import test from "node:test";
import assert from "node:assert/strict";
import { optimizeTmdbImageUrl } from "../src/media-image.js";

test("TMDB posters are requested at the rendered card size instead of original resolution", () => {
  assert.equal(
    optimizeTmdbImageUrl("https://image.tmdb.org/t/p/w500/poster.jpg", "w185"),
    "https://image.tmdb.org/t/p/w185/poster.jpg"
  );
  assert.equal(
    optimizeTmdbImageUrl("https://image.tmdb.org/t/p/original/backdrop.jpg", "w780"),
    "https://image.tmdb.org/t/p/w780/backdrop.jpg"
  );
});

test("image URLs from other hosts and already-small images are never rewritten or enlarged", () => {
  const external = "https://cdn.myanimelist.net/images/anime/1/1.jpg";
  const small = "https://image.tmdb.org/t/p/w92/poster.jpg";
  assert.equal(optimizeTmdbImageUrl(external, "w185"), external);
  assert.equal(optimizeTmdbImageUrl(small, "w185"), small);
  assert.equal(optimizeTmdbImageUrl("not-a-url", "w185"), "not-a-url");
  assert.equal(optimizeTmdbImageUrl("https://image.tmdb.org/t/p/w500/x.jpg", "original"), "https://image.tmdb.org/t/p/w500/x.jpg");
});
