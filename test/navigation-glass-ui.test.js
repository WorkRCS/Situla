import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("site chrome uses a unified translucent glass surface on header, sidebar and responsive dock", async () => {
  const css = await read("../app/globals.css");
  const glassStart = css.lastIndexOf("/* Situla navigation glass system:");
  assert.ok(glassStart >= 0, "navigation glass system should be present");
  const glass = css.slice(glassStart);

  for (const selector of [
    ".site-app-header",
    ".site-sidebar.home-sidebar",
    ".site-workspace > .site-sidebar",
    ".bottom-nav",
    ".site-workspace-mobile-nav",
    ".header-account-popover",
    ".header-notification-popover"
  ]) assert.ok(glass.includes(selector), "missing glass surface: " + selector);

  assert.match(glass, /backdrop-filter:blur\(14px\) saturate\(148%\) !important/);
  assert.match(glass, /background:[\s\S]*?linear-gradient\(112deg,rgba\(32,39,53/);
  assert.match(glass, /border-bottom:1px solid var\(--situla-chrome-edge\)/);
  assert.match(glass, /inset 0 1px 0 rgba\(255,255,255/);
});

test("sidebar navigation uses flat editorial link states instead of separate raised button tiles", async () => {
  const [sidebar, css] = await Promise.all([
    read("../app/components/site-sidebar.jsx"),
    read("../app/globals.css")
  ]);
  const glass = css.slice(css.lastIndexOf("/* Situla navigation glass system:"));

  assert.match(sidebar, /<nav className="home-sidebar-nav site-sidebar-navigation"/);
  assert.match(sidebar, /className=\{"home-side-link" \+ \(selected \? " active" : ""\)\}/);
  assert.match(glass, /\.site-sidebar \.home-side-link\s*\{[\s\S]*?border:0 !important;[\s\S]*?border-radius:0 !important;[\s\S]*?background:transparent !important/);
  assert.match(glass, /\.site-sidebar \.home-side-link\.active::before/);
  assert.match(glass, /\.site-sidebar \.home-side-link\.active\s*\{[\s\S]*?box-shadow:none !important/);
});

test("mobile and tablet navigation stays proportionate with continuous bar-level glass and flat active states", async () => {
  const [app, sidebar, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/site-sidebar.jsx"),
    read("../app/globals.css")
  ]);
  const glass = css.slice(css.lastIndexOf("/* Situla navigation glass system:"));

  assert.match(app, /className=\{"bottom-nav" \+ \(kidsMode \? " is-kids-nav" : ""\)\}/);
  assert.match(sidebar, /className=\{"bottom-nav site-workspace-mobile-nav"/);
  assert.match(glass, /width:min\(940px,calc\(100% - 44px\)\)/);
  assert.match(glass, /@media \(min-width:768px\) and \(max-width:1100px\)/);
  assert.match(glass, /@media \(max-width:767px\)/);
  assert.match(glass, /width:calc\(100% - 16px\) !important/);
  assert.match(glass, /\.bottom-nav \.nav-button\.active::before/);
  assert.match(glass, /\.bottom-nav \.nav-button\.active,\s*\.bottom-nav \.site-workspace-mobile-link\.active\s*\{[\s\S]*?background:transparent !important/);
  assert.match(glass, /\.bottom-nav\.is-kids-nav\s*\{\s*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test("glass chrome respects reduced transparency, reduced motion, and unsupported backdrop filters", async () => {
  const css = await read("../app/globals.css");
  const glass = css.slice(css.lastIndexOf("/* Situla navigation glass system:"));

  assert.match(glass, /@media \(prefers-reduced-transparency:reduce\)[\s\S]*?backdrop-filter:none !important/);
  assert.match(glass, /@media \(prefers-reduced-motion:reduce\)[\s\S]*?transition:none !important/);
  assert.match(glass, /@supports not \(backdrop-filter:blur\(1px\)\)/);
  assert.match(glass, /Only the large navigation planes sample the backdrop/);
});
