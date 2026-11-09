import { connectDatabase } from './db.js';
import { Movie, CrawlRun } from './models.js';

function getTmdbBase() {
  const configured = (process.env.TMDB_API_BASE_URL || 'https://api.themoviedb.org/3').trim();
  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('TMDB_API_BASE_URL is not a valid URL. Use https://api.themoviedb.org/3.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('TMDB_API_BASE_URL must use HTTPS (HTTP is permitted only for local testing).');
  }
  return configured.replace(/\/+$/, '');
}

function getCauseDetails(error) {
  const details = [];
  const queue = [error];
  const seen = new Set();

  while (queue.length && seen.size < 20) {
    const current = queue.shift();
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || seen.has(current)) continue;
    seen.add(current);

    if (current.code) details.push(String(current.code));
    if (current.message) details.push(String(current.message));
    if (current.cause) queue.push(current.cause);
    if (Array.isArray(current.errors)) queue.push(...current.errors);
  }

  return details;
}

export function describeTmdbNetworkError(error) {
  const details = getCauseDetails(error);
  const code = details.find((item) => /^(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR_[A-Z_]+|CERT_[A-Z_]+|DEPTH_[A-Z_]+|ERR_TLS_[A-Z_]+|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|CERT_HAS_EXPIRED)$/.test(item));
  if (error?.name === 'TimeoutError' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return 'TMDB did not respond in time. Check your internet connection, firewall, VPN or proxy, then retry.';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'DNS could not resolve api.themoviedb.org. Check DNS/internet access or try another network.';
  }
  if (code === 'ECONNREFUSED') {
    return 'The connection to TMDB was refused. Check firewall, proxy or network filtering.';
  }
  if (code === 'ECONNRESET') {
    return 'The connection to TMDB was reset by the network. Check VPN/proxy/firewall and retry.';
  }
  if (code?.startsWith('CERT_') || code?.startsWith('DEPTH_')) {
    return 'TLS certificate validation failed while connecting to TMDB. Check system date, antivirus HTTPS inspection or proxy certificate settings.';
  }
  return 'Node.js could not connect to TMDB. Check outbound HTTPS access to api.themoviedb.org:443 and any required proxy configuration.';
}

const ALLOWED_IMPORT_GENRES = new Set([878, 9648, 14, 27, 28, 12]);
const GENRE_NAMES = new Map([
  [878, 'Science Fiction'], [9648, 'Mystery'], [14, 'Fantasy'],
  [27, 'Horror'], [28, 'Action'], [12, 'Adventure']
]);

export function normalizeImportIds(body = {}) {
  const source = String(body.source || 'imdb').trim().toLowerCase();
  if (!['imdb', 'tmdb'].includes(source)) throw new Error('Import source must be imdb or tmdb.');
  if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 20) {
    throw new Error('Submit between 1 and 20 IDs per import request.');
  }
  const ids = [...new Set(body.ids.map((value) => String(value).trim()).filter(Boolean))];
  if (!ids.length) throw new Error('Add at least one movie ID.');
  if (source === 'imdb' && ids.some((id) => !/^tt\\d{5,12}$/i.test(id))) {
    throw new Error('IMDb IDs must use the tt followed by digits format.');
  }
  if (source === 'tmdb' && ids.some((id) => !/^\\d{1,12}$/.test(id) || Number(id) <= 0)) {
    throw new Error('TMDB IDs must be positive numeric IDs.');
  }
  return { source, ids: ids.map((id) => source === 'imdb' ? id.toLowerCase() : id) };
}

export function normalizeInput(body = {}) {
  const currentYear = new Date().getFullYear();
  const startYear = Number(body.startYear ?? process.env.CRAWL_DEFAULT_START_YEAR ?? 2010);
  const endYear = Number(body.endYear ?? process.env.CRAWL_DEFAULT_END_YEAR ?? currentYear);
  const startPage = Number(body.startPage ?? 1);
  const askedPages = Number(body.maxPages ?? 5);
  const pageCap = Math.max(1, Math.min(20, Number(process.env.CRAWL_MAX_PAGES_PER_RUN || 5)));
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < 1870 || endYear > currentYear || startYear > endYear) {
    throw new Error('Choose a valid release-year range.');
  }
  if (!Number.isInteger(startPage) || startPage < 1 || startPage > 500) throw new Error('startPage must be between 1 and 500.');
  if (!Number.isInteger(askedPages) || askedPages < 1) throw new Error('maxPages must be a positive whole number.');
  return { startYear, endYear, startPage, maxPages: Math.min(askedPages, pageCap) };
}

