import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PREMIUM_FEED_LIMIT, buildNewestFirstSort } from '../src/premium-feed.js';

test('Premium feeds sort by actual stored date fields with no current-year or rolling-year cutoff', () => {
  assert.equal(PREMIUM_FEED_LIMIT, 10);
  assert.deepEqual(buildNewestFirstSort('releaseDate', { popularity: -1 }), {
    releaseDate: -1, releaseYear: -1, popularity: -1
  });
  assert.deepEqual(buildNewestFirstSort('firstAirDate', { popularity: -1 }), {
    firstAirDate: -1, releaseYear: -1, popularity: -1
  });
  assert.deepEqual(buildNewestFirstSort('airedFrom', { score: -1, rank: 1, popularity: 1 }), {
    airedFrom: -1, releaseYear: -1, score: -1, rank: 1, popularity: 1
  });
  assert.throws(() => buildNewestFirstSort(''), /date field/);
});

test('Premium sort fields match the compound database indexes', async () => {
  const models = await readFile(new URL('../src/models.js', import.meta.url), 'utf8');
  assert.match(models, /movieSchema\.index\(\{ releaseDate: -1, releaseYear: -1, popularity: -1 \}\)/);
  assert.match(models, /tvSeriesSchema\.index\(\{ firstAirDate: -1, releaseYear: -1, popularity: -1 \}\)/);
  assert.match(models, /animeSeriesSchema\.index\(\{ airedFrom: -1, releaseYear: -1, score: -1, rank: 1, popularity: 1 \}\)/);
});

test('Premium Movie, TV and Anime pages query the complete database and paginate after newest-first sort', async () => {
  const api = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const helperStart = api.indexOf('async function findNewestFeedPage(');
  const helperEnd = api.indexOf('\n\nfunction safeText', helperStart);
  const helper = api.slice(helperStart, helperEnd);
  assert.ok(helper.includes('Model.find(filter)'));
  assert.ok(helper.includes('query.sort(sort).skip(offset).limit(limit).lean()'));
  assert.ok(helper.includes('Model.countDocuments(filter)'));
  assert.doesNotMatch(helper, /window|recentClause|ignorePageOffset/i);

  for (const [route, model, dateField] of [
    ['/api/movies', 'Movie', 'releaseDate'],
    ['/api/tv', 'TvSeries', 'firstAirDate'],
    ['/api/anime', 'AnimeSeries', 'airedFrom']
  ]) {
    const start = api.indexOf("app.get('" + route + "'");
    const end = api.indexOf('\napp.get(', start + 1);
    const block = api.slice(start, end < 0 ? api.length : end);
    assert.notEqual(start, -1, route + ' route exists');
    assert.ok(block.includes('findNewestFeedPage'));
    assert.ok(block.includes('Model: ' + model));
    assert.ok(block.includes("buildNewestFirstSort('" + dateField + "'"));
    const premiumStart = block.indexOf('if (premiumAccess)');
    const premiumEnd = block.indexOf('const [items, total]', premiumStart);
    const premium = block.slice(premiumStart, premiumEnd);
    assert.ok(premium.includes('filter,'));
    assert.ok(premium.includes('sort: buildNewestFirstSort'));
    assert.doesNotMatch(premium, /randomFilter|ignorePageOffset|startYear|endYear/);
  }
});

test('Premium Movie discovery sorts before facets and ignores localStorage random exclusions', async () => {
  const api = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const start = api.indexOf("app.get('/api/movies/discover'");
  const end = api.indexOf("app.get('/api/search'", start);
  const route = api.slice(start, end);
  const premiumStart = route.indexOf('if (premiumAccess)');
  const premiumEnd = route.indexOf("\n    const facets = {\n      featured:", premiumStart + 10);
  const premium = route.slice(premiumStart, premiumEnd);
  assert.ok(premium.includes('Movie.aggregate([{ $match: baseFilter }, { $sort: dateSort }, { $facet: facets }])'));
  assert.ok(premium.includes('Movie.countDocuments(baseFilter)'));
  assert.ok(premium.includes('itemsLatest'));
  assert.ok(premium.includes('featuredLatest'));
  assert.doesNotMatch(premium, /excludedIds|publicFilter|recentClause|startYear|endYear/);
});

test('Premium entitlement is checked server-side before chronological sorting is enabled', async () => {
  const api = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(api, /getWatchPolicy\(user, now\)\.planId === 'premium' \? \{ plan: 'premium' \} : null/);
  assert.match(api, /getPremiumCatalogAccess\(c\)/);
});
