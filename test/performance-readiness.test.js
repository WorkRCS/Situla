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

test("database pool and API work are bounded for serverless bursts", async () => {
  const db = await read("../src/db.js");
  const api = await read("../src/app.js");
  assert.match(db, /maxPoolSize: 10/);
  assert.match(db, /maxConnecting: 2/);
  assert.match(db, /maxIdleTimeMS: 30_000/);
  assert.match(db, /waitQueueTimeoutMS: 3_000/);
  assert.match(api, /if \(process\.env\.NODE_ENV === 'development'\) app\.use\('\*', logger\(\)\)/);
  assert.match(api, /app\.use\('\/api\/\*', createRequestConcurrencyGuard\(\{ maxConcurrent: 12 \}\)\)/);
  assert.match(api, /if \(!sessionToken \|\| !deviceToken\)/);
  const resolveStart = api.indexOf("async function resolveCatalogTierWindow");
  const connect = api.indexOf("await connectDatabase();", resolveStart);
  const firstQuery = api.indexOf("AuthSession.findOne", resolveStart);
  assert.ok(resolveStart >= 0 && connect > resolveStart && firstQuery > connect);
  assert.match(api, /CATALOG_TIER_MEMO_TTL_MS = 5_000/);
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
