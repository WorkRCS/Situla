import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Normal and Kids Home keep poster-driven colour strictly inside Hero page content", async () => {
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
  assert.match(app, /normalHeroPaletteStyle/);
  assert.match(app, /kidsHeroPaletteStyle/);
  assert.ok(app.includes('<div className="home-mode-panel" hidden={!kidsModeReady || kidsMode}'));
  assert.ok(app.includes('<div className="kids-mode-panel" hidden={!kidsModeReady || !kidsMode}'));
  assert.match(app, /home-hero-palette-surface/);
  assert.match(app, /kids-hero-palette-surface/);
  assert.match(app, /className=\{"home-mode-panel" \+ \(heroPalettes\.normal \? " has-home-hero-palette" : ""\)\}/);
  assert.match(app, /className=\{"kids-mode-panel" \+ \(heroPalettes\.kids \? " has-home-hero-palette" : ""\)\}/);
  assert.match(app, /src=\{optimizeTmdbImageUrl\(featured\.heroImage/);
  assert.doesNotMatch(app, /activeHeroPalette|appShellStyle|app-shell.*has-home-hero-palette/);
  assert.match(cartoons, /onPaletteChange=\{onHeroPaletteChange\}/);
  assert.match(cartoons, /onLoad=\{onCenterImageLoad\}/);
  assert.match(cartoons, /optimizeTmdbImageUrl\(featured\.backdropUrl/);

  assert.ok(css.includes(".home-mode-panel .home-hero-palette-surface.has-home-hero-palette"));
  assert.ok(css.includes(".kids-mode-panel .kids-hero-palette-surface.has-home-hero-palette"));
  assert.doesNotMatch(css, /\.app-shell\.has-home-hero-palette/);
  assert.doesNotMatch(css, /\.site-app-header[^\n]*--home-hero-rgb|\.site-sidebar[^\n]*--home-hero-rgb|\.bottom-nav[^\n]*--home-hero-rgb|\.site-footer-app[^\n]*--home-hero-rgb/);
  assert.match(css, /filter:blur\(30px\) saturate\(1\.55\)/);
  assert.match(css, /transition:background-color \.68s ease/);
  assert.match(css, /inset:-8px 0 0/);
});

test("responsive breakpoints size catalog grids and hero layouts for phone, tablet and desktop", async () => {
  const css = await read("../app/globals.css");
  const responsive = css.slice(css.indexOf("/* Device-fit layouts:"));
  assert.match(responsive, /@media \(max-width:599px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(responsive, /@media \(min-width:600px\) and \(max-width:767px\)[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(responsive, /@media \(min-width:768px\) and \(max-width:1100px\)[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(responsive, /@media \(min-width:1450px\)[\s\S]*?grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(responsive, /height:clamp\(300px,48svh,420px\)/);
  assert.match(responsive, /min-height:40px/);
  assert.match(responsive, /orientation:landscape/);
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
