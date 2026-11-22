import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Kids Mode has one password-free icon-only red/green switch", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  const backend = await read("../src/app.js");
  const models = await read("../src/models.js");

  assert.ok(app.includes('className="header-kids-mode-icon"'));
  assert.ok(app.includes("<Baby size={19} />"));
  assert.ok(app.includes('role="switch"'));
  assert.ok(app.includes('aria-checked={kidsMode}'));
  assert.ok(app.includes('aria-label="Kids Mode"'));
  assert.ok(app.includes("onClick={() => changeKidsMode(!kidsMode)}"));
  assert.ok(!app.includes("Only approved cartoon content"));
  assert.ok(!app.includes("header-kids-mode-copy"));
  assert.ok(!app.includes("header-kids-mode-description"));
  assert.ok(!app.includes("header-kids-mode-status"));
  assert.ok(css.includes("background:#d63c3c;"));
  assert.ok(css.includes("background:#209b65;"));
  assert.ok(!/kidsPin|Parent PIN|type="password"|saveKidsModePin/.test(app));
  assert.ok(!backend.includes("/api/kids-mode/pin"));
  assert.ok(!backend.includes("verifyPassword('situla-kids-pin:"));
  assert.ok(backend.includes("removeLegacyKidsModePinData"));
  assert.ok(!models.includes("kidsModePinHash"));
});

test("Kids Mode API stores just the toggle and clears all old PIN hashes", async () => {
  const backend = await read("../src/app.js");
  const route = backend.slice(backend.indexOf("app.post('/api/kids-mode'"), backend.indexOf("async function readSharePosterBytes"));

  assert.ok(backend.includes("async function removeLegacyKidsModePinData()"));
  assert.ok(backend.includes("User.collection.updateMany("));
  assert.ok(backend.includes("GuestSession.collection.updateMany("));
  assert.ok(route.includes("$set: { kidsMode: body.enabled }"));
  assert.ok(route.includes('$unset: { kidsModePinHash: "" }'));
  assert.ok(!route.includes("body.pin"));
  assert.ok(!route.includes("verifyPassword"));
});

test("Kids Mode changes content immediately and persists the latest switch state without reloads", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const handler = app.slice(app.indexOf("async function changeKidsMode"), app.indexOf("useEffect(() => {\n    if (!kidsModeReady || kidsMode) return undefined;"));
  const home = app.slice(app.indexOf('<div className="home-main-column">'), app.indexOf("</div>\n          </>", app.indexOf('<div className="home-main-column">')));

  assert.ok(handler.includes("kidsModeIntentRef.current = nextMode"));
  assert.ok(handler.includes("setKidsMode(Boolean(enabled))"));
  assert.ok(handler.includes("void persistKidsModePreference()"));
  assert.ok(!handler.includes("router.replace"));
  assert.ok(!handler.includes("router.refresh"));
  assert.ok(!handler.includes("location.reload"));
  assert.ok(app.includes("while (true)"));
  assert.ok(app.includes("kidsModeSaveInFlightRef.current"));
  assert.ok(app.includes("kidsModeIntentRef.current !== requestedMode"));
  assert.match(app, /disabled=\{!kidsModeReady\}/);
  assert.doesNotMatch(app, /disabled=\{kidsModeBusy \|\| !kidsModeReady\}/);
  assert.ok(home.includes('className="home-mode-panel"') && home.includes('hidden={!kidsModeReady || kidsMode}'));
  assert.ok(home.includes('<div className="kids-mode-panel" hidden={!kidsModeReady || !kidsMode}'));
  assert.ok(home.includes("Preparing your home feed"));
  assert.ok(app.includes("typeof payload.enabled !== \"boolean\""));
  assert.ok(app.includes('className="app-view-mode-panel" hidden={!kidsModeReady || (kidsMode && !kidsOnlyView)}'));
  assert.ok(app.includes('className="kids-mode-panel" hidden={!kidsModeReady || !kidsMode || kidsOnlyView}'));
  assert.ok(app.includes('if (!kidsModeReady || kidsMode || tab !== "home") return undefined;'));
  assert.ok(!app.includes("setHomeSeriesReady(false);"));
});

