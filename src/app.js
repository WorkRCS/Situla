import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { connectDatabase } from './db.js';
import { createCatalogResponseCache } from './redis-cache.js';
import { createRequestConcurrencyGuard } from './request-guard.js';
import mongoose from 'mongoose';
import { getCookie, setCookie } from 'hono/cookie';
import {
  User, AuthSession, Device, ActivitySession, Movie, TvSeries, AnimeSeries, Announcement, AnnouncementRead
} from './models.js';
import {
  SESSION_COOKIE, DEVICE_COOKIE, OAUTH_STATE_COOKIE, OAUTH_NONCE_COOKIE,
  authSecret, normalizeEmail, validEmail, validPassword, hashPassword, hashToken, verifyPassword,
  getClientIp, isSameOriginRequest, enforceRateLimit, hasAdminRole, keyedHash,
  getSuspendedSession, isAccountSuspended,
  createLoginSession, getAuthenticatedSession, revokeCurrentSession, safeUser,
  getGoogleOAuthClient, randomToken, safeEqual, clearOAuthCookies
} from './auth.js';
import { getWatchPolicy, addCalendarMonths } from './membership-policy.js';
import adminRouter from './admin.js';
import { encryptSensitiveIp, parseUserAgent } from './admin-analytics.js';
import {
  getRollingTenYearWindow, buildRecentDateWindowFilter, PREMIUM_FEED_LIMIT
} from './premium-feed.js';
import {
  resolvePlaybackPrincipal, readAccessStatus, startPlaybackSession,
  heartbeatPlaybackSession, stopPlaybackSession
} from './access-control.js';

const app = new Hono();
const IMDB_ID = /^tt\d{5,12}$/i;

if (process.env.NODE_ENV === 'development') app.use('*', logger());
app.use('*', async (c, next) => {
  const suppliedId = String(c.req.header('x-request-id') || '');
  const requestId = /^[a-zA-Z0-9._:-]{1,96}$/.test(suppliedId) ? suppliedId : randomUUID();
  const startedAt = performance.now();
  c.set('requestId', requestId);
  await next();
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  c.header('X-Situla-Request-Id', requestId);
  c.header('Server-Timing', 'app;dur=' + durationMs);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), picture-in-picture=(), fullscreen=(self "https://vidlink.pro"), autoplay=(self "https://vidlink.pro")');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net data:; img-src 'self' data: https:; frame-src https://vidlink.pro https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  const status = c.res.status;
  if (status >= 500 || durationMs >= 1_000) {
    const event = {
      event: status >= 500 ? 'api_request_failed' : 'api_request_slow',
      requestId,
      method: c.req.method,
      route: new URL(c.req.url).pathname,
      status,
      durationMs,
      cache: c.res.headers.get('x-situla-cache') || null,
      vercelId: c.req.header('x-vercel-id') || null
    };
    (status >= 500 ? console.error : console.warn)(JSON.stringify(event));
  }
});
const catalogResponseCache = createCatalogResponseCache({
  getVariant: async (c, policy) => {
    if (!policy.premiumAware) return 'public';
    return await getPremiumFeedWindow(c) ? 'premium' : 'standard';
  }
});

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

// Bound the entire API path, including Redis and entitlement checks. Short bursts queue briefly.
app.use('/api/*', createRequestConcurrencyGuard({
  maxConcurrent: 8,
  maxQueued: 48,
  queueTimeoutMs: 800
}));
app.use('/api/*', catalogResponseCache);

app.route('/api/admin', adminRouter);

export function pageOptions(c, defaultLimit = 10, maxLimit = 10) {
  const requestedPage = Number(c.req.query('page') || 1);
  const requestedLimit = Number(c.req.query('limit') || defaultLimit);
  return {
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1,
    limit: Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, maxLimit) : defaultLimit
  };
}

const catalogTierMemo = new Map();
const CATALOG_TIER_MEMO_TTL_MS = 5_000;
const CATALOG_TIER_MEMO_MAX_ENTRIES = 1_000;

async function resolveCatalogTierWindow(sessionToken, deviceToken) {
  // This middleware runs before route handlers, so establish Mongo before any Mongoose query.
  await connectDatabase();
  const now = new Date();
  const session = await AuthSession.findOne({
    tokenHash: hashToken(sessionToken),
    expiresAt: { $gt: now },
    revokedAt: null
  }).select('userId deviceId').lean();
  if (!session) return null;

  const [user, device] = await Promise.all([
    User.findById(session.userId).select('status suspendedUntil planId membership').lean(),
    Device.exists({
      _id: session.deviceId,
      userId: session.userId,
      tokenHash: hashToken(deviceToken),
      revokedAt: null
    })
  ]);
  if (!user || !device) return null;

  const suspensionExpired = user.status === 'suspended' && user.suspendedUntil &&
    new Date(user.suspendedUntil) <= now;
  if (user.status !== 'active' && !suspensionExpired) return null;
  return getWatchPolicy(user, now).planId === 'premium' ? getRollingTenYearWindow() : null;
}

async function getMemoizedCatalogTierWindow(sessionToken, deviceToken) {
  const key = hashToken('catalog-tier:' + sessionToken + ':' + deviceToken);
  const now = Date.now();
  const existing = catalogTierMemo.get(key);
  if (existing && existing.expiresAt > now) {
    catalogTierMemo.delete(key);
    catalogTierMemo.set(key, existing);
    return existing.promise;
  }
  if (existing) catalogTierMemo.delete(key);

  const entry = { expiresAt: Number.POSITIVE_INFINITY, promise: null };
  entry.promise = resolveCatalogTierWindow(sessionToken, deviceToken).then((window) => {
    entry.expiresAt = Date.now() + CATALOG_TIER_MEMO_TTL_MS;
    return window;
  }).catch((error) => {
    catalogTierMemo.delete(key);
    throw error;
  });
  catalogTierMemo.set(key, entry);
  while (catalogTierMemo.size > CATALOG_TIER_MEMO_MAX_ENTRIES) {
    const oldestKey = catalogTierMemo.keys().next().value;
    if (oldestKey === key) break;
    catalogTierMemo.delete(oldestKey);
  }
  return entry.promise;
}

async function getPremiumFeedWindow(c) {
  if (c.get('premiumFeedWindowResolved')) return c.get('premiumFeedWindow');

  const sessionToken = getCookie(c, SESSION_COOKIE);
  const deviceToken = getCookie(c, DEVICE_COOKIE);
  // Anonymous traffic stays on the public feed and never opens a database connection for cache lookup.
  if (!sessionToken || !deviceToken) {
    c.set('premiumFeedWindowResolved', true);
    c.set('premiumFeedWindow', null);
    return null;
  }

  const window = await getMemoizedCatalogTierWindow(sessionToken, deviceToken);
  c.set('premiumFeedWindowResolved', true);
  c.set('premiumFeedWindow', window);
  return window;
}

async function findDatePrioritizedFeedPage({ Model, filter, countFilter = filter, dateField, yearField, sort, page, limit, select, ignorePageOffset = false }) {
  const window = getRollingTenYearWindow();
  const recentClause = buildRecentDateWindowFilter(dateField, yearField, window);
  const recentFilter = { $and: [filter, recentClause] };
  const recentCountFilter = { $and: [countFilter, recentClause] };
  const offset = ignorePageOffset ? 0 : (page - 1) * limit;

  async function readRecentPage() {
    let query = Model.find(recentFilter);
    if (select) query = query.select(select);
    return query.sort(sort).skip(offset).limit(limit).lean();
  }

  const [items, total] = await Promise.all([
    readRecentPage(),
    Model.countDocuments(recentCountFilter)
  ]);
  return { items, total, window };
}

