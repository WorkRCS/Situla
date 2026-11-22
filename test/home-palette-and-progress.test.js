import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Normal and Kids Home blend a smooth multi-color ambient palette from the active poster", async () => {
  const [app, cartoons, hero, api, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/cartoons-catalog.jsx"),
    read("../app/components/three-card-hero.jsx"),
    read("../src/app.js"),
    read("../app/globals.css")
  ]);

  assert.match(hero, /extractPosterPalette/);
  assert.match(hero, /fetch\(endpoint,\s*\{/);
  assert.match(hero, /\/api\/share-poster\?url=/);
  assert.match(hero, /createImageBitmap\(blob\)/);
  assert.match(hero, /selected\.slice\(0, 4\)/);
  assert.match(hero, /onPaletteChange\?\.\(palette\)/);
  assert.match(hero, /onPaletteChange\?\.\(null\)/);
  assert.match(api, /app\.get\('\/api\/share-poster'/);
  assert.match(app, /onPaletteChange=\{setHeroPaletteColors\}/);
  assert.match(cartoons, /onPaletteChange=\{setHeroPaletteColors\}/);
  for (let index = 1; index <= 4; index += 1) {
    assert.match(app, new RegExp("--home-hero-color-" + index));
    assert.match(cartoons, new RegExp("--home-hero-color-" + index));
    assert.match(css, new RegExp("@property --home-hero-color-" + index));
  }
  assert.match(css, /color-mix\(in srgb,var\(--home-hero-color-1\)/);
  assert.match(css, /\.home-mode-panel \{ display:block; \}/);
  assert.match(css, /radial-gradient\(ellipse 76% 34%/);
  assert.match(css, /--home-hero-color-4 1\.25s ease-in-out/);
  assert.doesNotMatch(app + cartoons, /--home-hero-palette|heroPaletteRgb/);
});

test("responsive breakpoints size catalog grids and hero layouts for phone, tablet and desktop", async () => {
  const css = await read("../app/globals.css");
  const responsive = css.slice(css.indexOf("/* Device-fit layouts:"));
  assert.match(responsive, /@media \(max-width:599px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(responsive, /@media \(min-width:600px\) and \(max-width:767px\)[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(responsive, /@media \(min-width:768px\) and \(max-width:1100px\)[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(responsive, /@media \(min-width:1450px\)[\s\S]*?grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(responsive, /height:clamp\(285px,44svh,350px\)/);
  assert.match(responsive, /min-height:33px/);
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
  const scheduleStart = progress.indexOf("function scheduleProgress(");
  const routeStart = progress.indexOf("function startRoute(");
  const serverStart = progress.indexOf("function startServerRequest(");
  const scheduledRouteProgress = progress.slice(scheduleStart, routeStart);
  const routeStartLogic = progress.slice(routeStart, serverStart);
  assert.match(scheduledRouteProgress, /setProgress\(\(value\) => Math\.max\(value, 12\)\)/);
  assert.doesNotMatch(routeStartLogic, /setProgress\(/);
  assert.match(routeStartLogic, /scheduleProgress\(pending, deferStateUpdate\)/);
  assert.match(progress, /startRoute\(target, true\)/);
  assert.match(progress, /aria-label="Loading page and server request"/);
  assert.match(css, /\.site-route-progress \{[\s\S]*?height:3px/);
  assert.doesNotMatch(css, /\.site-server-activity\s*\{/);
  assert.match(legacyLoader, /return null/);
});

test("desktop header height aligns with the fixed sidebar brand row", async () => {
  const css = await read("../app/globals.css");
  const desktopHeader = css.slice(css.lastIndexOf("/* Keep the left brand strip and the right application header"));

  assert.match(desktopHeader, /--site-desktop-header-height:54px/);
  assert.ok(desktopHeader.includes("height:var(--site-desktop-header-height);"));
  assert.ok(desktopHeader.includes("height:calc(var(--site-desktop-header-height) + 1px);"));
  assert.ok(desktopHeader.includes("height:44px !important;"));
  assert.ok(desktopHeader.includes("width:42px;"));
});
test("Hero carousel keeps the active middle card larger than its side previews", async () => {
  const [hero, css] = await Promise.all([
    read("../app/components/three-card-hero.jsx"),
    read("../app/globals.css")
  ]);

  assert.match(hero, /isCenter \? " is-center" : isAdjacent \? " is-adjacent"/);
  assert.match(css, /\.home-hero-deck-slide\.is-center\s*\{[\s\S]*?transform:scale\(1\)/);
  assert.match(css, /\.home-hero-deck-slide\.is-adjacent\s*\{[\s\S]*?transform:scale\(\.84\)/);
  assert.match(css, /@media \(max-width:760px\)[\s\S]*?\.home-hero-deck-slide\.is-adjacent[^}]*transform:scale\(\.88\)/);
  assert.match(css, /\.home-hero-deck-track\s*\{[\s\S]*?transition:transform 360ms/);
  assert.match(css, /\.home-hero-deck-slide,[\s\S]*?transition:none !important/);
  assert.match(css, /\.home-hero-deck-slide\.is-adjacent\s*\{[\s\S]*?filter:none !important/);
});



test("Hero fits the viewport, keeps side previews softly blurred and contains mobile copy", async () => {
  const css = await read("../app/globals.css");
  const hero = css.slice(css.indexOf("/* Three-card Home spotlight:"));

  assert.match(hero, /height:clamp\(300px,min\(34vw,44svh\),430px\)/);
  assert.match(hero, /height:clamp\(290px,min\(38vw,46svh\),390px\)/);
  assert.match(hero, /will-change:transform/);
  assert.match(hero, /loading=\{Math\.abs\(offset\) === 1 \? "eager" : "lazy"\}/);
  assert.match(hero, /requestIdleCallback\(sampleWhenIdle, \{ timeout: 1400 \}\)/);
  assert.match(hero, /height:clamp\(285px,44svh,350px\)/);
  assert.match(hero, /height:100%; min-height:0; overflow:hidden/);
  assert.match(hero, /font-size:clamp\(19px,5vw,27px\)/);
  assert.match(hero, /min-height:33px/);
});

test("Full-site glass styling remains dark and applies restrained blur to shared navigation planes", async () => {
  const css = await read("../app/globals.css");
  const glass = css.slice(css.indexOf("/* Shared dark-glass tokens for responsive Situla surfaces."));

  assert.match(glass, /--situla-glass-surface:rgba\(15,18,27,\.76\)/);
  assert.match(glass, /--situla-glass-border:rgba\(220,229,245,\.13\)/);
  assert.match(glass, /backdrop-filter:blur\(7px\) saturate\(122%\)/);
  assert.match(glass, /prefers-reduced-transparency:reduce/);
  assert.match(glass, /--situla-glass-shadow:inset 0 1px 0/);
  assert.doesNotMatch(glass, /\.gold-button|\.ghost-button|\.plans-card-action/);
  assert.doesNotMatch(glass, /0 5px 16px/);
  assert.doesNotMatch(glass, /\.movie-card[^}]*backdrop-filter/);
  assert.match(glass, /Only the large navigation planes sample the backdrop/);
});

test("landing hero slides through one compositor-friendly track with prepared adjacent posters", async () => {
  const [hero, css] = await Promise.all([
    read("../app/components/three-card-hero.jsx"),
    read("../app/globals.css")
  ]);
  const finalMotion = css.slice(css.lastIndexOf("/* The landing hero animates one composited track"));
  assert.match(hero, /onTransitionEnd=\{finishTransition\}/);
  assert.match(hero, /loading=\{Math\.abs\(offset\) === 1 \? "eager" : "lazy"\}/);
  assert.match(finalMotion, /transition:transform 360ms/);
  assert.match(finalMotion, /will-change:transform/);
  assert.match(finalMotion, /\.home-hero-deck-track\.is-rebasing\s*\{[\s\S]*?transition:none !important/);
  assert.match(finalMotion, /\.home-hero-deck-slide,[\s\S]*?transition:none !important/);
  assert.match(finalMotion, /@media \(max-width:760px\)[\s\S]*?transition-duration:320ms !important/);
});

