import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Admin dashboard menu icon is imported before it is rendered", async () => {
  const shell = await read("../app/components/situla-app.jsx");
  const iconImport = shell.match(/import \{[^}]*\} from "lucide-react"/);
  assert.ok(iconImport?.[0].includes("ShieldCheck"));
  assert.match(shell, /<ShieldCheck size=\{16\} \/>/);
});

test("Login and profile routes provide the requested demo account experience", async () => {
  const loginRoute = await read("../app/login/page.jsx");
  const profileRoute = await read("../app/profile/page.jsx");
  const pages = await read("../app/components/account-pages.jsx");
  const membership = await read("../src/membership-preview.js");

  assert.match(loginRoute, /LoginPage/);
  assert.match(profileRoute, /ProfilePage/);
  assert.ok(pages.includes("Continue with email"));
  assert.ok(pages.includes("Continue with Google"));
  assert.ok(pages.includes("mixHomeSpotlight"));
  assert.ok(pages.includes('fetchPriority={prioritize ? "high" : "low"}'));
  assert.ok(pages.includes('loading={prioritize ? "eager" : "lazy"}'));
  assert.ok(pages.includes("publishPosterColumns();"));
  assert.ok(pages.includes("toHomeSpotlight"));
  assert.ok(pages.includes("/api/movies?limit=10"));
  assert.ok(pages.includes("/api/tv?limit=10"));
  assert.ok(pages.includes("/api/anime?limit=10"));
  assert.ok(!pages.includes("random=true"));
  assert.ok(pages.includes("sessionStorage.getItem(cacheKey)"));
  assert.ok(pages.includes("sessionStorage.setItem(cacheKey"));
  assert.ok(pages.includes("preloadedPosterUrls"));
  assert.ok(pages.includes("const chunkSize = 4"));
  assert.ok(pages.includes("await image.decode()"));
  assert.ok(pages.includes("window.setTimeout(resolve, 64)"));
  assert.ok(pages.includes("draggable={false}"));
  assert.ok(pages.includes("onContextMenu={(event) => event.preventDefault()}"));
  assert.ok(pages.includes("https://developers.google.com/static/identity/images/g-logo.png"));
  assert.ok(!pages.includes("THE SITULA EXPERIENCE"));
  const login = pages.slice(pages.indexOf("export function LoginPage"), pages.indexOf("\nfunction formatAccountDate"));
  assert.ok(login.includes("Email address"));
  assert.ok(login.includes("Password"));
  assert.ok(login.includes("Continue with email"));
  assert.ok(login.includes("Continue with Google"));
  assert.doesNotMatch(login, /login-auth-hint|New email|create a Free account automatically|Enter your account password|Password: 10/);
  assert.match(login, /type=\{showPassword \? "text" : "password"\}/);
  assert.doesNotMatch(login, /name="password"[^>]*placeholder=/);
  assert.ok(login.includes("/api/auth/email"));
  assert.ok(login.includes("/api/auth/google"));
  assert.doesNotMatch(login, /rememberMe|Remember me/);
  assert.ok(login.includes('className="account-divider" role="separator">OR</div>'));
  assert.ok(login.indexOf("Password") < login.indexOf("Continue with email"));
  assert.ok(login.indexOf("Continue with email") < login.indexOf(">OR</div>"));
  assert.ok(login.indexOf(">OR</div>") < login.indexOf("Continue with Google"));
  assert.doesNotMatch(login, /MEMBER ACCESS|Welcome back|Sign in to continue|Forgot password|Explore membership|account-demo-disclaimer|UserRound/);
  assert.ok(!login.includes("no password is verified"));
  assert.ok(pages.includes("Premium · Active"));
  assert.ok(pages.includes("Renew plan"));
  assert.ok(pages.includes("Premium Verified"));
  assert.ok(pages.includes("PREMIUM MEMBER"));
  assert.ok(!pages.includes("DEMO_ACCOUNT"));
  assert.ok(pages.includes("Personal details"));
  assert.ok(pages.includes("Profile avatar"));
  assert.ok(pages.includes("Locked"));
  assert.ok(pages.includes("Early movie updates"));
  assert.ok(!pages.includes("DEMO_ACCOUNT"));
  assert.ok(pages.includes("/api/auth/me"));
  assert.ok(pages.includes("/api/auth/me"));
  assert.ok(pages.includes("SERVER-VERIFIED SESSION"));
  assert.doesNotMatch(pages, /\/api\/auth\/devices|profile-device-revoke|deviceSummary|Remember me/);
  assert.ok(membership.includes('status: "active"'));
});

test("Main app header places search before avatar and notifications", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  const search = app.indexOf('className="header-search-wrap">');
  const avatar = app.indexOf('className="header-account-wrap"');
  const notifications = app.indexOf('<AnnouncementCenter onOpen=');
  const announcementCenter = await read("../app/components/announcement-center.jsx");
  assert.ok(search >= 0 && avatar > search && notifications > avatar);
  assert.ok(announcementCenter.includes('className="header-notifications-wrap"'));
  assert.ok(app.includes('router.push("/profile")'));
  assert.ok(app.includes('router.push("/login")'));
  assert.ok(app.includes("/api/auth/logout"));
  assert.ok(!app.includes("DEMO_ACCOUNT"));
  assert.ok(app.includes("/api/auth/me"));
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
  assert.ok(account.includes("activeBilling.monthlyPrice"));
  assert.ok(membership.includes("monthlyPrice: 199"));
  assert.ok(membership.includes("monthlyPrice: 149"));
  assert.ok(membership.includes("monthlyPrice: 119"));
});


