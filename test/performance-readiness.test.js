import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("global layout avoids full Bootstrap CSS and repeated whole-DOM extension scans", async () => {
  const layout = await read("../app/layout.jsx");
  assert.match(layout, /bootstrap-icons\/font\/bootstrap-icons\.css/);
  assert.doesNotMatch(layout, /bootstrap\/dist\/css\/bootstrap\.min\.css/);
  assert.doesNotMatch(layout, /MutationObserver|querySelectorAll\("\*"\)|beforeInteractive/);
});

test("avatar menu omits the Plans & pricing redirect", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const menuStart = app.indexOf('<div className="header-account-popover"');
  const menuEnd = app.indexOf('<p className="header-popover-demo-note"', menuStart);
  assert.ok(menuStart >= 0 && menuEnd > menuStart, "account popover should exist");
  const accountMenu = app.slice(menuStart, menuEnd);
  assert.equal(accountMenu.includes("Plans & pricing"), false);
  assert.equal(accountMenu.includes('router.push("/plans")'), false);
  assert.match(accountMenu, /Visit profile/);
});

test("global page scrolling is native and moving chrome avoids live blur filters", async () => {
  const layout = await read("../app/layout.jsx");
  const css = await read("../app/globals.css");
  const app = await read("../app/components/situla-app.jsx");
  assert.doesNotMatch(layout, /data-scroll-behavior="smooth"/);
  assert.ok(css.includes("html { scroll-behavior: auto; }"));
  const performanceStyles = css.slice(css.indexOf("Shared scrolling performance:"));
  assert.ok(performanceStyles.includes(".site-app-header"));
  assert.ok(performanceStyles.includes("backdrop-filter:none !important"));
  assert.ok(performanceStyles.includes(".bottom-nav"));
  assert.match(app, /window\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/);
  assert.equal((app.match(/document\.visibilityState !== "visible" \|\| isScrollingRef\.current/g) || []).length, 0);
  assert.match(app, /window\.removeEventListener\("scroll", onScroll\)/);
});

test("background presence and announcements stop polling hidden tabs", async () => {
  const presence = await read("../app/components/presence-tracker.jsx");
  const announcements = await read("../app/components/announcement-center.jsx");
  assert.match(presence, /initialHeartbeatTimer = window\.setTimeout/);
  assert.match(presence, /}, 1500\)/);
  assert.match(presence, /if \(document\.visibilityState === "visible"\) sendHeartbeat\(false\);/);
  assert.match(presence, /if \(document\.visibilityState === "visible"\) sendHeartbeat\(false\);\s*\}, 60 \* 1000\)/);
  assert.match(announcements, /if \(document\.visibilityState === "visible"\) loadAnnouncements\(\);/);
  assert.match(announcements, /document\.addEventListener\("visibilitychange", onVisibility\)/);
});

test("database connections and API admissions are bounded without cold-start index builds", async () => {
  const db = await read("../src/db.js");
  const api = await read("../src/app.js");
  const connect = db.slice(db.indexOf("export async function connectDatabase"), db.indexOf("export async function initializeDatabaseIndexes"));
  assert.match(connect, /maxPoolSize/);
  assert.match(connect, /maxConnecting: 2/);
  assert.match(connect, /waitQueueTimeoutMS: 2_000/);
  assert.match(connect, /serverSelectionTimeoutMS: 5_000/);
  assert.doesNotMatch(connect, /createIndexes/);
  assert.match(db, /export async function initializeDatabaseIndexes/);
  assert.match(api, /if \(process\.env\.NODE_ENV === 'development'\) app\.use\('\*', logger\(\)\)/);
  assert.match(api, /maxConcurrent: 8/);
  assert.match(api, /maxQueued: 48/);
  assert.match(api, /X-Situla-Request-Id/);
  assert.match(api, /Server-Timing/);
  assert.match(api, /CATALOG_ACCESS_MEMO_TTL_MS = 5_000/);
});

