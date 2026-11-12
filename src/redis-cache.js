import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

const CACHE_NAMESPACE = 'situla:catalog:v1';
const DEFAULT_MAX_CACHE_BYTES = 1_500_000;
const MEMORY_CACHE_MAX_ENTRIES = 100;
const MEMORY_CACHE_MAX_BYTES = 8 * 1024 * 1024;
const REDIS_REQUEST_TIMEOUT_MS = 200;
const STALE_WINDOW_SECONDS = 300;

let redisClient;
let redisCredentials = '';

export function getRedisClient() {
  if (process.env.NODE_ENV === 'test' && process.env.SITULA_REDIS_CACHE_IN_TESTS !== 'true') return null;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const credentials = url + '\n' + token;
  if (!redisClient || redisCredentials !== credentials) {
    redisClient = new Redis({
      url,
      token,
      retry: { retries: 0 },
      signal: () => AbortSignal.timeout(REDIS_REQUEST_TIMEOUT_MS),
      enableTelemetry: false
    });
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

  if (path === '/api/movies/discover') return { ttl: 90, premiumAware: true, kind: 'movie-discovery' };
  if (path === '/api/movies') return { ttl: random ? 25 : 60, premiumAware: !hasQuery && !hasYear, kind: 'movie-list' };
  if (path === '/api/tv') return { ttl: random ? 25 : 60, premiumAware: !hasQuery, kind: 'tv-list' };
  if (path === '/api/anime') return { ttl: random ? 25 : 60, premiumAware: !hasQuery, kind: 'anime-list' };
  if (path === '/api/search') return { ttl: 20, premiumAware: false, kind: 'global-search' };
  if (path === '/api/movies/suggestions') return { ttl: 30, premiumAware: false, kind: 'movie-suggestions' };
  if (/^\/api\/movies\/tt[0-9]{5,12}$/i.test(path)) return { ttl: 300, premiumAware: false, kind: 'movie-detail' };
  if (/^\/api\/tv\/[0-9]{1,12}\/seasons\/[0-9]{1,4}$/.test(path)) return { ttl: 300, premiumAware: false, kind: 'tv-season-detail' };
  if (/^\/api\/tv\/[0-9]{1,12}$/.test(path)) return { ttl: 300, premiumAware: false, kind: 'tv-detail' };
  if (/^\/api\/anime\/[0-9]{1,12}$/.test(path)) return { ttl: 300, premiumAware: false, kind: 'anime-detail' };
  return null;
}

export function buildCatalogCacheKey(requestUrl, variant = 'public', namespace = CACHE_NAMESPACE) {
  const url = new URL(requestUrl, 'http://localhost');
  url.searchParams.sort();
  const canonical = url.pathname + url.search + '|variant=' + String(variant || 'public');
  const digest = createHash('sha256').update(canonical).digest('hex');
  return namespace + ':' + digest;
}

function withinTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('Cache request exceeded its time budget.');
        error.name = 'TimeoutError';
        reject(error);
      }, timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

function normalizeCacheEntry(value, now) {
  if (!value || value.status !== 200 || typeof value.body !== 'string') return null;
  const freshUntil = Number(value.freshUntil || 0);
  const staleUntil = Number(value.staleUntil || 0);
  // Legacy records only had a fresh TTL, so a live legacy key is still fresh.
  if (!freshUntil) {
    return { status: 200, body: value.body, freshUntil: Number.POSITIVE_INFINITY, staleUntil: Number.POSITIVE_INFINITY };
  }
  if (!staleUntil || staleUntil <= now) return null;
  return { status: 200, body: value.body, freshUntil, staleUntil };
}