export async function tmdbRequest(path, params = {}) {
  const apiKey = (process.env.TMDB_API_KEY || '').trim();
  if (!apiKey || apiKey.startsWith('replace_')) {
    throw new Error('TMDB_API_KEY is missing or still contains the example placeholder. Add your TMDB v3 API key to .env and restart the backend.');
  }

  const url = new URL(getTmdbBase() + path);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'Situla/0.1 TMDB metadata client' },
        signal: AbortSignal.timeout(25000)
      });
      break;
    } catch (error) {
      lastError = error;
      const details = getCauseDetails(error);
      const transient = error?.name === 'TimeoutError' ||
        details.some((item) => ['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(item));
      if (!transient || attempt === 3) {
        const host = new URL(url).host;
        const diagnostic = describeTmdbNetworkError(error);
        const code = details.find((item) => /^(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR_[A-Z_]+|CERT_[A-Z_]+|DEPTH_[A-Z_]+)$/.test(item));
        throw new Error('Unable to reach TMDB (' + host + ')' + (code ? ' [' + code + ']' : '') + '. ' + diagnostic);
      }
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }

  if (!response) {
    throw new Error('Unable to reach TMDB. ' + describeTmdbNetworkError(lastError));
  }
  if (response.status === 401) {
    throw new Error('TMDB rejected TMDB_API_KEY (HTTP 401). Verify that .env contains the TMDB v3 API key, not the account password, and restart the backend.');
  }
  if (response.status === 403) {
    throw new Error('TMDB denied this API request (HTTP 403). Check API key permissions and TMDB account/API access.');
  }
  if (response.status === 429) {
    throw new Error('TMDB rate limit reached (HTTP 429). Wait briefly before starting another crawl.');
  }
  if (!response.ok) {
    throw new Error('TMDB API returned HTTP ' + response.status + ' for ' + path + '.');
  }

  try {
    return await response.json();
  } catch {
    throw new Error('TMDB returned an invalid JSON response. Check the configured TMDB_API_BASE_URL.');
  }
}

export async function checkTmdbConnection() {
  const payload = await tmdbRequest('/configuration');
  if (!payload || !payload.images) throw new Error('TMDB responded, but the configuration payload was unexpected.');
  return { ok: true, host: new URL(getTmdbBase()).host, message: 'TMDB API connection and API key are working.' };
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { output[index] = await mapper(items[index]); } catch { output[index] = null; }
    }
  }));
  return output;
}

function mapMovie(item, details) {
  const source = details || item;
  const releaseDate = source.release_date || item.release_date || null;
  const releaseCountries = details?.release_dates?.results || [];
  const us = releaseCountries.find((country) => country.iso_3166_1 === 'US');
  const certification = us?.release_dates?.find((entry) => entry.certification)?.certification || '';
  const keywordSource = details?.keywords || {};
  const keywords = (keywordSource.keywords || keywordSource.results || []).map((entry) => entry.name).filter(Boolean).slice(0, 40);
  const genreIds = item.genre_ids || source.genre_ids || (source.genres || []).map((genre) => Number(genre.id)).filter(Number.isFinite);
  const genreNames = (source.genres || []).map((genre) => genre.name).filter(Boolean);
  const imdbId = source.imdb_id || item.imdb_id || source.external_ids?.imdb_id || item.external_ids?.imdb_id;
  return {
    tmdbId: Number(item.id),
    ...(imdbId ? { imdbId: String(imdbId).toLowerCase() } : {}),
    title: source.title || item.title || 'Untitled',
    originalTitle: source.original_title || item.original_title || '',
    overview: source.overview || item.overview || '',
    posterPath: source.poster_path || item.poster_path || null,
    backdropPath: source.backdrop_path || item.backdrop_path || null,
    releaseDate,
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    runtime: Number.isFinite(source.runtime) ? source.runtime : null,
    voteAverage: Number(item.vote_average || 0),
    voteCount: Number(item.vote_count || 0),
    popularity: Number(item.popularity || 0),
    originalLanguage: item.original_language || 'en',
    genreIds,
    genres: genreNames.length ? genreNames : genreIds.map((id) => GENRE_NAMES.get(Number(id))).filter(Boolean),
    keywords,
    certification,
    adult: Boolean(item.adult),
    tmdbUrl: 'https://www.themoviedb.org/movie/' + item.id,
    lastSyncedAt: new Date()
  };
}

