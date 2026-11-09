import 'dotenv/config';
import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';
import { SignJWT, jwtVerify } from 'jose';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { connectDatabase } from './db.js';
import { Movie, CrawlRun } from './models.js';
import { runManualCrawl, checkTmdbConnection, importMovieIds } from './crawler.js';

const app = new Hono();
const attempts = new Map();
const COOKIE = 'situla_admin';

// Curated first-run titles. These are real TMDB metadata records, not fake playback assets.
const STARTER_IMDB_IDS = [
  'tt1375666', 'tt0816692', 'tt0482571', 'tt0133093', 'tt1856101',
  'tt2543164', 'tt1160419', 'tt1631867', 'tt0945513', 'tt1130884',
  'tt8946378', 'tt0167404', 'tt6644200', 'tt1392190', 'tt6710474',
  'tt3659388', 'tt1454468', 'tt0470752', 'tt0107290', 'tt0120737'
];
let starterCatalogPromise;

async function ensureStarterCatalog() {
  const apiKey = (process.env.TMDB_API_KEY || '').trim();
  if (!apiKey || apiKey.startsWith('replace_')) return 0;

  const approvedCount = await Movie.countDocuments({
    moderationStatus: 'approved',
    adult: false,
    originalLanguage: 'en'
  });
  if (approvedCount > 0) return approvedCount;

  if (!starterCatalogPromise) {
    starterCatalogPromise = (async () => {
      await importMovieIds({ source: 'imdb', ids: STARTER_IMDB_IDS });
      const candidates = await Movie.find({
        imdbId: { $in: STARTER_IMDB_IDS },
        adult: false,
        originalLanguage: 'en',
        moderationStatus: { $ne: 'rejected' }
      }).select('tmdbId').lean();

      const ids = candidates.map((movie) => movie.tmdbId);
      if (ids.length) {
        await Movie.updateMany(
          { tmdbId: { $in: ids }, moderationStatus: { $ne: 'rejected' } },
          {
            $set: {
              moderationStatus: 'approved',
              manualReviewNote: 'Curated Situla starter catalog, automatically seeded from TMDB metadata.'
            }
          }
        );
      }
      console.info('Situla starter catalog seeded:', ids.length, 'titles');
      return ids.length;
    })().catch((error) => {
      console.error('Situla starter catalog seed failed:', error.message);
      return 0;
    });
  }

  return starterCatalogPromise;
}

app.use('*', logger());
app.use('/api/*', bodyLimit({ maxSize: 64 * 1024 }));
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net data:; img-src 'self' data: https://image.tmdb.org; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
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
  return {
    // Public/admin API returns movie metadata only. Playback is resolved inside
    // the Android app from tmdbId; never return a provider URL or iframe markup.
    id: String(movie._id), tmdbId: movie.tmdbId, imdbId: movie.imdbId || null, title: movie.title,
    originalTitle: movie.originalTitle, overview: movie.overview,
    posterUrl: imageUrl(movie.posterPath), backdropUrl: imageUrl(movie.backdropPath, 'w780'),
    releaseDate: movie.releaseDate, releaseYear: movie.releaseYear, runtime: movie.runtime,
    voteAverage: movie.voteAverage, voteCount: movie.voteCount, popularity: movie.popularity,
    originalLanguage: movie.originalLanguage, genres: movie.genres, keywords: movie.keywords,
    certification: movie.certification, adult: movie.adult, moderationStatus: movie.moderationStatus,
    manualReviewNote: movie.manualReviewNote, tmdbUrl: movie.tmdbUrl,
    createdAt: movie.createdAt, updatedAt: movie.updatedAt
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
      if (/^\d+$/.test(query)) filter.$or.push({ tmdbId: Number(query) });
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


app.post('/api/admin/import-ids', requireSameOrigin, requireAdmin, async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body.' }, 400); }
  try {
    const result = await importMovieIds(body);
    return c.json({ result });
  } catch (error) {
    const invalid = /Import source|between 1 and 20|at least one|IMDb IDs|TMDB IDs/.test(error.message || '');
    console.error('Manual IMDb/TMDB import failed:', error.message);
    return c.json({ error: error.message || 'Movie ID import failed.' }, invalid ? 400 : 502);
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
    // On a brand-new/empty public catalog, seed a small curated set automatically.
    // A seed failure must not take down the read-only public catalog endpoint.
    await ensureStarterCatalog();
    const requestedPage = Number(c.req.query('page') || 1);
    const requestedLimit = Number(c.req.query('limit') || 20);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 40) : 20;
    const year = Number(c.req.query('year') || 0);
    const query = (c.req.query('q') || '').trim().slice(0, 80);
    const filter = { moderationStatus: 'approved', adult: false, originalLanguage: 'en' };
    if (year >= 1870 && year <= new Date().getFullYear()) filter.releaseYear = year;
    if (query) filter.$text = { $search: query };
    const sort = query
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

app.get('/api/movies/:tmdbId', async (c) => {
  const tmdbId = Number(c.req.param('tmdbId'));
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return c.json({ error: 'Invalid TMDB ID.' }, 400);
  try {
    await connectDatabase();
    const movie = await Movie.findOne({
      tmdbId, moderationStatus: 'approved', adult: false, originalLanguage: 'en'
    }).lean();
    if (!movie) return c.json({ error: 'Movie not found.' }, 404);
    return c.json({ item: movieDto(movie) });
  } catch (error) {
    console.error('Public movie detail failed:', error.message);
    return c.json({ error: 'Movie detail is temporarily unavailable.' }, 503);
  }
});

app.notFound((c) => c.json({ error: 'Not found.' }, 404));
app.onError((error, c) => {
  console.error('Unhandled application error:', error.message);
  return c.json({ error: 'Internal server error.' }, 500);
});

export default app;
