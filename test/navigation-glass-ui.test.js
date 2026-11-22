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


test("desktop header keeps the SITULA brand visible beside the desktop sidebar", async () => {
  const css = await read("../app/globals.css");
  const app = await read("../app/components/situla-app.jsx");
  const desktopBrand = css.slice(css.lastIndexOf("/* Desktop restores the brand"));

  assert.match(app, /<Link href="\/" className="brand-lockup" aria-label="Situla home">/);
  assert.match(app, /className="brand-logo"/);
  assert.match(app, /<strong>SITULA<\/strong>/);
  assert.match(desktopBrand, /@media \(min-width:1101px\)/);
  assert.match(desktopBrand, /\.site-app-header \.brand-lockup\s*\{[\s\S]*?display:flex !important;/);
  assert.match(desktopBrand, /\.site-app-header \.brand-copy\s*\{[\s\S]*?display:grid !important;/);
  assert.match(desktopBrand, /justify-content:space-between/);
});

test("mobile navigation is explicitly hidden on desktop and enabled only below the desktop breakpoint", async () => {
  const css = await read("../app/globals.css");
  const rules = css.slice(css.lastIndexOf("/* Responsive ownership is explicit:"));
  const app = await read("../app/components/situla-app.jsx");
  const sidebar = await read("../app/components/site-sidebar.jsx");

  assert.match(rules, /@media \(min-width:1101px\)[\s\S]*?\.app-shell > \.bottom-nav,[\s\S]*?\.site-workspace > \.site-workspace-mobile-nav\s*\{[\s\S]*?display:none !important/);
  assert.match(rules, /@media \(max-width:1100px\)[\s\S]*?\.app-shell > \.bottom-nav,[\s\S]*?\.site-workspace > \.site-workspace-mobile-nav\s*\{[\s\S]*?display:grid !important/);
  assert.match(app, /<nav className=\{["']bottom-nav/);
  assert.match(sidebar, /className=\{["']bottom-nav site-workspace-mobile-nav/);
});


test("mobile navigation docks flush to the viewport with only its top corners rounded", async () => {
  const css = await read("../app/globals.css");
  const app = await read("../app/components/situla-app.jsx");
  const fixedDock = css.slice(css.lastIndexOf("/* Mobile/tablet navigation is a fixed"));

  assert.match(css, /\.site-app-header\s*\{[\s\S]*?position:sticky !important;[\s\S]*?top:0 !important;/);
  assert.match(fixedDock, /position:fixed !important/);
  assert.match(fixedDock, /bottom:0 !important/);
  assert.match(fixedDock, /left:0 !important/);
  assert.match(fixedDock, /width:100% !important/);
  assert.match(fixedDock, /border-radius:22px 22px 0 0 !important/);
  assert.match(fixedDock, /transform:none !important/);
  assert.match(app, /function getAccountInitials\(user\)/);
  assert.match(app, /getAccountInitials\(accountUser\)/);
});

test("header avatar initials stay legible on glass and fall back to the account name", async () => {
  const [app, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/globals.css")
  ]);

  assert.match(app, /user\?\.name \|\| user\?\.displayName \|\| user\?\.fullName \|\| user\?\.email/);
  assert.match(app, /return initials\.toLocaleUpperCase\(\) \|\| "S"/);
  assert.match(app, /<span className="header-avatar-initials">\{getAccountInitials\(accountUser\)\}<\/span>/);
  assert.match(css, /\.site-app-header \.header-avatar-initials\s*\{[\s\S]*?color:#2a1c0a !important;[\s\S]*?background:linear-gradient\(145deg,#ffe8b8,#d99a3e\) !important/);
});


test('desktop navigation keeps one toggle next to the sidebar brand and no duplicate header toggle', async () => {
  const [app, sidebar, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/site-sidebar.jsx"),
    read("../app/globals.css")
  ]);
  assert.doesNotMatch(app, /site-app-sidebar-toggle|situla:toggle-sidebar/);
  assert.match(sidebar, /className="site-sidebar-toggle"/);
  assert.match(sidebar, /const \[collapsed, setCollapsed\] = useState\(true\)/);
  assert.match(sidebar, /onClick=\{\(\) => setCollapsed\(\(value\) => !value\)\}/);
  assert.doesNotMatch(sidebar, /situla:sidebar-collapsed:v2|localStorage\.getItem\(.*sidebar/);
  assert.match(css, /\.site-app-header\s*\{[\s\S]*?width:calc\(100% - var\(--site-sidebar-column\)\)/);
  assert.match(css, /\.site-app-header \.brand-lockup \{ display:none !important; \}/);
});

test('search uses a simple field and concise catalogue recommendations', async () => {
  const [app, css] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/globals.css")
  ]);
  assert.match(app, /handleGlobalSearchShortcut/);
  assert.match(app, /event\.key === "ArrowDown"/);
  assert.match(app, /event\.key === "ArrowUp"/);
  assert.match(app, /const searchRecommendations = useMemo/);
  assert.match(app, /searchDisplayItems/);
  assert.match(app, /search-recommendation-label/);
  assert.ok(app.includes('placeholder={kidsMode ? "Search cartoons…" : "Search movies, TV & anime…"}'));
  assert.doesNotMatch(app, /search-keyboard-hint|search-type-filters|search-sort-filter|search-recent-section|Recent searches|SMART CATALOG SEARCH/);
  assert.match(css, /\.search-dialog \{[\s\S]*?border-radius:12px/);
  assert.match(css, /\.suggestion-item \{[\s\S]*?border-radius:7px !important/);
});

test("catalogue card badges, rating and actions stay readable without overlapping", async () => {
  const css = await read("../app/globals.css");
  const finalCards = css.slice(css.lastIndexOf("/* Low-memory catalogue rendering"));
  assert.match(finalCards, /\.movie-card \.catalog-badge\s*\{[\s\S]*?max-width:calc\(100% - 64px\) !important/);
  assert.match(finalCards, /\.movie-card > \.save-button[\s\S]*?width:40px !important/);
  assert.match(finalCards, /\.movie-card > \.share-button[\s\S]*?top:54px !important/);
  assert.match(finalCards, /\.movie-card \.rating-pill\s*\{[\s\S]*?max-width:calc\(100% - 50px\) !important/);
  assert.match(finalCards, /\.home-collection-rated \.series-card \.rating-pill\s*\{[\s\S]*?bottom:8px !important/);
});

