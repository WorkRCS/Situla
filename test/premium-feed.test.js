import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PREMIUM_FEED_LIMIT, PREMIUM_FEED_WINDOW_YEARS,
  getRollingTenYearWindow, buildRecentDateWindowFilter
} from '../src/premium-feed.js';

test('Premium feed uses the current calendar year and the previous nine years', () => {
  assert.equal(PREMIUM_FEED_LIMIT, 10);
  assert.equal(PREMIUM_FEED_WINDOW_YEARS, 10);
  assert.deepEqual(getRollingTenYearWindow(new Date('2026-11-12T10:00:00.000Z')), {
    startYear: 2017, endYear: 2026, startDate: '2017-01-01', endDateExclusive: '2027-01-01'
  });
  assert.deepEqual(getRollingTenYearWindow(new Date('2027-01-01T00:00:00.000Z')), {
    startYear: 2018, endYear: 2027, startDate: '2018-01-01', endDateExclusive: '2028-01-01'
  });
  assert.deepEqual(getRollingTenYearWindow(new Date('2040-07-01T00:00:00.000Z')), {
    startYear: 2031, endYear: 2040, startDate: '2031-01-01', endDateExclusive: '2041-01-01'
  });
});

test('Premium date filter includes the exact ten-year range and only falls back to year when date is missing', () => {
  const window = getRollingTenYearWindow(new Date('2026-11-12T00:00:00.000Z'));
  assert.deepEqual(buildRecentDateWindowFilter('releaseDate', 'releaseYear', window), {
    $or: [
      { releaseDate: { $gte: '2017-01-01', $lt: '2027-01-01' } },
      { $and: [
        { $or: [{ releaseDate: { $exists: false } }, { releaseDate: null }, { releaseDate: '' }] },
        { releaseYear: { $gte: 2017, $lte: 2026 } }
      ] }
    ]
  });
  assert.throws(() => buildRecentDateWindowFilter('', 'releaseYear', window), /required/);
});

test('Premium movie, TV and Anime catalog routes return only the rolling ten-year window', async () => {
  const api = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const helperStart = api.indexOf('async function findDatePrioritizedFeedPage(');
  const helperEnd = api.indexOf('\n\nfunction safeText', helperStart);
  const helper = api.slice(helperStart, helperEnd);
  assert.ok(helper.includes('const recentFilter = { $and: [filter, recentClause] }'));
  assert.ok(helper.includes('Model.countDocuments(recentCountFilter)'));
  assert.doesNotMatch(helper, /older|archive|mergeRecentAndOlder/i);

  const discoverStart = api.indexOf("app.get('/api/movies/discover'");
  const discoverEnd = api.indexOf("app.get('/api/movies/suggestions'", discoverStart);
  const discover = api.slice(discoverStart, discoverEnd);
  assert.ok(discover.includes('itemsRecent:'));
  assert.ok(discover.includes('featuredRecent:'));
  assert.ok(discover.includes('Movie.countDocuments({ $and: [countFilter, recentClause] })'));
  assert.doesNotMatch(discover, /older|archive/i);

  for (const [route, dateField] of [
    ['/api/movies', 'releaseDate'],
    ['/api/tv', 'firstAirDate'],
    ['/api/anime', 'airedFrom']
  ]) {
    const start = api.indexOf("app.get('" + route + "'");
    const end = api.indexOf('\napp.get(', start + 1);
    const block = api.slice(start, end < 0 ? api.length : end);
    assert.notEqual(start, -1, route + ' route exists');
    assert.ok(block.includes('findDatePrioritizedFeedPage'));
    assert.ok(block.includes("dateField: '" + dateField + "'"));
    assert.ok(block.includes("yearField: 'releaseYear'"));
  }
});
