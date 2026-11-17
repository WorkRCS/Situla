import test from "node:test";
import assert from "node:assert/strict";
import { formatRuntimeDuration } from "../src/media-time.js";

test("runtime values stored in minutes are shown as hours, minutes and seconds", () => {
  assert.equal(formatRuntimeDuration(125), "2h 5m 0s");
  assert.equal(formatRuntimeDuration(60), "1h 0m 0s");
  assert.equal(formatRuntimeDuration(45), "0h 45m 0s");
  assert.equal(formatRuntimeDuration(0.5), "0h 0m 30s");
});

test("unknown and invalid runtime values stay hidden", () => {
  assert.equal(formatRuntimeDuration(0), "");
  assert.equal(formatRuntimeDuration(null), "");
  assert.equal(formatRuntimeDuration("unknown"), "");
  assert.equal(formatRuntimeDuration(-5), "");
});
