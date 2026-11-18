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

test("Hero palette selectors are isolated from shared navigation and app chrome", async () => {
  const css = await read("../app/globals.css");
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /<main className="app-shell">/);
  assert.match(app, /home-hero-palette-surface/);
  assert.match(app, /kids-hero-palette-surface/);
  for (const chromeSelector of [
    ".site-app-header",
    ".site-sidebar",
    ".bottom-nav",
    ".site-footer-app"
  ]) {
    const selectors = css.split("\n").filter((line) => line.includes(chromeSelector) && line.includes("home-hero-rgb"));
    assert.equal(selectors.length, 0, chromeSelector + " must not read the poster palette");
  }
  assert.match(css, /\.home-mode-panel \.home-hero-palette-surface\.has-home-hero-palette/);
  assert.match(css, /\.kids-mode-panel \.kids-hero-palette-surface\.has-home-hero-palette/);
});
