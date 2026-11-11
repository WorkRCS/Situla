import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Plans page presents the three Situla access modes and their agreed limits", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  const route = await read("../app/plans/page.jsx");
  const footer = await read("../app/components/site-footer.jsx");
  assert.match(route, /PlansPage/);
  assert.match(page, /Anonymous Guest/);
  assert.match(page, /name: "Free"/);
  assert.match(page, /name: "Premium"/);
  assert.match(page, /allowance: "1 hour"/);
  assert.match(page, /cooldown: "5 hours"/);
  assert.match(page, /cooldown: "2 hours"/);
  assert.match(page, /allowance: "3 hours"/);
  assert.match(page, /Up to 3 registered devices/);
  assert.match(page, /Premium Verified badge/);
  assert.match(page, /VidBolt \\(planned\\)/);
  assert.match(page, /Continue as Guest/);
  assert.match(page, /"Login"/);
  assert.match(page, /Buy Premium/);
  assert.match(page, /does not sign you in, start a subscription/);
  assert.match(page, /Cooldown locks Watch Pages, not Situla/);
  assert.match(page, /IP is not a unique person identifier/);
  assert.match(page, /TV browser/);
  assert.match(page, /Third-party player policy/);
  assert.match(page, /not active yet/);
  assert.match(footer, /href="\\/plans">Plans<\\/Link>/);
});

test("Plans page has responsive three-column desktop and stacked mobile layouts", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /\\.plans-cards \\{ display:grid; grid-template-columns:repeat\\(3,minmax\\(0,1fr\\)\\)/);
  assert.match(css, /@media \\(max-width:680px\\)[\\s\\S]*?\\.plans-cards \\{ grid-template-columns:minmax\\(0,1fr\\)/);
  assert.match(css, /\\.plans-table-wrap \\{ overflow-x:auto/);
  assert.match(css, /\\.plans-lock-layout \\{ display:grid/);
});
