import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUpcomingUrl, countdownParts } from "../src/upcoming-utils.js";
import { UpcomingItem, UpcomingWaitlist, UpcomingRead } from "../src/models.js";
import app from "../src/app.js";

test("Upcoming poster URLs require safe public HTTPS hosts", () => {
  assert.equal(normalizeUpcomingUrl("https://cdn.example.com/posters/title.jpg"), "https://cdn.example.com/posters/title.jpg");
  assert.equal(normalizeUpcomingUrl("https://player.example.org/embed/123"), "https://player.example.org/embed/123");
  assert.equal(normalizeUpcomingUrl(""), "");
  for (const value of [
    "http://cdn.example.com/poster.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "https://localhost/poster.jpg",
    "https://admin.local/poster.jpg",
    "https://example.internal/poster.jpg",
    "https://127.0.0.1/poster.jpg",
    "https://10.0.0.5/poster.jpg",
    "https://192.168.1.2/poster.jpg",
    "https://[::1]/poster.jpg",
    "https://user:password@cdn.example.com/poster.jpg",
    "not-a-url"
  ]) assert.equal(normalizeUpcomingUrl(value), null, value);
});

test("Upcoming countdown returns stable calendar components and detects a passed release", () => {
  assert.deepEqual(countdownParts("2026-01-02T00:00:00.000Z", Date.parse("2026-01-01T00:00:00.000Z")), {
    launched: false, days: 1, hours: 0, minutes: 0, seconds: 0
  });
  assert.deepEqual(countdownParts("2026-01-01T00:00:01.000Z", Date.parse("2026-01-01T00:00:00.000Z")), {
    launched: false, days: 0, hours: 0, minutes: 0, seconds: 1
  });
  assert.deepEqual(countdownParts("2026-01-01T00:00:00.000Z", Date.parse("2026-01-01T00:00:00.000Z")), {
    launched: true, days: 0, hours: 0, minutes: 0, seconds: 0
  });
  assert.equal(countdownParts("not-a-date", 0), null);
});

test("Upcoming item model stores the three content types, release data, labels and countdown", () => {
  assert.deepEqual(UpcomingItem.schema.path("type").enumValues, ["movie", "tv", "anime"]);
  for (const path of ["title", "posterMode", "posterUrl", "posterData", "releaseAt", "rating", "isPopular", "isHot", "isFeatured", "isPremium", "countdownEnabled", "status"]) {
    assert.ok(UpcomingItem.schema.path(path), "missing " + path);
  }
});

test("Upcoming waitlist enforces one row per user and item", () => {
  const indexes = UpcomingWaitlist.schema.indexes();
  assert.ok(indexes.some(([keys, options]) =>
    keys.upcomingId === 1 && keys.userId === 1 && options.unique === true
  ));
});

test("Upcoming unread marker is unique per user", () => {
  const indexes = UpcomingRead.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.userId === 1 && options.unique === true));
});


test("Upcoming waitlist mutations enforce same-origin requests and validate IDs before database access", async () => {
  const crossOrigin = await app.request("/api/upcoming/507f1f77bcf86cd799439011/waitlist", {
    method: "POST",
    headers: { origin: "https://attacker.example", host: "situla.example", "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(crossOrigin.status, 403);

  const malformedId = await app.request("/api/upcoming/not-an-id/waitlist", {
    method: "POST",
    headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(malformedId.status, 400);
  assert.equal((await malformedId.json()).error, "Invalid upcoming item.");

  const malformedPoster = await app.request("/api/upcoming/not-an-id/poster");
  assert.equal(malformedPoster.status, 400);
});

test("Upcoming admin API rejects requests without an administrator session", async () => {
  const response = await app.request("/api/admin/upcoming");
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ADMIN_REQUIRED");
});