export function createCatalogResponseCache({
  getRedis = getRedisClient,
  getVariant = async () => 'public',
  maxCacheBytes = DEFAULT_MAX_CACHE_BYTES
} = {}) {
  const memoryCache = new Map();
  let memoryBytes = 0;

  function readMemory(key, now) {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (entry.staleUntil <= now) {
      memoryCache.delete(key);
      memoryBytes -= entry.bytes;
      return null;
    }
    memoryCache.delete(key);
    memoryCache.set(key, entry);
    return entry;
  }

  function writeMemory(key, body, freshUntil, staleUntil, bytes) {
    const previous = memoryCache.get(key);
    if (previous) {
      memoryCache.delete(key);
      memoryBytes -= previous.bytes;
    }
    if (bytes > MEMORY_CACHE_MAX_BYTES) return;
    while (memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES || memoryBytes + bytes > MEMORY_CACHE_MAX_BYTES) {
      const oldestKey = memoryCache.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = memoryCache.get(oldestKey);
      memoryCache.delete(oldestKey);
      memoryBytes -= oldest?.bytes || 0;
    }
    memoryCache.set(key, { status: 200, body, freshUntil, staleUntil, bytes });
    memoryBytes += bytes;
  }

  function serveCached(c, entry, status, layer) {
    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Situla-Cache': status
    };
    if (layer) headers['X-Situla-Cache-Layer'] = layer;
    if (status === 'STALE') {
      headers['X-Situla-Cache-Age'] = String(Math.max(0, Math.floor((Date.now() - entry.freshUntil) / 1000)));
    }
    return c.body(entry.body, 200, headers);
  }

  return async (c, next) => {
    const policy = getCatalogCachePolicy(c.req.method, c.req.url);
    if (!policy) {
      await next();
      return;
    }

    let redis = null;
    try { redis = await getRedis(); } catch {}

    let variant = 'public';
    if (policy.premiumAware) {
      try {
        variant = String(await getVariant(c, policy) || 'standard');
      } catch {
        // Unknown entitlement must never receive Premium feed data.
        variant = 'standard';
      }
    }

    const key = buildCatalogCacheKey(c.req.url, policy.premiumAware ? variant : 'public');
    const now = Date.now();
    let staleCandidate = readMemory(key, now);

    if (staleCandidate && staleCandidate.freshUntil > now) {
      return serveCached(c, staleCandidate, 'HIT', 'memory');
    }

    if (redis) {
      try {
        const cachedValue = await withinTimeout(redis.get(key), REDIS_REQUEST_TIMEOUT_MS + 40);
        const cached = normalizeCacheEntry(cachedValue, Date.now());
        if (cached) {
          if (!staleCandidate || cached.staleUntil > staleCandidate.staleUntil) staleCandidate = cached;
          if (cached.freshUntil > Date.now()) {
            writeMemory(key, cached.body, cached.freshUntil, cached.staleUntil, Buffer.byteLength(cached.body, 'utf8'));
            return serveCached(c, cached, 'HIT', 'redis');
          }
        }
      } catch {
        // Redis is a best-effort accelerator, not a hard dependency for catalog reads.
      }
    }

    await next();
    const response = c.res;
    if (response?.status >= 500 && staleCandidate && staleCandidate.staleUntil > Date.now()) {
      return serveCached(c, staleCandidate, 'STALE');
    }

    const contentType = response?.headers?.get('content-type') || '';
    if (!response || response.status !== 200 || !contentType.includes('application/json')) {
      c.header('X-Situla-Cache', redis ? 'MISS' : 'BYPASS');
      return;
    }

    try {
      const body = await response.clone().text();
      const bytes = Buffer.byteLength(body, 'utf8');
      if (bytes <= maxCacheBytes) {
        const freshUntil = Date.now() + policy.ttl * 1000;
        const staleUntil = freshUntil + STALE_WINDOW_SECONDS * 1000;
        writeMemory(key, body, freshUntil, staleUntil, bytes);
        if (redis) {
          // Cache writes never delay successful API responses.
          void redis.set(key, { status: 200, body, freshUntil, staleUntil }, {
            ex: policy.ttl + STALE_WINDOW_SECONDS
          }).catch(() => {});
        }
      }
      c.header('X-Situla-Cache', redis ? 'MISS' : 'BYPASS');
    } catch {
      c.header('X-Situla-Cache', 'WRITE_FAILED');
    }
  };
}
