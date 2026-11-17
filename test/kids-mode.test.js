import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Kids Mode has one password-free icon-only red/green switch", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  const backend = await read("../src/app.js");
  const models = await read("../src/models.js");

  assert.ok(app.includes('className="header-kids-mode-icon"'));
  assert.ok(app.includes("<Baby size={19} />"));
  assert.ok(app.includes('role="switch"'));
  assert.ok(app.includes('aria-checked={kidsMode}'));
  assert.ok(app.includes('aria-label="Kids Mode"'));
  assert.ok(app.includes("onClick={() => changeKidsMode(!kidsMode)}"));
  assert.ok(!app.includes("Only approved cartoon content"));
  assert.ok(!app.includes("header-kids-mode-copy"));
  assert.ok(!app.includes("header-kids-mode-description"));
  assert.ok(!app.includes("header-kids-mode-status"));
  assert.ok(css.includes("background:#d63c3c;"));
  assert.ok(css.includes("background:#209b65;"));
  assert.ok(!/kidsPin|Parent PIN|type="password"|saveKidsModePin/.test(app));
  assert.ok(!backend.includes("/api/kids-mode/pin"));
  assert.ok(!backend.includes("verifyPassword('situla-kids-pin:"));
  assert.ok(backend.includes("removeLegacyKidsModePinData"));
  assert.ok(!models.includes("kidsModePinHash"));
});

test("Kids Mode API stores just the toggle and clears all old PIN hashes", async () => {
  const backend = await read("../src/app.js");
  const route = backend.slice(backend.indexOf("app.post('/api/kids-mode'"), backend.indexOf("async function readSharePosterBytes"));

  assert.ok(backend.includes("async function removeLegacyKidsModePinData()"));
  assert.ok(backend.includes("User.collection.updateMany("));
  assert.ok(backend.includes("GuestSession.collection.updateMany("));
  assert.ok(route.includes("$set: { kidsMode: body.enabled }"));
  assert.ok(route.includes('$unset: { kidsModePinHash: "" }'));
  assert.ok(!route.includes("body.pin"));
  assert.ok(!route.includes("verifyPassword"));
});

test("Kids Mode switch is optimistic, avoids route navigation, and keeps both home views mounted", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const handler = app.slice(app.indexOf("async function changeKidsMode"), app.indexOf("useEffect(() => {\n    if (!kidsModeReady || kidsMode) return undefined;"));
  const home = app.slice(app.indexOf('<div className="home-main-column">'), app.indexOf("</div>\n          </>", app.indexOf('<div className="home-main-column">')));

  assert.ok(handler.includes("setKidsMode(Boolean(enabled))"));
  assert.ok(!handler.includes("router.replace"));
  assert.ok(home.includes('<div className="home-mode-panel" hidden={kidsMode}'));
  assert.ok(home.includes('<div className="kids-mode-panel" hidden={!kidsMode}'));
  assert.ok(app.includes('className="app-view-mode-panel" hidden={kidsMode && !kidsOnlyView}'));
  assert.ok(app.includes('className="kids-mode-panel" hidden={!kidsMode || kidsOnlyView}'));
  assert.ok(app.includes('if (!kidsModeReady || kidsMode || tab !== "home") return undefined;'));
  assert.ok(!app.includes("setHomeSeriesReady(false);"));
});

test("Kids Mode restricts adult catalogs and playback to approved cartoons", async () => {
  const backend = await read("../src/app.js");

  assert.ok(backend.includes("'/api/movies'") && backend.includes("'/api/tv'") && backend.includes("'/api/anime'"));
  assert.ok(backend.includes("kidsModeOn && !['cartoon_movie', 'cartoon_tv'].includes(mediaType)"));
  assert.ok(backend.includes("CartoonMovie.exists(approvedCartoonMovieFilter({ tmdbId }))"));
  assert.ok(backend.includes("CartoonSeries.exists(approvedCartoonSeriesFilter({ tmdbId }))"));
  assert.ok(backend.includes("CartoonEpisode.exists({ seriesTmdbId: tmdbId, seasonNumber: season, episodeNumber: episode, kidsApproved: true })"));
});

test("Roll No. 21 is excluded from every Kids catalog API query", async () => {
  const backend = await read("../src/app.js");
  const catalog = await read("../src/cartoon-catalog.js");

  assert.ok(catalog.includes(String.raw`const ROLL_NO_21_PATTERN = /roll[\s._-]*no\.?[\s._-]*21/i;`));
  assert.ok(catalog.includes("function baseApprovedFilter(extra, yearFilter)"));
  assert.ok(catalog.includes("{ title: ROLL_NO_21_PATTERN }"));
  assert.ok(catalog.includes("{ originalTitle: ROLL_NO_21_PATTERN }"));
  assert.ok(catalog.includes("{ aliases: ROLL_NO_21_PATTERN }"));
  assert.ok(backend.includes("approvedCartoonMovieFilter"));
  assert.ok(backend.includes("approvedCartoonSeriesFilter"));
  assert.equal(backend.includes("approvedCartoonFilter("), false);
});

test("Kids Mode stays in the shared home UI and navigation", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const sidebar = await read("../app/components/site-sidebar.jsx");

  assert.ok(app.includes("import { ArrowUpRight, Baby,"));
  assert.ok(app.includes('const kidsOnlyView = ["home", "cartoons",'));
  assert.ok(!app.includes('router.replace("/")'));
  assert.ok(app.includes('const navigationTab = kidsMode && !kidsOnlyView ? "cartoons" : tab;'));
  assert.ok(app.includes('<CartoonsCatalog view="kidsHome" />'));
  assert.ok(app.includes("<CartoonsCatalog view={tab} />"));
  assert.ok(app.includes("kidsMode={kidsMode}"));
  assert.ok(sidebar.includes('{ id: "home", href: "/", label: "Home", icon: House }'));
  assert.ok(sidebar.includes("export function SiteWorkspace({ children, kidsMode = false })"));
});

test("Kids Mode cards use the same TV poster, card size, rating and metadata styles", async () => {
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
  assert.ok(cartoons.includes('const homeView = view === "kidsHome";'));
  assert.ok(cartoons.includes('const mixedView = view === "cartoons";'));
  assert.ok(cartoons.includes('"/api/cartoons/catalog"'));
  assert.ok(cartoons.includes('value="random"'));
  assert.ok(cartoons.includes("Load more"));
});
