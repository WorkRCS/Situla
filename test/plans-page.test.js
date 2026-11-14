import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Plans page presents the three access modes with concise, accurate limits", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  const route = await read("../app/plans/page.jsx");
  const footer = await read("../app/components/site-footer.jsx");

  assert.match(route, /PlansPage/);
  assert.ok(page.includes("<h2>Guest</h2>"));
  assert.ok(page.includes("<h2>Free</h2>"));
  assert.ok(page.includes("<h2>Premium</h2>"));
  assert.ok(page.includes('value="1 hour"'));
  assert.ok(page.includes('value="2 hours"'));
  assert.ok(page.includes('value="3 hours"'));
  assert.ok(page.includes('value="1 hour" detail="after the limit"'));
  assert.ok(page.includes("Up to 3"));
  assert.ok(page.includes("Premium Verified badge"));
  assert.ok(page.includes("Continue as Guest"));
  assert.ok(page.includes("Sign in or create account"));
  assert.ok(page.includes("Movies, TV and Anime catalog access"));
  assert.ok(page.includes("IP + session"));
  assert.ok(page.includes("Catalog browsing remains available during cooldown"));
  assert.ok(footer.includes('<Link href="/plans">Plans</Link>'));
});

test("Premium billing periods use the current plan values and do not imply checkout is active", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  const membership = await read("../src/membership-preview.js");

  assert.ok(membership.includes('id: "monthly"'));
  assert.ok(membership.includes("monthlyPrice: 199"));
  assert.ok(membership.includes("totalPrice: 199"));
  assert.ok(membership.includes('id: "six-months"'));
  assert.ok(membership.includes("monthlyPrice: 149"));
  assert.ok(membership.includes("totalPrice: 894"));
  assert.ok(membership.includes('cooldown: "20 minutes"'));
  assert.ok(membership.includes('id: "yearly"'));
  assert.ok(membership.includes("monthlyPrice: 119"));
  assert.ok(membership.includes("totalPrice: 1428"));
  assert.ok(membership.includes('allowance: "Unlimited"'));
  assert.ok(membership.includes('cooldown: "No periodic cooldown"'));

  assert.ok(page.includes('aria-label="Premium billing period"'));
  assert.ok(page.includes("selectedBilling.allowance"));
  assert.ok(page.includes("selectedBilling.cooldown"));
  assert.ok(page.includes("selectedBilling.totalPrice"));
  assert.ok(page.includes("Checkout unavailable"));
  assert.ok(page.includes("activated by an administrator"));
  assert.ok(page.includes("Online checkout and renewals are not available yet."));
  assert.ok(page.includes("Unlimited"));
});

test("Plans page removes preview-only and repeated comparison sections", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  assert.ok(page.includes('from "lucide-react"'));
  assert.ok(page.includes("<ArrowLeft"));
  assert.ok(page.includes("<CreditCard"));
  assert.ok(page.includes("<LockKeyhole"));
  assert.doesNotMatch(page, /plans-preview-panel|plans-lock-demo|plans-feature-matrix|plans-bottom-cta/);
  assert.doesNotMatch(page, /UI PREVIEW ONLY|illustrative cooldown|Previewing/);
  assert.doesNotMatch(page, /Buy Premium/);
});

test("Plans page is responsive from desktop through small phones", async () => {
  const css = await read("../app/globals.css");
  assert.ok(css.includes(".plans-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)"));
  assert.ok(css.includes("@media (max-width:980px)"));
  assert.ok(css.includes(".plans-cards { grid-template-columns:repeat(2,minmax(0,1fr))"));
  assert.ok(css.includes("@media (max-width:680px)"));
  assert.ok(css.includes(".plans-cards { grid-template-columns:minmax(0,1fr)"));
  assert.ok(css.includes("@media (max-width:380px)"));
  assert.ok(css.includes(".plans-metrics { gap:4px; }"));
});

test("Public plan copy does not disclose provider brands or promise unsupported playback", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  const profile = await read("../app/components/account-pages.jsx");
  const tvDetail = await read("../app/tv/[tmdbId]/detail.jsx");
  const readme = await read("../README.md");
  const publicCopy = [page, profile, tvDetail, readme].join("\n");
  assert.doesNotMatch(publicCopy, /vid\s?link|vid\s?bolt|slast430did/i);
  assert.ok(page.includes("Movies, TV and Anime catalog access"));
  assert.ok(profile.includes("<strong>Premium movie playback</strong>"));
  assert.ok(tvDetail.includes("open the episode in Situla"));
});

test("Guest and Free watch cooldowns are visible without demo-only text", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  assert.ok(page.includes('value="1 hour" detail="per cycle"'));
  assert.ok(page.includes('value="2 hours" detail="after the limit"'));
  assert.ok(page.includes('value="3 hours" detail="per cycle"'));
  assert.ok(page.includes('value="1 hour" detail="after the limit"'));
  assert.doesNotMatch(page, /01:42:18|00:42:18|setInterval/);
});
