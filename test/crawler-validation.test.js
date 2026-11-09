import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput } from '../src/crawler.js';

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
