import 'dotenv/config';
import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';
import { SignJWT, jwtVerify } from 'jose';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { connectDatabase } from './db.js';
import { Movie, CrawlRun, TvSeries, TvSeason, AnimeSeries } from './models.js';
import { runManualCrawl, checkTmdbConnection, importMovieIds, migrateLegacyMovieIds, importPopularMovies } from './crawler.js';
import { importTvSeriesIds, importAnimeIds, getTvSeason } from './series.js';

const app = new Hono();
const attempts = new Map();
const COOKIE = 'situla_admin';

app.use('*', logger());
app.use('/api/*', bodyLimit({ maxSize: 64 * 1024 }));
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net data:; img-src 'self' data: https://image.tmdb.org https://cdn.myanimelist.net; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
});
app.use('/api/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });

function safeEquals(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    const dummy = Buffer.alloc(Math.max(a.length, b.length, 1));
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(a, b);
}

function sessionKey() {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  return new TextEncoder().encode(secret);
}

async function requireAdmin(c, next) {
  const token = getCookie(c, COOKIE);
  if (!token) return c.json({ error: 'Authentication required.' }, 401);
  let payload;
  try {
    const result = await jwtVerify(token, sessionKey(), { algorithms: ['HS256'] });
    payload = result.payload;
  } catch {
    return c.json({ error: 'Session expired. Please sign in again.' }, 401);
  }
  if (payload.role !== 'admin') return c.json({ error: 'Authentication required.' }, 401);
  c.set('admin', payload);
  await next();
}

function sameOrigin(c) {
  const origin = c.req.header('origin');
  if (!origin) return true;
  const host = c.req.header('x-forwarded-host') || c.req.header('host');
  const proto = c.req.header('x-forwarded-proto') || new URL(c.req.url).protocol.replace(':', '');
  try { return Boolean(host) && new URL(origin).origin === proto + '://' + host; }
  catch { return false; }
}

async function requireSameOrigin(c, next) {
  if (!sameOrigin(c)) return c.json({ error: 'Cross-origin request blocked.' }, 403);
  await next();
}

function allowLoginAttempt(c) {
  const ip = (c.req.header('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((time) => now - time < 900000);
  if (recent.length >= 8) {
    attempts.set(ip, recent);
    return false;
  }
  recent.push(now);
  attempts.set(ip, recent);
  if (attempts.size > 3000) {
    for (const [key, values] of attempts) {
      if (!values.some((time) => now - time < 900000)) attempts.delete(key);
    }
  }
  return true;
}

const imageUrl = (path, size = 'w342') => path
  ? (process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p').replace(/\/+$/, '') + '/' + size + path
  : null;

export function movieDto(movie) {
  const imdbId = String(movie.imdbId || '').toLowerCase();
  return {
    id: String(movie._id),
    imdbId,
    imdbUrl: /^tt\d{5,12}$/.test(imdbId) ? 'https://www.imdb.com/title/' + imdbId + '/' : null,
    title: movie.title,
    originalTitle: movie.originalTitle,
    overview: movie.overview,
    posterUrl: imageUrl(movie.posterPath),
    backdropUrl: imageUrl(movie.backdropPath, 'w780'),
    releaseDate: movie.releaseDate,
    releaseYear: movie.releaseYear,
    runtime: movie.runtime,
    voteAverage: movie.voteAverage,
    voteCount: movie.voteCount,
    popularity: movie.popularity,
    originalLanguage: movie.originalLanguage,
    genres: movie.genres,
    keywords: movie.keywords,
    certification: movie.certification,
    adult: movie.adult,
    moderationStatus: movie.moderationStatus,
    manualReviewNote: movie.manualReviewNote,
    createdAt: movie.createdAt,
    updatedAt: movie.updatedAt
  };
}


export function tvSeriesDto(series) {
  return {
    id: String(series._id), tmdbId: series.tmdbId, imdbId: series.imdbId || null,
    title: series.title, originalTitle: series.originalTitle, overview: series.overview,
    posterUrl: imageUrl(series.posterPath), backdropUrl: imageUrl(series.backdropPath, 'w780'),
    firstAirDate: series.firstAirDate, releaseYear: series.releaseYear,
    voteAverage: series.voteAverage, voteCount: series.voteCount, popularity: series.popularity,
    genres: series.genres, numberOfSeasons: series.numberOfSeasons,
    numberOfEpisodes: series.numberOfEpisodes,
    seasons: (series.seasons || []).map((season) => ({
      seasonNumber: season.seasonNumber, name: season.name, airDate: season.airDate,
      episodeCount: season.episodeCount, posterUrl: imageUrl(season.posterPath)
    })),
    status: series.status, certification: series.certification,
    moderationStatus: series.moderationStatus
  };
}

export function tvSeasonDto(season) {
  return {
    seasonNumber: season.seasonNumber, name: season.name, overview: season.overview,
    airDate: season.airDate, episodeCount: season.episodeCount,
    posterUrl: imageUrl(season.posterPath),
    episodes: (season.episodes || []).map((episode) => ({
      episodeNumber: episode.episodeNumber, name: episode.name, overview: episode.overview,
      airDate: episode.airDate, runtime: episode.runtime,
      stillUrl: imageUrl(episode.stillPath, 'w342'), voteAverage: episode.voteAverage
    }))
  };
}

export function animeSeriesDto(anime) {
  return {
    id: String(anime._id), malId: anime.malId,
    malUrl: 'https://myanimelist.net/anime/' + anime.malId,
    title: anime.title, titleEnglish: anime.titleEnglish, titleJapanese: anime.titleJapanese,
    synopsis: anime.synopsis, posterUrl: anime.posterUrl, trailerUrl: anime.trailerUrl,
    airedFrom: anime.airedFrom, releaseYear: anime.releaseYear,
    episodes: anime.episodes, duration: anime.duration, score: anime.score,
    scoredBy: anime.scoredBy, rank: anime.rank, popularity: anime.popularity,
    status: anime.status, season: anime.season, type: anime.type, source: anime.source,
    genres: anime.genres, themes: anime.themes, demographics: anime.demographics,
    rating: anime.rating, moderationStatus: anime.moderationStatus
  };
}

app.get('/api/health', async (c) => {
  const required = ['MONGODB_URI', 'MONGODB_DB_NAME', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) return c.json({ status: 'needs_configuration', missing, database: 'not_checked' }, 503);
  try {
    await connectDatabase();
    await Movie.db.db.admin().ping();
    return c.json({ status: 'ok', service: 'situla-backend', database: 'connected', tmdbConfigured: Boolean(process.env.TMDB_API_KEY) });
  } catch (error) {
    console.error('Health check failed:', error.message);
    return c.json({ status: 'error', database: 'unavailable' }, 503);
  }
});

app.post('/api/admin/login', requireSameOrigin, async (c) => {
  if (!allowLoginAttempt(c)) return c.json({ error: 'Too many sign-in attempts. Try again later.' }, 429);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password || username.length > 120 || password.length > 512) {
    return c.json({ error: 'Enter a valid username and password.' }, 400);
  }
  if (!safeEquals(username, process.env.ADMIN_USERNAME || '') || !safeEquals(password, process.env.ADMIN_PASSWORD || '')) {
    return c.json({ error: 'Incorrect username or password.' }, 401);
  }
  try {
    const hours = Math.max(1, Math.min(24, Number(process.env.ADMIN_SESSION_TTL_HOURS || 8)));
    const token = await new SignJWT({ role: 'admin', username })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(String(hours) + 'h')
      .sign(sessionKey());
    setCookie(c, COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
      sameSite: 'Strict', path: '/', maxAge: hours * 3600
    });
    return c.json({ authenticated: true, username });
  } catch (error) {
    console.error('Admin session setup failed:', error.message);
    return c.json({ error: 'Admin authentication is not configured correctly.' }, 503);
  }
});

app.get('/api/admin/session', requireAdmin, (c) => c.json({
  authenticated: true, username: c.get('admin').username
}));

app.post('/api/admin/logout', requireSameOrigin, (c) => {
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ authenticated: false });
});

