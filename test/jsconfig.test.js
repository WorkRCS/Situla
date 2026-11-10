import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("JavaScript path aliases resolve from jsconfig without deprecated baseUrl", async () => {
  const config = JSON.parse(await readFile(new URL("../jsconfig.json", import.meta.url), "utf8"));
  assert.equal(Object.hasOwn(config.compilerOptions || {}, "baseUrl"), false);
  assert.deepEqual(config.compilerOptions?.paths?.["@/*"], ["./*"]);
});
