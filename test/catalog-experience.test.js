import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("TV and Anime initial catalog requests rotate to a random first batch", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const api = await read("../src/app.js");
  assert.match(app, /\/api\/tv\?page=1&limit=40&random=true/);
  assert.match(app, /\/api\/anime\?page=1&limit=40&random=true/);
  assert.match(app, /readRecentCatalogIds\(recentKey\)/);
  assert.match(app, /rememberRecentCatalogIds\(recentKey/);
  assert.match(api, /baseFilter\.imdbId = \{ \$nin: excludedIds, \$regex: IMDB_ID \}/);
});

test("TV and Anime load-more requests exclude already visible canonical IDs", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const api = await read("../src/app.js");
  assert.match(app, /exclude: tvShows\.map\(\(item\) => item\.tmdbId\)/);
  assert.match(app, /exclude: animeShows\.map\(\(item\) => item\.malId\)/);
  assert.match(app, /current\.map\(\(item\) => Number\(item\.tmdbId\)\)/);
  assert.match(app, /current\.map\(\(item\) => Number\(item\.malId\)\)/);
  assert.doesNotMatch(app, /current\.map\(\(item\) => item\.imdbId\)/);
  assert.match(api, /randomFilter\.tmdbId = \{ \$nin: excludedIds, \$type: 'number', \$gt: 0 \}/);
  assert.match(api, /randomFilter\.malId = \{ \$nin: excludedIds, \$type: 'number', \$gt: 0 \}/);
  assert.equal((api.match(/\$sample: \{ size: limit \}/g) || []).length, 3);
});

test("global search interleaves Movies, TV series, and Anime", async () => {
  const api = await read("../src/app.js");
  const app = await read("../app/components/situla-app.jsx");
  assert.match(api, /movies\.map\(\(item\) => \(\{ \.\.\.movieDto\(item\), mediaType: 'movie' \}\)\)/);
  assert.match(api, /shows\.map\(\(item\) => \(\{ \.\.\.tvSeriesDto\(item\), mediaType: 'tv' \}\)\)/);
  assert.match(api, /anime\.map\(\(item\) => \(\{ \.\.\.animeSeriesDto\(item\), mediaType: 'anime' \}\)\)/);
  assert.match(api, /activeGroups.*Math\.random\(\)/s);
  assert.match(app, /className="search-overlay"/);
  assert.match(app, /role="dialog" aria-modal="true"/);
  assert.match(app, /Mixed results · Movies · TV series · Anime/);
  assert.match(app, /View full search page/);
  assert.match(app, /onClick=\{\(\) => setSearchOpen\(true\)\}/);
});

test("catalog loading is bounded and off-screen image/grid work is deferred", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /AbortSignal\.timeout\(20000\)/);
  assert.match(app, /AbortSignal\.timeout\(10000\)/);
  assert.match(app, /loadMoreLock\.current/);
  assert.match(app, /loading="lazy"/);
  assert.match(app, /decoding="async"/);
  assert.match(css, /content-visibility:auto/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(app, /document\.visibilityState !== "visible"/);
  assert.match(app, /\}, 10000\)/);
});

test("seed:catalog runs all three catalog seed commands", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(pkg.scripts["seed:catalog"],
    "npm run seed:movies && npm run seed:tv && npm run seed:anime");
});