app.get('/api/admin/dashboard', requireAdmin, async (c) => {
  try {
    await connectDatabase();
    const [total, pending, approved, rejected, recentRuns] = await Promise.all([
      Movie.countDocuments({}), Movie.countDocuments({ moderationStatus: 'pending' }),
      Movie.countDocuments({ moderationStatus: 'approved' }), Movie.countDocuments({ moderationStatus: 'rejected' }),
      CrawlRun.find({}).sort({ createdAt: -1 }).limit(8).lean()
    ]);
    return c.json({
      counts: { total, pending, approved, rejected },
      recentRuns: recentRuns.map((run) => ({
        id: String(run._id), status: run.status, startYear: run.startYear, endYear: run.endYear,
        discoveredCount: run.discoveredCount, importedCount: run.importedCount,
        updatedCount: run.updatedCount, createdAt: run.createdAt
      }))
    });
  } catch (error) {
    console.error('Dashboard read failed:', error.message);
    return c.json({ error: 'Unable to load dashboard data.' }, 503);
  }
});

app.get('/api/admin/movies', requireAdmin, async (c) => {
  try {
    await connectDatabase();
    const requestedPage = Number(c.req.query('page') || 1);
    const requestedLimit = Number(c.req.query('limit') || 20);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 50) : 20;
    const status = c.req.query('status') || 'all';
    const query = (c.req.query('q') || '').trim().slice(0, 80);
    const filter = {};
    if (['pending', 'approved', 'rejected'].includes(status)) filter.moderationStatus = status;
    if (query) {
      const safe = query.replace(/[.*+?^\$\{\}()|[\]\\]/g, '\\$&');
      const expression = new RegExp(safe, 'i');
      filter.$or = [{ title: expression }, { originalTitle: expression }];
      if (/^tt\d{5,12}$/i.test(query)) filter.$or.push({ imdbId: query.toLowerCase() });
    }
    const [items, total] = await Promise.all([
      Movie.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Movie.countDocuments(filter)
    ]);
    return c.json({ items: items.map(movieDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Movie list failed:', error.message);
    return c.json({ error: 'Unable to load movie catalog.' }, 503);
  }
});

app.patch('/api/admin/movies/:id/review', requireSameOrigin, requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!/^[a-f\d]{24}$/i.test(id)) return c.json({ error: 'Invalid movie record ID.' }, 400);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  if (!['pending', 'approved', 'rejected'].includes(body.moderationStatus)) {
    return c.json({ error: 'Choose pending, approved, or rejected.' }, 400);
  }
  try {
    await connectDatabase();
    const movie = await Movie.findByIdAndUpdate(id, {
      moderationStatus: body.moderationStatus,
      manualReviewNote: typeof body.manualReviewNote === 'string' ? body.manualReviewNote.slice(0, 1000) : ''
    }, { new: true, runValidators: true }).lean();
    if (!movie) return c.json({ error: 'Movie not found.' }, 404);
    return c.json({ item: movieDto(movie) });
  } catch (error) {
    console.error('Review update failed:', error.message);
    return c.json({ error: 'Unable to update movie review.' }, 503);
  }
});

