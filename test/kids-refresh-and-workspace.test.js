import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Kids Home and every Cartoon catalogue request a fresh stable shuffle", async () => {
  const [component, backend] = await Promise.all([
    read("../app/components/cartoons-catalog.jsx"),
    read("../src/app.js")
  ]);
  assert.ok(component.includes('fetch("/api/cartoons/home?seed="'));
  assert.ok(component.includes('setSort("random")'));
  assert.ok(component.includes('params.set("seed", createCartoonRefreshSeed())'));
  assert.ok(component.includes('if (sort === "random" && shuffleSeed) params.set("seed", shuffleSeed)'));
  assert.ok(component.includes('situla:kids:home-spotlight:v1'));
  assert.ok(backend.includes("shuffleSeed + ':movies'"));
  assert.ok(backend.includes("shuffleSeed + ':series'"));
  assert.ok(backend.includes("shuffleCartoonCatalog(allItems, shuffleSeed)"));
  assert.ok(backend.includes("sortKey === 'random'"));
});

test("normal and Cartoon player routes keep the shared workspace sidebar and mobile navigation", async () => {
  const paths = [
    "../app/watch/[imdbId]/page.jsx",
    "../app/watch/tv/[tmdbId]/[season]/[episode]/page.jsx",
    "../app/watch/anime/[malId]/[episode]/[audio]/page.jsx",
    "../app/cartoons/watch/movie/[tmdbId]/page.jsx",
    "../app/cartoons/watch/tv/[tmdbId]/[seasonNumber]/[episodeNumber]/page.jsx",
    "../app/tv/[tmdbId]/page.jsx",
    "../app/cartoons/tv/[tmdbId]/page.jsx"
  ];
  for (const path of paths) {
    const page = await read(path);
    assert.ok(page.includes("SiteWorkspace"), path + " must mount SiteWorkspace");
  }
  const css = await read("../app/globals.css");
  assert.ok(css.includes(".site-workspace:has(.watch-screen) .watch-screen"));
  assert.ok(css.includes("left:var(--site-sidebar-column,68px) !important"));
  assert.ok(css.includes("z-index:120 !important"));
  assert.ok(css.includes(".site-workspace:has(.watch-screen) .site-workspace-mobile-nav"));
});

test("runtime metadata uses the same hour-minute-second formatter", async () => {
  const paths = [
    ["../app/components/situla-app.jsx", "formatRuntimeDuration"],
    ["../app/components/cartoons-catalog.jsx", "formatRuntimeDuration"],
    ["../app/components/cartoon-series-detail.jsx", "formatRuntimeDuration"],
    ["../app/tv/[tmdbId]/detail.jsx", "formatRuntimeDuration"]
  ];
  for (const [path, token] of paths) {
    const source = await read(path);
    assert.ok(source.includes(token), path + " must use the shared runtime formatter");
  }
});

test("mixed Cartoons landing hides its heading, counts, sort controls and genre chips", async () => {
  const source = await read("../app/components/cartoons-catalog.jsx");
  assert.ok(source.includes("{!mixedView && ("));
  assert.ok(source.includes('className="section-heading shelf-heading"'));
  assert.ok(source.includes('className="catalog-toolbar catalog-toolbar-sort-only"'));
  assert.ok(source.includes('className="home-genre-row"'));
  assert.ok(source.includes('className="catalog-grid"'));
});
