import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createRequestConcurrencyGuard } from "../src/request-guard.js";

test("request guard rejects excess in-flight work and releases capacity after completion", async () => {
  const app = new Hono();
  app.use("*", createRequestConcurrencyGuard({ maxConcurrent: 1 }));
  let releaseFirst;
  let markFirstStarted;
  let firstShouldWait = true;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  app.get("/work", async (c) => {
    if (firstShouldWait) {
      firstShouldWait = false;
      markFirstStarted();
      await firstGate;
    }
    return c.json({ ok: true });
  });

  const firstRequest = app.request("/work");
  await firstStarted;
  const overflow = await app.request("/work");
  assert.equal(overflow.status, 503);
  assert.equal(overflow.headers.get("retry-after"), "1");
  assert.equal(overflow.headers.get("cache-control"), "no-store");
  assert.deepEqual(await overflow.json(), {
    error: "The service is busy. Please retry shortly.",
    code: "SERVER_BUSY"
  });

  releaseFirst();
  const firstResponse = await firstRequest;
  assert.equal(firstResponse.status, 200);
  const afterRelease = await app.request("/work");
  assert.equal(afterRelease.status, 200);
  assert.deepEqual(await afterRelease.json(), { ok: true });
});
