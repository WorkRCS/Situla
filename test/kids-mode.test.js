import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Kids Mode accepts only 4–8 digit parent PINs on the server", async () => {
  const backend = await read("../src/app.js");
  const frontend = await read("../app/components/situla-app.jsx");
  const validPinPattern = "if (!/^\d{4,8}$/.test(pin))";
  const invalidEscapedPattern = "if (!/^\\d{4,8}$/.test(pin))";
  const digitFilter = 'event.target.value.replace(/\D/g, "").slice(0, 8)';

  assert.ok(backend.includes(validPinPattern));
  assert.ok(!backend.includes(invalidEscapedPattern));
  assert.ok(frontend.includes(validPinPattern));
  assert.ok(frontend.includes(digitFilter));
});

test("Kids Mode PIN changes and exit are protected by the stored parent PIN", async () => {
  const backend = await read("../src/app.js");

  assert.match(backend, /verifyPassword\('situla-kids-pin:' \+ currentPin, document\.kidsModePinHash\)/);
  assert.match(backend, /verifyPassword\('situla-kids-pin:' \+ pin, document\.kidsModePinHash\)/);
  assert.match(backend, /kids-mode-pin-setup:/);
  assert.match(backend, /kids-mode-exit:/);
});

test("Kids Mode protects adult catalog routes and restricts playback to approved cartoons", async () => {
  const backend = await read("../src/app.js");

  assert.match(backend, /'\/api\/movies'.*'\/api\/tv'.*'\/api\/anime'/s);
  assert.match(backend, /kidsModeOn && !\['cartoon_movie', 'cartoon_tv'\]\.includes\(mediaType\)/);
  assert.match(backend, /CartoonMovie\.exists\(\{ tmdbId, kidsApproved: true \}\)/);
  assert.match(backend, /CartoonSeries\.exists\(\{ tmdbId, kidsApproved: true \}\)/);
  assert.match(backend, /CartoonEpisode\.exists\(\{ seriesTmdbId: tmdbId, seasonNumber: season, episodeNumber: episode, kidsApproved: true \}\)/);
});

test("Cartoon catalogue and season guides expose only Kids-approved records", async () => {
  const backend = await read("../src/app.js");

  assert.match(backend, /app\.get\('\/api\/cartoons\/movies'[\s\S]*?const filter = \{ kidsApproved: true \}/);
  assert.match(backend, /app\.get\('\/api\/cartoons\/series'[\s\S]*?const filter = \{ kidsApproved: true \}/);
  assert.match(backend, /app\.get\('\/api\/cartoons\/series\/:tmdbId\/seasons\/:seasonNumber'[\s\S]*?kidsApproved: true/);
});


test("Workspace navigation receives Kids Mode state instead of reading an undefined variable", async () => {
  const sidebar = await read("../app/components/site-sidebar.jsx");

  assert.match(sidebar, /export function SiteWorkspace\(\{ children, kidsMode = false \}\)/);
  assert.match(sidebar, /<SiteSidebar onCollapsedChange=\{setSidebarCollapsed\} kidsMode=\{kidsMode\} \/>/);
  assert.match(sidebar, /\(kidsMode \? SITE_KIDS_MOBILE_NAV_ITEMS : SITE_MOBILE_NAV_ITEMS\)/);
});