test("Login showcase mixes live movie, TV and anime posters in opposing vertical loops", async () => {
  const pages = await read("../app/components/account-pages.jsx");
  const css = await read("../app/globals.css");

  assert.ok(pages.includes("login-poster-rail"));
  assert.ok(pages.includes('direction="down"'));
  assert.ok(pages.includes('direction="up"'));
  assert.ok(pages.includes('loading={prioritize ? "eager" : "lazy"}'));
  assert.ok(css.includes("@keyframes login-poster-up"));
  assert.ok(css.includes("@keyframes login-poster-down"));
  assert.ok(css.includes("animation:login-poster-up"));
  assert.ok(css.includes("animation:login-poster-down"));
  assert.ok(css.includes("body:has(.login-page) .site-footer"));
  assert.ok(css.includes("height:.35%;"));
  assert.ok(css.includes("#000 .25%,#000 99.75%"));
  assert.ok(css.includes("border:1px solid rgba(255,255,255,.055)"));
  assert.ok(css.includes("position:absolute;\n    z-index:0;\n    inset:0;"));
  assert.ok(css.includes("opacity:.54;"));
  assert.ok(css.includes("pointer-events:none;\n  user-select:none;\n  -webkit-user-drag:none;"));
});

test("Free signed-in profiles can open a responsive Premium upgrade modal with all billing periods", async () => {
  const pages = await read("../app/components/account-pages.jsx");
  const css = await read("../app/globals.css");
  const modal = pages.slice(pages.indexOf("function PremiumUpgradeModal"), pages.indexOf("export function ProfilePage"));
  const profile = pages.slice(pages.indexOf("export function ProfilePage"));

  assert.match(profile, /upgradeModalOpen && !membershipActive && <PremiumUpgradeModal/);
  assert.match(profile, /className="profile-upgrade-trigger" onClick=\{\(\) => setUpgradeModalOpen\(true\)\}/);
  assert.match(profile, /membershipActive \? \([\s\S]*?Premium · Active/);
  assert.match(modal, /role="dialog" aria-modal="true"/);
  assert.match(modal, /aria-labelledby="profile-upgrade-title"/);
  assert.match(modal, /PREMIUM_BILLING\.map/);
  assert.match(modal, /selectedBilling\.totalPrice\.toLocaleString/);
  assert.match(modal, /selectedBilling\.allowance/);
  assert.match(modal, /selectedBilling\.cooldown/);
  assert.match(modal, /Included with Premium/);
  assert.match(modal, /Limits & not included/);
  assert.match(modal, /Premium movie playback is planned, but not active yet/);
  assert.match(modal, /Checkout is not connected yet/);
  assert.match(modal, /Purchase unavailable/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(css, /\.profile-upgrade-backdrop \{[\s\S]*?position:fixed/);
  assert.match(css, /\.profile-upgrade-dialog \{[\s\S]*?max-height:min\(92dvh,900px\)/);
  assert.match(css, /@media \(max-width:620px\) \{[\s\S]*?\.profile-upgrade-feature-grid \{ grid-template-columns:minmax\(0,1fr\)/);
});


test("Profile stays in the account menu and responsive navigation stays compact", async () => {
  const sidebar = await read("../app/components/site-sidebar.jsx");
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  const navItems = sidebar.match(/export const SITE_NAV_ITEMS = \[([\s\S]*?)\];/)?.[1] || "";

  assert.doesNotMatch(navItems, /profile|Profile/);
  assert.ok(app.includes('router.push("/profile")'));
  assert.ok(css.includes("column-gap:clamp(4px,.9vw,8px) !important;"));
  assert.ok(css.includes("min-width:0 !important;"));
  assert.ok(css.includes("grid-template-columns:repeat(7,minmax(0,1fr)) !important;"));
  assert.ok(css.includes("Shared page-header glass treatment"));
  assert.ok(css.includes(".site-app-header .header-notification-trigger"));
  assert.ok(css.includes(".site-app-header .header-actions .header-search-trigger"));
});

test("Login, Plans and Profile keep their existing content with a clearer responsive UI", async () => {
  const [css, login, plans, profile] = await Promise.all([
    read("../app/globals.css"),
    read("../app/components/account-pages.jsx"),
    read("../app/plans/plans-page.jsx"),
    read("../app/profile/page.jsx")
  ]);
  const loginView = login.slice(login.indexOf("export function LoginPage"), login.indexOf("\nfunction formatAccessDuration"));
  assert.doesNotMatch(loginView, /New email\\?|create a Free account automatically|Enter your account password|login-auth-hint/);
  assert.ok(loginView.includes("Continue with email"));
  assert.ok(loginView.includes("Continue with Google"));
  assert.ok(loginView.includes("/api/auth/email"));
  assert.ok(loginView.includes("/api/auth/google"));
  assert.ok(plans.includes("<h2>Guest</h2>") && plans.includes("<h2>Free</h2>") && plans.includes("<h2>Premium</h2>"));
  assert.ok(profile.includes("<ProfilePage />"));
  assert.ok(css.includes("Focused visual refinement for Login, Plans and Profile only."));
  assert.ok(css.includes(".login-page .login-form-panel .login-form-card"));
  assert.ok(css.includes(".plans-card:not(.plans-card-guest) .plans-metrics"));
  assert.ok(css.includes(".profile-overview-panel"));
  assert.ok(css.includes(".profile-readonly-field"));
  assert.ok(css.includes(".profile-upgrade-dialog"));
  assert.ok(css.includes("@media (max-width:640px)"));
  assert.ok(css.includes("@media (max-width:520px)"));
  assert.ok(css.includes("@media (max-width:380px)"));
});