test("Kids Mode restricts adult catalogs and playback to approved cartoons", async () => {
  const backend = await read("../src/app.js");

  assert.ok(backend.includes("'/api/movies'") && backend.includes("'/api/tv'") && backend.includes("'/api/anime'"));
  assert.ok(backend.includes("kidsModeOn && !['cartoon_movie', 'cartoon_tv'].includes(mediaType)"));
  assert.ok(backend.includes("CartoonMovie.exists(approvedCartoonMovieFilter({ tmdbId }))"));
  assert.ok(backend.includes("CartoonSeries.exists(approvedCartoonSeriesFilter({ tmdbId }))"));
  assert.ok(backend.includes("CartoonEpisode.exists({ seriesTmdbId: tmdbId, seasonNumber: season, episodeNumber: episode, kidsApproved: true })"));
});

test("Roll No. 21 is excluded from every Kids catalog API query", async () => {
  const backend = await read("../src/app.js");
  const catalog = await read("../src/cartoon-catalog.js");

  assert.ok(catalog.includes(String.raw`const ROLL_NO_21_PATTERN = /roll[\s._-]*no\.?[\s._-]*21/i;`));
  assert.ok(catalog.includes("function baseApprovedFilter(extra, yearFilter)"));
  assert.ok(catalog.includes("{ title: ROLL_NO_21_PATTERN }"));
  assert.ok(catalog.includes("{ originalTitle: ROLL_NO_21_PATTERN }"));
  assert.ok(catalog.includes("{ aliases: ROLL_NO_21_PATTERN }"));
  assert.ok(backend.includes("approvedCartoonMovieFilter"));
  assert.ok(backend.includes("approvedCartoonSeriesFilter"));
  assert.equal(backend.includes("approvedCartoonFilter("), false);
});

test("Kids Mode stays in the shared home UI and navigation", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const sidebar = await read("../app/components/site-sidebar.jsx");

  assert.ok(app.includes("import { ArrowUpRight, Baby,"));
  assert.ok(app.includes('const kidsOnlyView = ["home", "cartoons",'));
  assert.ok(!app.includes('router.replace("/")'));
  assert.ok(app.includes('const navigationTab = (kidsMode && !kidsOnlyView) || tab === "cartoons" ? "home" : tab;'));
  assert.ok(app.includes('<CartoonsCatalog view="kidsHome" kidsMode={kidsMode} isSaved={isCartoonSaved}'));
  assert.ok(app.includes('<CartoonsCatalog view={tab} kidsMode={kidsMode} isSaved={isCartoonSaved}'));
  assert.ok(app.includes("kidsMode={kidsMode}"));
  assert.ok(sidebar.includes('{ id: "home", href: "/", label: "Home", icon: House }'));
  assert.equal(sidebar.includes('{ id: "cartoons", href: "/cartoons", label: "Cartoons", icon: Baby }'), false);
  assert.ok(sidebar.includes('{ id: "cartoonMovies", href: "/cartoons/movies", label: "Cartoon Movies", icon: Film }'));
  assert.ok(sidebar.includes('{ id: "cartoonTv", href: "/cartoons/tv", label: "TV Series", icon: Tv }'));
  assert.ok(sidebar.includes("export function SiteWorkspace({ children, kidsMode })"));
  assert.ok(sidebar.includes('fetch("/api/kids-mode"'));
});

test("Kids Home keeps its hero and only one vertical mixed Discover More feed", async () => {
  const cartoons = await read("../app/components/cartoons-catalog.jsx");
  const homeStart = cartoons.indexOf("if (homeView) {");
  const homeEnd = cartoons.indexOf('return (\n    <section className="pb-8 cartoons-listing-catalog"', homeStart);
  const kidsHome = cartoons.slice(homeStart, homeEnd);

  assert.ok(cartoons.includes('className={"movie-card series-card series-card-tv"'));
  assert.ok(cartoons.includes('className="movie-poster"'));
  assert.ok(cartoons.includes('className="rating-pill"'));
  assert.ok(cartoons.includes('className="series-card-meta"'));
  assert.ok(kidsHome.includes("<CartoonSpotlight"));
  assert.equal(kidsHome.includes('className="home-hero-atmosphere"'), false);
  assert.ok(kidsHome.includes('className="home-scroll-feed cartoons-home-feed"'));
  assert.ok(kidsHome.includes("<h2>Discover More</h2>"));
  assert.ok(kidsHome.includes("cartoonFeedItems.slice(0, homeFeedCount)"));
  assert.ok(kidsHome.includes("homeFeedSentinelRef"));
  assert.ok(kidsHome.includes("Scroll to load 5 more cartoons"));
  assert.equal(kidsHome.includes("<CartoonShelf"), false);
  assert.equal(kidsHome.includes("media-row"), false);
  assert.ok(cartoons.includes('const homeView = view === "kidsHome";'));
  assert.ok(cartoons.includes('const mixedView = view === "cartoons";'));
  assert.ok(cartoons.includes('limit: "5"'));
});


