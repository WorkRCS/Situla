import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("shared desktop sidebar has clear workspace groups and a restrained active state", async () => {
  const sidebar = await read("../app/components/site-sidebar.jsx");
  const css = await read("../app/globals.css");

  assert.ok(sidebar.includes('className="site-sidebar-nav-group"'));
  assert.ok(sidebar.includes("DISCOVER"));
  assert.ok(sidebar.includes("YOUR SPACE"));
  assert.ok(sidebar.includes("const navItems = kidsMode ? SITE_KIDS_NAV_ITEMS : SITE_NAV_ITEMS;"));
  assert.ok(sidebar.includes("const discoverItems = kidsMode ? navItems.slice(0, 4) : navItems.slice(0, 5);"));
  assert.ok(sidebar.includes("const personalItems = kidsMode ? navItems.slice(4) : navItems.slice(5);"));
  assert.ok(sidebar.includes("site-sidebar-footer"));
  assert.match(css, /\.site-sidebar\.home-sidebar\s*\{[\s\S]*?position:fixed;[\s\S]*?height:100dvh;[\s\S]*?border-radius:0 !important;/);
  assert.ok(sidebar.includes('className="site-sidebar-heading">'));
  assert.ok(sidebar.includes('className="site-sidebar-brand" aria-label="Situla home"'));
  assert.ok(sidebar.includes('<small>DISCOVER · WATCH</small>'));
  assert.doesNotMatch(sidebar, /NAVIGATION/);
  assert.match(css, /\.site-app-header \.brand-lockup\s*\{\s*display:none !important;/);
  assert.match(css, /\.site-sidebar\.home-sidebar\s*\{[\s\S]*?margin:0 !important;[\s\S]*?inset:0 auto 0 0;/);
  assert.match(css, /\.site-sidebar \.home-side-link\.active::before\s*\{/);
  assert.match(css, /--site-desktop-header-height:76px/);
  assert.match(css, /\.site-app-header \.header-inner\s*\{[\s\S]*?height:var\(--site-desktop-header-height\);[\s\S]*?padding-top:0 !important;[\s\S]*?padding-bottom:0 !important;/);
  assert.match(css, /\.site-sidebar \.site-sidebar-heading\s*\{[\s\S]*?height:calc\(var\(--site-desktop-header-height\) \+ 1px\);[\s\S]*?padding:0;[\s\S]*?margin:0;/);
  assert.match(css, /\.site-sidebar\.is-collapsed \.site-sidebar-heading\s*\{[\s\S]*?height:calc\(var\(--site-desktop-header-height\) \+ 1px\);/);
  assert.match(css, /\.site-sidebar\.is-collapsed \.site-sidebar-section-label/);
  assert.match(css, /@media \(min-width:1101px\)/);
});

test("server route and mutation requests expose distinct loading states", async () => {
  const layout = await read("../app/layout.jsx");
  const routeProgress = await read("../app/components/route-progress.jsx");
  const activityLoader = await read("../app/components/server-activity-loader.jsx");
  const serverBoundary = await read("../app/loading.jsx");
  const css = await read("../app/globals.css");

  assert.ok(layout.includes("<RouteProgress />"));
  assert.ok(layout.includes("<ServerActivityLoader />"));
  assert.ok(routeProgress.includes('wrapHistoryMethod("pushState", true)'));
  assert.ok(routeProgress.includes('wrapHistoryMethod("replaceState", false)'));
  assert.ok(routeProgress.includes("Loading page from Situla server"));
  assert.ok(activityLoader.includes('["POST", "PUT", "PATCH", "DELETE"]'));
  assert.ok(activityLoader.includes('requestMethod === "GET"'));
  assert.ok(activityLoader.includes("Date.now() - userActionAt <= 850"));
  assert.ok(activityLoader.includes('"/api/upcoming/status"'));
  assert.ok(activityLoader.includes('"/api/presence"'));
  assert.ok(activityLoader.includes('"/api/playback/heartbeat"'));
  assert.ok(activityLoader.includes('"/api/playback/stop"'));
  assert.ok(serverBoundary.includes("SERVER RESPONSE"));
  assert.ok(serverBoundary.includes("Loading verified content from Situla"));
  assert.ok(css.includes(".site-server-activity"));
  assert.ok(css.includes(".site-server-page-loading"));
});

test("TV and Anime use a compact title context while the Movie watch header remains unchanged", async () => {
  const tvPage = await read("../app/watch/tv/[tmdbId]/[season]/[episode]/page.jsx");
  const animePage = await read("../app/watch/anime/[malId]/[episode]/[audio]/page.jsx");
  const seriesPlayer = await read("../app/components/media-player.jsx");
  const moviePlayer = await read("../app/watch/[imdbId]/player.jsx");
  const css = await read("../app/globals.css");

  assert.ok(tvPage.includes("<SeriesMediaPlayer"));
  assert.ok(animePage.includes("<SeriesMediaPlayer"));
  assert.ok(seriesPlayer.includes('className="series-watch-context"'));
  assert.ok(seriesPlayer.includes('role="group" aria-label="Series player information"'));
  assert.doesNotMatch(seriesPlayer, /watch-topbar|series-watch-topbar/);
  assert.match(css, /\.series-watch-context\s*\{[\s\S]*?width:max-content/);
  assert.match(css, /\.series-watch-context\s*\{[\s\S]*?max-width:min\(440px/);
  assert.ok(moviePlayer.includes('className="watch-topbar"'));
  assert.ok(moviePlayer.includes("watch-language-switch"));
});
