import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Kids Mode accepts only 4–8 digit parent PINs", async () => {
  const backend = await read("../src/app.js");
  const frontend = await read("../app/components/situla-app.jsx");

  assert.ok(backend.includes(String.raw`if (!/^\d{4,8}$/.test(pin))`));
  assert.ok(frontend.includes(String.raw`if (!/^\d{4,8}$/.test(pin))`));
  assert.ok(frontend.includes(String.raw`event.target.value.replace(/\D/g, "").slice(0, 8)`));
});

test("Kids Mode PIN changes and exit require the stored parent PIN", async () => {
  const backend = await read("../src/app.js");

  assert.ok(backend.includes("verifyPassword('situla-kids-pin:' + currentPin, document.kidsModePinHash)"));
  assert.ok(backend.includes("verifyPassword('situla-kids-pin:' + pin, document.kidsModePinHash)"));
  assert.ok(backend.includes("kids-mode-pin-setup:"));
  assert.ok(backend.includes("kids-mode-exit:"));
});

test("Kids Mode restricts adult catalogs and playback to approved cartoons", async () => {
  const backend = await read("../src/app.js");

  assert.ok(backend.includes("'/api/movies'") && backend.includes("'/api/tv'") && backend.includes("'/api/anime'"));
  assert.ok(backend.includes("kidsModeOn && !['cartoon_movie', 'cartoon_tv'].includes(mediaType)"));
  assert.ok(backend.includes("CartoonMovie.exists(approvedCartoonFilter({ tmdbId }))"));
  assert.ok(backend.includes("CartoonSeries.exists(approvedCartoonFilter({ tmdbId }))"));
  assert.ok(backend.includes("CartoonEpisode.exists({ seriesTmdbId: tmdbId, seasonNumber: season, episodeNumber: episode, kidsApproved: true })"));
});

test("Roll No. 21 is excluded from every Kids catalog API query", async () => {
  const backend = await read("../src/app.js");

  assert.ok(backend.includes(String.raw`const ROLL_NO_21_PATTERN = /roll[\s._-]*no\.?[\s._-]*21/i;`));
  assert.ok(backend.includes("function approvedCartoonFilter(extra = {})"));
  assert.ok(backend.includes("{ title: ROLL_NO_21_PATTERN }"));
  assert.ok(backend.includes("{ originalTitle: ROLL_NO_21_PATTERN }"));
  assert.ok(backend.includes("{ aliases: ROLL_NO_21_PATTERN }"));
  assert.ok(backend.split("approvedCartoonFilter(").length >= 10);
});

test("Kids Mode stays in the shared home UI and navigation", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const sidebar = await read("../app/components/site-sidebar.jsx");

  assert.ok(app.includes("import { ArrowUpRight, Baby,"));
  assert.ok(app.includes('const kidsOnlyView = ["home", "cartoons",'));
  assert.ok(app.includes('router.replace("/")'));
  assert.ok(app.includes('<CartoonsCatalog view="cartoons" />'));
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
});