test("Cartoons reuse the header search and expose Movie-style badge, Save and Share actions", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const cartoons = await read("../app/components/cartoons-catalog.jsx");
  const backend = await read("../src/app.js");

  assert.ok(!cartoons.includes("catalog-search"));
  assert.ok(!cartoons.includes("setQuery"));
  assert.ok(!cartoons.includes("Search size={16}"));
  assert.equal(cartoons.includes("catalog-toolbar-sort-only"), false);
  assert.equal(cartoons.includes("Random</option>"), false);
  assert.ok(app.includes('className="header-search search-box header-search-trigger"'));
  assert.ok(app.includes('onClick={() => setSearchOpen(true)}'));
  assert.ok(cartoons.includes('catalog-badge-" + catalogBadge.kind'));
  assert.ok(cartoons.includes('className={"save-button" + (saved ? " saved" : "")}'));
  assert.ok(cartoons.includes('className="share-button"'));
  assert.ok(cartoons.includes("onSave?.(item, mediaType)"));
  assert.ok(cartoons.includes("onShare(item, mediaType)"));
  assert.ok(app.includes("isSaved={isCartoonSaved}"));
  assert.ok(app.includes("onSave={toggleSaved}"));
  assert.ok(app.includes("onShare={shareCartoon}"));
  assert.ok(app.includes('kind === "cartoon_movie" || kind === "cartoon_tv"'));
  assert.ok(backend.includes("deriveCartoonBadges"));
  assert.ok(backend.includes("getCartoonPublicBadgeIndex"));
  assert.ok(backend.includes("applyCartoonPublicBadges(movieRows, badgeIndex.movies)"));
  assert.ok(backend.includes("applyCartoonPublicBadges(seriesRows, badgeIndex.series)"));
  assert.ok(backend.includes("CARTOON_BADGE_CACHE_TTL_MS = 5 * 60 * 1000"));
});

test("Cartoon detail and watch routes mount the dedicated components", async () => {
  const series = await read("../app/cartoons/tv/[tmdbId]/page.jsx");
  const movie = await read("../app/cartoons/watch/movie/[tmdbId]/page.jsx");
  const episode = await read("../app/cartoons/watch/tv/[tmdbId]/[seasonNumber]/[episodeNumber]/page.jsx");
  const player = await read("../app/components/cartoon-media-player.jsx");
  assert.match(series, /<SiteWorkspace><CartoonSeriesDetail tmdbId=\{id\} \/><\/SiteWorkspace>/);
  assert.match(movie, /<CartoonMediaPlayer type="movie" tmdbId=\{id\} \/>/);
  assert.match(episode, /<CartoonMediaPlayer type="tv"/);
  assert.match(player, /iframeUrl && sessionId && !error/);
  assert.match(player, /cartoonMoviePlaybackUrl\(tmdbId, resume\)/);
  assert.match(player, /cartoonTvPlaybackUrl\(tmdbId, seasonNumber, episodeNumber, resume\)/);
});