app.get('/api/admin/crawl-runs', requireAdmin, async (c) => {
  try {
    await connectDatabase();
    const items = await CrawlRun.find({}).sort({ createdAt: -1 }).limit(50).lean();
    return c.json({ items });
  } catch (error) {
    console.error('Crawl history read failed:', error.message);
    return c.json({ error: 'Unable to load crawler history.' }, 503);
  }
});

app.get('/api/admin/tmdb-status', requireAdmin, async (c) => {
  try {
    const result = await checkTmdbConnection();
    return c.json({ status: 'connected', ...result });
  } catch (error) {
    console.error('TMDB connectivity check failed:', error.message);
    return c.json({
      status: 'unavailable',
      error: error.message || 'TMDB connectivity check failed.'
    }, 502);
  }
});



app.post('/api/admin/seed-top-movies', requireSameOrigin, requireAdmin, async (c) => {
  let body = {};
  try { body = await c.req.json(); } catch {}
  try {
    const result = await importPopularMovies({
      targetCount: body.targetCount ?? 60,
      maxPages: body.maxPages ?? 20
    });
    return c.json({ result });
  } catch (error) {
    console.error('Top movie seed failed:', error.message);
    return c.json({ error: error.message || 'Unable to add popular movies.' }, 502);
  }
});

