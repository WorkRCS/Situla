import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

const CACHE_NAMESPACE = 'situla:catalog:v1';
const DEFAULT_MAX_CACHE_BYTES = 1_500_000;

let redisClient;
let redisCredentials = '';

export function getRedisClient() {
  if (process.env.NODE_ENV === 'test' && process.env.SITULA_REDIS_CACHE_IN_TESTS !== 'true') return null;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const credentials = url + '\n' + token;
  if (!redisClient || redisCredentials !== credentials) {
    redisClient = new Redis({ url, token });
    redisCredentials = credentials;
  }
  return redisClient;
}

export function getCatalogCachePolicy(method, requestUrl) {
  if (String(method || '').toUpperCase() !== 'GET') return null;
  let url;
  try {
    url = new URL(requestUrl, 'http://localhost');
  } catch {
    return null;
  }

  const path = url.pathname;
  const random = url.searchParams.get('random') === 'true';
  const hasQuery = Boolean(String(url.searchParams.get('q') || '').trim());
  const hasYear = Number(url.searchParams.get('year') || 0) > 0;

  if (path === '/api/movies/discover') {
    return { ttl: 90, premiumAware: true, kind: 'movie-discovery' };
  }
  if (path === '/api/movies') {
    return { ttl: random ? 25 : 60, premiumAware: !hasQuery && !hasYear, kind: 'movie-list' };
  }
  if (path === '/api/tv') {
    return { ttl: random ? 25 : 60, premiumAware: !hasQuery, kind: 'tv-list' };
  }
  if (path === '/api/anime') {
    return { ttl: random ? 25 : 60, premiumAware: !hasQuery, kind: 'anime-list' };
  }
  if (path === '/api/search') {
    return { ttl: 20, premiumAware: false, kind: 'global-search' };
  }
  if (path === '/api/movies/suggestions') {
    return { ttl: 30, premiumAware: false, kind: 'movie-suggestions' };
  }
  if (/^\/api\/movies\/tt[0-9]{5,12}$/i.test(path)) {
    return { ttl: 300, premiumAware: false, kind: 'movie-detail' };
  }
  if (/^\/api\/tv\/[0-9]{1,12}\/seasons\/[0-9]{1,4}$/.test(path)) {
    return { ttl: 300, premiumAware: false, kind: 'tv-season-detail' };
  }
  if (/^\/api\/tv\/[0-9]{1,12}$/.test(path)) {
    return { ttl: 300, premiumAware: false, kind: 'tv-detail' };
  }
  if (/^\/api\/anime\/[0-9]{1,12}$/.test(path)) {
    return { ttl: 300, premiumAware: false, kind: 'anime-detail' };
  }
  return null;
}

export function buildCatalogCacheKey(requestUrl, variant = 'public', namespace = CACHE_NAMESPACE) {
  const url = new URL(requestUrl, 'http://localhost');
  url.searchParams.sort();
  const canonical = url.pathname + url.search + '|variant=' + String(variant || 'public');
  const digest = createHash('sha256').update(canonical).digest('hex');
  return namespace + ':' + digest;
}

export function createCatalogResponseCache({
  getRedis = getRedisClient,
  getVariant = async () => 'public',
  maxCacheBytes = DEFAULT_MAX_CACHE_BYTES
} = {}) {
  return async (c, next) => {
    const policy = getCatalogCachePolicy(c.req.method, c.req.url);
    if (!policy) {
      await next();
      return;
    }

    let redis;
    let redisUnavailable = false;
    try {
      redis = await getRedis();
    } catch {
      redisUnavailable = true;
    }
    if (redisUnavailable) {
      await next();
      c.header('X-Situla-Cache', 'BYPASS');
      return;
    }
    if (!redis) {
      await next();
      c.header('X-Situla-Cache', 'DISABLED');
      return;
    }

    let variant = 'public';
    try {
      if (policy.premiumAware) variant = String(await getVariant(c, policy) || 'standard');
    } catch {
      await next();
      c.header('X-Situla-Cache', 'BYPASS');
      return;
    }

    const key = buildCatalogCacheKey(c.req.url, policy.premiumAware ? variant : 'public');
    try {
      const cached = await redis.get(key);
      if (cached && cached.status === 200 && typeof cached.body === 'string') {
        return c.body(cached.body, 200, {
          'Content-Type': 'application/json; charset=UTF-8',
          'Cache-Control': 'no-store',
          'X-Situla-Cache': 'HIT'
        });
      }
    } catch {
      await next();
      c.header('X-Situla-Cache', 'BYPASS');
      return;
    }

    await next();
    const response = c.res;
    const contentType = response?.headers?.get('content-type') || '';
    if (!response || response.status !== 200 || !contentType.includes('application/json')) {
      c.header('X-Situla-Cache', 'MISS');
      return;
    }

    try {
      const body = await response.clone().text();
      if (Buffer.byteLength(body, 'utf8') <= maxCacheBytes) {
        await redis.set(key, { status: 200, body }, { ex: policy.ttl });
      }
      c.header('X-Situla-Cache', 'MISS');
    } catch {
      c.header('X-Situla-Cache', 'WRITE_FAILED');
    }
  };
}
