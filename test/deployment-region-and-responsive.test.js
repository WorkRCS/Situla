import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Vercel Hobby functions are pinned to the Mumbai region", async () => {
  const config = JSON.parse(await read("../vercel.json"));
  assert.deepEqual(config.regions, ["bom1"]);
  assert.equal(config.regions.length, 1);
});

test("Cartoon TV mobile grid and five-item Kids navigation stay evenly aligned", async () => {
  const [app, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/globals.css")
  ]);

  assert.ok(app.includes('<nav className={"bottom-nav" + (kidsMode ? " is-kids-nav" : "")} aria-label="Main navigation">'));
  assert.ok(css.includes(".bottom-nav.is-kids-nav { grid-template-columns:repeat(5,minmax(0,1fr)) !important; }"));
  assert.match(css, /\.cartoons-catalog-page \.catalog-grid\s*\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
});

test("Vercel installs the Tailwind PostCSS build plugin even when production omits dev dependencies", async () => {
  const [config, pkg] = await Promise.all([
    read("../vercel.json"),
    read("../package.json")
  ]);
  const vercel = JSON.parse(config);
  const manifest = JSON.parse(pkg);

  assert.match(vercel.installCommand, /npm install --include=dev/);
  assert.equal(manifest.devDependencies["@tailwindcss/postcss"], "4.3.5");
  assert.equal(manifest.devDependencies.tailwindcss, "4.3.5");
  assert.ok(manifest.devDependencies.postcss);
});

test("the app uses one document scroll surface instead of a nested content viewport", async () => {
  const css = await read("../app/globals.css");
  const flowRules = css.slice(css.lastIndexOf("/* One document scroll surface:"));

  assert.match(flowRules, /\.app-shell:has\(\.home-page-layout\)/);
  assert.match(flowRules, /height:auto !important/);
  assert.match(flowRules, /overflow:visible !important/);
  assert.match(flowRules, /\.home-main-column,[\s\S]*?\.app-view-main-column/);
  assert.match(flowRules, /overscroll-behavior:auto/);
});
test("mobile navigation dock keeps evenly spaced icons on Cartoon TV at phone and tablet widths", async () => {
  const [app, sidebar, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/site-sidebar.jsx"),
    read("../app/globals.css")
  ]);

  assert.ok(app.includes('(kidsMode ? SITE_KIDS_MOBILE_NAV_ITEMS : SITE_MOBILE_NAV_ITEMS)'));
  assert.ok(app.includes('className={"bottom-nav" + (kidsMode ? " is-kids-nav" : "")}'));
  assert.ok(sidebar.includes('(activeKidsMode ? " is-kids-nav" : "")'));
  assert.match(css, /\.bottom-nav\.is-kids-nav\s*\{\s*grid-template-columns:repeat\(5,minmax\(0,1fr\)\) !important;/);
  assert.match(css, /\.bottom-nav,\.site-workspace-mobile-nav\s*\{[\s\S]*?grid-template-columns:repeat\(7,minmax\(0,1fr\)\) !important;[\s\S]*?column-gap:clamp\(4px,\.9vw,8px\) !important;/);
  assert.match(css, /\.bottom-nav \.nav-button,\s*\.bottom-nav \.site-workspace-mobile-link\s*\{[\s\S]*?padding:5px 2px !important;[\s\S]*?gap:4px !important;/);
});

