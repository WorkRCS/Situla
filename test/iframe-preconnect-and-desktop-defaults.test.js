import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import NativeDOMException from "node-domexception";
import { getIframePreconnectTarget } from "../src/iframe-preconnect.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the root document preconnects every configured playback host", async () => {
  const [layout, urls] = await Promise.all([
    read("../app/layout.jsx"),
    read("../src/player-urls.js")
  ]);
  assert.match(urls, /IFRAME_PLAYER_ORIGINS = Object\.freeze\(/);
  for (const host of ["vidlink.pro", "vidbolt.pro", "slast430did.com"]) {
    assert.ok(urls.includes("https://" + host), "missing playback host: " + host);
  }
  assert.match(layout, /rel="dns-prefetch"/);
  assert.match(layout, /rel="preconnect"/);
  assert.match(layout, /IFRAME_PLAYER_ORIGINS\.map/);
});

test("every existing video and editorial iframe placement receives an origin hint", async () => {
  const paths = [
    "../app/components/media-player.jsx",
    "../app/components/cartoon-media-player.jsx",
    "../app/watch/[imdbId]/player.jsx",
    "../app/components/announcement-center.jsx",
    "../app/components/upcoming-section.jsx",
    "../app/components/upcoming-manager.jsx"
  ];
  const sources = await Promise.all(paths.map(read));
  for (const [index, source] of sources.entries()) {
    assert.match(source, /IframeConnectionHints/, paths[index]);
    assert.match(source, /<iframe/, paths[index]);
  }
  assert.match(sources[0], /<IframeConnectionHints src=\{playerUrl\} \/>/);
  assert.match(sources[1], /<IframeConnectionHints src=\{playerUrl\} \/>/);
  assert.match(sources[2], /<IframeConnectionHints src=\{playerUrl\} \/>/);
  assert.match(sources[3], /<IframeConnectionHints src=\{media\.src\} \/>/);
  assert.match(sources[4], /<IframeConnectionHints src=\{item\.posterUrl\} \/>/);
  assert.match(sources[5], /<IframeConnectionHints src=\{item\.posterUrl\} \/>/);
  const helper = await read("../app/components/iframe-connection-hints.jsx");
  assert.match(helper, /rel="dns-prefetch"/);
  assert.match(helper, /rel="preconnect"/);
});

test("dynamic iframe hints only warm external HTTP(S) origins", () => {
  assert.deepEqual(getIframePreconnectTarget("https://player.example/watch/123"), {
    origin: "https://player.example",
    hostname: "player.example"
  });
  assert.deepEqual(getIframePreconnectTarget("//embed.example/poster"), {
    origin: "https://embed.example",
    hostname: "embed.example"
  });
  assert.equal(getIframePreconnectTarget("/internal/embed"), null);
  assert.equal(getIframePreconnectTarget("javascript:alert(1)"), null);
  assert.equal(getIframePreconnectTarget("not a url"), null);
});

test("the node-domexception compatibility override exports the native Node implementation", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  const shim = JSON.parse(await read("../vendor/native-domexception/package.json"));
  assert.equal(pkg.dependencies["node-domexception"], "file:./vendor/native-domexception");
  assert.equal(shim.name, "node-domexception");
  assert.equal(NativeDOMException, globalThis.DOMException);
});

test("Vercel build pins Node 22 and clears only injected cache-dir environment config", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  const vercel = JSON.parse(await read("../vercel.json"));
  assert.equal(pkg.engines.node, "22.x");
  for (const command of [vercel.installCommand, vercel.buildCommand]) {
    assert.match(command, /unset npm_config_cache_dir pnpm_config_cache_dir/);
    assert.match(command, /NPM_CONFIG_CACHE_DIR PNPM_CONFIG_CACHE_DIR/);
  }
  assert.match(vercel.installCommand, /npm install$/);
  assert.match(vercel.buildCommand, /npm run build$/);
});

test("desktop sidebar defaults to collapsed while an explicit expanded preference is respected", async () => {
  const [sidebar, app, css] = await Promise.all([
    read("../app/components/site-sidebar.jsx"),
    read("../app/components/situla-app.jsx"),
    read("../app/globals.css")
  ]);
  assert.match(sidebar, /const \[collapsed, setCollapsed\] = useState\(true\)/);
  assert.match(sidebar, /matchMedia\("\(min-width: 1101px\)"\)\.matches/);
  assert.match(sidebar, /savedPreference === "0"/);
  assert.match(app, /const \[sidebarCollapsed, setSidebarCollapsed\] = useState\(true\)/);
  assert.match(css, /--site-desktop-header-height:38px/);
  assert.match(css, /site-app-header \.header-actions \.header-search-trigger[\s\S]*?height:38px/);
});

test("Normal and Kids Hero images retry without CORS before switching to poster fallback", async () => {
  const [app, cartoons] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/cartoons-catalog.jsx")
  ]);
  for (const source of [app, cartoons]) {
    assert.match(source, /dataset\.corsRetry/);
    assert.match(source, /removeAttribute\("crossorigin"\)/);
    assert.match(source, /currentSrc \|\| imageElement\.src/);
    assert.match(source, /dataset\.posterFallback/);
  }
  assert.match(app, /key=\{String\(heroItem\.heroId \|\| heroItem\.imdbId \|\| heroItem\.tmdbId \|\| heroItem\.malId\)\}/);
  assert.match(cartoons, /key=\{item\.mediaType \+ ":" \+ item\.tmdbId\}/);
});