function safeText(value) {
  return String(value || '').trim().slice(0, 80);
}

export function movieDto(movie) {
  const imdbId = String(movie.imdbId || '').toLowerCase();
  return {
    id: String(movie._id),
    imdbId,
    imdbUrl: IMDB_ID.test(imdbId) ? 'https://www.imdb.com/title/' + imdbId + '/' : null,
    title: movie.title,
    originalTitle: movie.originalTitle || '',
    overview: movie.overview || '',
    posterUrl: movie.posterUrl || null,
    backdropUrl: movie.backdropUrl || null,
    releaseDate: movie.releaseDate || null,
    releaseYear: movie.releaseYear || null,
    runtime: movie.runtime || null,
    voteAverage: Number(movie.voteAverage) || 0,
    voteCount: Number(movie.voteCount) || 0,
    popularity: Number(movie.popularity) || 0,
    genres: Array.isArray(movie.genres) ? movie.genres : [],
    keywords: Array.isArray(movie.keywords) ? movie.keywords : [],
    certification: movie.certification || '',
    createdAt: movie.createdAt,
    updatedAt: movie.updatedAt
  };
}

export function movieDetailsDto(movie) {
  return {
    ...movieDto(movie),
    tagline: movie.tagline || '',
    originalLanguage: movie.originalLanguage || '',
    adult: Boolean(movie.adult),
    status: movie.status || '',
    homepage: movie.homepage || '',
    sourceUrl: movie.sourceUrl || '',
    metadataSource: movie.metadataSource || '',
    budget: Number(movie.budget) || 0,
    revenue: Number(movie.revenue) || 0,
    productionCompanies: Array.isArray(movie.productionCompanies) ? movie.productionCompanies : [],
    productionCountries: Array.isArray(movie.productionCountries) ? movie.productionCountries : [],
    spokenLanguages: Array.isArray(movie.spokenLanguages) ? movie.spokenLanguages : [],
    cast: Array.isArray(movie.cast) ? movie.cast.map((person) => ({
      name: person.name || '',
      character: person.character || '',
      profileUrl: person.profileUrl || null
    })) : [],
    directors: Array.isArray(movie.directors) ? movie.directors : [],
    writers: Array.isArray(movie.writers) ? movie.writers : [],
    trailerUrl: movie.trailerUrl || '',
    collection: movie.collectionInfo ? {
      name: movie.collectionInfo.name || '',
      posterUrl: movie.collectionInfo.posterUrl || null,
      backdropUrl: movie.collectionInfo.backdropUrl || null
    } : null
  };
}

export function tvSeriesDto(series) {
  const tmdbId = Number(series.tmdbId) || null;
  return {
    id: String(series._id),
    tmdbId,
    tmdbUrl: tmdbId ? 'https://www.themoviedb.org/tv/' + tmdbId : null,
    externalImdbId: String(series.externalImdbId || '').toLowerCase() || null,
    title: series.title,
    originalTitle: series.originalTitle || '',
    overview: series.overview || '',
    posterUrl: series.posterUrl || null,
    backdropUrl: series.backdropUrl || null,
    firstAirDate: series.firstAirDate || null,
    releaseYear: series.releaseYear || null,
    runtime: Number(series.runtime) || null,
    adult: Boolean(series.adult),
    certification: series.certification || '',
    voteAverage: Number(series.voteAverage) || 0,
    voteCount: Number(series.voteCount) || 0,
    popularity: Number(series.popularity) || 0,
    genres: Array.isArray(series.genres) ? series.genres : [],
    keywords: Array.isArray(series.keywords) ? series.keywords : [],
    metadataSource: series.metadataSource || '',
    sourceUrl: series.sourceUrl || '',
    referenceUrl: series.referenceUrl || '',
    network: series.network || '',
    country: series.country || '',
    creators: Array.isArray(series.creators) ? series.creators : [],
    numberOfSeasons: Number(series.numberOfSeasons) || (series.seasons || []).filter((season) => Number(season.seasonNumber) > 0).length,
    numberOfEpisodes: Number(series.numberOfEpisodes) || (series.seasons || []).reduce((sum, season) => sum + (Number(season.episodeCount) || 0), 0),
    seasons: (series.seasons || []).map((season) => ({
      seasonNumber: season.seasonNumber,
      name: season.name || '',
      airDate: season.airDate || null,
      episodeCount: Number(season.episodeCount) || (season.episodes || []).length,
      posterUrl: season.posterUrl || null
    })),
    status: series.status || ''
  };
}

export function tvSeasonDto(season) {
  return {
    seasonNumber: season.seasonNumber,
    name: season.name || '',
    overview: season.overview || '',
    airDate: season.airDate || null,
    episodeCount: Number(season.episodeCount) || (season.episodes || []).length,
    posterUrl: season.posterUrl || null,
    episodes: (season.episodes || []).map((episode) => ({
      episodeNumber: episode.episodeNumber,
      name: episode.name || '',
      overview: episode.overview || '',
      airDate: episode.airDate || null,
      runtime: episode.runtime || null,
      stillUrl: episode.stillUrl || null,
      voteAverage: Number(episode.voteAverage) || 0
    }))
  };
}

export function animeSeriesDto(anime) {
  return {
    id: String(anime._id),
    malId: anime.malId,
    malUrl: anime.malUrl || ('https://myanimelist.net/anime/' + anime.malId),
    title: anime.title,
    titleEnglish: anime.titleEnglish || '',
    titleJapanese: anime.titleJapanese || '',
    synopsis: anime.synopsis || '',
    posterUrl: anime.posterUrl || null,
    posterFallbackUrl: anime.posterFallbackUrl || null,
    backdropUrl: anime.backdropUrl || anime.bannerUrl || anime.posterUrl || null,
    bannerUrl: anime.bannerUrl || anime.backdropUrl || null,
    sourceUrl: anime.sourceUrl || '',
    metadataSource: anime.metadataSource || '',
    trailerUrl: anime.trailerUrl || null,
    airedFrom: anime.airedFrom || null,
    releaseYear: anime.releaseYear || null,
    episodes: anime.episodes ?? null,
    duration: anime.duration || '',
    score: Number(anime.score) || 0,
    scoredBy: Number(anime.scoredBy) || 0,
    rank: anime.rank ?? null,
    popularity: anime.popularity ?? null,
    status: anime.status || '',
    season: anime.season || '',
    type: anime.type || 'TV',
    source: anime.source || '',
    genres: Array.isArray(anime.genres) ? anime.genres : [],
    themes: Array.isArray(anime.themes) ? anime.themes : [],
    demographics: Array.isArray(anime.demographics) ? anime.demographics : [],
    studios: Array.isArray(anime.studios) ? anime.studios : [],
    producers: Array.isArray(anime.producers) ? anime.producers : [],
    episodeGuide: Array.isArray(anime.episodeGuide) ? anime.episodeGuide.map((episode) => ({
      episodeNumber: Number(episode.episodeNumber),
      absoluteEpisodeNumber: episode.absoluteEpisodeNumber ?? null,
      seasonNumber: Number(episode.seasonNumber) || 1,
      title: episode.title || '',
      titleJapanese: episode.titleJapanese || '',
      overview: episode.overview || '',
      airDate: episode.airDate || null,
      runtime: episode.runtime || null,
      imageUrl: episode.imageUrl || null,
      tvdbEpisodeId: episode.tvdbEpisodeId || null
    })) : [],
    relatedAnime: Array.isArray(anime.relatedAnime) ? anime.relatedAnime.map((item) => ({
      malId: Number(item.malId),
      title: item.title || '',
      relationType: item.relationType || 'RELATED',
      episodes: item.episodes ?? null,
      seasonYear: item.seasonYear ?? null,
      posterUrl: item.posterUrl || null
    })) : [],
    nextAiringEpisode: anime.nextAiringEpisode ? {
      episode: Number(anime.nextAiringEpisode.episode) || null,
      airDate: anime.nextAiringEpisode.airDate || null
    } : null,
    rating: anime.rating || ''
  };
}

