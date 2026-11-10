import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STATIC_MOVIES } from "../data/movie-catalog.js";
import { STATIC_TV_SERIES } from "../data/tv-catalog.js";
import { MANUAL_ANIME_CATALOG } from "../data/anime-catalog.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("static packs contain 70 new IMDb Movies and 70 TMDB TV records", () => {
  assert.equal(STATIC_MOVIES.length, 70);
  assert.equal(new Set(STATIC_MOVIES.map((item) => item.imdbId)).size, 70);
  assert.ok(STATIC_MOVIES.every((item) => /^tt\d{5,12}$/.test(item.imdbId)));
  assert.ok(STATIC_MOVIES.every((item) => item.posterUrl && item.title && item.runtime > 0));

  assert.equal(STATIC_TV_SERIES.length, 70);
  assert.equal(new Set(STATIC_TV_SERIES.map((item) => item.tmdbId)).size, 70);
  assert.ok(STATIC_TV_SERIES.every((item) => Number.isSafeInteger(item.tmdbId) && item.tmdbId > 0));
  assert.ok(STATIC_TV_SERIES.every((item) => item.posterUrl && item.title && item.adult === false));
  assert.ok(STATIC_TV_SERIES.every((item) => item.numberOfSeasons > 0 && item.numberOfEpisodes > 0));
  assert.ok(STATIC_TV_SERIES.every((item) => Array.isArray(item.seasons) && item.seasons.length === 0));
});

test("manual MAL pack keeps the 11 starter Anime and adds at least 70 unique TV entries", () => {
  assert.ok(MANUAL_ANIME_CATALOG.length >= 80);
  assert.equal(new Set(MANUAL_ANIME_CATALOG.map((item) => item.malId)).size, MANUAL_ANIME_CATALOG.length);
  assert.ok(MANUAL_ANIME_CATALOG.every((item) => Number.isSafeInteger(item.malId) && item.malId > 0));
  assert.ok(MANUAL_ANIME_CATALOG.every((item) => item.type === "TV" || item.type === "ONA"));
  assert.ok(MANUAL_ANIME_CATALOG.every((item) => item.title));
  assert.ok(MANUAL_ANIME_CATALOG.slice(11).every((item) => item.posterUrl));
});

test("one static bulk seeder imports all three catalogs without metadata API calls", async () => {
  const script = await read("../scripts/seed-static-catalog.js");
  const pkg = JSON.parse(await read("../package.json"));

  assert.equal(pkg.scripts["seed:catalog"], "node scripts/seed-static-catalog.js");
  assert.equal(pkg.scripts["seed:movies"], "node scripts/seed-static-catalog.js --movies");
  assert.equal(pkg.scripts["seed:tv"], "node scripts/seed-static-catalog.js --tv");
  assert.equal(pkg.scripts["seed:anime"], "node scripts/seed-static-catalog.js --anime");
  assert.match(script, /Model\.bulkWrite/);
  assert.match(script, /\$setOnInsert/);
  assert.match(script, /STATIC_MOVIES/);
  assert.match(script, /STATIC_TV_SERIES/);
  assert.match(script, /MANUAL_ANIME_CATALOG/);
  assert.doesNotMatch(script, /\bfetch\s*\(|axios|api\.tvmaze|api\.themoviedb|api\.jikan/i);
  assert.doesNotMatch(pkg.scripts.dev, /seed|crawl/i);
  assert.equal(Object.hasOwn(pkg.scripts, "predev"), false);
});

test("static TV detail allows manual season and episode selection when no guide exists", async () => {
  const detail = await read("../app/tv/[tmdbId]/detail.jsx");
  assert.match(detail, /const hasEpisodeGuide =/);
  assert.match(detail, /type="number" min="0"/);
  assert.match(detail, /type="number" min="1"/);
  assert.match(detail, /Enter the season and episode number to open it directly in VidLink/);
  assert.match(detail, /{hasEpisodeGuide && <div className="episode-guide-section/);
});
