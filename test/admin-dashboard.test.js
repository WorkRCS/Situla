import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { memberFilter, onlineActivityFilter, clampPage } from "../src/admin-queries.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Admin member filters include legacy users without role and exclude admins", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");
  assert.deepEqual(memberFilter("all", now), { role: { $ne: "admin" } });
  const free = memberFilter("free", now);
  assert.deepEqual(free.role, { $ne: "admin" });
  assert.ok(free.$or.some((condition) => condition.planId?.$ne === "premium"));
  const premium = memberFilter("premium", now);
  assert.deepEqual(premium.role, { $ne: "admin" });
  assert.equal(premium.planId, "premium");
  assert.equal(premium["membership.status"], "active");
  assert.ok(premium.$or.some((condition) => condition["membership.expiresAt"]?.$gt === now));
});

test("Admin list pages clamp stale and out-of-range pages safely", () => {
  assert.equal(clampPage(1, 1, 10), 1);
  assert.equal(clampPage(2, 1, 10), 1);
  assert.equal(clampPage(8, 25, 10), 3);
  assert.equal(clampPage(0, 25, 10), 1);
  assert.equal(clampPage(2, 0, 10), 1);
});

test("Online presence only counts active, unended and recent activity sessions", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");
  const filter = onlineActivityFilter("guest", now, ["guest-one"]);
  assert.equal(filter.ownerType, "guest");
  assert.equal(filter.isActive, true);
  assert.equal(filter.endedAt, null);
  assert.equal(filter.lastSeenAt.$gte.toISOString(), "2026-11-12T09:58:00.000Z");
  assert.deepEqual(filter.ownerId.$in, ["guest-one"]);
  assert.equal(filter.expiresAt.$gt, now);
});

test("Every admin record popup uses cards and waits for page one before showing empty state", async () => {
  const dashboard = await read("../app/components/admin-dashboard.jsx");
  const styles = await read("../app/globals.css");
  const api = await read("../src/admin.js");
  const tracker = await read("../app/components/presence-tracker.jsx");

  assert.match(dashboard, /className="admin-user-list"/);
  assert.match(dashboard, /admin-guest-record-list/);
  assert.match(dashboard, /admin-sales-record-list/);
  assert.match(dashboard, /admin-guest-card/);
  assert.match(dashboard, /admin-sales-card/);
  assert.doesNotMatch(dashboard, /<table className="admin-table"/);
  assert.match(dashboard, /listReady && !listLoading && rows\.length === 0/);
  assert.match(dashboard, /const requestVersion = listRequestVersion\.current/);
  assert.match(dashboard, /listAbortController\.current\?\.abort\(\)/);
  assert.match(dashboard, /rows\.length === 0 \|\| !hasMore/);
  assert.match(dashboard, /openModal\("users", "all"\)/);
  assert.match(dashboard, /admin-back-button/);
  assert.match(dashboard, /admin-detail-view/);
  assert.match(dashboard, /assignUser &&/);
  assert.match(dashboard, /suspendUser &&/);

  assert.match(api, /clampPage\(requestedPage, total, PAGE_SIZE\)/);
  assert.match(api, /clampPage\(requestedPage, activityTotal, PAGE_SIZE\)/);
  assert.match(api, /clampPage\(requestedActivityPage, activityCount, PAGE_SIZE\)/);
  assert.match(api, /const activityTotal = await ActivitySession\.countDocuments\(activityFilter\)/);
  assert.match(api, /const activityCount = await ActivitySession\.countDocuments\(activityFilter\)/);

  assert.match(styles, /\.admin-record-list\s*\{/);
  assert.match(styles, /\.admin-record-card\s*\{/);
  assert.match(styles, /\.admin-user-list\s*\{/);
  assert.match(styles, /\.admin-user-card-facts\s*\{/);
  assert.match(styles, /\.admin-user-detail-summary\s*\{/);
  assert.match(styles, /\.admin-metric-grid-five/);
  assert.match(tracker, /heartbeatRetryTimer/);
});
