import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword, verifyPassword, validEmail, validPassword,
  hashToken, safeEqual, normalizeEmail, authSecret
} from "../src/auth.js";

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
