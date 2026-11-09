import { connectDatabase } from './db.js';
import { AnimeSeries, TvSeason, TvSeries } from './models.js';
import { tmdbRequest } from './crawler.js';

const ALLOWED_TV_GENRES = new Set([10759, 10765, 9648, 80, 18, 10768]);
const ANIME_ALLOWED_TYPES = new Set(['TV', 'ONA']);
const ANIME_BLOCKED_GENRES = new Set(['Hentai', 'Ecchi']);
let lastJikanRequestAt = 0;

export function normalizePopularSeriesOptions(options = {}) {
  const targetCount = Number(options.targetCount ?? 50);
  const maxPages = Number(options.maxPages ?? 20);
  if (!Number.isSafeInteger(targetCount) || targetCount < 1 || targetCount > 200) {
    throw new Error('targetCount must be a whole number between 1 and 200.');
  }
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 50) {
    throw new Error('maxPages must be a whole number between 1 and 50.');
  }
  return { targetCount, maxPages };
}

export function normalizeNumericIds(ids, label, max = 20) {
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
  // Previously fetched episode metadata remains useful even when stale. Player
  // startup must never block on an external TMDB request.
  if (cached?.episodes?.length) return cached;

  const series = await TvSeries.findOne({ tmdbId, moderationStatus: 'approved', adult: false })
    .select('seasons')
    .lean();
  const summary = (series?.seasons || []).find((item) => Number(item.seasonNumber) === Number(seasonNumber));
  if (!summary) {
    if (cached) return cached;
    return {
      seriesTmdbId: tmdbId, seasonNumber, name: 'Season ' + seasonNumber,
      overview: '', airDate: null, episodeCount: 0, posterPath: null,
      voteAverage: 0, episodes: []
    };
  }

  // Imported TV metadata contains the season's episode count. Generate stable
  // episode-number choices from that cached count so playback and Next Episode
  // still work when the TMDB season endpoint is unreachable. Episode titles are
  // clearly generic until a trusted episode metadata sync is available.
  const episodeCount = Math.max(0, Math.min(2000, Number(summary.episodeCount) || 0));
  const episodes = Array.from({ length: episodeCount }, (_, index) => ({
    tmdbEpisodeId: null,
    episodeNumber: index + 1,
    name: 'Episode ' + (index + 1),
    overview: '',
    airDate: null,
    runtime: null,
    stillPath: null,
    voteAverage: 0
  }));
  const record = {
    seriesTmdbId: tmdbId,
    tmdbSeasonId: Number(summary.tmdbSeasonId) || null,
    seasonNumber,
    name: summary.name || 'Season ' + seasonNumber,
    overview: summary.overview || '',
    airDate: summary.airDate || null,
    episodeCount,
    posterPath: summary.posterPath || null,
    voteAverage: Number(summary.voteAverage || 0),
    episodes,
    lastSyncedAt: new Date()
  };
  try {
    return await TvSeason.findOneAndUpdate(
      { seriesTmdbId: tmdbId, seasonNumber },
      { $set: record },
      { new: true, upsert: true, runValidators: true }
    ).lean();
  } catch (error) {
    // The episode picker can still render directly from the cached summary.
    console.warn('TV season placeholder cache write failed:', error.message);
    return record;
  }
}

async function jikanRequest(path, options = {}) {
  const base = (process.env.JIKAN_API_BASE_URL || 'https://api.jikan.moe/v4').replace(/\/+$/, '');
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const wait = Math.max(0, 450 - (Date.now() - lastJikanRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastJikanRequestAt = Date.now();

    let response;
    try {
      response = await fetch(base + path, {
        headers: { Accept: 'application/json', 'User-Agent': 'Situla/1.0 anime metadata client' },
        signal: AbortSignal.timeout(20000)
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        continue;
      }
      throw new Error('Unable to reach Jikan (' + new URL(base).host + '): ' + (error.message || 'network error'));
    }

    if (response.status === 404) return null;
    if (response.status === 429 || response.status >= 500) {
      if (attempt < 3) {
        const retryAfter = Number(response.headers.get('retry-after') || 0) * 1000;
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 900 * attempt)));
        continue;
      }
    }
    if (!response.ok) {
      if (response.status === 429) throw new Error('Jikan rate limit reached after retries. Wait briefly and rerun the anime seed.');
      throw new Error('Jikan API returned HTTP ' + response.status + '.');
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Jikan returned an invalid JSON response.');
    }
    return options.envelope ? payload : payload.data || null;
  }

  throw new Error('Unable to reach Jikan: ' + (lastError?.message || 'request failed'));
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


function isEligibleTvSeries(record) {
  return Boolean(record) &&
    !record.adult &&
    record.originalLanguage === 'en' &&
    Boolean(record.firstAirDate) &&
    Boolean(record.posterPath) &&
    record.genreIds.some((id) => ALLOWED_TV_GENRES.has(Number(id))) &&
    record.voteAverage >= 5.5 &&
    record.voteCount >= 100;
}

function isEligibleAnimeSeries(record) {
  return Boolean(record) &&
    ANIME_ALLOWED_TYPES.has(record.type) &&
    !record.genres.some((genre) => ANIME_BLOCKED_GENRES.has(genre)) &&
    Boolean(record.posterUrl) &&
    Number(record.episodes || 0) > 0 &&
    record.score >= 6.5 &&
    record.scoredBy >= 500;
}

/**
 * Discover and insert new, popular English-language TV shows.
 * Each accepted title is written immediately so a later API timeout cannot
 * discard earlier successful inserts.
 */
