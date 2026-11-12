import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { memberFilter, onlineActivityFilter } from "../src/admin-queries.js";

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

test("Admin member directory renders readable responsive member cards", async () => {
  const dashboard = await read("../app/components/admin-dashboard.jsx");
  const styles = await read("../app/globals.css");
  assert.match(dashboard, /className="admin-user-list"/);
  assert.match(dashboard, /className="admin-user-card"/);
  assert.match(dashboard, /View full profile/);
  assert.match(dashboard, /user\.membership\.durationMonths/);
  assert.match(dashboard, /user\.browser/);
  assert.match(dashboard, /user\.suspensionReason/);
  assert.doesNotMatch(dashboard, /<th>#<\/th><th>Member<\/th>/);
  assert.match(dashboard, /Email verified/);
  assert.match(dashboard, /loginMethod/);
  assert.match(dashboard, /BILLING CYCLE/);
  assert.match(dashboard, /USER ID/);
  assert.match(dashboard, /segment === "all"/);
  assert.match(dashboard, /const \[listReady, setListReady\] = useState\(false\)/);
  assert.match(dashboard, /if \(!modal \|\| !listReady \|\| rows\.length === 0 \|\| !hasMore/);
  assert.match(dashboard, /listRequestVersion/);
  assert.match(dashboard, /AbortController/);
  assert.match(dashboard, /setHasMore\(false\)/);
  assert.match(dashboard, /payload\.page/);
  assert.match(dashboard, /loadPage\(1, true, requestVersion\)/);
  assert.match(dashboard, /Online now/);
  assert.match(dashboard, /Offline/);
  assert.match(dashboard, /setInterval\(refreshVisibleStats, 15 \* 1000\)/);
  const api = await read("../src/admin.js");
  const auth = await read("../src/auth.js");
  assert.match(api, /const requestedPage = pageNumber\(c\.req\.query\('page'\)\)/);
  assert.match(api, /const page = Math\.min\(requestedPage, lastPage\)/);
  assert.match(auth, /returnDocument: 'after'/);
  assert.doesNotMatch(auth, /\{ new: true/);
  const tracker = await read("../app/components/presence-tracker.jsx");
  assert.match(tracker, /heartbeatRetryTimer/);
  assert.match(tracker, /sendHeartbeat\(false\)/);

  assert.match(dashboard, /openModal\("users", "all"\)/);
  assert.match(styles, /\.admin-user-list\s*\{/);
  assert.match(styles, /\.admin-user-card-facts\s*\{/);
  assert.match(styles, /\.admin-user-detail-summary\s*\{/);
  assert.match(styles, /\.admin-metric-grid-five/);
});
