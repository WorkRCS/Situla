import test from "node:test";
import assert from "node:assert/strict";
import { AuthRateLimit, AuthSession } from "../src/models.js";
import {
  hashPassword, verifyPassword, validEmail, validPassword,
  hashToken, safeEqual, normalizeEmail, authSecret, SESSION_COOKIE_MAX_AGE_SECONDS, hasAdminRole, getClientIp, isAccountSuspended, enforceRateLimit
} from "../src/auth.js";

test("Rate-limit aggregation updates explicitly enable Mongoose 9 update pipelines", async () => {
  const previousSecret = process.env.AUTH_SECRET;
  const originalFindOneAndUpdate = AuthRateLimit.findOneAndUpdate;
  let captured;
  try {
    process.env.AUTH_SECRET = "r".repeat(48);
    AuthRateLimit.findOneAndUpdate = async (filter, pipeline, options) => {
      captured = { filter, pipeline, options };
      return { count: 1 };
    };
    assert.equal(await enforceRateLimit("test-key", 5, 60), true);
    assert.equal(captured.filter.keyHash.length, 64);
    assert.equal(Array.isArray(captured.pipeline), true);
    assert.equal(captured.options.updatePipeline, true);
    assert.equal(captured.options.upsert, true);
    assert.equal(captured.options.returnDocument, 'after');
    assert.equal(Object.hasOwn(captured.options, 'new'), false);
  } finally {
    AuthRateLimit.findOneAndUpdate = originalFindOneAndUpdate;
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});

test("Email and password validation normalizes account identifiers", () => {
  assert.equal(normalizeEmail("  Member@Example.COM "), "member@example.com");
  assert.equal(validEmail("member@example.com"), true);
  assert.equal(validEmail("not-an-email"), false);
  assert.equal(validPassword("correct horse battery"), true);
  assert.equal(validPassword("short"), false);
  assert.equal(validPassword("x".repeat(129)), false);
});

test("Password hashes are salted and can only be checked with the correct password", async () => {
  const first = await hashPassword("correct horse battery");
  const second = await hashPassword("correct horse battery");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("correct horse battery", first), true);
  assert.equal(await verifyPassword("incorrect password", first), false);
  assert.equal(await verifyPassword("correct horse battery", "not-a-hash"), false);
});

test("Opaque session token hashes are stable and comparisons reject mismatches", () => {
  assert.equal(hashToken("session-token"), hashToken("session-token"));
  assert.notEqual(hashToken("session-token"), hashToken("different-token"));
  assert.equal(safeEqual("same", "same"), true);
  assert.equal(safeEqual("same", "other"), false);
  assert.equal(safeEqual("", ""), false);
});


test("AUTH_SECRET must contain at least 32 bytes before account operations are available", () => {
  const previous = process.env.AUTH_SECRET;
  try {
    process.env.AUTH_SECRET = "short";
    assert.throws(() => authSecret(), /at least 32 bytes/);
    process.env.AUTH_SECRET = "x".repeat(32);
    assert.equal(authSecret().length, 32);
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
});


test("AUTH_SECRET configuration errors are returned as an explicit service-unavailable code", () => {
  const previous = process.env.AUTH_SECRET;
  try {
    delete process.env.AUTH_SECRET;
    assert.throws(() => authSecret(), (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.code, "AUTH_SECRET_NOT_CONFIGURED");
      return true;
    });
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
});

test("Local development resolves loopback IP when proxy headers are absent", () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    const context = { req: { header: () => undefined, url: "http://localhost:3000/api/presence" } };
    assert.equal(getClientIp(context), "127.0.0.1");
    process.env.NODE_ENV = "production";
    assert.equal(getClientIp(context), "");
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("Expired timed suspensions reactivate an account for both email and Google sign-in checks", async () => {
  let saves = 0;
  const user = {
    status: "suspended",
    suspendedUntil: new Date(Date.now() - 1000),
    suspensionReason: "Temporary test suspension",
    async save() { saves += 1; }
  };
  assert.equal(await isAccountSuspended(user), false);
  assert.equal(user.status, "active");
  assert.equal(user.suspendedUntil, null);
  assert.equal(user.suspensionReason, "");
  assert.equal(saves, 1);
});

test("Permanent suspensions remain enforced until an administrator restores the account", async () => {
  const user = {
    status: "suspended",
    suspendedUntil: null,
    async save() { throw new Error("A permanent suspension must not auto-reactivate."); }
  };
  assert.equal(await isAccountSuspended(user), true);
  assert.equal(user.status, "suspended");
});

test("Auth sessions have no fixed expiry or registered-device dependency", () => {
  assert.equal(AuthSession.schema.path("deviceId"), undefined);
  assert.equal(AuthSession.schema.path("expiresAt"), undefined);
  assert.ok(AuthSession.schema.path("userId"));
  assert.ok(AuthSession.schema.path("tokenHash"));
  assert.ok(SESSION_COOKIE_MAX_AGE_SECONDS >= 365 * 24 * 60 * 60);
  assert.equal(AuthSession.schema.indexes().some(([keys]) => Object.hasOwn(keys, "expiresAt")), false);
});

test("Administrator authority is determined only by the persisted User role", () => {
  assert.equal(hasAdminRole({ role: "admin", email: "admin@example.com" }), true);
  assert.equal(hasAdminRole({ role: "user", email: "admin@example.com" }), false);
  assert.equal(hasAdminRole({ role: "user", email: "owner@example.com" }), false);
  assert.equal(hasAdminRole(null), false);
});
