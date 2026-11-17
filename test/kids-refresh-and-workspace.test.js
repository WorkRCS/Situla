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

test("all five normal and Cartoon watch routes render without sidebar or navigation bars", async () => {
  const playerPaths = [
    "../app/watch/[imdbId]/page.jsx",
    "../app/watch/tv/[tmdbId]/[season]/[episode]/page.jsx",
    "../app/watch/anime/[malId]/[episode]/[audio]/page.jsx",
    "../app/cartoons/watch/movie/[tmdbId]/page.jsx",
    "../app/cartoons/watch/tv/[tmdbId]/[seasonNumber]/[episodeNumber]/page.jsx"
  ];
  for (const path of playerPaths) {
    const page = await read(path);
    assert.doesNotMatch(page, /SiteWorkspace|SiteSidebar|site-workspace-mobile-nav|bottom-nav/, path + " must not mount global navigation");
  }

  const detailPaths = [
    "../app/tv/[tmdbId]/page.jsx",
    "../app/cartoons/tv/[tmdbId]/page.jsx"
  ];
  for (const path of detailPaths) {
    const page = await read(path);
    assert.ok(page.includes("SiteWorkspace"), path + " must keep shared navigation");
  }

  const css = await read("../app/globals.css");
  assert.equal(css.includes(".site-workspace:has(.watch-screen)"), false);
  assert.equal(css.includes(".site-workspace.is-sidebar-collapsed:has(.watch-screen)"), false);
  assert.match(css, /\.watch-screen\s*\{\s*position:fixed;\s*inset:0;/);
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
