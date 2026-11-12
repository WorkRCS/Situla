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
  assert.match(api, /CATALOG_TIER_MEMO_TTL_MS = 5_000/);
});

test("catalog search uses existing text indexes rather than collection-wide regex scans", async () => {
  const api = await read("../src/app.js");
  const search = api.slice(api.indexOf("app.get('/api/search'"), api.indexOf("app.get('/api/movies/suggestions'"));
  const suggestions = api.slice(api.indexOf("app.get('/api/movies/suggestions'"), api.indexOf("app.get('/api/movies'"));
  assert.equal(search.split("$text: { $search: query }").length - 1, 3);
  assert.ok(suggestions.includes("$text: { $search: tokens.join(' ') }"));
  assert.doesNotMatch(search, /new RegExp\(escapeRegex/);
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
  assert.match(app, /items\.slice\(0, 10\)\.map\(\(item\)/);
  assert.doesNotMatch(app, /items\.slice\(0, (?:16|20)\)\.map\(\(item\)/);
});
