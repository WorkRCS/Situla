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
  assert.ok(page.includes('cooldown: "2 hours"'));
  assert.ok(page.includes('cooldown: "1 hour"'));
  assert.ok(page.includes('allowance: "3 hours"'));
  assert.ok(page.includes("Up to 3 registered devices"));
  assert.ok(page.includes("Premium Verified badge"));
  assert.ok(page.includes("Premium movie playback planned"));
  assert.ok(page.includes("Continue as Guest"));
  assert.ok(page.includes('"Login"'));
  assert.ok(page.includes("Buy Premium"));
  assert.ok(page.includes("does not change your actual server-side access"));
  assert.ok(page.includes("Cooldown locks Watch Pages, not Situla"));
  assert.ok(page.includes("IP is not a unique person identifier"));
  assert.ok(page.includes("TV browser"));
  assert.ok(page.includes("Playback access policy"));
  assert.ok(page.includes("not active yet"));
  assert.ok(footer.includes('<Link href="/plans">Plans</Link>'));
});

test("Premium plans expose Monthly, 6-month and Yearly pricing with term-specific viewing policies", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  const membership = await read("../src/membership-preview.js");
  assert.ok(membership.includes('id: "monthly"'));
  assert.ok(membership.includes('monthlyPrice: 199'));
  assert.ok(membership.includes('totalPrice: 199'));
  assert.ok(membership.includes('id: "six-months"'));
  assert.ok(membership.includes('monthlyPrice: 149'));
  assert.ok(membership.includes('totalPrice: 894'));
  assert.ok(membership.includes('cooldown: "20 minutes"'));
  assert.ok(membership.includes('id: "yearly"'));
  assert.ok(membership.includes('monthlyPrice: 119'));
  assert.ok(membership.includes('totalPrice: 1428'));
  assert.ok(membership.includes('allowance: "Unlimited"'));
  assert.ok(membership.includes('cooldown: "No periodic cooldown"'));
  assert.ok(page.includes("Unlimited streaming on the Yearly package"));
  assert.ok(page.includes("USD_REFERENCE_INR_PER_USD = 93.8075"));
  assert.ok(page.includes("formatUsd(selectedBilling.totalPrice)"));
  assert.ok(page.includes("11 Nov 2026"));
  assert.ok(page.includes('aria-label="Premium billing period"'));
  assert.ok(page.includes("selectedBilling.cooldown"));
});

test("Plans page uses Lucide icons and explicit included/missing feature states", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  assert.ok(page.includes('from "lucide-react"'));
  assert.ok(page.includes("<ArrowLeft"));
  assert.ok(page.includes("<LogIn"));
  assert.ok(page.includes("<CreditCard"));
  assert.ok(page.includes("<Compass"));
  assert.ok(page.includes("<CircleX"));
  assert.ok(page.includes("plans-feature-status"));
  assert.ok(page.includes("plans-matrix-mobile-label"));
  assert.ok(page.includes('available: false'));
  assert.ok(page.includes("20-minute cooldown (6-month billing)"));
  assert.ok(page.includes("Unlimited streaming (Yearly billing)"));
  assert.ok(!page.includes('className="bi '));
});

test("Plans comparison is responsive without a forced wide table", async () => {
  const css = await read("../app/globals.css");
  assert.ok(css.includes(".plans-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)"));
  assert.ok(css.includes("@media (max-width:680px)"));
  assert.ok(css.includes(".plans-cards { grid-template-columns:minmax(0,1fr)"));
  assert.ok(css.includes(".plans-feature-matrix"));
  assert.ok(css.includes(".plans-matrix-mobile-label"));
  assert.ok(css.includes(".plans-feature-status.is-included"));
  assert.ok(css.includes(".plans-feature-status.is-unavailable"));
  assert.ok(css.includes("@media (max-width:360px)"));
});

test("Public-facing playback copy does not disclose provider brands", async () => {
  const page = await read("../app/plans/plans-page.jsx");
  const profile = await read("../app/components/account-pages.jsx");
  const tvDetail = await read("../app/tv/[tmdbId]/detail.jsx");
  const readme = await read("../README.md");
  const publicCopy = [page, profile, tvDetail, readme].join("\n");
  assert.doesNotMatch(publicCopy, /vid\s?link|vid\s?bolt|slast430did/i);
  assert.ok(page.includes("TV & Anime streaming access"));
  assert.ok(profile.includes("<strong>Premium movie playback</strong>"));
  assert.ok(tvDetail.includes("open the episode in Situla"));
});
