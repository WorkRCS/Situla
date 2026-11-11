import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("all browsers can access Situla pages and API routes without a browser gate", async () => {
  const proxy = await read("../proxy.js");
  assert.match(proxy, /export function proxy\(\)\s*\{\s*\/\*[\s\S]*?\*\/\s*return NextResponse\.next\(\);\s*\}/);
  assert.doesNotMatch(proxy, /Brave|browser-check|user-agent|sec-ch-ua|NextResponse\.redirect|cookies/);
  assert.match(proxy, /matcher:/);
});

test("the old Brave-only check page and browser access helper are removed", async () => {
  await assert.rejects(read("../app/browser-check/page.jsx"), { code: "ENOENT" });
  await assert.rejects(read("../src/browser-access.js"), { code: "ENOENT" });
});