test("Cartoon listing pages use the same responsive catalogue frame and Movie/TV detail/player templates", async () => {
  const [app, catalog, detail, player, css, cartoonsPage, moviesPage, tvPage] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/cartoons-catalog.jsx"),
    read("../app/components/cartoon-series-detail.jsx"),
    read("../app/components/cartoon-media-player.jsx"),
    read("../app/globals.css"),
    read("../app/cartoons/page.jsx"),
    read("../app/cartoons/movies/page.jsx"),
    read("../app/cartoons/tv/page.jsx")
  ]);
  assert.ok(app.includes('"cartoons-catalog-page"'));
  assert.match(cartoonsPage, /view="cartoons"/);
  assert.match(moviesPage, /view="cartoonMovies"/);
  assert.match(tvPage, /view="cartoonTv"/);
  assert.ok(app.includes('CartoonsCatalog view={tab} kidsMode={kidsMode}'));
  assert.ok(catalog.includes('kidsMode ? "SITULA KIDS · FAMILY CATALOGUE" : "SITULA · CARTOON CATALOGUE"'));
  assert.ok(catalog.includes('className="pb-8 cartoons-listing-catalog"'));
  assert.equal(catalog.includes("catalog-toolbar-sort-only"), false);
  assert.equal(catalog.includes("SITULA KIDS · APPROVED CATALOGUE"), false);
  assert.equal(catalog.includes("Random</option>"), false);
  assert.ok(catalog.includes("listingSentinelRef"));
  assert.ok(catalog.includes('limit: "5"'));
  assert.ok(css.includes(".catalog-infinite-sentinel"));
  assert.ok(css.includes("@media (max-width:767px)"));
  for (const token of ["series-detail-page", "tv-detail-page", "series-detail-hero", "series-detail-layout", "series-detail-panel", "episode-guide-grid"]) {
    assert.ok(detail.includes(token), "Cartoon detail uses shared TV detail class " + token);
  }
  for (const token of ["watch-screen", "series-watch-screen", "series-watch-frame", "series-watch-context", "watch-topbar"]) {
    assert.ok(player.includes(token), "Cartoon player uses shared Movie/TV player class " + token);
  }
  assert.ok(player.includes("iframeUrl && sessionId && !error"));
  assert.ok(detail.includes("/api/cartoons/series/"));
  assert.ok(detail.includes("fetch(\"/api/kids-mode\""));
  assert.ok(detail.includes('kidsMode ? "SITULA KIDS · CARTOON TV SERIES" : "SITULA · CARTOON TV SERIES"'));
  assert.ok(detail.includes("setEpisodeNumber"));
  assert.ok(detail.includes("Play episode"));
  assert.ok(detail.includes("Verified episode guide unavailable"));
  assert.ok(detail.includes("!hasEpisodeGuide"));
});

test("advanced search keeps filters tucked away and loads database facets", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const backend = await read("../src/app.js");
  const helper = await read("../src/search-year-options.js");

  assert.ok(app.includes('/api/search/filters?type='));
  assert.ok(app.includes('/api/cartoons/search/filters'));
  assert.ok(app.includes('searchFiltersOpen'));
  assert.ok(app.includes('search-filter-panel'));
  assert.ok(app.includes('searchYears.map((year) => <option'));
  assert.ok(app.includes('searchGenres.map((genre) => <option'));
  assert.ok(app.includes('className="search-filter-field"'));
  assert.ok(app.includes('setSearchType("all")'));
  assert.ok(app.includes('setSearchYear("all")'));
  assert.ok(backend.includes("app.get('/api/search/filters'"));
  assert.ok(backend.includes("app.get('/api/cartoons/search/filters'"));
  assert.ok(backend.includes("catalog.Model.distinct('releaseYear'"));
  assert.ok(backend.includes("catalog.Model.distinct(catalog.dateField"));
  assert.ok(backend.includes("buildSearchYearOptions(values)"));
  assert.ok(backend.includes("'/api/search/*'"));
  assert.ok(backend.includes("(!/^\\d{4}$/.test(yearText)"));
  assert.ok(helper.includes("const sorted = [...years].sort((a, b) => b - a)"));
});

