import test from "node:test";
import assert from "node:assert/strict";
import { WATCH_POLICIES, getWatchPolicy } from "../src/membership-policy.js";

test("Guest, Free and Premium watch policies use the approved server durations", () => {
  assert.deepEqual(WATCH_POLICIES.guest, { allowanceSeconds: 3600, cooldownSeconds: 7200, deviceLimit: 0 });
  assert.deepEqual(WATCH_POLICIES.free, { allowanceSeconds: 10800, cooldownSeconds: 3600, deviceLimit: 1 });
  assert.deepEqual(WATCH_POLICIES.premium.monthly, { allowanceSeconds: 18000, cooldownSeconds: 2400, deviceLimit: 3 });
  assert.deepEqual(WATCH_POLICIES.premium["six-months"], { allowanceSeconds: 36000, cooldownSeconds: 1200, deviceLimit: 3 });
  assert.deepEqual(WATCH_POLICIES.premium.yearly, { allowanceSeconds: null, cooldownSeconds: 0, deviceLimit: 3 });
});

test("An expired Premium membership falls back to the Free access policy", () => {
  const expired = getWatchPolicy({
    planId: "premium",
    membership: { status: "active", billingCycle: "monthly", expiresAt: "2025-01-01T00:00:00.000Z" }
  }, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(expired.planId, "free");
  assert.equal(expired.allowanceSeconds, 10800);
  assert.equal(expired.cooldownSeconds, 3600);
});

test("A valid Yearly Premium membership has unlimited usage and no periodic cooldown", () => {
  const yearly = getWatchPolicy({
    planId: "premium",
    membership: { status: "active", billingCycle: "yearly", expiresAt: "2027-01-01T00:00:00.000Z" }
  }, new Date("2026-12-01T00:00:00.000Z"));
  assert.equal(yearly.allowanceSeconds, null);
  assert.equal(yearly.cooldownSeconds, 0);
});
