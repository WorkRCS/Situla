import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createRequestConcurrencyGuard } from "../src/request-guard.js";

test("request guard queues a short burst and releases capacity after completion", async () => {
  const app = new Hono();
  app.use("*", createRequestConcurrencyGuard({ maxConcurrent: 1, maxQueued: 2, queueTimeoutMs: 500 }));
  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  app.get("/work", async (c) => {
    if (c.req.query("hold") === "1") {
      markFirstStarted();
      await firstGate;
    }
    return c.json({ ok: true });
  });

  const firstRequest = app.request("/work?hold=1");
  await firstStarted;
  const queuedRequest = app.request("/work");
  await new Promise((resolve) => setTimeout(resolve, 10));
  releaseFirst();

  const [firstResponse, queuedResponse] = await Promise.all([firstRequest, queuedRequest]);
  assert.equal(firstResponse.status, 200);
  assert.equal(queuedResponse.status, 200);
  assert.deepEqual(await queuedResponse.json(), { ok: true });
});

test("request guard rejects only when the bounded queue is full", async () => {
  const app = new Hono();
  app.use("*", createRequestConcurrencyGuard({ maxConcurrent: 1, maxQueued: 0, queueTimeoutMs: 100 }));
  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  app.get("/work", async (c) => {
    if (c.req.query("hold") === "1") {
      markFirstStarted();
      await firstGate;
    }
    return c.json({ ok: true });
  });

  const firstRequest = app.request("/work?hold=1");
  await firstStarted;
  const overflow = await app.request("/work");
  assert.equal(overflow.status, 503);
  assert.equal(overflow.headers.get("retry-after"), "1");
  assert.equal(overflow.headers.get("cache-control"), "no-store");
  assert.equal((await overflow.json()).code, "SERVER_BUSY");
  releaseFirst();
  assert.equal((await firstRequest).status, 200);
});