export async function runManualCrawl(body = {}) {
  await connectDatabase();
  const input = normalizeInput(body);
  const run = await CrawlRun.create({
    startYear: input.startYear,
    endYear: input.endYear,
    startPage: input.startPage,
    requestedPages: input.maxPages,
    status: 'running'
  });

  try {
    const discovered = [];
    let totalPages = 0;
    let pagesProcessed = 0;
    let skippedAdultCount = 0;

    for (let page = input.startPage; page < input.startPage + input.maxPages; page += 1) {
      const data = await tmdbRequest('/discover/movie', {
        include_adult: false,
        include_video: false,
        language: 'en-US',
        sort_by: 'popularity.desc',
        'primary_release_date.gte': input.startYear + '-01-01',
        'primary_release_date.lte': input.endYear + '-12-31',
        with_original_language: 'en',
        with_genres: '878|9648|14|27|28|12',
        region: 'US',
        page
      });
      totalPages = Number(data.total_pages || 0);
      const results = data.results || [];
      skippedAdultCount += results.filter((movie) => movie.adult).length;
      discovered.push(...results.filter((movie) =>
        !movie.adult && movie.original_language === 'en' && movie.release_date && movie.poster_path
      ));
      pagesProcessed += 1;
      if (page >= totalPages || !results.length) break;
    }

    const unique = [...new Map(discovered.map((movie) => [Number(movie.id), movie])).values()];
    const records = (await mapLimit(unique, 5, async (movie) => {
      let details = null;
      try {
        details = await tmdbRequest('/movie/' + encodeURIComponent(movie.id), {
          language: 'en-US',
          append_to_response: 'release_dates,keywords,external_ids'
        });
      } catch { /* Keep discovery metadata if optional details are unavailable. */ }
      return mapMovie(movie, details);
    })).filter(Boolean);

    const ids = records.map((record) => record.tmdbId);
    const existing = ids.length ? await Movie.find({ tmdbId: { $in: ids } }).select('tmdbId').lean() : [];
    const existingIds = new Set(existing.map((movie) => movie.tmdbId));
    if (records.length) {
      await Movie.bulkWrite(records.map((record) => ({
        updateOne: {
          filter: { tmdbId: record.tmdbId },
          update: { $set: record, $setOnInsert: { moderationStatus: 'pending', manualReviewNote: '' } },
          upsert: true
        }
      })), { ordered: false });
    }

    const importedCount = records.filter((record) => !existingIds.has(record.tmdbId)).length;
    const updatedCount = records.length - importedCount;
    const nextCandidate = input.startPage + pagesProcessed;
    const nextPage = totalPages > 0 && nextCandidate <= totalPages ? nextCandidate : null;
    Object.assign(run, {
      status: 'completed', pagesProcessed, totalPages, discoveredCount: unique.length,
      importedCount, updatedCount, skippedAdultCount, finishedAt: new Date()
    });
    await run.save();
    return {
      runId: String(run._id), status: run.status, startYear: input.startYear, endYear: input.endYear,
      pagesProcessed, totalPages, discoveredCount: unique.length, importedCount, updatedCount,
      skippedAdultCount, nextPage
    };
  } catch (error) {
    run.status = 'failed';
    run.errorMessage = String(error.message || 'Crawler failed').slice(0, 500);
    run.finishedAt = new Date();
    await run.save();
    throw error;
  }
}

export async function importMovieIds(body = {}) {
  const input = normalizeImportIds(body);
  await connectDatabase();

  const resolved = await mapLimit(input.ids, 3, async (externalId) => {
    try {
      let item;
      if (input.source === 'imdb') {
        const found = await tmdbRequest('/find/' + encodeURIComponent(externalId), {
          external_source: 'imdb_id',
          language: 'en-US'
        });
        item = (found.movie_results || [])[0] || null;
        if (item) item.imdb_id = externalId;
      } else {
        item = await tmdbRequest('/movie/' + encodeURIComponent(externalId), {
          language: 'en-US',
          append_to_response: 'external_ids'
        });
        item.imdb_id = item.imdb_id || item.external_ids?.imdb_id || null;
      }

      if (!item) return { externalId, reason: 'not_found' };
      const genreIds = item.genre_ids || (item.genres || []).map((genre) => Number(genre.id));
      const valid = !item.adult &&
        item.original_language === 'en' &&
        Boolean(item.release_date) &&
        Boolean(item.poster_path) &&
        genreIds.some((id) => ALLOWED_IMPORT_GENRES.has(Number(id)));
      if (!valid) return { externalId, reason: 'filtered' };
      return { externalId, record: mapMovie(item, item) };
    } catch (error) {
      return { externalId, error };
    }
  });

  const failed = resolved.find((entry) => entry?.error);
  if (failed) throw failed.error;

  const records = resolved.filter((entry) => entry?.record).map((entry) => entry.record);
  const unmatched = resolved.filter((entry) => !entry?.record).map((entry) => entry.externalId);
  const tmdbIds = records.map((record) => record.tmdbId);
  const existing = tmdbIds.length
    ? await Movie.find({ tmdbId: { $in: tmdbIds } }).select('tmdbId').lean()
    : [];
  const existingIds = new Set(existing.map((movie) => movie.tmdbId));

  if (records.length) {
    await Movie.bulkWrite(records.map((record) => ({
      updateOne: {
        filter: { tmdbId: record.tmdbId },
        update: {
          $set: record,
          $setOnInsert: { moderationStatus: 'pending', manualReviewNote: '' }
        },
        upsert: true
      }
    })), { ordered: false });
  }

  const imported = records.filter((record) => !existingIds.has(record.tmdbId)).length;
  return {
    requested: input.ids.length,
    matched: records.length,
    imported,
    updated: records.length - imported,
    skipped: unmatched.length,
    unmatched
  };
}
