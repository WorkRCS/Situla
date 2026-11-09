import 'dotenv/config';
import mongoose from 'mongoose';

const IMDB_ID = /^tt\d{5,12}$/i;
const invalidImdbFilter = {
  $or: [
    { imdbId: { $exists: false } },
    { imdbId: null },
    { imdbId: { $not: IMDB_ID } }
  ]
};

async function duplicateIds(collection) {
  return collection.aggregate([
    { $match: { imdbId: IMDB_ID } },
    { $group: { _id: { $toLower: '$imdbId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]).toArray();
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) throw new Error('Set MONGODB_URI and MONGODB_DB_NAME in .env first.');

  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const movies = db.collection('movies');
  const tv = db.collection('tvseries');

  const [movieTotal, movieValid, movieInvalid, tvTotal, tvValid, tvInvalid, duplicateMovies, duplicateTv] = await Promise.all([
    movies.countDocuments({}),
    movies.countDocuments({ imdbId: IMDB_ID }),
    movies.countDocuments(invalidImdbFilter),
    tv.countDocuments({}),
    tv.countDocuments({ imdbId: IMDB_ID }),
    tv.countDocuments(invalidImdbFilter),
    duplicateIds(movies),
    duplicateIds(tv)
  ]);

  console.log(JSON.stringify({
    readOnly: true,
    database: dbName,
    movies: { total: movieTotal, validImdbId: movieValid, missingOrInvalidImdbId: movieInvalid },
    tvSeries: { total: tvTotal, validImdbId: tvValid, missingOrInvalidImdbId: tvInvalid },
    duplicateMovieImdbIds: duplicateMovies,
    duplicateTvImdbIds: duplicateTv
  }, null, 2));

  if (duplicateMovies.length || duplicateTv.length) {
    console.error('Duplicate IMDb IDs must be resolved before the migration can create unique indexes.');
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error('IMDb catalog audit failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
