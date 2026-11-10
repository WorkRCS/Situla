import test from "node:test";
import assert from "node:assert/strict";
import { mixHomeSpotlight, toHomeSpotlight } from "../src/home-discovery.js";

test("home spotlight normalizes movie, TV, and anime metadata", () => {
  const movie = toHomeSpotlight({ imdbId: "TT1234567", title: "Film", voteAverage: 8.1 }, "movie");
  const tv = toHomeSpotlight({ tmdbId: 42, title: "Series", firstAirDate: "2024-01-01" }, "tv");
  const anime = toHomeSpotlight({ malId: 99, title: "日本語", titleEnglish: "Anime", score: 9.2 }, "anime");

  assert.equal(movie.heroId, "movie:tt1234567");
  assert.equal(movie.heroTitle, "Film");
  assert.equal(movie.heroRating, 8.1);
  assert.equal(tv.heroMediaLabel, "TV SERIES");
  assert.equal(tv.heroYear, 2024);
  assert.equal(anime.heroTitle, "Anime");
  assert.equal(anime.heroRating, 9.2);
});

test("invalid spotlight records are ignored", () => {
  assert.equal(toHomeSpotlight({ title: "Missing ID" }, "movie"), null);
  assert.equal(toHomeSpotlight({ tmdbId: -1, title: "Invalid" }, "tv"), null);
  assert.equal(toHomeSpotlight({ malId: "NaN", title: "Invalid" }, "anime"), null);
});

test("mixed spotlight alternates media types while multiple sources remain", () => {
  const movies = [1, 2, 3].map((id) => toHomeSpotlight({ imdbId: "tt12345" + id, title: "Movie " + id }, "movie"));
  const tv = [1, 2].map((id) => toHomeSpotlight({ tmdbId: id, title: "TV " + id }, "tv"));
  const anime = [1, 2].map((id) => toHomeSpotlight({ malId: id, title: "Anime " + id }, "anime"));
  const mixed = mixHomeSpotlight({ movies, tv, anime }, () => 0.37);

  assert.equal(mixed.length, 7);
  assert.deepEqual(new Set(mixed.map((item) => item.mediaType)), new Set(["movie", "tv", "anime"]));
  for (let index = 1; index < mixed.length; index += 1) {
    assert.notEqual(mixed[index].mediaType, mixed[index - 1].mediaType);
  }
  assert.equal(new Set(mixed.map((item) => item.heroId)).size, mixed.length);
});

test("mixed spotlight tolerates an empty catalog", () => {
  assert.deepEqual(mixHomeSpotlight({ movies: [], tv: [], anime: [] }), []);
});