test("catalog search uses existing text indexes rather than collection-wide regex scans", async () => {
  const api = await read("../src/app.js");
  const search = api.slice(api.indexOf("app.get('/api/search'"), api.indexOf("app.get('/api/movies/suggestions'"));
  const suggestions = api.slice(api.indexOf("app.get('/api/movies/suggestions'"), api.indexOf("app.get('/api/movies'"));
  assert.equal(search.split("$text: { $search: query }").length - 1, 1);
  assert.ok(search.includes("const textFilter = { $and: [...scope, { $text: { $search: query } }] }"));
  assert.match(search, /Promise\.allSettled\(\[textTask, partialTask\]\)/);
  assert.match(search, /fuzzyPattern/);
  assert.ok(suggestions.includes("$text: { $search: tokens.join(' ') }"));
  assert.doesNotMatch(search, /activeGroups.*Math\.random\(\)/s);
});

test("API requests expose request IDs, timing and structured error diagnostics", async () => {
  const api = await read("../src/app.js");
  assert.match(api, /X-Situla-Request-Id/);
  assert.match(api, /Server-Timing/);
  assert.match(api, /api_unhandled_error/);
  assert.match(api, /requestId/);
});

test("home series shelves are chunked and memoized cards receive stable callbacks", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /const MovieCard = memo\(function MovieCard/);
  assert.match(app, /const SeriesCard = memo\(function SeriesCard/);
  assert.match(app, /const toggleSaved = useCallback/);
  assert.match(app, /const openHomeSeries = useCallback/);
  assert.match(app, /items\.slice\(0, 10\)\.map\(\(item, index\)/);
  assert.doesNotMatch(app, /items\.slice\(0, (?:16|20)\)\.map\(\(item\)/);
});


test("catalog cache runs after Kids Mode and account access boundaries", async () => {
  const api = await read("../src/app.js");
  const boundaryRegistration = api.indexOf("]) app.use(path, enforceAdultCatalogBoundary);");
  const cacheRegistration = api.indexOf("app.use('/api/*', catalogResponseCache);");
  assert.ok(boundaryRegistration >= 0 && cacheRegistration > boundaryRegistration);
  const premiumAccess = api.slice(api.indexOf("async function getPremiumCatalogAccess"), api.indexOf("async function findNewestFeedPage"));
  assert.match(premiumAccess, /c\.get\('situlaPrincipal'\)/);
  assert.match(premiumAccess, /getWatchPolicy\(principal\.user \|\| null\)/);
});

test("cartoon public catalogue reads and search metadata are cached instead of repeatedly rescanned", async () => {
  const cache = await read("../src/redis-cache.js");
  const api = await read("../src/app.js");
  for (const path of [
    "/api/cartoons/home", "/api/cartoons/catalog", "/api/cartoons/movies",
    "/api/cartoons/series", "/api/cartoons/search"
  ]) assert.ok(cache.includes(path), path);
  assert.match(cache, /cartoon-movie-detail/);
  assert.match(cache, /cartoon-season-detail/);
  assert.match(cache, /cartoon-series-detail/);
  const badgeCache = api.slice(api.indexOf("async function getCartoonPublicBadgeIndex"), api.indexOf("function applyCartoonPublicBadges"));
  assert.match(badgeCache, /movieDates/);
  assert.match(badgeCache, /seriesDates/);
  const cartoonSearch = api.slice(api.indexOf("app.get('/api/cartoons/search'"), api.indexOf("app.get('/api/movies/discover'"));
  assert.equal(cartoonSearch.includes("CartoonMovie.find(approvedCartoonMovieFilter()).select('releaseYear releaseDate')"), false);
  assert.equal(cartoonSearch.includes("CartoonSeries.find(approvedCartoonSeriesFilter()).select('releaseYear firstAirDate')"), false);
});


test("database models include indexes for frequently sorted admin and upcoming reads", async () => {
  const models = await read("../src/models.js");
  assert.match(models, /guestAccessSchema\.index\(\{ lastSeenAt: -1, _id: -1 \}\)/);
  assert.match(models, /authSessionSchema\.index\(\{ userId: 1, createdAt: -1 \}\)/);
  assert.match(models, /paymentTransactionSchema\.index\(\{ userId: 1, createdAt: -1 \}\)/);
  assert.match(models, /upcomingItemSchema\.index\(\{ status: 1, releaseAt: 1, _id: 1 \}\)/);
  const db = await read("../src/db.js");
  assert.match(db, /Model\.createIndexes\(\)/);
  assert.match(db, /autoIndex: false/);
});