app.get('/api/health', async (c) => {
  const required = ['MONGODB_URI', 'MONGODB_DB_NAME', 'AUTH_SECRET'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) return c.json({ status: 'needs_configuration', missing, database: 'not_checked' }, 503);
  try {
    authSecret();
  } catch {
    return c.json({ status: 'needs_configuration', invalid: ['AUTH_SECRET must contain at least 32 bytes'], database: 'not_checked' }, 503);
  }
  try {
    await connectDatabase();
    await Movie.db.db.admin().ping();
    return c.json({
      status: 'ok',
      service: 'situla-backend',
      database: 'connected',
      authentication: 'enabled',
      googleOAuth: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI ? 'configured' : 'needs_configuration'
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    return c.json({ status: 'error', database: 'unavailable' }, 503);
  }
});


// Authentication and server-owned access control.
function apiError(c, error, fallback = 'The request could not be completed.') {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error('Authentication/access request failed:', error?.cause?.message || error?.message || fallback);
  const safeConfigurationMessage = ['AUTH_SECRET_NOT_CONFIGURED', 'DATABASE_NOT_CONFIGURED']
    .includes(error?.code);
  return c.json({
    error: status >= 500 && !safeConfigurationMessage ? fallback : (error?.message || fallback),
    code: error?.code || 'REQUEST_FAILED',
    ...(error?.access ? { access: error.access } : {})
  }, status);
}

function requireSameOrigin(c) {
  if (isSameOriginRequest(c)) return null;
  return c.json({ error: 'Cross-origin request rejected.', code: 'ORIGIN_CHECK_FAILED' }, 403);
}

function displayNameFromEmail(email) {
  const local = email.split('@')[0].replace(/[._+-]+/g, ' ').trim();
  return local.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80) || 'Situla Member';
}

app.post('/api/auth/email', async (c) => {
  const originFailure = requireSameOrigin(c);
  if (originFailure) return originFailure;
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = body.password;
  const rememberMe = body.rememberMe !== false;
  if (!validEmail(email)) {
    return c.json({ error: 'Enter a valid email address.', code: 'INVALID_EMAIL' }, 400);
  }
  if (!validPassword(password)) {
    return c.json({ error: 'Password must contain at least 10 characters and no more than 128 bytes.', code: 'INVALID_PASSWORD' }, 400);
  }
  try {
    await connectDatabase();
    authSecret();
    const ip = getClientIp(c) || 'unknown';
    if (!await enforceRateLimit('email-login:' + ip + ':' + email, 8, 15 * 60)) {
      return c.json({ error: 'Too many sign-in attempts. Please try again later.', code: 'RATE_LIMITED' }, 429);
    }

    let user = await User.findOne({ email }).select('+passwordHash');
    let created = false;
    if (user) {
      if (await isAccountSuspended(user)) return c.json({ error: 'This account is suspended.', code: 'ACCOUNT_SUSPENDED', suspendedUntil: user.suspendedUntil || null, reason: user.suspensionReason || '' }, 403);
      if (!user.passwordHash || !await verifyPassword(password, user.passwordHash)) {
        return c.json({ error: 'Email or password is incorrect.', code: 'INVALID_CREDENTIALS' }, 401);
      }
      if (!user.hasPassword) {
        user.hasPassword = true;
        await user.save();
      }
    } else {
      const passwordHash = await hashPassword(password);
      try {
        user = await User.create({
          email,
          displayName: displayNameFromEmail(email),
          passwordHash,
          hasPassword: true,
          emailVerified: false,
          role: 'user',
          planId: 'free',
          membership: { status: 'inactive', billingCycle: null, startedAt: null, expiresAt: null },
          status: 'active'
        });
        created = true;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        user = await User.findOne({ email }).select('+passwordHash');
        if (!user || !user.passwordHash || !await verifyPassword(password, user.passwordHash)) {
          return c.json({ error: 'Email or password is incorrect.', code: 'INVALID_CREDENTIALS' }, 401);
        }
      }
    }

    const session = await createLoginSession(c, user, rememberMe);
    return c.json({ user: safeUser(user), created, sessionExpiresAt: session.expiresAt }, created ? 201 : 200);
  } catch (error) {
    return apiError(c, error, 'Email sign-in is temporarily unavailable.');
  }
});

app.get('/api/auth/google', async (c) => {
  try {
    await connectDatabase();
    authSecret();
    const ip = getClientIp(c) || 'unknown';
    if (!await enforceRateLimit('google-oauth:' + ip, 10, 15 * 60)) {
      return c.json({ error: 'Too many Google sign-in attempts. Try again later.', code: 'RATE_LIMITED' }, 429);
    }
    const state = randomToken(32);
    const nonce = randomToken(32);
    const client = getGoogleOAuthClient();
    const options = {
      access_type: 'online',
      prompt: 'select_account',
      response_type: 'code',
      scope: ['openid', 'email', 'profile'],
      state,
      nonce
    };
    setCookie(c, OAUTH_STATE_COOKIE, state, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax', path: '/api/auth/google', maxAge: 600
    });
    setCookie(c, OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax', path: '/api/auth/google', maxAge: 600
    });
    return c.redirect(client.generateAuthUrl(options), 302);
  } catch (error) {
    if (error?.code === 'GOOGLE_NOT_CONFIGURED') return c.redirect('/login?authError=google', 302);
    return apiError(c, error, 'Google Sign-in is not available yet. Check the server configuration.');
  }
});

