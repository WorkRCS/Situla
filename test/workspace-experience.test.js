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
  assert.ok(sidebar.includes("SITE_NAV_ITEMS.slice(0, 5)"));
  assert.ok(sidebar.includes("SITE_NAV_ITEMS.slice(5)"));
  assert.ok(sidebar.includes("site-sidebar-footer"));
  assert.match(css, /\.site-sidebar\.home-sidebar\s*\{[\s\S]*?border-radius:19px/);
  assert.match(css, /\.site-sidebar \.home-side-link\.active::before\s*\{/);
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
