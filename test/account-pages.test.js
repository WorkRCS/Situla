import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Login and profile routes provide the requested demo account experience", async () => {
  const loginRoute = await read("../app/login/page.jsx");
  const profileRoute = await read("../app/profile/page.jsx");
  const pages = await read("../app/components/account-pages.jsx");
  const membership = await read("../src/membership-preview.js");

  assert.match(loginRoute, /LoginPage/);
  assert.match(profileRoute, /ProfilePage/);
  assert.ok(pages.includes("Continue with email"));
  assert.ok(pages.includes("Continue with Google"));
  assert.ok(pages.includes("Forgot password?"));
  assert.ok(pages.includes("no password is verified"));
  assert.ok(pages.includes("Purchased · Enjoy Premium"));
  assert.ok(pages.includes("Renew plan"));
  assert.ok(pages.includes("Premium Verified"));
  assert.ok(pages.includes("Personal details"));
  assert.ok(pages.includes("Profile avatar"));
  assert.ok(pages.includes("Locked"));
  assert.ok(pages.includes("Early movie updates"));
  assert.ok(membership.includes("renewWindowDays: 21"));
  assert.ok(membership.includes('status: "active"'));
});

test("Main app header places search before avatar and notifications", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  const search = app.indexOf('className="header-search-wrap">');
  const avatar = app.indexOf('className="header-account-wrap"');
  const notifications = app.indexOf('className="header-notifications-wrap"');
  assert.ok(search >= 0 && avatar > search && notifications > avatar);
  assert.ok(app.includes('router.push("/profile")'));
  assert.ok(app.includes('router.push("/login")'));
  assert.ok(app.includes("setDemoAccountSession(false)"));
  assert.ok(css.includes(".header-actions"));
  assert.ok(css.includes("@media (max-width:1100px)"));
  assert.ok(css.includes(".header-notification-popover"));
  assert.match(css, /\.bottom-nav \{\s*position:fixed !important;\s*z-index:40;\s*left:0 !important;\s*right:0 !important;\s*bottom:0 !important;\s*width:100% !important;/);
  assert.ok(css.includes("border-radius:22px 22px 0 0 !important;"));
});

test("Premium pricing data is shared by Plans and the demo membership profile", async () => {
  const plans = await read("../app/plans/plans-page.jsx");
  const account = await read("../app/components/account-pages.jsx");
  const membership = await read("../src/membership-preview.js");
  assert.ok(plans.includes('from "../../src/membership-preview.js"'));
  assert.ok(account.includes("PREMIUM_BILLING"));
  assert.ok(account.includes("ACTIVE_BILLING.monthlyPrice"));
  assert.ok(membership.includes("monthlyPrice: 199"));
  assert.ok(membership.includes("monthlyPrice: 149"));
  assert.ok(membership.includes("monthlyPrice: 119"));
});
