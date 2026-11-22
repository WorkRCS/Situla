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


test('search results support newest, popularity and rating sort modes', () => {
  const items = [
    { title: 'Dune', releaseDate: '2021-10-22', popularity: 90, voteAverage: 8.0 },
    { title: 'Dune', releaseDate: '2024-03-01', popularity: 55, voteAverage: 7.0 },
    { title: 'Dune', releaseDate: '2019-01-01', popularity: 120, voteAverage: 9.0 }
  ];
  assert.equal(rankSearchResults(items, 'Dune', 'newest')[0].releaseDate, '2024-03-01');
  assert.equal(rankSearchResults(items, 'Dune', 'popular')[0].releaseDate, '2019-01-01');
  assert.equal(rankSearchResults(items, 'Dune', 'rating')[0].releaseDate, '2019-01-01');
});


test('advanced search can find a title through cast, crew, genre and studio metadata', () => {
  const byCrew = searchRelevanceScore({
    title: 'The Dark Knight',
    searchTerms: ['Christian Bale', 'Heath Ledger', 'Christopher Nolan', 'Action', 'Crime']
  }, 'Christopher Nolan');
  const byGenre = searchRelevanceScore({
    title: 'An unrelated title',
    genres: ['Science Fiction', 'Adventure']
  }, 'science fiction');
  const exactTitle = searchRelevanceScore({ title: 'Science Fiction' }, 'science fiction');
  assert.ok(byCrew > 0);
  assert.ok(byGenre > 0);
  assert.ok(exactTitle > byGenre);
});

test('IMDb, external IMDb, TMDB, MAL and AniList identifiers receive exact priority', () => {
  assert.ok(searchRelevanceScore({ title: 'A Film', imdbId: 'tt1234567' }, 'tt1234567') > 1000);
  assert.ok(searchRelevanceScore({ title: 'A Show', externalImdbId: 'tt7654321' }, 'tt7654321') > 1000);
  assert.ok(searchRelevanceScore({ title: 'Anime', malId: 42 }, '42') > 1000);
  assert.ok(searchRelevanceScore({ title: 'Anime', anilistId: 99 }, '99') > 1000);
  assert.ok(searchRelevanceScore({ title: 'Series', tmdbId: 123 }, '123') > 1000);
});