app.get('/api/auth/google/callback', async (c) => {
  try {
    await connectDatabase();
    authSecret();
    const query = c.req.query();
    const expectedState = getCookie(c, OAUTH_STATE_COOKIE);
    const expectedNonce = getCookie(c, OAUTH_NONCE_COOKIE);
    if (query.error || !query.code || !safeEqual(query.state, expectedState) || !expectedNonce) {
      clearOAuthCookies(c);
      return c.redirect('/login?authError=google', 302);
    }

    const client = getGoogleOAuthClient();
    const tokenResponse = await client.getToken(query.code);
    if (!tokenResponse.tokens?.id_token) throw new Error('Google did not return an ID token.');
    const ticket = await client.verifyIdToken({
      idToken: tokenResponse.tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const identity = ticket.getPayload();
    if (!identity?.sub || !identity.email || identity.email_verified !== true ||
        !safeEqual(identity.nonce, expectedNonce)) {
      throw new Error('Google identity verification failed.');
    }

    const email = normalizeEmail(identity.email);
    if (!validEmail(email)) throw new Error('Google returned an invalid account email.');
    let user = await User.findOne({ googleSub: String(identity.sub) }).select('+passwordHash');
    if (user && user.email !== email) throw new Error('Google account identity does not match the saved account.');
    if (!user) {
      user = await User.findOne({ email }).select('+passwordHash');
      if (user) {
        if (await isAccountSuspended(user)) throw new Error('This account is suspended.');
        if (user.googleSub && user.googleSub !== String(identity.sub)) throw new Error('This email is already linked to another Google identity.');
        user.googleSub = String(identity.sub);
        user.emailVerified = true;
        await user.save();
      } else {
        try {
          user = await User.create({
            email,
            displayName: String(identity.name || displayNameFromEmail(email)).slice(0, 80),
            googleSub: String(identity.sub),
            emailVerified: true,
            role: 'user',
            status: 'active',
            planId: 'free',
            membership: { status: 'inactive', billingCycle: null, startedAt: null, expiresAt: null }
          });
        } catch (error) {
          if (error?.code !== 11000) throw error;
          user = await User.findOne({ $or: [{ email }, { googleSub: String(identity.sub) }] }).select('+passwordHash');
          if (!user || user.email !== email || (user.googleSub && user.googleSub !== String(identity.sub))) throw error;
          if (!user.googleSub) {
            user.googleSub = String(identity.sub);
            user.emailVerified = true;
            user.hasPassword = Boolean(user.passwordHash);
            await user.save();
          }
        }
      }
    }
    if (await isAccountSuspended(user) || user.status !== 'active') {
      throw new Error('This account is suspended or unavailable.');
    }
    await createLoginSession(c, user, true);
    clearOAuthCookies(c);
    return c.redirect('/profile', 302);
  } catch (error) {
    console.error('Google OAuth callback failed:', error?.message || 'Unknown OAuth error');
    clearOAuthCookies(c);
    return c.redirect('/login?authError=google', 302);
  }
});

app.get('/api/auth/me', async (c) => {
  try {
    await connectDatabase();
    const suspended = await getSuspendedSession(c);
    if (suspended) {
      return c.json({
        error: 'This account is temporarily suspended.',
        code: 'ACCOUNT_SUSPENDED',
        suspendedUntil: suspended.user.suspendedUntil || null,
        reason: suspended.user.suspensionReason || ''
      }, 403);
    }
    const authenticated = await getAuthenticatedSession(c);
    if (!authenticated) return c.json({ error: 'Sign-in required.', code: 'UNAUTHENTICATED' }, 401);
    const user = authenticated.user;
    const [deviceCount, access] = await Promise.all([
      Device.countDocuments({ userId: user._id, revokedAt: null }),
      readAccessStatus({ ownerType: 'user', ownerId: user._id, user })
    ]);
    const safe = safeUser(user);
    return c.json({
      user: safe,
      devices: { active: deviceCount, limit: getWatchPolicy(user).deviceLimit },
      access
    });
  } catch (error) {
    return apiError(c, error, 'Could not load the account session.');
  }
});

app.post('/api/presence', async (c) => {
  const originFailure = requireSameOrigin(c);
  if (originFailure) return originFailure;
  try {
    const body = await c.req.json().catch(() => ({}));
    const activityId = String(body.activityId || '');
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(activityId) ||
        (body.active !== undefined && typeof body.active !== 'boolean') ||
        (body.stop !== undefined && typeof body.stop !== 'boolean')) {
      return c.json({ error: 'Invalid activity heartbeat.' }, 400);
    }
    await connectDatabase();
    const principal = await resolvePlaybackPrincipal(c);
    const sourceSessionId = principal.ownerType === 'user'
      ? principal.session._id : principal.guestSession._id;
    const sessionKey = keyedHash('activity-session:' + principal.ownerType + ':' + sourceSessionId + ':' + activityId);
    const now = new Date();
    const ip = getClientIp(c);
    const userAgent = String(c.req.header('user-agent') || '').slice(0, 500);
    const parsedAgent = parseUserAgent(userAgent);
    const existing = await ActivitySession.findOne({ sessionKey });
    const deltaSeconds = existing && !existing.endedAt
      ? Math.min(90, Math.max(0, Math.floor((now.getTime() - new Date(existing.lastSeenAt).getTime()) / 1000)))
      : 0;
    const set = {
      ownerType: principal.ownerType,
      ownerId: principal.ownerId,
      guestAccessId: principal.ownerType === 'guest' ? principal.ownerId : null,
      lastSeenAt: now,
      isActive: body.stop === true ? false : body.active === true,
      endedAt: body.stop === true ? now : null,
      ipHash: ip ? keyedHash('activity-ip:' + ip) : null,
      ipEncrypted: ip ? encryptSensitiveIp(ip) : null,
      userAgent,
      browser: parsedAgent.browser,
      operatingSystem: parsedAgent.operatingSystem,
      deviceType: parsedAgent.deviceType,
      expiresAt: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
    };
    if (body.active === true && body.stop !== true) set.lastActiveAt = now;
    if (existing?.endedAt) {
      await ActivitySession.updateOne({ _id: existing._id, endedAt: existing.endedAt }, { $set: {
        ...set, startedAt: now, activeSeconds: 0, lastActiveAt: body.active === true && body.stop !== true ? now : null
      } });
    } else if (existing) {
      if (body.active === true && body.stop !== true && deltaSeconds > 0) {
        const update = await ActivitySession.updateOne(
          { _id: existing._id, endedAt: null, lastSeenAt: existing.lastSeenAt },
          { $set: set, $inc: { activeSeconds: deltaSeconds } }
        );
        // Only one concurrent heartbeat may credit the same time interval.
        if (!update.matchedCount) {
          await ActivitySession.updateOne({ _id: existing._id, endedAt: null }, { $set: set });
        }
      } else {
        await ActivitySession.updateOne({ _id: existing._id, endedAt: null }, { $set: set });
      }
    } else {
      try {
        await ActivitySession.create({
          sessionKey, ...set, startedAt: now, activeSeconds: 0,
          lastActiveAt: body.active === true && body.stop !== true ? now : null
        });
      } catch (error) {
        // Strict Mode or a second tab can win the unique sessionKey race.
        if (error?.code !== 11000) throw error;
        await ActivitySession.updateOne({ sessionKey, endedAt: null }, { $set: set });
      }
    }
    if (body.stop === true) return c.json({ tracked: true, stopped: true });
    return c.json({ tracked: true, ownerType: principal.ownerType });
  } catch (error) {
    if (error?.code === 'ACCOUNT_SUSPENDED') {
      return c.json({ error: 'This account is suspended.', code: 'ACCOUNT_SUSPENDED', suspendedUntil: error.suspendedUntil || null }, 403);
    }
    return apiError(c, error, 'Activity could not be recorded.');
  }
});

app.post('/api/auth/logout', async (c) => {
  const originFailure = requireSameOrigin(c);
  if (originFailure) return originFailure;
  try {
    await connectDatabase();
    await revokeCurrentSession(c);
    return c.json({ signedOut: true });
  } catch (error) {
    return apiError(c, error, 'Sign-out is temporarily unavailable.');
  }
});

app.get('/api/auth/devices', async (c) => {
  try {
    await connectDatabase();
    const authenticated = await getAuthenticatedSession(c);
    if (!authenticated) return c.json({ error: 'Sign-in required.' }, 401);
    const devices = await Device.find({ userId: authenticated.user._id, revokedAt: null })
      .sort({ lastSeenAt: -1 }).lean();
    return c.json({
      items: devices.map((device) => ({
        id: String(device._id),
        label: device.label,
        lastSeenAt: device.lastSeenAt,
        slot: Number.isInteger(device.slot) ? device.slot + 1 : null,
        current: String(device._id) === String(authenticated.device._id)
      })),
      limit: getWatchPolicy(authenticated.user).deviceLimit
    });
  } catch (error) {
    return apiError(c, error, 'Could not load registered devices.');
  }
});

app.delete('/api/auth/devices/:deviceId', async (c) => {
  const originFailure = requireSameOrigin(c);
  if (originFailure) return originFailure;
  const deviceId = c.req.param('deviceId');
  if (!/^[a-f0-9]{24}$/i.test(deviceId)) return c.json({ error: 'Invalid device ID.' }, 400);
  try {
    await connectDatabase();
    const authenticated = await getAuthenticatedSession(c);
    if (!authenticated) return c.json({ error: 'Sign-in required.' }, 401);
    const device = await Device.findOne({ _id: deviceId, userId: authenticated.user._id, revokedAt: null });
    if (!device) return c.json({ error: 'Device not found.' }, 404);
    const now = new Date();
    device.revokedAt = now;
    await device.save();
    await AuthSession.updateMany({ deviceId: device._id, revokedAt: null }, { $set: { revokedAt: now, expiresAt: now } });
    const isCurrent = String(device._id) === String(authenticated.device._id);
    if (isCurrent) await revokeCurrentSession(c);
    return c.json({ revoked: true, currentDevice: isCurrent });
  } catch (error) {
    return apiError(c, error, 'Could not revoke the device.');
  }
});

app.get('/api/access/status', async (c) => {
  try {
    await connectDatabase();
    const principal = await resolvePlaybackPrincipal(c);
    return c.json({ access: await readAccessStatus(principal) });
  } catch (error) {
    return apiError(c, error, 'Could not verify watch access.');
  }
});

app.post('/api/playback/start', async (c) => {
  const originFailure = requireSameOrigin(c);
  if (originFailure) return originFailure;
  try {
    const body = await c.req.json().catch(() => ({}));
    const mediaType = String(body.mediaType || '').toLowerCase();
    const mediaId = String(body.mediaId || '').trim();
    const media = { mediaType, mediaId };
    let validateCatalogRecord;

    if (mediaType === 'movie') {
      if (!/^tt\d{5,12}$/i.test(mediaId)) return c.json({ error: 'Invalid movie ID.' }, 400);
      validateCatalogRecord = async () => Boolean(await Movie.exists({ imdbId: mediaId.toLowerCase(), adult: { $ne: true } }));
    } else if (mediaType === 'tv') {
      const tmdbId = Number(mediaId);
      const season = Number(body.season);
      const episode = Number(body.episode);
      if (!/^\d{1,12}$/.test(mediaId) || !Number.isSafeInteger(tmdbId) || tmdbId < 1 ||
          !Number.isSafeInteger(season) || season < 0 || !Number.isSafeInteger(episode) || episode < 1) {
        return c.json({ error: 'Invalid TV episode route.' }, 400);
      }
      media.season = season;
      media.episode = episode;
      validateCatalogRecord = async () => {
        const series = await TvSeries.findOne({ tmdbId, adult: { $ne: true } }).select('seasons').lean();
        const targetSeason = series?.seasons?.find((item) => Number(item.seasonNumber) === season);
        return Boolean(targetSeason?.episodes?.some((item) => Number(item.episodeNumber) === episode));
      };
    } else if (mediaType === 'anime') {
      const malId = Number(mediaId);
      const episode = Number(body.episode);
      const audio = String(body.audio || 'sub').toLowerCase();
      if (!/^\d{1,12}$/.test(mediaId) || !Number.isSafeInteger(malId) || malId < 1 ||
          !Number.isSafeInteger(episode) || episode < 1 || !['sub', 'dub'].includes(audio)) {
        return c.json({ error: 'Invalid Anime episode route.' }, 400);
      }
      media.episode = episode;
      media.audio = audio;
      validateCatalogRecord = async () => {
        const anime = await AnimeSeries.findOne({ malId, type: { $in: ['TV', 'ONA'] } }).select('episodes episodeGuide').lean();
        return Boolean(anime && !(Number(anime.episodes) > 0 && episode > Number(anime.episodes)));
      };
    } else {
      return c.json({ error: 'Unsupported playback type.' }, 400);
    }

    await connectDatabase();
    if (!await validateCatalogRecord()) {
      const label = mediaType === 'movie' ? 'Movie' : mediaType === 'tv' ? 'TV episode' : 'Anime episode';
      return c.json({ error: label + ' is not available in the Situla catalog.' }, 404);
    }

    const principal = await resolvePlaybackPrincipal(c);
    const principalKey = String(principal.ownerId);
    if (!await enforceRateLimit('playback-start:' + principal.ownerType + ':' + principalKey, 20, 60)) {
      return c.json({ error: 'Too many playback starts. Please wait before opening another title.', code: 'PLAYBACK_RATE_LIMITED' }, 429);
    }
    const result = await startPlaybackSession(principal, media);
    return c.json(result, 201);
  } catch (error) {
    return apiError(c, error, 'Playback access could not be started.');
  }
});

app.post('/api/playback/heartbeat', async (c) => {
  const originFailure = requireSameOrigin(c);
  if (originFailure) return originFailure;
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!/^[a-f0-9]{24}$/i.test(String(body.sessionId || '')) || typeof body.playing !== 'boolean') {
      return c.json({ error: 'Invalid playback heartbeat.' }, 400);
    }
    await connectDatabase();
    const principal = await resolvePlaybackPrincipal(c);
    return c.json(await heartbeatPlaybackSession(principal, body.sessionId, body.playing));
  } catch (error) {
    return apiError(c, error, 'Playback heartbeat failed.');
  }
});

