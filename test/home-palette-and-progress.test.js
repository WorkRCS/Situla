import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Normal and Kids Home sample the active poster and share its palette across the app frame", async () => {
  const [app, cartoons, hero, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/cartoons-catalog.jsx"),
    read("../app/components/three-card-hero.jsx"),
    read("../app/globals.css")
  ]);

  assert.match(hero, /extractPosterDominantRgb/);
  assert.match(hero, /canvas\.getContext\("2d", \{ willReadFrequently: true \}\)/);
  assert.match(hero, /getImageData\(0, 0, 20, 20\)/);
  assert.match(hero, /renderCenter\?\.\(item, onCenterImageLoad\)/);
  assert.match(hero, /onPaletteChange\?\.\(dominantRgb\)/);
  assert.match(app, /onPaletteChange=\{reportNormalHeroPalette\}/);
  assert.match(app, /onHeroPaletteChange=\{reportKidsHeroPalette\}/);
  assert.match(app, /heroPalettes\[kidsMode \? "kids" : "normal"\]/);
  assert.match(app, /has-home-hero-palette/);
  assert.match(cartoons, /onPaletteChange=\{onHeroPaletteChange\}/);
  assert.match(cartoons, /onLoad=\{onCenterImageLoad\}/);
  assert.match(app, /onLoad=\{onCenterImageLoad\}/);

  for (const selector of [
    ".app-shell.has-home-hero-palette",
    ".app-shell.has-home-hero-palette .site-app-header",
    ".app-shell.has-home-hero-palette .site-sidebar.home-sidebar",
    ".app-shell.has-home-hero-palette .site-footer-app",
    ".app-shell.has-home-hero-palette .bottom-nav"
  ]) assert.ok(css.includes(selector), "missing full-frame poster palette: " + selector);

  assert.match(css, /rgba\(var\(--home-hero-rgb\),\.34\)/);
  assert.match(css, /rgba\(var\(--home-hero-rgb\),\.20\)/);
  assert.match(css, /opacity:\.79/);
  assert.match(css, /opacity:\.62/);
  assert.match(css, /saturate\(1\.74\)/);
  assert.match(css, /saturate\(1\.54\)/);
  assert.match(css, /transition:background-color \.68s ease/);
});

test("the top route progress bar also tracks user-triggered server requests without a corner popup", async () => {
  const [layout, progress, css, legacyLoader] = await Promise.all([
    read("../app/layout.jsx"),
    read("../app/components/route-progress.jsx"),
    read("../app/globals.css"),
    read("../app/components/server-activity-loader.jsx")
  ]);

  assert.match(layout, /<RouteProgress \/>/);
  assert.doesNotMatch(layout, /ServerActivityLoader/);
  assert.match(progress, /document\.addEventListener\("pointerdown", markUserAction, true\)/);
  assert.match(progress, /document\.addEventListener\("keydown", markUserAction, true\)/);
  assert.match(progress, /window\.fetch = trackedFetch/);
  assert.match(progress, /isUserTriggeredServerRequest/);
  assert.match(progress, /startRoute\(target/);
  assert.match(progress, /window\.history\[method\] = wrappedHistoryMethod/);
  assert.match(progress, /aria-label="Loading page and server request"/);
  assert.match(css, /\.site-route-progress \{[\s\S]*?height:3px/);
  assert.doesNotMatch(css, /\.site-server-activity\s*\{/);
  assert.match(legacyLoader, /return null/);
});
