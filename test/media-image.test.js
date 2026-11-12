import test from "node:test";
import assert from "node:assert/strict";
import { optimizeTmdbImageUrl, normalizeSharePosterUrl, detectSharePosterMimeType, SHARE_POSTER_MAX_BYTES } from "../src/media-image.js";

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


test("share poster proxy only accepts the catalogue's approved HTTPS image hosts", () => {
  assert.equal(normalizeSharePosterUrl("https://image.tmdb.org/t/p/w500/poster.jpg"), "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.equal(normalizeSharePosterUrl("https://cdn.myanimelist.net/images/anime/1/1.jpg"), "https://cdn.myanimelist.net/images/anime/1/1.jpg");
  assert.equal(normalizeSharePosterUrl("https://m.media-amazon.com/images/poster.jpg"), "https://m.media-amazon.com/images/poster.jpg");
  assert.equal(normalizeSharePosterUrl("https://static.tvmaze.com/uploads/images/medium_portrait/poster.jpg"), "https://static.tvmaze.com/uploads/images/medium_portrait/poster.jpg");
  assert.equal(normalizeSharePosterUrl("https://images.metahub.space/poster/medium/tt1234567/img"), "https://images.metahub.space/poster/medium/tt1234567/img");
  assert.equal(normalizeSharePosterUrl("https://is1-ssl.mzstatic.com/image/thumb/poster.jpg"), "https://is1-ssl.mzstatic.com/image/thumb/poster.jpg");
  assert.equal(normalizeSharePosterUrl("http://image.tmdb.org/t/p/w500/poster.jpg"), null);
  assert.equal(normalizeSharePosterUrl("https://evil.example/poster.jpg"), null);
  assert.equal(normalizeSharePosterUrl("https://image.tmdb.org.evil.example/poster.jpg"), null);
  assert.equal(normalizeSharePosterUrl("https://user:pass@image.tmdb.org/poster.jpg"), null);
  assert.equal(normalizeSharePosterUrl("https://image.tmdb.org:8443/poster.jpg"), null);
  assert.equal(normalizeSharePosterUrl("not-a-url"), null);
});

test("share poster proxy detects supported image file signatures and rejects non-images", () => {
  assert.equal(detectSharePosterMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])), "image/jpeg");
  assert.equal(detectSharePosterMimeType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), "image/png");
  assert.equal(detectSharePosterMimeType(new TextEncoder().encode("GIF89a123456")), "image/gif");
  assert.equal(detectSharePosterMimeType(new TextEncoder().encode("RIFF1234WEBP1234")), "image/webp");
  assert.equal(detectSharePosterMimeType(new TextEncoder().encode("1234ftypavif1234")), "image/avif");
  assert.equal(detectSharePosterMimeType(new TextEncoder().encode("<html></html>")), null);
  assert.equal(detectSharePosterMimeType(new Uint8Array(4)), null);
  assert.equal(SHARE_POSTER_MAX_BYTES, 8 * 1024 * 1024);
});
