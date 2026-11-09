import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, normalizeImportIds, describeTmdbNetworkError, tmdbRequest } from '../src/crawler.js';

test('uses the requested release years and safe page defaults', () => {
  const result = normalizeInput({ startYear: 2010, endYear: 2026 });
  assert.equal(result.startYear, 2010);
  assert.equal(result.endYear, 2026);
  assert.equal(result.startPage, 1);
  assert.equal(result.maxPages, 5);
});

test('caps a requested batch using the configured safety limit', (t) => {
  const previous = process.env.CRAWL_MAX_PAGES_PER_RUN;
  process.env.CRAWL_MAX_PAGES_PER_RUN = '3';
  t.after(() => {
    if (previous === undefined) delete process.env.CRAWL_MAX_PAGES_PER_RUN;
    else process.env.CRAWL_MAX_PAGES_PER_RUN = previous;
  });
  assert.equal(normalizeInput({ startYear: 2020, endYear: 2024, maxPages: 10 }).maxPages, 3);
});

test('rejects an inverted or future release-year range', () => {
  assert.throws(() => normalizeInput({ startYear: 2025, endYear: 2020 }), /valid release-year range/);
  assert.throws(() => normalizeInput({ startYear: 2010, endYear: new Date().getFullYear() + 1 }), /valid release-year range/);
});

test('rejects invalid pages and page counts', () => {
  assert.throws(() => normalizeInput({ startYear: 2010, endYear: 2026, startPage: 0 }), /startPage/);
  assert.throws(() => normalizeInput({ startYear: 2010, endYear: 2026, maxPages: 0 }), /maxPages/);
});

test('explains common TMDB DNS failures from nested fetch causes', () => {
  const error = new TypeError('fetch failed', {
    cause: new AggregateError([Object.assign(new Error('lookup failed'), { code: 'ENOTFOUND' })])
  });
  assert.match(describeTmdbNetworkError(error), /DNS could not resolve api.themoviedb.org/);
});

test('explains TMDB connection timeouts', () => {
  const error = Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
  assert.match(describeTmdbNetworkError(error), /did not respond in time/);
});

test('fails clearly when the example TMDB key has not been replaced', async (t) => {
  const previous = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'replace_with_your_tmdb_api_key';
  t.after(() => {
    if (previous === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = previous;
  });
  await assert.rejects(() => tmdbRequest('/configuration'), /missing or still contains the example placeholder/);
});

test('normalizes a deduplicated batch of IMDb IDs and caps requests at 20', () => {
  const result = normalizeImportIds({ source: 'IMDb', ids: ['tt1375666', 'TT0816692', 'tt1375666'] });
  assert.deepEqual(result, { source: 'imdb', ids: ['tt1375666', 'tt0816692'] });
  assert.throws(() => normalizeImportIds({ source: 'imdb', ids: ['wrong-id'] }), /IMDb IDs/);
  assert.throws(() => normalizeImportIds({ source: 'imdb', ids: Array.from({ length: 21 }, (_, i) => 'tt' + String(i + 1000000)) }), /between 1 and 20/);
});
