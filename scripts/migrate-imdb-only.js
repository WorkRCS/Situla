import 'dotenv/config';
import mongoose from 'mongoose';

const IMDB_ID = /^tt\d{5,12}$/i;

function imageUrl(value, size) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith('/')) return null;
  return 'https://image.tmdb.org/t/p/' + size + raw;
}

function invalidImdbFilter() {
  return {
    $or: [
      { imdbId: { $exists: false } },
      { imdbId: null },
      { imdbId: { $not: IMDB_ID } }
    ]
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) throw new Error('Set MONGODB_URI and MONGODB_DB_NAME in .env before migrating.');

  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const movies = db.collection('movies');
  const tvSeries = db.collection('tvseries');
  const tvSeasons = db.collection('tvseasons');
  const anime = db.collection('animeseries');

  const invalidMovieCount = await movies.countDocuments(invalidImdbFilter());
  const invalidTvCount = await tvSeries.countDocuments(invalidImdbFilter());
  const duplicateMovieIds = await movies.aggregate([
    { $match: { imdbId: IMDB_ID } },
    { $group: { _id: { $toLower: '$imdbId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 }
  ]).toArray();
  if (duplicateMovieIds.length) {
    throw new Error('Duplicate IMDb IDs exist in the Movie collection. Resolve these duplicates first: ' +
      duplicateMovieIds.map((item) => item._id + ' (' + item.count + ')').join(', '));
  }
  const duplicateTvIds = await tvSeries.aggregate([
    { $match: { imdbId: IMDB_ID } },
    { $group: { _id: { $toLower: '$imdbId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 }
  ]).toArray();

  if (duplicateTvIds.length) {
    throw new Error('Duplicate IMDb IDs exist in the TV collection. Resolve these duplicates first: ' +
      duplicateTvIds.map((item) => item._id + ' (' + item.count + ')').join(', '));
  }

  const [moviesMissingProvider, tvMissingProvider] = await Promise.all([
    movies.countDocuments({ imdbId: IMDB_ID, $or: [{ vidlinkId: { $exists: false } }, { vidlinkId: null }, { vidlinkId: { $lte: 0 } }] }),
    tvSeries.countDocuments({ imdbId: IMDB_ID, $or: [{ vidlinkId: { $exists: false } }, { vidlinkId: null }, { vidlinkId: { $lte: 0 } }] })
  ]);
  console.log('Legacy cleanup preview:');
  console.log('  Movie records without a valid IMDb ID to delete: ' + invalidMovieCount);
  console.log('  TV records without a valid IMDb ID to delete: ' + invalidTvCount);
  console.log('  TV series to migrate to IMDb identity: ' + (await tvSeries.countDocuments({ imdbId: IMDB_ID })));
  console.log('  Movies missing a VidLink provider mapping: ' + moviesMissingProvider);
  console.log('  TV series missing a VidLink provider mapping: ' + tvMissingProvider);

  const cursor = tvSeries.find({ imdbId: IMDB_ID });
  let migratedTv = 0;
  for await (const series of cursor) {
    const cachedSeasons = await tvSeasons.find({ seriesTmdbId: series.tmdbId }).toArray();
    const seasonMap = new Map(cachedSeasons.map((item) => [Number(item.seasonNumber), item]));
    const summaries = new Map((series.seasons || []).map((item) => [Number(item.seasonNumber), item]));
    for (const cached of cachedSeasons) {
      if (!summaries.has(Number(cached.seasonNumber))) summaries.set(Number(cached.seasonNumber), cached);
    }

    const seasons = [...summaries.entries()].sort((a, b) => a[0] - b[0]).map(([number, summary]) => {
      const cached = seasonMap.get(number) || summary;
      return {
        seasonNumber: number,
        name: summary.name || cached.name || '',
        overview: summary.overview || cached.overview || '',
        airDate: summary.airDate || cached.airDate || null,
        episodeCount: Number(summary.episodeCount || cached.episodeCount || (cached.episodes || []).length),
        posterUrl: imageUrl(summary.posterPath || cached.posterPath || summary.posterUrl, 'w342'),
        voteAverage: Number(summary.voteAverage || cached.voteAverage) || 0,
        episodes: (cached.episodes || []).map((episode) => ({
          episodeNumber: Number(episode.episodeNumber),
          name: episode.name || '',
          overview: episode.overview || '',
          airDate: episode.airDate || null,
          runtime: Number(episode.runtime) || null,
          stillUrl: imageUrl(episode.stillPath || episode.stillUrl, 'w342'),
          voteAverage: Number(episode.voteAverage) || 0
        })).filter((episode) => Number.isSafeInteger(episode.episodeNumber) && episode.episodeNumber > 0)
      };
    }).filter((season) => Number.isSafeInteger(season.seasonNumber) && season.seasonNumber >= 0);

    await tvSeries.updateOne({ _id: series._id }, {
      $set: {
        imdbId: String(series.imdbId).toLowerCase(),
        // Preserve the old numeric provider key for VidLink playback. The
        // public TV URL and catalog identity remain IMDb-based.
        vidlinkId: Number(series.vidlinkId || series.tmdbId) > 0 ? Number(series.vidlinkId || series.tmdbId) : null,
        posterUrl: series.posterUrl || imageUrl(series.posterPath, 'w342'),
        backdropUrl: series.backdropUrl || imageUrl(series.backdropPath, 'w780'),
        seasons
      },
      $unset: {
        tmdbId: '', tmdbUrl: '', posterPath: '', backdropPath: '', genreIds: '', originCountry: '',
        moderationStatus: '', manualReviewNote: '', lastSyncedAt: '', adult: '', originalLanguage: ''
      }
    });
    migratedTv += 1;
  }

  const movieUpdate = await movies.updateMany({ imdbId: IMDB_ID }, [
    {
      $set: {
        imdbId: { $toLower: '$imdbId' },
        // Keep VidLink's internal provider key while removing legacy field names.
        vidlinkId: { $ifNull: ['$vidlinkId', '$tmdbId'] },
        posterUrl: { $ifNull: ['$posterUrl', { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$posterPath', ''] } }, 0] }, { $concat: ['https://image.tmdb.org/t/p/w342', '$posterPath'] }, null] }] },
        backdropUrl: { $ifNull: ['$backdropUrl', { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$backdropPath', ''] } }, 0] }, { $concat: ['https://image.tmdb.org/t/p/w780', '$backdropPath'] }, null] }] }
      }
    },
    {
      $unset: ['tmdbId', 'tmdbUrl', 'posterPath', 'backdropPath', 'genreIds', 'moderationStatus', 'manualReviewNote', 'lastSyncedAt', 'adult', 'originalLanguage']
    }
  ]);

  const deletedMovies = await movies.deleteMany(invalidImdbFilter());
  const deletedTv = await tvSeries.deleteMany(invalidImdbFilter());

  for (const collection of [movies, tvSeries, anime]) {
    const indexes = await collection.indexes();
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      const keys = Object.keys(index.key || {});
      const obsolete = keys.some((key) =>
        /tmdb|genreIds|posterPath|backdropPath|moderationStatus|adult|originCountry|lastSyncedAt/i.test(key)
      );
      if (obsolete) await collection.dropIndex(index.name);
    }
  }

  const movieIndexes = await movies.indexes();
  if (movieIndexes.some((index) => index.name === 'imdbId_1')) await movies.dropIndex('imdbId_1');
  await movies.createIndex({ imdbId: 1 }, { unique: true, name: 'imdbId_1' });

  const tvIndexes = await tvSeries.indexes();
  if (tvIndexes.some((index) => index.name === 'imdbId_1')) await tvSeries.dropIndex('imdbId_1');
  await tvSeries.createIndex({ imdbId: 1 }, { unique: true, name: 'imdbId_1' });

  if ((await db.listCollections({ name: 'tvseasons' }).toArray()).length) await tvSeasons.drop();
  if ((await db.listCollections({ name: 'crawl_runs' }).toArray()).length) await db.collection('crawl_runs').drop();
  await anime.updateMany({}, { $unset: { moderationStatus: '', manualReviewNote: '', lastSyncedAt: '' } });

  console.log('Migration complete:');
  console.log('  Movies migrated to direct IMDb identity: ' + movieUpdate.modifiedCount);
  console.log('  Movies deleted (missing/invalid IMDb): ' + deletedMovies.deletedCount);
  console.log('  TV series migrated to direct IMDb identity: ' + migratedTv);
  console.log('  TV series deleted (missing/invalid IMDb): ' + deletedTv.deletedCount);
  console.log('  Legacy season cache and crawl history collections removed.');
}

main()
  .catch((error) => {
    console.error('IMDb migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
