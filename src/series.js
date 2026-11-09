import { connectDatabase } from './db.js';
import { AnimeSeries, TvSeason, TvSeries } from './models.js';
import { tmdbRequest } from './crawler.js';

const ALLOWED_TV_GENRES = new Set([10759, 10765, 9648, 80, 18, 10768]);
const ANIME_ALLOWED_TYPES = new Set(['TV', 'ONA']);
const ANIME_BLOCKED_GENRES = new Set(['Hentai', 'Ecchi']);
let lastJikanRequestAt = 0;

function normalizeNumericIds(ids, label, max = 20) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > max) {
    throw new Error('Submit between 1 and ' + max + ' ' + label + ' per import request.');
  }
  const values = [...new Set(ids.map((value) => String(value).trim()).filter(Boolean))];
  if (!values.length || values.some((value) => !/^\d{1,10}$/.test(value) || Number(value) <= 0)) {
    throw new Error(label + ' must be positive numeric IDs.');
  }
  return values.map(Number);
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { output[index] = await mapper(items[index]); }
      catch (error) { output[index] = { error }; }
    }
  }));
  return output;
}

function mapTvSeries(data) {
  const genres = (data.genres || []).map((item) => item.name).filter(Boolean);
  const genreIds = (data.genres || []).map((item) => Number(item.id)).filter(Number.isFinite);
  const countries = data.content_ratings?.results || [];
  const us = countries.find((item) => item.iso_3166_1 === 'US');
  const certification = us?.rating || '';
  const keywordGroups = data.keywords || {};
  const keywords = (keywordGroups.results || keywordGroups.keywords || []).map((item) => item.name).filter(Boolean).slice(0, 40);
  return {
    tmdbId: Number(data.id),
    imdbId: data.external_ids?.imdb_id ? String(data.external_ids.imdb_id).toLowerCase() : null,
    title: data.name || 'Untitled',
    originalTitle: data.original_name || '',
    overview: data.overview || '',
    posterPath: data.poster_path || null,
    backdropPath: data.backdrop_path || null,
    firstAirDate: data.first_air_date || null,
    releaseYear: data.first_air_date ? Number(data.first_air_date.slice(0, 4)) : null,
    voteAverage: Number(data.vote_average || 0),
    voteCount: Number(data.vote_count || 0),
    popularity: Number(data.popularity || 0),
    originalLanguage: data.original_language || '',
    originCountry: data.origin_country || [],
    genreIds,
    genres,
    keywords,
    certification,
    status: data.status || '',
    numberOfSeasons: Number(data.number_of_seasons || 0),
    numberOfEpisodes: Number(data.number_of_episodes || 0),
    seasons: (data.seasons || []).map((season) => ({
      tmdbSeasonId: Number(season.id) || null,
      seasonNumber: Number(season.season_number),
      name: season.name || '',
      overview: season.overview || '',
      airDate: season.air_date || null,
      episodeCount: Number(season.episode_count || 0),
      posterPath: season.poster_path || null,
      voteAverage: Number(season.vote_average || 0)
    })),
    adult: Boolean(data.adult),
    lastSyncedAt: new Date()
  };
}

export async function importTvSeriesIds(body = {}) {
  const ids = normalizeNumericIds(body.ids, 'TMDB TV IDs', 20);
  await connectDatabase();

  const results = await mapLimit(ids, 3, async (tmdbId) => {
    const data = await tmdbRequest('/tv/' + tmdbId, {
      language: 'en-US',
      append_to_response: 'content_ratings,external_ids,keywords'
    });
    const record = mapTvSeries(data);
    const eligible = !record.adult &&
      record.originalLanguage === 'en' &&
      Boolean(record.firstAirDate) &&
      Boolean(record.posterPath) &&
      record.genreIds.some((id) => ALLOWED_TV_GENRES.has(id)) &&
      record.voteAverage >= 5.5 &&
      record.voteCount >= 100;
    if (!eligible) return { id: tmdbId, reason: 'filtered' };
    return { id: tmdbId, record };
  });

  const failed = results.find((item) => item?.error);
  if (failed) throw failed.error;
  const records = results.filter((item) => item?.record).map((item) => item.record);
  const unmatched = results.filter((item) => !item?.record).map((item) => item.id);
  const existing = records.length
    ? await TvSeries.find({ tmdbId: { $in: records.map((item) => item.tmdbId) } }).select('tmdbId').lean()
    : [];
  const existingIds = new Set(existing.map((item) => item.tmdbId));

  if (records.length) {
    await TvSeries.bulkWrite(records.map((record) => ({
      updateOne: {
        filter: { tmdbId: record.tmdbId },
        update: { $set: record, $setOnInsert: { moderationStatus: 'pending', manualReviewNote: '' } },
        upsert: true
      }
    })), { ordered: false });
  }

  const imported = records.filter((record) => !existingIds.has(record.tmdbId)).length;
  return {
    requested: ids.length,
    matched: records.length,
    imported,
    updated: records.length - imported,
    skipped: unmatched.length,
    unmatched
  };
}