app.post('/api/admin/import-ids', requireSameOrigin, requireAdmin, async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  try {
    const result = await importMovieIds(body);
    return c.json({ result });
  } catch (error) {
    const invalid = /IMDb title IDs|between 1 and 20|at least one|IMDb IDs/.test(error.message || '');
    console.error('Manual IMDb import failed:', error.message);
    return c.json({ error: error.message || 'Movie ID import failed.' }, invalid ? 400 : 502);
  }
});


app.post('/api/admin/import-tv-series', requireSameOrigin, requireAdmin, async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  try {
    return c.json({ result: await importTvSeriesIds(body) });
  } catch (error) {
    const invalid = /TMDB TV IDs|between 1 and 20/.test(error.message || '');
    console.error('TV series import failed:', error.message);
    return c.json({ error: error.message || 'TV series import failed.' }, invalid ? 400 : 502);
  }
});

app.post('/api/admin/import-anime-series', requireSameOrigin, requireAdmin, async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  try {
    return c.json({ result: await importAnimeIds(body) });
  } catch (error) {
    const invalid = /MyAnimeList IDs|between 1 and 12/.test(error.message || '');
    console.error('Anime series import failed:', error.message);
    return c.json({ error: error.message || 'Anime series import failed.' }, invalid ? 400 : 502);
  }
});