app.post('/api/playback/stop', async (c) => {
  const originFailure = requireSameOrigin(c);
  if (originFailure) return originFailure;
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!/^[a-f0-9]{24}$/i.test(String(body.sessionId || ''))) return c.json({ error: 'Invalid playback session.' }, 400);
    await connectDatabase();
    const principal = await resolvePlaybackPrincipal(c);
    return c.json(await stopPlaybackSession(principal, body.sessionId));
  } catch (error) {
    return apiError(c, error, 'Playback session could not be stopped.');
  }
});


const MOVIE_CATEGORIES = [
  { key: 'action', name: 'Action' },
  { key: 'adventure', name: 'Adventure' },
  { key: 'science-fiction', name: 'Science Fiction' },
  { key: 'fantasy', name: 'Fantasy' },
  { key: 'mystery', name: 'Mystery' },
  { key: 'horror', name: 'Horror' }
];

app.get('/api/movies/discover', async (c) => {
  try {
    await connectDatabase();
    const baseFilter = { imdbId: IMDB_ID, adult: { $ne: true } };
    const countFilter = { ...baseFilter };
    const excludedIds = [...new Set(String(c.req.query('exclude') || '')
      .split(',').map((value) => value.trim().toLowerCase()).filter((value) => IMDB_ID.test(value)))].slice(0, 120);
    if (excludedIds.length) baseFilter.imdbId = { $nin: excludedIds, $regex: IMDB_ID };

    const premiumWindow = await getPremiumFeedWindow(c);
    if (premiumWindow) {
      const recentClause = buildRecentDateWindowFilter('releaseDate', 'releaseYear', premiumWindow);
      const dateSort = { releaseDate: -1, releaseYear: -1, popularity: -1, _id: 1 };
      const facets = {
        featuredRecent: [{ $match: recentClause }, { $sort: dateSort }, { $limit: 1 }],
        itemsRecent: [{ $match: recentClause }, { $sort: dateSort }, { $limit: PREMIUM_FEED_LIMIT }]
      };
      for (const category of MOVIE_CATEGORIES) {
        facets[category.key + 'Recent'] = [
          { $match: { $and: [recentClause, { genres: category.name }] } },
          { $sort: dateSort }, { $limit: PREMIUM_FEED_LIMIT }
        ];
      }
      const [result, total] = await Promise.all([
        Movie.aggregate([{ $match: baseFilter }, { $facet: facets }]),
        Movie.countDocuments({ $and: [countFilter, recentClause] })
      ]);
      const categories = MOVIE_CATEGORIES.map((category) => ({
        key: category.key,
        name: category.name === 'Science Fiction' ? 'Sci-Fi' : category.name,
        genre: category.name,
        items: (result?.[category.key + 'Recent'] || []).map(movieDto)
      })).filter((category) => category.items.length > 0);
      const featured = result?.featuredRecent?.[0] || null;
      return c.json({
        featured: featured ? movieDto(featured) : null,
        items: (result?.itemsRecent || []).map(movieDto),
        categories,
        personalizedFeed: { plan: 'premium', startYear: premiumWindow.startYear, endYear: premiumWindow.endYear },
        pagination: { page: 1, limit: PREMIUM_FEED_LIMIT, total, totalPages: Math.ceil(total / PREMIUM_FEED_LIMIT) }
      });
    }

    const facets = {
      featured: [{ $sample: { size: 1 } }],
      items: [{ $sample: { size: PREMIUM_FEED_LIMIT } }],
    };
    for (const category of MOVIE_CATEGORIES) {
      facets[category.key] = [
        { $match: { genres: category.name } },
        { $sample: { size: PREMIUM_FEED_LIMIT } }
      ];
    }
    const [result] = await Movie.aggregate([{ $match: baseFilter }, { $facet: facets }]);
    const categories = MOVIE_CATEGORIES.map((category) => ({
      key: category.key,
      name: category.name === 'Science Fiction' ? 'Sci-Fi' : category.name,
      genre: category.name,
      items: (result?.[category.key] || []).map(movieDto)
    })).filter((category) => category.items.length > 0);
    const total = await Movie.countDocuments(countFilter);
    return c.json({
      featured: result?.featured?.[0] ? movieDto(result.featured[0]) : null,
      items: (result?.items || []).map(movieDto),
      categories,
      pagination: { page: 1, limit: PREMIUM_FEED_LIMIT, total, totalPages: Math.ceil(total / PREMIUM_FEED_LIMIT) }
    });
  } catch (error) {
    console.error('Movie discovery feed failed:', error.message);
    return c.json({ error: 'Movie discovery is temporarily unavailable.' }, 503);
  }
});

