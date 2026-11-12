import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSavedMediaList,
  savedMediaKey,
  savedMediaType,
  toggleSavedMedia
} from "../src/saved-media.js";

test("saved collection accepts Movies, TV series, and Anime with type-safe IDs", () => {
  const movie = { imdbId: "tt1234567", title: "A Movie", posterUrl: "https://img.example/movie.jpg" };
  const tv = { tmdbId: 123, title: "A Series", posterUrl: "https://img.example/tv.jpg" };
  const anime = { malId: 123, title: "An Anime", posterUrl: "https://img.example/anime.jpg" };

  let saved = [];
  saved = toggleSavedMedia(saved, movie);
  saved = toggleSavedMedia(saved, tv, "tv");
  saved = toggleSavedMedia(saved, anime, "anime");

  assert.deepEqual(saved.map(savedMediaKey), ["anime:123", "tv:123", "movie:tt1234567"]);
  assert.deepEqual(saved.map(savedMediaType), ["anime", "tv", "movie"]);
  assert.equal(saved.length, 3);
});

test("saved list normalizes legacy movie-only entries and keeps all three media types", () => {
  const legacyMovie = { imdbId: "tt1234567", title: "Legacy movie" };
  const saved = normalizeSavedMediaList([
    legacyMovie,
    { tmdbId: 456, mediaType: "tv", title: "TV" },
    { malId: 789, mediaType: "anime", title: "Anime" },
    legacyMovie,
    { title: "Invalid entry" }
  ]);

  assert.deepEqual(saved.map(savedMediaType), ["movie", "tv", "anime"]);
  assert.deepEqual(saved.map(savedMediaKey), ["movie:tt1234567", "tv:456", "anime:789"]);
  assert.equal(saved[0].mediaType, "movie");
});

test("saved items can be removed independently without affecting another media type", () => {
  const movie = { imdbId: "tt7654321" };
  const tv = { tmdbId: 987 };
  let saved = toggleSavedMedia([], movie);
  saved = toggleSavedMedia(saved, tv, "tv");
  saved = toggleSavedMedia(saved, { tmdbId: "987", mediaType: "tv" }, "tv");

  assert.deepEqual(saved.map(savedMediaKey), ["movie:tt7654321"]);
  assert.deepEqual(toggleSavedMedia(saved, { malId: 42 }, "anime"), [
    { malId: 42, mediaType: "anime" },
    { imdbId: "tt7654321", mediaType: "movie" }
  ]);
});

test("invalid IDs cannot be added to the saved collection", () => {
  assert.deepEqual(toggleSavedMedia([], { tmdbId: 0 }, "tv"), []);
  assert.deepEqual(toggleSavedMedia([], { malId: "not-a-number" }, "anime"), []);
  assert.deepEqual(toggleSavedMedia([], { imdbId: "movie-1" }), []);
});
