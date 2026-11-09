import { connectDatabase } from './db.js';
import { Movie, CrawlRun } from './models.js';

const TMDB_BASE = (process.env.TMDB_API_BASE_URL || 'https://api.themoviedb.org/3').replace(/\/+$/, '');

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

async function tmdbRequest(path, params = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('TMDB_API_KEY is not configured in .env.');
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set('api_key', apiKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    if (response.status === 429) throw new Error('TMDB rate limit reached. Please retry later.');
    throw new Error('TMDB request failed (' + response.status + ').');
  }
  return response.json();
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
  return {
    tmdbId: Number(item.id),
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
    genreIds: item.genre_ids || [],
    genres: (source.genres || []).map((genre) => genre.name).filter(Boolean),
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
          append_to_response: 'release_dates,keywords'
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
