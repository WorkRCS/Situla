import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREMIUM_FEED_LIMIT, getRollingTenYearWindow,
  buildRecentDateWindowFilter, buildOlderDateWindowFilter,
  mergeRecentAndOlderFeedItems
} from '../src/premium-feed.js';

test('Premium feed uses the current calendar year and the previous nine years', () => {
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

test('Date-backed recent filtering uses the date first and only falls back to year when date is missing', () => {
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
  assert.deepEqual(buildOlderDateWindowFilter('releaseDate', 'releaseYear', window), {
    $or: [
      { releaseDate: { $lt: '2017-01-01' } },
      { $and: [
        { $or: [{ releaseDate: { $exists: false } }, { releaseDate: null }, { releaseDate: '' }] },
        { releaseYear: { $lt: 2017 } }
      ] }
    ]
  });
});

test('Premium page merges recent records before archive fallback and caps the result at ten', () => {
  const recent = Array.from({ length: 7 }, (_, index) => ({ _id: 'recent-' + index }));
  const older = Array.from({ length: 8 }, (_, index) => ({ _id: 'older-' + index }));
  const result = mergeRecentAndOlderFeedItems(recent, older, 10);
  assert.equal(PREMIUM_FEED_LIMIT, 10);
  assert.equal(result.length, 10);
  assert.deepEqual(result.slice(0, 7).map((item) => item._id), recent.map((item) => item._id));
  assert.deepEqual(result.slice(7).map((item) => item._id), ['older-0', 'older-1', 'older-2']);
});

test('Premium feed merge de-duplicates records in recent and archive pools', () => {
  const result = mergeRecentAndOlderFeedItems([{ _id: '1' }, { _id: '2' }], [{ _id: '2' }, { _id: '3' }], 10);
  assert.deepEqual(result.map((item) => item._id), ['1', '2', '3']);
});
