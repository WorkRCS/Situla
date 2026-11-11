import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("global Site footer appears after page content and links to the copyright policy", async () => {
  const layout = await read("../app/layout.jsx");
  const footer = await read("../app/components/site-footer.jsx");
  assert.match(layout, /import SiteFooter from "\.\/components\/site-footer\.jsx"/);
  assert.match(layout, /\{children\}[\s\S]*?<SiteFooter \/>/);
  assert.match(footer, /href="\/copyright"/);
  assert.match(footer, /Copyright &amp; Content Policy/);
  assert.match(footer, /an0-my1@proton\.me/);
  assert.match(footer, /pathname\?\.startsWith\("\/watch\/"\)/);
});

test("copyright policy explains third-party video embeds without claiming blanket legal immunity", async () => {
  const page = await read("../app/copyright/page.jsx");
  assert.match(page, /does not upload[\s\S]*?store complete[\s\S]*?video files/i);
  assert.match(page, /embedded players or services operated by third[\s\S]*?parties/i);
  assert.match(page, /rights remain with the respective copyright owners/i);
  assert.match(page, /an0-my1@proton\.me/);
  assert.match(page, /exact Situla page URL/);
  assert.match(page, /within our control/);
  assert.match(page, /does not constitute legal advice/i);
  assert.match(page, /does not by itself determine whether a particular use is lawful/i);
});

test("copyright footer and policy page use responsive Situla styling", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /\.site-footer \{/);
  assert.match(css, /\.copyright-policy-card \{/);
  assert.match(css, /@media \(max-width:700px\)[\s\S]*?\.site-footer-top/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)[\s\S]*?\.site-footer a/);
});