app.get('/api/search', async (c) => {
  const query = safeText(c.req.query('q'));
  if (query.length < 2) return c.json({ items: [] });
  try {
    await connectDatabase();
    const id = query.toLowerCase();
    const numericId = /^[0-9]{1,12}$/.test(query) ? Number(query) : null;
    const movieFilter = IMDB_ID.test(id)
      ? { adult: { $ne: true }, imdbId: id }
      : { adult: { $ne: true }, $text: { $search: query } };
    const tvFilter = numericId
      ? { adult: { $ne: true }, tmdbId: numericId }
      : { adult: { $ne: true }, $text: { $search: query } };
    const animeFilter = numericId
      ? { type: { $in: ['TV', 'ONA'] }, malId: numericId }
      : { type: { $in: ['TV', 'ONA'] }, $text: { $search: query } };
    const [movies, shows, anime] = await Promise.all([
      Movie.find(movieFilter)
        .sort(IMDB_ID.test(id) ? { popularity: -1, releaseDate: -1 } : { score: { $meta: 'textScore' }, popularity: -1 })
        .limit(8).lean(),
      TvSeries.find(tvFilter).select('-seasons.episodes')
        .sort(numericId ? { popularity: -1, firstAirDate: -1 } : { score: { $meta: 'textScore' }, popularity: -1 })
        .limit(8).lean(),
      AnimeSeries.find(animeFilter).select('-episodeGuide -relatedAnime')
        .sort(numericId ? { score: -1, rank: 1, popularity: 1 } : { score: { $meta: 'textScore' }, rank: 1, popularity: 1 })
        .limit(8).lean()
    ]);
    const groups = [
      movies.map((item) => ({ ...movieDto(item), mediaType: 'movie' })),
      shows.map((item) => ({ ...tvSeriesDto(item), mediaType: 'tv' })),
      anime.map((item) => ({ ...animeSeriesDto(item), mediaType: 'anime' }))
    ];
    const items = [];
    while (groups.some((group) => group.length)) {
      const activeGroups = groups.filter((group) => group.length);
      for (let index = activeGroups.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [activeGroups[index], activeGroups[swapIndex]] = [activeGroups[swapIndex], activeGroups[index]];
      }
      for (const group of activeGroups) items.push(group.shift());
    }
    return c.json({ items, total: items.length });
  } catch (error) {
    console.error('Global title search failed:', error.message);
    return c.json({ error: 'Search is temporarily unavailable.', items: [] }, 503);
  }
});

app.get('/api/movies/suggestions', async (c) => {
  try {
    await connectDatabase();
    const query = safeText(c.req.query('q'));
    if (query.length < 2) return c.json({ items: [] });
    if (IMDB_ID.test(query)) {
      const direct = await Movie.findOne({ imdbId: query.toLowerCase() }).lean();
      return c.json({ items: direct ? [movieDto(direct)] : [] });
    }
    const tokens = [...new Set(query.toLowerCase().split(/\s+/).filter((token) => token.length >= 2))].slice(0, 6);
    const candidates = tokens.length
      ? await Movie.find({
        imdbId: IMDB_ID,
        adult: { $ne: true },
        $text: { $search: tokens.join(' ') }
      }).sort({ score: { $meta: 'textScore' }, popularity: -1, releaseDate: -1 }).limit(40).lean()
      : [];
    const normalized = query.toLowerCase();
    const ranked = candidates.map((item) => {
      const title = String(item.title || '').toLowerCase();
      const hits = tokens.reduce((count, token) => count + (title.includes(token) ? 1 : 0), 0);
      return { item, score: hits * 10 + (title.includes(normalized) ? 20 : 0) + Math.min(9, Number(item.popularity || 0) / 100) };
    }).sort((a, b) => b.score - a.score);
    return c.json({ items: ranked.slice(0, 8).map(({ item }) => movieDto(item)) });
  } catch (error) {
    console.error('Movie suggestions failed:', error.message);
    return c.json({ items: [], warning: 'Suggestions are temporarily unavailable.' });
  }
});

