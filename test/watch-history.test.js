import test from "node:test";
import assert from "node:assert/strict";
import { createHistoryResumeTarget } from "../src/watch-history.js";

test("Movie history resumes through IMDb route and preserves the saved timestamp", () => {
  const target = createHistoryResumeTarget({
    key: "movie:tt0133093",
    mediaType: "movie",
    mediaId: "tt0133093",
    imdbId: "tt0133093",
    title: "The Matrix",
    watched: 1534.8,
    duration: 6000,
    updatedAt: 123
  });
  assert.equal(target.href, "/watch/tt0133093");
  assert.equal(target.storageKey, "situla:progress:v1");
  assert.equal(target.progressEntry.watched, 1534);
  assert.equal(target.progressEntry.duration, 6000);
  assert.equal(target.matches({ imdbId: "tt0133093" }), true);
});

test("TV history resumes the exact TMDB season and episode", () => {
  const target = createHistoryResumeTarget({
    key: "tv:1399:s2:e8",
    mediaType: "tv",
    mediaId: "1399",
    tmdbId: 1399,
    season: 2,
    episode: 8,
    watched: 711,
    duration: 2400
  });
  assert.equal(target.href, "/watch/tv/1399/2/8");
  assert.equal(target.storageKey, "situla:tv-progress:v1");
  assert.equal(target.progressEntry.watched, 711);
  assert.equal(target.progressEntry.season, 2);
  assert.equal(target.progressEntry.episode, 8);
  assert.equal(target.matches({ tmdbId: 1399, season: 2, episode: 8 }), true);
});

test("Anime history resumes exact MAL episode and selected audio mode", () => {
  const target = createHistoryResumeTarget({
    key: "anime:5114:e64:dub",
    mediaType: "anime",
    mediaId: "5114",
    malId: 5114,
    episode: 64,
    audio: "dub",
    watched: 820,
    duration: 1400
  });
  assert.equal(target.href, "/watch/anime/5114/64/dub");
  assert.equal(target.storageKey, "situla:anime-progress:v1");
  assert.equal(target.progressEntry.watched, 820);
  assert.equal(target.matches({ malId: 5114, episode: 64, audio: "dub" }), true);
});

test("Invalid history items are ignored and completed items replay from the beginning", () => {
  assert.equal(createHistoryResumeTarget({ mediaType: "movie", imdbId: "bad", watched: 10 }), null);
  const target = createHistoryResumeTarget({
    key: "movie:tt0133093",
    mediaType: "movie",
    imdbId: "tt0133093",
    watched: 3600,
    duration: 3600
  });
  assert.equal(target.progressEntry.watched, 0);
});