export async function getTvSeason(tmdbId, seasonNumber) {
  const cached = await TvSeason.findOne({ seriesTmdbId: tmdbId, seasonNumber }).lean();
  if (cached && Date.now() - new Date(cached.lastSyncedAt || 0).getTime() < 7 * 86400000) return cached;

  const data = await tmdbRequest('/tv/' + tmdbId + '/season/' + seasonNumber, { language: 'en-US' });
  const record = {
    seriesTmdbId: tmdbId,
    tmdbSeasonId: Number(data.id) || null,
    seasonNumber,
    name: data.name || '',
    overview: data.overview || '',
    airDate: data.air_date || null,
    episodeCount: Number(data.episodes?.length || 0),
    posterPath: data.poster_path || null,
    voteAverage: Number(data.vote_average || 0),
    episodes: (data.episodes || []).map((episode) => ({
      tmdbEpisodeId: Number(episode.id) || null,
      episodeNumber: Number(episode.episode_number),
      name: episode.name || '',
      overview: episode.overview || '',
      airDate: episode.air_date || null,
      runtime: Number(episode.runtime) || null,
      stillPath: episode.still_path || null,
      voteAverage: Number(episode.vote_average || 0)
    })),
    lastSyncedAt: new Date()
  };
  return TvSeason.findOneAndUpdate(
    { seriesTmdbId: tmdbId, seasonNumber },
    { $set: record },
    { new: true, upsert: true, runValidators: true }
  ).lean();
}

async function jikanRequest(path) {
  const wait = Math.max(0, 400 - (Date.now() - lastJikanRequestAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastJikanRequestAt = Date.now();

  const response = await fetch('https://api.jikan.moe/v4' + path, {
    headers: { Accept: 'application/json', 'User-Agent': 'Situla/1.0 anime metadata client' },
    signal: AbortSignal.timeout(20000)
  });
  if (response.status === 429) throw new Error('Jikan rate limit reached. Wait briefly and retry the anime import.');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Jikan API returned HTTP ' + response.status + '.');
  const payload = await response.json();
  return payload.data || null;
}

function mapAnime(data) {
  const airedFrom = data.aired?.from || null;
  const genres = (data.genres || []).map((item) => item.name).filter(Boolean);
  const themes = (data.themes || []).map((item) => item.name).filter(Boolean);
  const demographics = (data.demographics || []).map((item) => item.name).filter(Boolean);
  return {
    malId: Number(data.mal_id),
    title: data.title || data.title_english || 'Untitled',
    titleEnglish: data.title_english || '',
    titleJapanese: data.title_japanese || '',
    synopsis: data.synopsis || '',
    posterUrl: data.images?.webp?.large_image_url || data.images?.jpg?.large_image_url || null,
    trailerUrl: data.trailer?.url || data.trailer?.embed_url || null,
    airedFrom,
    releaseYear: data.year || (airedFrom ? Number(airedFrom.slice(0, 4)) : null),
    episodes: Number.isFinite(Number(data.episodes)) ? Number(data.episodes) : null,
    duration: data.duration || '',
    score: Number(data.score || 0),
    scoredBy: Number(data.scored_by || 0),
    rank: Number(data.rank || 0) || null,
    popularity: Number(data.popularity || 0) || null,
    status: data.status || '',
    season: data.season || '',
    type: data.type || '',
    source: data.source || '',
    genres,
    themes,
    demographics,
    rating: data.rating || '',
    lastSyncedAt: new Date()
  };
}

export async function importAnimeIds(body = {}) {
  const ids = normalizeNumericIds(body.ids, 'MyAnimeList IDs', 12);
  await connectDatabase();

  // Jikan documents a ceiling of 3 requests/second and 60/minute. A single
  // sequential queue stays below that limit when importing the requested batch.
  const results = [];
  for (const malId of ids) {
    try {
      const data = await jikanRequest('/anime/' + malId + '/full');
      if (!data) {
        results.push({ id: malId, reason: 'not_found' });
        continue;
      }
      const record = mapAnime(data);
      const eligible = ANIME_ALLOWED_TYPES.has(record.type) &&
        !record.genres.some((genre) => ANIME_BLOCKED_GENRES.has(genre)) &&
        Boolean(record.posterUrl) &&
        Number(record.episodes || 0) > 0 &&
        record.score >= 6.5 &&
        record.scoredBy >= 500;
      if (!eligible) results.push({ id: malId, reason: 'filtered' });
      else results.push({ id: malId, record });
    } catch (error) {
      results.push({ id: malId, error });
    }
  }

  const failed = results.find((item) => item?.error);
  if (failed) throw failed.error;
  const records = results.filter((item) => item?.record).map((item) => item.record);
  const unmatched = results.filter((item) => !item?.record).map((item) => item.id);
  const existing = records.length
    ? await AnimeSeries.find({ malId: { $in: records.map((item) => item.malId) } }).select('malId').lean()
    : [];
  const existingIds = new Set(existing.map((item) => item.malId));

  if (records.length) {
    await AnimeSeries.bulkWrite(records.map((record) => ({
      updateOne: {
        filter: { malId: record.malId },
        update: { $set: record, $setOnInsert: { moderationStatus: 'pending', manualReviewNote: '' } },
        upsert: true
      }
    })), { ordered: false });
  }

  const imported = records.filter((record) => !existingIds.has(record.malId)).length;
  return {
    requested: ids.length,
    matched: records.length,
    imported,
    updated: records.length - imported,
    skipped: unmatched.length,
    unmatched
  };
}
