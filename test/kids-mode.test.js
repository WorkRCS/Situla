import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Kids Mode accepts only 4–8 digit parent PINs on the server", async () => {
  const backend = await read("../src/app.js");
  const frontend = await read("../app/components/situla-app.jsx");
  const validPinPattern = String.raw`if (!/^\\d{4,8}$/.test(pin))`;
  const invalidEscapedPattern = String.raw`if (!/^\\\\d{4,8}$/.test(pin))`;
  const digitFilter = String.raw`event.target.value.replace(/\\D/g, "").slice(0, 8)`;

  assert.ok(backend.includes(validPinPattern));
  assert.ok(!backend.includes(invalidEscapedPattern));
  assert.ok(frontend.includes(validPinPattern));
  assert.ok(frontend.includes(digitFilter));
});

test("Kids Mode PIN changes and exit are protected by the stored parent PIN", async () => {
  const backend = await read("../src/app.js");

  assert.match(backend, /verifyPassword\\('situla-kids-pin:' \\+ currentPin, document\\.kidsModePinHash\\)/);
  assert.match(backend, /verifyPassword\\('situla-kids-pin:' \\+ pin, document\\.kidsModePinHash\\)/);
  assert.match(backend, /kids-mode-pin-setup:/);
  assert.match(backend, /kids-mode-exit:/);
});

test("Kids Mode protects adult catalog routes and only authorizes approved cartoon playback", async () => {
  const backend = await read("../src/app.js");

  assert.match(backend, /'\\/api\\/movies'.*'\\/api\\/tv'.*'\\/api\\/anime'/s);
  assert.match(backend, /kidsModeOn && !\\['cartoon_movie', 'cartoon_tv'\\]\\.includes\\(mediaType\\)/);
  assert.ok(backend.includes("CartoonMovie.exists(approvedCartoonFilter({ tmdbId }))"));
  assert.ok(backend.includes("CartoonSeries.exists(approvedCartoonFilter({ tmdbId }))"));
  assert.match(backend, /CartoonEpisode\\.exists\\(\\{ seriesTmdbId: tmdbId, seasonNumber: season, episodeNumber: episode, kidsApproved: true \\}\\)/);
});

test("Roll No. 21 is excluded from every approved cartoon catalog query", async () => {
  const backend = await read("../src/app.js");

  assert.ok(backend.includes(String.raw`const ROLL_NO_21_PATTERN = /roll[\\s._-]*no\\.?[\\s._-]*21/i;`));
  assert.ok(backend.includes("function approvedCartoonFilter(extra = {})"));
  assert.ok(backend.includes("{ title: ROLL_NO_21_PATTERN }"));
  assert.ok(backend.includes("{ originalTitle: ROLL_NO_21_PATTERN }"));
  assert.ok(backend.includes("{ aliases: ROLL_NO_21_PATTERN }"));
  assert.ok((backend.match(/approvedCartoonFilter\\(/g) || []).length >= 10);
  assert.ok(backend.includes("const filter = approvedCartoonFilter();"));
});

test("Motu Patlu replaces Roll No. 21 with validated public TV metadata and a complete episode guide", async () => {
  const migration = await read("../scripts/replace-kids-catalog.js");
  const packageJson = JSON.parse(await read("../package.json"));

  assert.ok(migration.includes('tmdbId: 70058'));
  assert.ok(migration.includes('tvmazeId: 35173'));
  assert.ok(migration.includes('imdbId: "tt2649730"'));
  assert.ok(migration.includes('title: "Motu Patlu"'));
  assert.ok(migration.includes('firstAirDate: "2012-10-16"'));
  assert.ok(migration.includes("fetchMotuPatlu()"));
  assert.ok(migration.includes("CartoonSeries.updateOne("));
  assert.ok(migration.includes("CartoonEpisode.insertMany(episodes"));
  assert.ok(migration.includes("CartoonSeries.deleteMany("));
  assert.ok(migration.includes("CartoonMovie.deleteMany("));
  assert.equal(packageJson.scripts["seed:kids"], "node scripts/replace-kids-catalog.js");
});

test("Kids Mode keeps the shared home layout and uses the same desktop navigation", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const sidebar = await read("../app/components/site-sidebar.jsx");

  assert.ok(app.includes("import { ArrowUpRight, Baby,"));
  assert.ok(app.includes('const kidsOnlyView = ["home", "cartoons",'));
  assert.ok(app.includes('router.replace("/")'));
  assert.ok(app.includes('<CartoonsCatalog view="cartoons" />'));
  assert.ok(app.includes("kidsMode={kidsMode}"));
  assert.ok(sidebar.includes('{ id: "home", href: "/", label: "Home", icon: House }'));
  assert.match(sidebar, /export function SiteWorkspace\\(\\{ children, kidsMode = false \\}\\)/);
});

test("Kids Mode cartoon cards reuse the normal TV card, poster, rating, and metadata classes", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const cartoons = await read("../app/components/cartoons-catalog.jsx");

  assert.ok(app.includes('className={"movie-card series-card series-card-" + kind'));
  assert.ok(app.includes('className="movie-poster"'));
  assert.ok(app.includes('className="rating-pill"'));
  assert.ok(app.includes('className="series-card-meta"'));
  assert.ok(cartoons.includes('className={"movie-card series-card series-card-tv"'));
  assert.ok(cartoons.includes('className="movie-poster"'));
  assert.ok(cartoons.includes('className="rating-pill"'));
  assert.ok(cartoons.includes('className="series-card-meta"'));
  assert.ok(cartoons.includes("featuredSeriesList"));
  assert.ok(cartoons.includes("hotSeries"));
  assert.ok(cartoons.includes("popularSeries"));
});
