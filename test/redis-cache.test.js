import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import {
  buildCatalogCacheKey,
  createCatalogResponseCache,
  getCatalogCachePolicy
} from '../src/redis-cache.js';

test('catalog cache allowlist covers landing, movie, TV, anime, A-to-Z search and detail reads only', () => {
  const paths = [
    '/api/movies/discover',
    '/api/movies?page=1',
    '/api/movies/suggestions?q=matrix',
    '/api/movies/tt0133093',
    '/api/tv?page=1',
    '/api/tv/1399',
    '/api/tv/1399/seasons/1',
    '/api/anime?page=1',
    '/api/anime/5114',
    '/api/search?q=naruto'
  ];
  for (const path of paths) assert.ok(getCatalogCachePolicy('GET', 'https://situla.example' + path), path);
  for (const path of ['/api/auth/me', '/api/admin/users', '/api/presence', '/api/access/status', '/api/playback/start']) {
    assert.equal(getCatalogCachePolicy('GET', 'https://situla.example' + path), null, path);
  }
  assert.equal(getCatalogCachePolicy('POST', 'https://situla.example/api/movies'), null);
});

test('cache policy varies TTL and premium scope by route and query', () => {
  assert.equal(getCatalogCachePolicy('GET', 'https://situla.example/api/movies/discover').premiumAware, true);
  assert.equal(getCatalogCachePolicy('GET', 'https://situla.example/api/movies?page=1').premiumAware, true);
  assert.equal(getCatalogCachePolicy('GET', 'https://situla.example/api/movies?q=matrix').premiumAware, false);
  assert.equal(getCatalogCachePolicy('GET', 'https://situla.example/api/tv?q=lost').premiumAware, false);
  assert.equal(getCatalogCachePolicy('GET', 'https://situla.example/api/tv?random=true').ttl, 25);
  assert.equal(getCatalogCachePolicy('GET', 'https://situla.example/api/movies/tt0133093').ttl, 300);
});

test('canonical cache key ignores parameter order but preserves filters and premium variant', () => {
  const first = buildCatalogCacheKey('https://situla.example/api/movies?page=1&limit=10', 'standard');
  const reordered = buildCatalogCacheKey('https://situla.example/api/movies?limit=10&page=1', 'standard');
  const premium = buildCatalogCacheKey('https://situla.example/api/movies?page=1&limit=10', 'premium');
  const pageTwo = buildCatalogCacheKey('https://situla.example/api/movies?page=2&limit=10', 'standard');
  assert.equal(first, reordered);
  assert.notEqual(first, premium);
  assert.notEqual(first, pageTwo);
});

test('Redis cache serves hits and writes successful JSON misses', async () => {
  const store = new Map();
  const redis = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => { store.set(key, value); return 'OK'; }
  };
  const app = new Hono();
  let calls = 0;
  app.use('/api/*', createCatalogResponseCache({ getRedis: () => redis }));
  app.get('/api/movies', (c) => {
    calls += 1;
    return c.json({ items: [{ imdbId: 'tt0133093' }] });
  });

  const first = await app.request('/api/movies?page=1');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('x-situla-cache'), 'MISS');
  assert.deepEqual(await first.json(), { items: [{ imdbId: 'tt0133093' }] });

  const second = await app.request('/api/movies?page=1');
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('x-situla-cache'), 'HIT');
  assert.equal(calls, 1);
});

test('Premium and standard catalog responses are cached separately', async () => {
  const store = new Map();
  const redis = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => { store.set(key, value); }
  };
  const app = new Hono();
  let variant = 'standard';
  let calls = 0;
  app.use('/api/*', createCatalogResponseCache({ getRedis: () => redis, getVariant: async () => variant }));
  app.get('/api/movies', (c) => c.json({ variant: (calls += 1, variant) }));

  const standard = await app.request('/api/movies');
  assert.equal((await standard.json()).variant, 'standard');
  variant = 'premium';
  const premium = await app.request('/api/movies');
  assert.equal((await premium.json()).variant, 'premium');
  variant = 'standard';
  const cachedStandard = await app.request('/api/movies');
  assert.equal(cachedStandard.headers.get('x-situla-cache'), 'HIT');
  assert.equal((await cachedStandard.json()).variant, 'standard');
  assert.equal(calls, 2);
});

test('Redis failures do not break public catalog APIs', async () => {
  const app = new Hono();
  app.use('/api/*', createCatalogResponseCache({ getRedis: () => { throw new Error('Redis unavailable'); } }));
  app.get('/api/tv', (c) => c.json({ items: [] }));
  const response = await app.request('/api/tv');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-situla-cache'), 'BYPASS');
  assert.deepEqual(await response.json(), { items: [] });
});