export async function importPopularTvSeries(options = {}) {
  const { targetCount, maxPages } = normalizePopularSeriesOptions(options);
  await connectDatabase();

  const existingIds = new Set((await TvSeries.distinct('tmdbId')).map(Number));
  const failures = [];
  let imported = 0;
  let filtered = 0;
  let duplicates = 0;
  let pagesProcessed = 0;
  let candidatesChecked = 0;
  let totalPages = 0;

  for (let page = 1; page <= maxPages && imported < targetCount; page += 1) {
    let discovery;
    try {
      discovery = await tmdbRequest('/discover/tv', {
        include_adult: false,
        include_null_first_air_dates: false,
        language: 'en-US',
        sort_by: 'popularity.desc',
        with_original_language: 'en',
        with_genres: [...ALLOWED_TV_GENRES].join('|'),
        'vote_average.gte': 5.5,
        'vote_count.gte': 100,
        page
      });
    } catch (error) {
      failures.push({ page, message: error.message });
      break;
    }

    totalPages = Number(discovery.total_pages || 0);
    const candidates = (discovery.results || []).filter((item) =>
      !item.adult &&
      item.original_language === 'en' &&
      Boolean(item.first_air_date) &&
      Boolean(item.poster_path) &&
      (item.genre_ids || []).some((id) => ALLOWED_TV_GENRES.has(Number(id)))
    );
    pagesProcessed += 1;

    const details = await mapLimit(candidates, 3, async (item) => {
      try {
        const data = await tmdbRequest('/tv/' + encodeURIComponent(item.id), {
          language: 'en-US',
          append_to_response: 'content_ratings,external_ids,keywords'
        });
        return { id: Number(item.id), record: mapTvSeries(data) };
      } catch (error) {
        return { id: Number(item.id), error };
      }
    });

    for (const result of details) {
      candidatesChecked += 1;
      if (result?.error) {
        failures.push({ tmdbId: result.id, message: result.error.message });
        continue;
      }
      const record = result?.record;
      if (!isEligibleTvSeries(record)) {
        filtered += 1;
        continue;
      }
      if (existingIds.has(record.tmdbId)) {
        duplicates += 1;
        continue;
      }
      if (imported >= targetCount) break;

      try {
        await TvSeries.create({
          ...record,
          moderationStatus: 'approved',
          manualReviewNote: 'Popular Situla TV seed: English, non-adult, poster/date, approved genre and rating filters passed.'
        });
        existingIds.add(record.tmdbId);
        imported += 1;
      } catch (error) {
        if (error?.code === 11000) duplicates += 1;
        else failures.push({ tmdbId: record.tmdbId, title: record.title, message: error.message });
      }
    }

    if ((details.length > 0 && details.every((result) => result?.error)) || page >= totalPages || !(discovery.results || []).length) break;
  }

  return {
    requested: targetCount,
    imported,
    remaining: Math.max(0, targetCount - imported),
    targetReached: imported >= targetCount,
    pagesProcessed,
    totalPages,
    candidatesChecked,
    filtered,
    duplicates,
    failed: failures.length,
    failures: failures.slice(0, 12)
  };
}

/**
 * Discover and insert popular, safe-for-work TV anime from Jikan.
 * Jikan's paginated search results contain the metadata needed by Situla,
 * avoiding one detail request per anime and staying under the API rate limit.
 */
export async function importPopularAnimeSeries(options = {}) {
  const { targetCount, maxPages } = normalizePopularSeriesOptions(options);
  await connectDatabase();

  const existingIds = new Set((await AnimeSeries.distinct('malId')).map(Number));
  const failures = [];
  let imported = 0;
  let filtered = 0;
  let duplicates = 0;
  let pagesProcessed = 0;
  let candidatesChecked = 0;
  let totalPages = 0;

  for (let page = 1; page <= maxPages && imported < targetCount; page += 1) {
    const params = new URLSearchParams({
      type: 'tv',
      sfw: 'true',
      order_by: 'popularity',
      sort: 'asc',
      min_score: '6.5',
      limit: '25',
      page: String(page)
    });

    let payload;
    try {
      payload = await jikanRequest('/anime?' + params.toString(), { envelope: true });
    } catch (error) {
      failures.push({ page, message: error.message });
      break;
    }
    if (!payload) break;

    totalPages = Number(payload.pagination?.last_visible_page || 0);
    const results = payload.data || [];
    pagesProcessed += 1;

    for (const item of results) {
      candidatesChecked += 1;
      const record = mapAnime(item);
      if (!isEligibleAnimeSeries(record)) {
        filtered += 1;
        continue;
      }
      if (existingIds.has(record.malId)) {
        duplicates += 1;
        continue;
      }
      if (imported >= targetCount) break;

      try {
        await AnimeSeries.create({
          ...record,
          moderationStatus: 'approved',
          manualReviewNote: 'Popular Situla anime seed: SFW TV title, poster/episodes, no Hentai/Ecchi genre and MAL rating filters passed.'
        });
        existingIds.add(record.malId);
        imported += 1;
      } catch (error) {
        if (error?.code === 11000) duplicates += 1;
        else failures.push({ malId: record.malId, title: record.title, message: error.message });
      }
    }

    if (!results.length || page >= totalPages || !payload.pagination?.has_next_page) break;
  }

  return {
    requested: targetCount,
    imported,
    remaining: Math.max(0, targetCount - imported),
    targetReached: imported >= targetCount,
    pagesProcessed,
    totalPages,
    candidatesChecked,
    filtered,
    duplicates,
    failed: failures.length,
    failures: failures.slice(0, 12)
  };
}