app.get('/api/admin/tv-series', requireAdmin, async (c) => {
  try {
    await connectDatabase();
    const page = Math.max(1, Math.min(100000, Number(c.req.query('page') || 1) || 1));
    const limit = Math.max(1, Math.min(50, Number(c.req.query('limit') || 20) || 20));
    const status = c.req.query('status') || 'all';
    const query = (c.req.query('q') || '').trim().slice(0, 80);
    const filter = {};
    if (['pending', 'approved', 'rejected'].includes(status)) filter.moderationStatus = status;
    if (query) {
      const safe = query.replace(/[.*+?^\$\{\}()|[\]\\]/g, '\\$&');
      filter.$or = [{ title: new RegExp(safe, 'i') }, { originalTitle: new RegExp(safe, 'i') }];
      if (/^\d+$/.test(query)) filter.$or.push({ tmdbId: Number(query) });
    }
    const [items, total] = await Promise.all([
      TvSeries.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      TvSeries.countDocuments(filter)
    ]);
    return c.json({ items: items.map(tvSeriesDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Admin TV catalog read failed:', error.message);
    return c.json({ error: 'Unable to load TV series catalog.' }, 503);
  }
});

app.patch('/api/admin/tv-series/:id/review', requireSameOrigin, requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!/^[a-f\d]{24}$/i.test(id)) return c.json({ error: 'Invalid TV series record ID.' }, 400);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  if (!['pending', 'approved', 'rejected'].includes(body.moderationStatus)) return c.json({ error: 'Choose pending, approved, or rejected.' }, 400);
  try {
    await connectDatabase();
    const item = await TvSeries.findByIdAndUpdate(id, {
      moderationStatus: body.moderationStatus,
      manualReviewNote: typeof body.manualReviewNote === 'string' ? body.manualReviewNote.slice(0, 1000) : ''
    }, { new: true, runValidators: true }).lean();
    if (!item) return c.json({ error: 'TV series not found.' }, 404);
    return c.json({ item: tvSeriesDto(item) });
  } catch (error) {
    console.error('TV series review update failed:', error.message);
    return c.json({ error: 'Unable to update TV series review.' }, 503);
  }
});

app.get('/api/admin/anime-series', requireAdmin, async (c) => {
  try {
    await connectDatabase();
    const page = Math.max(1, Math.min(100000, Number(c.req.query('page') || 1) || 1));
    const limit = Math.max(1, Math.min(50, Number(c.req.query('limit') || 20) || 20));
    const status = c.req.query('status') || 'all';
    const query = (c.req.query('q') || '').trim().slice(0, 80);
    const filter = {};
    if (['pending', 'approved', 'rejected'].includes(status)) filter.moderationStatus = status;
    if (query) {
      const safe = query.replace(/[.*+?^\$\{\}()|[\]\\]/g, '\\$&');
      filter.$or = [{ title: new RegExp(safe, 'i') }, { titleEnglish: new RegExp(safe, 'i') }];
      if (/^\d+$/.test(query)) filter.$or.push({ malId: Number(query) });
    }
    const [items, total] = await Promise.all([
      AnimeSeries.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AnimeSeries.countDocuments(filter)
    ]);
    return c.json({ items: items.map(animeSeriesDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Admin anime catalog read failed:', error.message);
    return c.json({ error: 'Unable to load anime series catalog.' }, 503);
  }
});

app.patch('/api/admin/anime-series/:id/review', requireSameOrigin, requireAdmin, async (c) => {
  const id = c.req.param('id');
  if (!/^[a-f\d]{24}$/i.test(id)) return c.json({ error: 'Invalid anime record ID.' }, 400);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  if (!['pending', 'approved', 'rejected'].includes(body.moderationStatus)) return c.json({ error: 'Choose pending, approved, or rejected.' }, 400);
  try {
    await connectDatabase();
    const item = await AnimeSeries.findByIdAndUpdate(id, {
      moderationStatus: body.moderationStatus,
      manualReviewNote: typeof body.manualReviewNote === 'string' ? body.manualReviewNote.slice(0, 1000) : ''
    }, { new: true, runValidators: true }).lean();
    if (!item) return c.json({ error: 'Anime series not found.' }, 404);
    return c.json({ item: animeSeriesDto(item) });
  } catch (error) {
    console.error('Anime series review update failed:', error.message);
    return c.json({ error: 'Unable to update anime series review.' }, 503);
  }
});

app.post('/api/admin/crawl', requireSameOrigin, requireAdmin, async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  try {
    const result = await runManualCrawl(body);
    return c.json({ result });
  } catch (error) {
    const invalid = /valid release-year|startPage|maxPages/.test(error.message);
    console.error('Manual TMDB crawl failed:', error.message);
    return c.json({ error: error.message || 'Manual crawl failed.' }, invalid ? 400 : 502);
  }
});

app.get('/api/movies', async (c) => {
  try {
    await connectDatabase();
    const requestedPage = Number(c.req.query('page') || 1);
    const requestedLimit = Number(c.req.query('limit') || 20);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 40) : 20;
    const year = Number(c.req.query('year') || 0);
    const query = (c.req.query('q') || '').trim().slice(0, 80);
    const filter = {
      moderationStatus: 'approved',
      adult: false,
      originalLanguage: 'en',
      imdbId: /^tt\d{5,12}$/
    };
    if (year >= 1870 && year <= new Date().getFullYear()) filter.releaseYear = year;
    const imdbQuery = /^tt\d{5,12}$/i.test(query);
    if (imdbQuery) filter.imdbId = query.toLowerCase();
    else if (query) filter.$text = { $search: query };
    const sort = query && !imdbQuery
      ? { score: { $meta: 'textScore' }, popularity: -1, releaseDate: -1 }
      : { popularity: -1, releaseDate: -1 };
    const [items, total] = await Promise.all([
      Movie.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Movie.countDocuments(filter)
    ]);
    return c.json({ items: items.map(movieDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Public movie list failed:', error.message);
    return c.json({ error: 'Movie catalog is temporarily unavailable.' }, 503);
  }
});

app.get('/api/movies/:imdbId', async (c) => {
  const imdbId = String(c.req.param('imdbId') || '').toLowerCase();
  if (!/^tt\d{5,12}$/.test(imdbId)) return c.json({ error: 'Invalid IMDb title ID.' }, 400);
  try {
    await connectDatabase();
    const movie = await Movie.findOne({
      imdbId, moderationStatus: 'approved', adult: false, originalLanguage: 'en'
    }).lean();
    if (!movie) return c.json({ error: 'Movie not found.' }, 404);
    return c.json({ item: movieDto(movie) });
  } catch (error) {
    console.error('Public IMDb movie detail failed:', error.message);
    return c.json({ error: 'Movie detail is temporarily unavailable.' }, 503);
  }
});


app.get('/api/tv', async (c) => {
  try {
    await connectDatabase();
    const page = Math.max(1, Math.min(100000, Number(c.req.query('page') || 1) || 1));
    const limit = Math.max(1, Math.min(40, Number(c.req.query('limit') || 20) || 20));
    const query = (c.req.query('q') || '').trim().slice(0, 80);
    const filter = { moderationStatus: 'approved', adult: false, originalLanguage: 'en' };
    if (query) {
      if (/^\d+$/.test(query)) filter.tmdbId = Number(query);
      else filter.$text = { $search: query };
    }
    const sort = query && !/^\d+$/.test(query)
      ? { score: { $meta: 'textScore' }, popularity: -1, firstAirDate: -1 }
      : { popularity: -1, firstAirDate: -1 };
    const [items, total] = await Promise.all([
      TvSeries.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      TvSeries.countDocuments(filter)
    ]);
    return c.json({ items: items.map(tvSeriesDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Public TV series list failed:', error.message);
    return c.json({ error: 'TV series catalog is temporarily unavailable.' }, 503);
  }
});

app.get('/api/tv/:tmdbId/seasons/:seasonNumber', async (c) => {
  const tmdbId = Number(c.req.param('tmdbId'));
  const seasonNumber = Number(c.req.param('seasonNumber'));
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0 || !Number.isSafeInteger(seasonNumber) || seasonNumber < 0) {
    return c.json({ error: 'Invalid TV series or season ID.' }, 400);
  }
  try {
    await connectDatabase();
    const series = await TvSeries.findOne({ tmdbId, moderationStatus: 'approved', adult: false }).select('tmdbId').lean();
    if (!series) return c.json({ error: 'TV series not found.' }, 404);
    const season = await getTvSeason(tmdbId, seasonNumber);
    return c.json({ item: tvSeasonDto(season) });
  } catch (error) {
    console.error('TV season read failed:', error.message);
    return c.json({ error: 'TV season episodes are temporarily unavailable.' }, 503);
  }
});

app.get('/api/tv/:tmdbId', async (c) => {
  const tmdbId = Number(c.req.param('tmdbId'));
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return c.json({ error: 'Invalid TMDB TV ID.' }, 400);
  try {
    await connectDatabase();
    const item = await TvSeries.findOne({
      tmdbId, moderationStatus: 'approved', adult: false, originalLanguage: 'en'
    }).lean();
    if (!item) return c.json({ error: 'TV series not found.' }, 404);
    return c.json({ item: tvSeriesDto(item) });
  } catch (error) {
    console.error('TV series detail read failed:', error.message);
    return c.json({ error: 'TV series detail is temporarily unavailable.' }, 503);
  }
});

app.get('/api/anime', async (c) => {
  try {
    await connectDatabase();
    const page = Math.max(1, Math.min(100000, Number(c.req.query('page') || 1) || 1));
    const limit = Math.max(1, Math.min(40, Number(c.req.query('limit') || 20) || 20));
    const query = (c.req.query('q') || '').trim().slice(0, 80);
    const filter = { moderationStatus: 'approved', type: { $in: ['TV', 'ONA'] } };
    if (query) {
      if (/^\d+$/.test(query)) filter.malId = Number(query);
      else filter.$text = { $search: query };
    }
    const sort = query && !/^\d+$/.test(query)
      ? { score: { $meta: 'textScore' }, rank: 1, popularity: 1 }
      : { rank: 1, score: -1, popularity: 1 };
    const [items, total] = await Promise.all([
      AnimeSeries.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      AnimeSeries.countDocuments(filter)
    ]);
    return c.json({ items: items.map(animeSeriesDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Public anime series list failed:', error.message);
    return c.json({ error: 'Anime series catalog is temporarily unavailable.' }, 503);
  }
});

app.get('/api/anime/:malId', async (c) => {
  const malId = Number(c.req.param('malId'));
  if (!Number.isSafeInteger(malId) || malId <= 0) return c.json({ error: 'Invalid MyAnimeList ID.' }, 400);
  try {
    await connectDatabase();
    const item = await AnimeSeries.findOne({ malId, moderationStatus: 'approved', type: { $in: ['TV', 'ONA'] } }).lean();
    if (!item) return c.json({ error: 'Anime series not found.' }, 404);
    return c.json({ item: animeSeriesDto(item) });
  } catch (error) {
    console.error('Anime series detail read failed:', error.message);
    return c.json({ error: 'Anime series detail is temporarily unavailable.' }, 503);
  }
});

app.notFound((c) => c.json({ error: 'Not found.' }, 404));
app.onError((error, c) => {
  console.error('Unhandled application error:', error.message);
  return c.json({ error: 'Internal server error.' }, 500);
});

export default app;