app.get('/api/movies', async (c) => {
  try {
    await connectDatabase();
    const { page, limit } = pageOptions(c);
    const year = Number(c.req.query('year') || 0);
    const query = safeText(c.req.query('q'));
    const genre = safeText(c.req.query('genre'));
    const filter = { imdbId: IMDB_ID, adult: { $ne: true } };
    if (year >= 1870 && year <= new Date().getFullYear()) filter.releaseYear = year;
    if (genre) filter.genres = genre;
    if (IMDB_ID.test(query)) filter.imdbId = query.toLowerCase();
    else if (query) filter.$text = { $search: query };
    const sort = query && !IMDB_ID.test(query)
      ? { score: { $meta: 'textScore' }, popularity: -1, releaseDate: -1 }
      : { popularity: -1, releaseDate: -1 };
    const randomOrder = c.req.query('random') === 'true';
    const excludedIds = [...new Set(String(c.req.query('exclude') || '')
      .split(',').map((value) => value.trim().toLowerCase()).filter((value) => IMDB_ID.test(value)))].slice(0, 900);
    const randomFilter = { ...filter };
    if (randomOrder && excludedIds.length) randomFilter.imdbId = { $nin: excludedIds, $regex: IMDB_ID };

    const premiumWindow = !query && !year ? await getPremiumFeedWindow(c) : null;
    if (premiumWindow) {
      const feed = await findDatePrioritizedFeedPage({
        Model: Movie,
        filter: randomOrder ? randomFilter : filter,
        countFilter: filter,
        dateField: 'releaseDate',
        yearField: 'releaseYear',
        sort: { releaseDate: -1, releaseYear: -1, popularity: -1, _id: 1 },
        page, limit, ignorePageOffset: randomOrder
      });
      return c.json({
        items: feed.items.map(movieDto),
        personalizedFeed: { plan: 'premium', startYear: feed.window.startYear, endYear: feed.window.endYear },
        pagination: { page, limit, total: feed.total, totalPages: Math.ceil(feed.total / limit) }
      });
    }

    const [items, total] = await Promise.all([
      randomOrder
        ? Movie.aggregate([{ $match: randomFilter }, { $sample: { size: limit } }])
        : Movie.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Movie.countDocuments(filter)
    ]);
    return c.json({ items: items.map(movieDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Movie catalog read failed:', error.message);
    return c.json({ error: 'Movie catalog is temporarily unavailable.' }, 503);
  }
});

app.get('/api/movies/:imdbId', async (c) => {
  const imdbId = String(c.req.param('imdbId') || '').toLowerCase();
  if (!IMDB_ID.test(imdbId)) return c.json({ error: 'Invalid IMDb title ID.' }, 400);
  try {
    await connectDatabase();
    const movie = await Movie.findOne({ imdbId }).lean();
    if (!movie) return c.json({ error: 'Movie not found.' }, 404);
    return c.json({ item: movieDetailsDto(movie) });
  } catch (error) {
    console.error('IMDb movie detail read failed:', error.message);
    return c.json({ error: 'Movie details are temporarily unavailable.' }, 503);
  }
});

app.get('/api/tv', async (c) => {
  try {
    await connectDatabase();
    const { page, limit } = pageOptions(c);
    const query = safeText(c.req.query('q'));
    const filter = { tmdbId: { $type: 'number', $gt: 0 }, adult: { $ne: true } };
    if (/^[0-9]+$/.test(query) && Number(query) > 0) filter.tmdbId = Number(query);
    else if (query) filter.$text = { $search: query };
    const sort = query && !(/^[0-9]+$/.test(query) && Number(query) > 0)
      ? { score: { $meta: 'textScore' }, popularity: -1, firstAirDate: -1 }
      : { popularity: -1, firstAirDate: -1 };
    const randomOrder = c.req.query('random') === 'true';
    const excludedIds = [...new Set(String(c.req.query('exclude') || '')
      .split(',').map((value) => value.trim()).filter((value) => /^[0-9]{1,12}$/.test(value)).map(Number))].slice(0, 900);
    const randomFilter = { ...filter };
    if (randomOrder && excludedIds.length) randomFilter.tmdbId = { $nin: excludedIds, $type: 'number', $gt: 0 };

    const premiumWindow = !query ? await getPremiumFeedWindow(c) : null;
    if (premiumWindow) {
      const feed = await findDatePrioritizedFeedPage({
        Model: TvSeries,
        filter: randomOrder ? randomFilter : filter,
        countFilter: filter,
        dateField: 'firstAirDate',
        yearField: 'releaseYear',
        sort: { firstAirDate: -1, releaseYear: -1, popularity: -1, _id: 1 },
        page, limit, select: '-seasons.episodes', ignorePageOffset: randomOrder
      });
      return c.json({
        items: feed.items.map(tvSeriesDto),
        personalizedFeed: { plan: 'premium', startYear: feed.window.startYear, endYear: feed.window.endYear },
        pagination: { page, limit, total: feed.total, totalPages: Math.ceil(feed.total / limit) }
      });
    }

    const [items, total] = await Promise.all([
      randomOrder
        ? TvSeries.aggregate([{ $match: randomFilter }, { $sample: { size: limit } }, { $project: { 'seasons.episodes': 0 } }])
        : TvSeries.find(filter).select('-seasons.episodes').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      TvSeries.countDocuments(filter)
    ]);
    return c.json({ items: items.map(tvSeriesDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('TV catalog read failed:', error.message);
    return c.json({ error: 'TV catalog is temporarily unavailable.' }, 503);
  }
});

app.get('/api/tv/:tmdbId/seasons/:seasonNumber', async (c) => {
  const tmdbIdText = String(c.req.param('tmdbId') || '');
  const tmdbId = Number(tmdbIdText);
  const seasonNumber = Number(c.req.param('seasonNumber'));
  if (!/^[0-9]{1,12}$/.test(tmdbIdText) || !Number.isSafeInteger(tmdbId) || tmdbId < 1 ||
      !Number.isSafeInteger(seasonNumber) || seasonNumber < 0) {
    return c.json({ error: 'Invalid TMDB series or season ID.' }, 400);
  }
  try {
    await connectDatabase();
    const series = await TvSeries.findOne({ tmdbId }).select('seasons').lean();
    if (!series) return c.json({ error: 'TV series not found.' }, 404);
    const season = (series.seasons || []).find((item) => Number(item.seasonNumber) === seasonNumber);
    if (!season) return c.json({ error: 'Season not found.' }, 404);
    return c.json({ item: tvSeasonDto(season) });
  } catch (error) {
    console.error('TV season read failed:', error.message);
    return c.json({ error: 'TV season episodes are temporarily unavailable.' }, 503);
  }
});

app.get('/api/tv/:tmdbId', async (c) => {
  const tmdbIdText = String(c.req.param('tmdbId') || '');
  const tmdbId = Number(tmdbIdText);
  if (!/^[0-9]{1,12}$/.test(tmdbIdText) || !Number.isSafeInteger(tmdbId) || tmdbId < 1) {
    return c.json({ error: 'Invalid TMDB series ID.' }, 400);
  }
  try {
    await connectDatabase();
    const item = await TvSeries.findOne({ tmdbId }).select('-seasons.episodes').lean();
    if (!item) return c.json({ error: 'TV series not found.' }, 404);
    return c.json({ item: tvSeriesDto(item) });
  } catch (error) {
    console.error('TV detail read failed:', error.message);
    return c.json({ error: 'TV series details are temporarily unavailable.' }, 503);
  }
});

app.get('/api/anime', async (c) => {
  try {
    await connectDatabase();
    const { page, limit } = pageOptions(c);
    const query = safeText(c.req.query('q'));
    const filter = { type: { $in: ['TV', 'ONA'] } };
    if (/^\d+$/.test(query)) filter.malId = Number(query);
    else if (query) filter.$text = { $search: query };
    const sort = query && !/^\d+$/.test(query)
      ? { score: { $meta: 'textScore' }, rank: 1, popularity: 1 }
      : { rank: 1, score: -1, popularity: 1 };
    const randomOrder = c.req.query('random') === 'true';
    const excludedIds = [...new Set(String(c.req.query('exclude') || '')
      .split(',').map((value) => value.trim()).filter((value) => /^[0-9]{1,12}$/.test(value)).map(Number))].slice(0, 900);
    const randomFilter = { ...filter };
    if (randomOrder && excludedIds.length) randomFilter.malId = { $nin: excludedIds, $type: 'number', $gt: 0 };

    const premiumWindow = !query ? await getPremiumFeedWindow(c) : null;
    if (premiumWindow) {
      const feed = await findDatePrioritizedFeedPage({
        Model: AnimeSeries,
        filter: randomOrder ? randomFilter : filter,
        countFilter: filter,
        dateField: 'airedFrom',
        yearField: 'releaseYear',
        sort: { airedFrom: -1, releaseYear: -1, score: -1, rank: 1, popularity: 1, _id: 1 },
        page, limit, select: '-episodeGuide -relatedAnime', ignorePageOffset: randomOrder
      });
      return c.json({
        items: feed.items.map(animeSeriesDto),
        personalizedFeed: { plan: 'premium', startYear: feed.window.startYear, endYear: feed.window.endYear },
        pagination: { page, limit, total: feed.total, totalPages: Math.ceil(feed.total / limit) }
      });
    }

    const [items, total] = await Promise.all([
      randomOrder
        ? AnimeSeries.aggregate([{ $match: randomFilter }, { $sample: { size: limit } }, { $project: { episodeGuide: 0, relatedAnime: 0 } }])
        : AnimeSeries.find(filter).select('-episodeGuide -relatedAnime').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      AnimeSeries.countDocuments(filter)
    ]);
    return c.json({ items: items.map(animeSeriesDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Anime catalog read failed:', error.message);
    return c.json({ error: 'Anime catalog is temporarily unavailable.' }, 503);
  }
});

app.get('/api/anime/:malId', async (c) => {
  const malId = Number(c.req.param('malId'));
  if (!Number.isSafeInteger(malId) || malId <= 0) return c.json({ error: 'Invalid MyAnimeList ID.' }, 400);
  try {
    await connectDatabase();
    const item = await AnimeSeries.findOne({ malId, type: { $in: ['TV', 'ONA'] } }).lean();
    if (!item) return c.json({ error: 'Anime series not found.' }, 404);
    return c.json({ item: animeSeriesDto(item) });
  } catch (error) {
    console.error('Anime detail read failed:', error.message);
    return c.json({ error: 'Anime details are temporarily unavailable.' }, 503);
  }
});


app.get('/api/announcements', async (c) => {
  try {
    await connectDatabase();
    const now = new Date();
    const items = await Announcement.find({ status: { $in: ['published', 'scheduled'] }, scheduledAt: { $lte: now } })
      .select('title description mediaUrl imageContentType scheduledAt createdAt')
      .sort({ scheduledAt: -1, _id: -1 })
      .limit(20)
      .lean();
    let readIds = new Set();
    let viewerScope = 'guest';
    try {
      const authenticated = await getAuthenticatedSession(c);
      if (authenticated) {
        viewerScope = 'user:' + keyedHash('announcement-read-scope:' + String(authenticated.user._id));
        if (items.length) {
          const reads = await AnnouncementRead.find({
            userId: authenticated.user._id,
            announcementId: { $in: items.map((item) => item._id) }
          }).select('announcementId').lean();
          readIds = new Set(reads.map((item) => String(item.announcementId)));
        }
      }
    } catch {}
    return c.json({
      viewerScope,
      items: items.map((item) => ({
        id: String(item._id),
        title: item.title,
        description: item.description,
        mediaUrl: item.mediaUrl || '',
        imageUrl: item.imageContentType ? '/api/announcements/' + String(item._id) + '/image' : '',
        scheduledAt: item.scheduledAt,
        createdAt: item.createdAt,
        isRead: readIds.has(String(item._id))
      }))
    });
  } catch (error) {
    console.error('Announcement feed failed:', error?.message || 'Unknown error');
    return c.json({ error: 'Announcements are temporarily unavailable.', items: [] }, 503);
  }
});

app.get('/api/announcements/:announcementId/image', async (c) => {
  const id = String(c.req.param('announcementId') || '');
  if (!/^[a-f0-9]{24}$/i.test(id)) return c.json({ error: 'Invalid announcement ID.' }, 400);
  try {
    await connectDatabase();
    const item = await Announcement.findOne({
      _id: id, status: { $in: ['published', 'scheduled'] }, scheduledAt: { $lte: new Date() }
    }).select('+imageData imageContentType').lean();
    if (!item?.imageData || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(item.imageContentType)) {
      return c.json({ error: 'Announcement image not found.' }, 404);
    }
    return c.body(item.imageData, 200, {
      'Content-Type': item.imageContentType,
      'Content-Length': String(item.imageData.length),
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff'
    });
  } catch (error) {
    console.error('Announcement image read failed:', error?.message || 'Unknown error');
    return c.json({ error: 'Announcement image is temporarily unavailable.' }, 503);
  }
});

app.post('/api/announcements/:announcementId/read', async (c) => {
  const originFailure = requireSameOrigin(c);
  if (originFailure) return originFailure;
  const id = String(c.req.param('announcementId') || '');
  if (!/^[a-f0-9]{24}$/i.test(id)) return c.json({ error: 'Invalid announcement ID.' }, 400);
  try {
    await connectDatabase();
    const authenticated = await getAuthenticatedSession(c);
    if (!authenticated) return c.json({ error: 'Sign-in required to sync read status.', code: 'UNAUTHENTICATED' }, 401);
    const announcement = await Announcement.findOne({
      _id: id, status: { $in: ['published', 'scheduled'] }, scheduledAt: { $lte: new Date() }
    }).select('_id').lean();
    if (!announcement) return c.json({ error: 'Announcement not found.' }, 404);
    await AnnouncementRead.updateOne(
      { userId: authenticated.user._id, announcementId: announcement._id },
      { $setOnInsert: { readAt: new Date() } },
      { upsert: true }
    );
    return c.json({ read: true, announcementId: id });
  } catch (error) {
    console.error('Announcement read receipt failed:', error?.message || 'Unknown error');
    return c.json({ error: 'Could not mark this announcement as read.' }, 503);
  }
});

app.notFound((c) => c.json({ error: 'Not found.' }, 404));
app.onError((error, c) => {
  const requestId = c.get('requestId') || randomUUID();
  console.error(JSON.stringify({
    event: 'api_unhandled_error',
    requestId,
    method: c.req.method,
    route: new URL(c.req.url).pathname,
    errorName: error?.name || 'Error',
    errorCode: error?.code || null,
    message: String(error?.message || 'Unknown error').slice(0, 240)
  }));
  c.header('X-Situla-Request-Id', requestId);
  return c.json({
    error: 'Internal server error.',
    code: 'INTERNAL_SERVER_ERROR',
    requestId
  }, 500);
});

export default app;
