import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Home and Kids keep artwork inside the hero instead of creating an oversized blurred page backdrop", async () => {
  const [app, cartoons, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/cartoons-catalog.jsx"),
    read("../app/globals.css")
  ]);

  assert.match(app, /className="home-mode-panel"/);
  assert.match(app, /className="kids-mode-panel"/);
  assert.match(app, /className="hero-card home-hero-card"/);
  assert.match(cartoons, /className="cartoons-home-catalog"/);
  assert.match(cartoons, /<CartoonSpotlight/);
  assert.doesNotMatch(app, /heroPalettes|home-hero-palette-surface|kids-hero-palette-surface|home-hero-atmosphere/);
  assert.doesNotMatch(app, /onPaletteChange=\{reportNormalHeroPalette\}|onHeroPaletteChange/);
  assert.doesNotMatch(cartoons, /home-hero-atmosphere|onPaletteChange|onHeroPaletteChange/);
  assert.doesNotMatch(css, /home-hero-atmosphere|home-hero-palette-surface|kids-hero-palette-surface/);
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
