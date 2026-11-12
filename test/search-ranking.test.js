import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchYearFilter,
  escapeSearchRegex,
  normalizeSearchText,
  rankSearchResults,
  searchRelevanceScore,
  searchResultDate
} from '../src/search-ranking.js';

test('year filtering uses the exact stored calendar dates and falls back to releaseYear only when date is missing', () => {
  assert.deepEqual(buildSearchYearFilter('releaseDate', 'releaseYear', 2026), {
    $or: [
      { releaseDate: { $gte: '2026-01-01', $lt: '2027-01-01' } },
      {
        $and: [
          { $or: [
            { releaseDate: { $exists: false } },
            { releaseDate: null },
            { releaseDate: '' }
          ] },
          { releaseYear: 2026 }
        ]
      }
    ]
  });
  assert.throws(() => buildSearchYearFilter('releaseDate', 'releaseYear', 1800), /valid/);
});

test('search normalization removes accents and normalizes punctuation and case', () => {
  assert.equal(normalizeSearchText('  Amélie: The Movie!  '), 'amelie the movie');
});

test('smart relevance prioritizes exact and prefix matches and tolerates small spelling mistakes', () => {
  const exact = searchRelevanceScore({ title: 'Batman' }, 'Batman');
  const prefix = searchRelevanceScore({ title: 'Batman Begins' }, 'Batman');
  const fuzzy = searchRelevanceScore({ title: 'Avengers' }, 'Avangers');
  const unrelated = searchRelevanceScore({ title: 'The Godfather' }, 'Avangers');
  assert.ok(exact > prefix);
  assert.ok(fuzzy > unrelated);
  assert.ok(fuzzy > 0);
});

test('results use newest database date as the tie-breaker and browse mode is newest-first', () => {
  const results = rankSearchResults([
    { mediaType: 'movie', title: 'Batman', releaseDate: '2022-03-04' },
    { mediaType: 'tv', title: 'Batman', firstAirDate: '2024-01-01' },
    { mediaType: 'anime', title: 'Batman', airedFrom: '2023-06-10' }
  ], 'Batman');
  assert.deepEqual(results.map((item) => item.mediaType), ['tv', 'anime', 'movie']);
  const newest = rankSearchResults([
    { mediaType: 'movie', title: 'Older', releaseDate: '2010-01-01' },
    { mediaType: 'anime', title: 'Newer', airedFrom: '2026-02-01' }
  ]);
  assert.equal(newest[0].title, 'Newer');
  assert.equal(searchResultDate({ releaseYear: 2020 }), '2020-01-01');
});

test('query text is escaped before it is used in a Mongo regular expression', () => {
  assert.equal(escapeSearchRegex('A+B (2026)'), 'A\\+B \\(2026\\)');
});
