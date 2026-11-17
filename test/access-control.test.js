import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { AuthSession, GuestAccess } from "../src/models.js";
import { resolvePlaybackPrincipal } from "../src/access-control.js";

test("an invalid login cookie is rejected instead of silently creating a guest principal", async () => {
  const originalSessionFindOne = AuthSession.findOne;
  const originalGuestFindOne = GuestAccess.findOne;
  let guestLookupCount = 0;

  try {
    AuthSession.findOne = async () => null;
    GuestAccess.findOne = async () => {
      guestLookupCount += 1;
      return null;
    };

    const app = new Hono();
    app.get("/", async (c) => {
      try {
        const principal = await resolvePlaybackPrincipal(c);
        return c.json({ ownerType: principal.ownerType });
      } catch (error) {
        return c.json({ code: error.code || "REQUEST_FAILED" }, error.status || 500);
      }
    });

    const response = await app.request("/", {
      headers: {
        cookie: "situla_session=revoked-or-invalid-token",
        "x-real-ip": "192.0.2.15"
      }
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: "AUTH_SESSION_INVALID" });
    assert.equal(guestLookupCount, 0, "a request carrying an account cookie must never create guest access");
  } finally {
    AuthSession.findOne = originalSessionFindOne;
    GuestAccess.findOne = originalGuestFindOne;
  }
});


test("guest access activity writes are throttled and playback ownership uses its unique active index", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/access-control.js", import.meta.url), "utf8");
  const principal = source.slice(source.indexOf("export async function resolvePlaybackPrincipal"), source.indexOf("async function ensureUsageState"));
  const start = source.slice(source.indexOf("export async function startPlaybackSession"), source.indexOf("export async function heartbeatPlaybackSession"));
  const usage = source.slice(source.indexOf("async function ensureUsageState"), source.indexOf("export async function readAccessStatus"));
  assert.match(principal, /now\.getTime\(\) - lastSeenAt >= 60_000/);
  assert.match(usage, /findOneAndUpdate\([\s\S]*upsert: true/);
  assert.doesNotMatch(usage, /UsageState\.create/);
  assert.doesNotMatch(start, /PlaybackSession\.findOne\(/);
  assert.match(start, /PlaybackSession\.create\(/);
  assert.match(start, /error\?\.code === 11000/);
});
