import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Plans page presents the three Situla access modes and their agreed limits", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  const route = await read("../app/plans/page.jsx");
  const footer = await read("../app/components/site-footer.jsx");
  assert.match(route, /PlansPage/);
  assert.ok(page.includes("Anonymous Guest"));
  assert.ok(page.includes('name: "Free"'));
  assert.ok(page.includes('name: "Premium"'));
  assert.ok(page.includes('allowance: "1 hour"'));
  assert.ok(page.includes('cooldown: "5 hours"'));
  assert.ok(page.includes('cooldown: "2 hours"'));
  assert.ok(page.includes('allowance: "3 hours"'));
  assert.ok(page.includes("Up to 3 registered devices"));
  assert.ok(page.includes("Premium Verified badge"));
  assert.ok(page.includes("VidBolt for Premium movies (planned)"));
  assert.ok(page.includes("Continue as Guest"));
  assert.ok(page.includes('"Login"'));
  assert.ok(page.includes("Buy Premium"));
  assert.ok(page.includes("does not sign you in, start a subscription"));
  assert.ok(page.includes("Cooldown locks Watch Pages, not Situla"));
  assert.ok(page.includes("IP is not a unique person identifier"));
  assert.ok(page.includes("TV browser"));
  assert.ok(page.includes("Third-party player policy"));
  assert.ok(page.includes("not active yet"));
  assert.ok(footer.includes('<Link href="/plans">Plans</Link>'));
});

test("Plans page has responsive three-column desktop and stacked mobile layouts", async () => {
  const css = await read("../app/globals.css");
  assert.ok(css.includes(".plans-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr))"));
  assert.ok(css.includes("@media (max-width:680px)"));
  assert.ok(css.includes(".plans-cards { grid-template-columns:minmax(0,1fr)"));
  assert.ok(css.includes(".plans-table-wrap { overflow-x:auto"));
  assert.ok(css.includes(".plans-lock-layout { display:grid"));
});