test("Kids Home spotlight uses the shared manual three-card hero without autoplay", async () => {
  const [cartoons, hero] = await Promise.all([
    read("../app/components/cartoons-catalog.jsx"),
    read("../app/components/three-card-hero.jsx")
  ]);
  assert.match(cartoons, /cartoonHeroItems/);
  assert.match(cartoons, /<CartoonSpotlight/);
  assert.match(cartoons, /<ThreeCardHero/);
  assert.doesNotMatch(cartoons, /setInterval\s*\(|heroPaused/);
  assert.match(hero, /Previous featured title/);
  assert.match(hero, /Next featured title/);
  assert.match(hero, /home-hero-deck-slide/);
});


test("Kids search is mode-isolated and rejects stale or non-Cartoon results", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const backend = await read("../src/app.js");
  assert.ok(app.includes("fetch('/api/cartoons/search?' + params.toString()"));
  assert.ok(app.includes("fetch('/api/search?' + params.toString()"));
  assert.ok(app.includes("searchRequestVersion.current"));
  assert.ok(app.includes("requestVersion !== searchRequestVersion.current"));
  assert.ok(app.includes("['cartoon_movie', 'cartoon_tv'].includes(item?.mediaType)"));
  assert.ok(app.includes("['movie', 'tv', 'anime'].includes(item?.mediaType)"));
  assert.ok(app.includes("Only approved cartoon movies and TV series can be opened in Kids Mode."));
  const route = backend.slice(backend.indexOf("app.get('/api/cartoons/search'"), backend.indexOf("app.get('/api/movies/discover'"));
  assert.ok(route.includes("findMatches(CartoonMovie"));
  assert.ok(route.includes("findMatches(CartoonSeries"));
  assert.equal(route.includes("findMatches(Movie"), false);
  assert.equal(route.includes("findMatches(TvSeries"), false);
});


test("the root Home view switches between Normal mixed discovery and Kids mixed Cartoons", async () => {
  const root = await read("../app/page.jsx");
  const router = await read("../app/components/persistent-situla-app.jsx");
  const app = await read("../app/components/situla-app.jsx");

  assert.match(root, /view="home"/);
  assert.ok(router.includes('"/": "home"'));
  assert.ok(app.includes('className="home-mode-panel"') && app.includes('hidden={!kidsModeReady || kidsMode}'));
  assert.ok(app.includes('<div className="kids-mode-panel" hidden={!kidsModeReady || !kidsMode}'));
  assert.ok(app.includes('<CartoonsCatalog view="kidsHome" kidsMode={kidsMode}'));
  assert.ok(app.includes('const isDiscover = (tab === "home" && genre === "All") || tab === "movies";'));
});


test("Kids Mode refresh never renders Normal navigation before the server preference is resolved", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const sidebar = await read("../app/components/site-sidebar.jsx");

  assert.match(app, /<SiteSidebar[\s\S]*?kidsMode=\{kidsMode\}[\s\S]*?modeReady=\{kidsModeReady\}/);
  assert.match(app, /const navigationItems = !kidsModeReady \? \[\] : kidsMode \? KIDS_NAV_ITEMS : NAV_ITEMS;/);
  assert.match(app, /\{kidsModeReady && \([\s\S]*?className=\{\"bottom-nav\"/);
  assert.match(sidebar, /modeReady = true/);
  assert.match(sidebar, /\{modeReady && <nav className=\"home-sidebar-nav site-sidebar-navigation\"/);
  assert.match(sidebar, /\{modeReady && continueItems && <ContinueWatching/);
  assert.match(sidebar, /const \[serverKidsModeReady, setServerKidsModeReady\] = useState\(false\)/);
  assert.match(sidebar, /typeof payload\.enabled === \"boolean\"/);
  assert.match(sidebar, /setServerKidsModeReady\(true\)/);
  assert.match(sidebar, /modeReady=\{activeKidsModeReady\}/);
  assert.match(sidebar, /\{activeKidsModeReady && <nav className=\{\"bottom-nav site-workspace-mobile-nav\"/);
});

test("Kids Mode hydration applies the confirmed mode before revealing navigation", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const loaderStart = app.indexOf("async function loadKidsMode()");
  const loaderEnd = app.indexOf('window.addEventListener("focus", refresh)', loaderStart);
  assert.ok(loaderStart >= 0 && loaderEnd > loaderStart, "Kids Mode loader should exist");
  const loader = app.slice(loaderStart, loaderEnd);
  const applyMode = loader.indexOf("setKidsMode(enabled)");
  const revealShell = loader.indexOf("setKidsModeReady(true)");
  assert.ok(applyMode >= 0 && revealShell > applyMode,
    "the confirmed mode must be committed before navigation/content becomes visible");
});

