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

test("Cartoon Movies and TV listings omit their heading, sort controls and genre chips", async () => {
  const source = await read("../app/components/cartoons-catalog.jsx");
  assert.equal(source.includes("catalog-toolbar-sort-only"), false);
  assert.equal(source.includes("SITULA KIDS · APPROVED CATALOGUE"), false);
  assert.equal(source.includes("Random</option>"), false);
  assert.ok(source.includes("cartoons-listing-catalog"));
  assert.ok(source.includes('className="catalog-grid"'));
  assert.ok(source.includes("listingSentinelRef"));
  assert.ok(source.includes('limit: "5"'));
});


test("app pages keep the shared footer inside the right content scroll frame", async () => {
  const [app, footer, rootLayout, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/site-footer.jsx"),
    read("../app/layout.jsx"),
    read("../app/globals.css")
  ]);

  assert.ok(app.includes('import SiteFooter from "./site-footer.jsx";'));
  assert.ok(app.includes("<SiteFooter inApp />"));
  assert.equal(app.split("<SiteFooter inApp />").length - 1, 2);
  assert.ok(footer.includes("if (inApp !== isAppRoute"));
  assert.ok(footer.includes('className={"site-footer" + (inApp ? " site-footer-app" : "")}'));
  assert.ok(rootLayout.includes("<SiteFooter />"));
  assert.ok(css.includes(".site-footer-app {"));
  assert.ok(css.includes("body:has(.bottom-nav) .site-footer.site-footer-app"));
  assert.ok(css.includes(".home-main-column > .site-footer-app"));
  assert.ok(css.includes(".app-view-main-column > .site-footer-app"));
});

test("Cartoon listings use the same top frame spacing as Movies and keep hero atmosphere Home-only", async () => {
  const [app, cartoons, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/cartoons-catalog.jsx"),
    read("../app/globals.css")
  ]);
  assert.ok(app.includes('tab === "movies" ? "movies-catalog-page"'));
  assert.ok(app.includes('["cartoons", "cartoonMovies", "cartoonTv"].includes(tab) ? "cartoons-catalog-page"'));
  const baseStart = css.indexOf(".cartoons-catalog-page {");
  const baseRule = css.slice(baseStart, css.indexOf("}", baseStart));
  const mobileMediaStart = css.indexOf("@media (max-width:767px)", baseStart);
  const mobileStart = css.indexOf(".cartoons-catalog-page {", mobileMediaStart);
  const mobileRule = css.slice(mobileStart, css.indexOf("}", mobileStart));
  assert.ok(baseRule.includes("padding-top:0 !important;"));
  assert.ok(mobileRule.includes("padding-top:0 !important;"));
  assert.ok(!baseRule.includes("padding-bottom:"));
  assert.ok(!mobileRule.includes("padding-bottom:"));
  const kidsHomeStart = cartoons.indexOf('if (homeView) {\n    const featured = cartoonHeroItems');
  const kidsHomeEnd = cartoons.indexOf('return (\n    <section className="pb-8 cartoons-listing-catalog"', kidsHomeStart);
  const kidsHome = cartoons.slice(kidsHomeStart, kidsHomeEnd);
  assert.ok(kidsHome.includes('className="home-hero-atmosphere"'));
  const listingStart = cartoons.indexOf('return (\n    <section className="pb-8 cartoons-listing-catalog"');
  assert.ok(listingStart >= 0);
  assert.ok(!cartoons.slice(listingStart).includes("home-hero-atmosphere"));
});
