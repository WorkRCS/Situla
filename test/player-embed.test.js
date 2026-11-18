import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hindiMoviePlaybackUrl, normalizeAnimePlayerRoute, normalizeSeriesPlaybackEvent, normalizeTvPlayerRoute, animeSeriesPlaybackUrl, tvSeriesPlaybackUrl, moviePlaybackUrl } from "../src/player-urls.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Anime routes keep MAL ID and episode routing while series playback receives Sub/Dub preferences", () => {
  assert.deepEqual(normalizeAnimePlayerRoute("40748", "1", "sub"), { malId: 40748, episode: 1, audio: "sub" });
  assert.equal(normalizeAnimePlayerRoute("tt1234567", "1", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("40748", "0", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("40748", "1.5", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("40748", "1", "unknown"), null);
  const sub = new URL(animeSeriesPlaybackUrl("40748", "1", "sub"));
  assert.equal(sub.origin + sub.pathname, "https://vidbolt.pro/anime/mal/40748/1");
  assert.equal(sub.searchParams.get("audio"), "Japanese");
  assert.equal(sub.searchParams.get("theme"), "e8b65b");
  assert.equal(sub.searchParams.get("episodesButton"), "true");
  assert.equal(sub.searchParams.get("nextEpisodeButton"), "true");
  const resumedSub = new URL(animeSeriesPlaybackUrl("40748", "1", "sub", 95));
  assert.equal(resumedSub.searchParams.get("startAt"), "95");
  const dub = new URL(animeSeriesPlaybackUrl("5114", "64", "dub"));
  assert.equal(dub.origin + dub.pathname, "https://vidbolt.pro/anime/mal/5114/64");
  assert.equal(dub.searchParams.get("audio"), "en");
  assert.equal(dub.searchParams.get("theme"), "e8b65b");
  assert.equal(dub.searchParams.get("nextEpisodeButton"), "true");
  assert.equal(animeSeriesPlaybackUrl(5, 0, "sub"), null);
  assert.equal(animeSeriesPlaybackUrl(5, 1, "unknown"), null);
});

test("Series playback ready, time, duration and ended events normalize for Situla watch history", () => {
  assert.deepEqual(normalizeSeriesPlaybackEvent({ type: "timeupdate", time: 85 }),
    { event: "timeupdate", currentTime: 85, duration: NaN });
  assert.deepEqual(normalizeSeriesPlaybackEvent({ type: "durationchange", duration: 1440 }),
    { event: "durationchange", currentTime: NaN, duration: 1440 });
  assert.deepEqual(normalizeSeriesPlaybackEvent(JSON.stringify({ type: "ended", time: 1440, duration: 1440 })),
    { event: "ended", currentTime: 1440, duration: 1440 });
  assert.deepEqual(normalizeSeriesPlaybackEvent({ type: "ready" }),
    { event: "ready", currentTime: NaN, duration: NaN });
  assert.equal(normalizeSeriesPlaybackEvent({ type: "unknown" }), null);
  assert.equal(normalizeSeriesPlaybackEvent("not-json"), null);
});

test("TV episode routes normalize numeric TMDB IDs and reject unsafe season or episode params", () => {
  assert.deepEqual(normalizeTvPlayerRoute("1399", "2", "8"), {
    tmdbId: 1399,
    season: 2,
    episode: 8
  });
  assert.equal(normalizeTvPlayerRoute("tt1234567", "2", "8"), null);
  assert.equal(normalizeTvPlayerRoute("0", "2", "8"), null);
  assert.equal(normalizeTvPlayerRoute("1399", "-1", "8"), null);
  assert.equal(normalizeTvPlayerRoute("1399", "2", "0"), null);
  assert.equal(normalizeTvPlayerRoute("1399", "1.5", "2"), null);
  assert.equal(normalizeTvPlayerRoute("999999999999999999", "2", "2"), null);
  const tv = new URL(tvSeriesPlaybackUrl("1399", "2", "8"));
  assert.equal(tv.origin + tv.pathname, "https://vidbolt.pro/tv/1399/2/8");
  assert.equal(tv.searchParams.get("theme"), "e8b65b");
  assert.equal(tv.searchParams.get("title"), "false");
  assert.equal(tv.searchParams.get("nextEpisodeButton"), "true");
  assert.equal(tv.searchParams.get("episodesButton"), "true");
  const resumedTv = new URL(tvSeriesPlaybackUrl("1399", "2", "8", 128));
  assert.equal(resumedTv.searchParams.get("startAt"), "128");
  assert.equal(tvSeriesPlaybackUrl("tt1234567", "2", "8"), null);
});

test("TV episode server route validates params and the player has a route-level recovery boundary", async () => {
  const page = await read("../app/watch/tv/[tmdbId]/[season]/[episode]/page.jsx");
  const errorBoundary = await read("../app/watch/tv/[tmdbId]/[season]/[episode]/error.jsx");
  const player = await read("../app/components/media-player.jsx");

  assert.match(page, /normalizeTvPlayerRoute/);
  assert.match(page, /if \(!route\) notFound\(\)/);
  assert.match(errorBoundary, /export default function TvEpisodeError/);
  assert.match(errorBoundary, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(player, /String\(item\.imdbId \|\| ""\)\.toLowerCase\(\)/);
  assert.match(player, /event\.origin !== SERIES_PLAYBACK_ORIGIN/);
  assert.match(player, /normalizeSeriesPlaybackEvent\(event\.data\)/);
});

test("Hindi movie iframe blocks popups and top-level redirects while retaining playback scripts", async () => {
  const moviePlayer = await read("../app/watch/[imdbId]/player.jsx");
  const seriesPlayer = await read("../app/components/media-player.jsx");

  assert.match(moviePlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.match(moviePlayer, /attachFullscreenLandscapeLock\(frame\)/);
  assert.match(moviePlayer, /sandbox=\{playerLanguage === "hi" \? "allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock" : undefined\}/);
  assert.doesNotMatch(moviePlayer, /allow-popups|allow-top-navigation/i);
  assert.match(seriesPlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.doesNotMatch(seriesPlayer, /\bsandbox\s*=/i);
});

test("Hindi/English player switch is restricted to the Movie watch page", async () => {
  const moviePlayer = await read("../app/watch/[imdbId]/player.jsx");
  const seriesPlayer = await read("../app/components/media-player.jsx");

  assert.match(moviePlayer, /hindiMoviePlaybackUrl/);
  assert.match(moviePlayer, /playerLanguage === "hi"/);
  assert.match(moviePlayer, /Switch to /);
  assert.match(moviePlayer, /situla:movie-player-language:v1/);
  assert.doesNotMatch(seriesPlayer, /slast430did|hindiMoviePlaybackUrl/);
});

test("both Movie providers use Situla gold controls without a mute override", () => {
  const english = new URL(moviePlaybackUrl("tt0133093"));
  const hindi = new URL(hindiMoviePlaybackUrl("tt0133093"));

  for (const url of [english, hindi]) {
    assert.equal(url.searchParams.get("primaryColor"), "e8b65b");
    assert.equal(url.searchParams.get("secondaryColor"), "171a23");
    assert.equal(url.searchParams.get("iconColor"), "ffffff");
    assert.equal(url.searchParams.get("autoplay"), "false");
    assert.equal(url.searchParams.get("muted"), null);
    assert.equal(url.searchParams.get("mute"), null);
  }
  assert.equal(english.pathname, "/movie/tt0133093");
  assert.equal(hindi.pathname, "/play/tt0133093");
  assert.equal(hindi.searchParams.get("id"), null);
  assert.equal(hindi.searchParams.get("muted"), null);
  assert.equal(hindi.searchParams.get("mute"), null);
  assert.equal(hindi.searchParams.get("audio"), null);
  assert.equal(new URL(moviePlaybackUrl("tt0133093", 345)).searchParams.get("startAt"), "345");
  assert.equal(new URL(hindiMoviePlaybackUrl("tt0133093", 345)).searchParams.get("startAt"), "345");
});


test("Situla homepage hero keeps mixed-media refresh selection and uses manual three-card navigation", async () => {
  const [app, hero] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/three-card-hero.jsx")
  ]);
  assert.match(app, /setHeroMovies\(homeMoviePicks\)/);
  assert.match(app, /homeHeroItems\[heroIndex % Math\.max\(1, homeHeroItems\.length\)\]/);
  assert.match(app, /<ThreeCardHero/);
  assert.doesNotMatch(app, /setInterval\([\s\S]*?\}, 3000\)|setHeroPaused/);
  assert.match(hero, /Previous featured title/);
  assert.match(hero, /Next featured title/);
  assert.match(hero, /\[-2, -1, 0, 1, 2\]/);
});

test("catalog pages do not render aggregate movie, series, saved-list or history counts", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const anime = await read("../app/anime/[malId]/detail.jsx");
  const tv = await read("../app/tv/[tmdbId]/detail.jsx");

  assert.match(tv, /TV SERIES · TMDB/);
  assert.doesNotMatch(tv, /TV SERIES · IMDb/);
  assert.doesNotMatch(app, /\{movies\.length\}\s*\/\s*\{/);
  assert.doesNotMatch(app, /\{tvShows\.length\}\s*\/\s*\{/);
  assert.doesNotMatch(app, /\{animeShows\.length\}\s*\/\s*\{/);
  assert.doesNotMatch(app, /\{savedMovies\.length\}\s+SAVED/i);
  assert.doesNotMatch(app, /Showing \{movies\.length\} of \{moviesTotal\}/);
  assert.doesNotMatch(app, /\{sortedHistory\.length\}\s+entries/i);
  assert.doesNotMatch(anime, /\{anime\.episodes\s*\|\|\s*["']\?["']\}\s+episodes/i);
  assert.match(tv, /series\.numberOfEpisodes > 0/);
});

test("landing page exposes primary navigation and cinematic responsive hero styles", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /className="desktop-nav"/);
  assert.match(app, /navigationItems\.filter\(\(item\) => item\.id !== "search"\)/);
  assert.match(app, /className="hero-content"/);
  assert.match(css, /\.hero-card/);
  assert.match(css, /\.hero-progress-fill/);
  assert.match(css, /@media \(max-width: 620px\)/);
});


test("Situla Home renders a Hero followed by one vertical mixed Discover More grid", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const cartoons = await read("../app/components/cartoons-catalog.jsx");
  const css = await read("../app/globals.css");
  const normalStart = app.indexOf('className="home-mode-panel"');
  const normalEnd = app.indexOf('className="kids-mode-panel"', normalStart);
  const normalHome = app.slice(normalStart, normalEnd);
  const kidsStart = cartoons.indexOf('if (homeView) {\n    const featured = cartoonHeroItems');
  const kidsEnd = cartoons.indexOf('return (\n    <section className="pb-8 cartoons-listing-catalog"', kidsStart);
  const kidsHome = cartoons.slice(kidsStart, kidsEnd);

  assert.match(app, /className=\{\(tab === "home" \? "home-page-layout"/);
  assert.match(normalHome, /className="hero-card home-hero-card"/);
  assert.match(normalHome, /className="home-scroll-feed"/);
  assert.match(normalHome, /<h2>Discover More<\/h2>/);
  assert.match(normalHome, /homeBrowseItems\.slice\(0, homeFeedCount\)/);
  assert.doesNotMatch(normalHome, /HomeMixedShelf|MixedSeriesShelf|<SeriesShelf|<MovieShelf|home-genre-row|home-discovery|home-hero-peeks/);
  assert.match(kidsHome, /<CartoonSpotlight/);
  assert.match(kidsHome, /className="home-scroll-feed cartoons-home-feed"/);
  assert.match(kidsHome, /<h2>Discover More<\/h2>/);
  assert.match(kidsHome, /cartoonFeedItems\.slice\(0, homeFeedCount\)/);
  assert.doesNotMatch(kidsHome, /<CartoonShelf|media-row/);
  assert.match(css, /--accent:#e8b65b/);
  assert.match(css, /#f7d58b/);
  assert.doesNotMatch(css, /#55b8ff|#69c7ff|#2388ee/);
  assert.doesNotMatch(css, /\.home-hero-atmosphere/);
  assert.doesNotMatch(css, /filter:blur\(46px\) saturate\(1\.45\)/);
  assert.doesNotMatch(css, /filter:blur\(22px\) saturate\(1\.28\)/);
  assert.match(css, /\.home-hero-deck-track\.is-next/);
});

test("Home heroes are manual-only three-card carousels with no preview rails or autoplay", async () => {
  const [app, cartoons, hero] = await Promise.all([
    read("../app/components/situla-app.jsx"),
    read("../app/components/cartoons-catalog.jsx"),
    read("../app/components/three-card-hero.jsx")
  ]);
  assert.match(app, /<ThreeCardHero/);
  assert.match(cartoons, /<ThreeCardHero/);
  assert.doesNotMatch(app, /setHeroPaused|setInterval\([\s\S]*?\}, 3000\)/);
  assert.doesNotMatch(cartoons, /heroPaused|setInterval\s*\(/);
  assert.match(hero, /Previous featured title/);
  assert.match(hero, /Next featured title/);
  assert.match(hero, /\[-2, -1, 0, 1, 2\]/);
  assert.doesNotMatch(hero, /setInterval\s*\(/);
  assert.doesNotMatch(app, /home-hero-peeks|previewIndex/);
});


test("watch history renders an accessible progress meter inside each history card", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const progress = await read("../app/components/ui/progress.jsx");
  const headless = await read("../app/components/ui/card.jsx");

  assert.match(app, /<Card className="history-card">/);
  assert.match(app, /<Disclosure defaultOpen>/);
  assert.match(app, /<DisclosureButton className="history-collapse"/);
  assert.match(app, /<Progress value=\{progress\} ariaLabel=/);
  assert.match(app, /history-time-labels/);
  assert.match(app, /history-type-chip/);
  assert.match(app, /history-progress-heading/);
  assert.match(app, /history-resume-action/);
  assert.match(progress, /role="progressbar"/);
  assert.match(progress, /aria-valuenow=\{Math\.round\(safeValue\)\}/);
  assert.match(headless, /ui-card/);
});

test("Home content refreshes remain dynamic while catalog listing pages are hero-free", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const cartoons = await read("../app/components/cartoons-catalog.jsx");
  assert.match(app, /chooseFreshSpotlight\(homeHeroItems, "situla:spotlight:home", "heroId"\)/);
  assert.match(app, /mixHomeSpotlight\(\{/);
  assert.match(app, /new URLSearchParams\(\{ page: "1", limit: "60" \}\)/);
  assert.doesNotMatch(app, /new URLSearchParams\(\{ page: "1", limit: "36", random: "true" \}\)/);
  assert.match(app, /loadSeries\("tv"\)/);
  assert.match(app, /loadSeries\("anime"\)/);
  assert.match(app, /setHeroMovies\(homeMoviePicks\)/);
  assert.match(app, /random=true/);
  assert.match(app, /excludeQuery/);
  assert.match(cartoons, /fetch\("\/api\/cartoons\/home\?seed="/);
  assert.match(cartoons, /setSort\("random"\)/);
  assert.match(cartoons, /situla:kids:home-spotlight:v1/);
  assert.doesNotMatch(app, /CatalogSpotlight|catalogSpotlight/);
  assert.doesNotMatch(app, /setInterval\([\s\S]*?\}, 3000\)|\}, 10000\)/);
  assert.doesNotMatch(cartoons, /setInterval\s*\(/);
});

test("Situla header keeps the logo with the name, and the theme switch is removed", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const layout = await read("../app/layout.jsx");
  const css = await read("../app/globals.css");

  assert.match(app, /className="brand-lockup"/);
  assert.match(app, /src="\/icon\.svg"/);
  assert.match(app, /DISCOVER STORIES/);
  assert.doesNotMatch(app, /themeMode|themeReady|themeMenuOpen|theme-switcher/);
  assert.match(layout, /data-theme="dark"/);
  assert.doesNotMatch(css, /data-theme="light"/);
});

test("mobile navigation is attached to the viewport and catalog grids are compact", async () => {
  const css = await read("../app/globals.css");
  const app = await read("../app/components/situla-app.jsx");

  assert.match(css, /\.bottom-nav \{[\s\S]*?left:0;[\s\S]*?right:0;[\s\S]*?bottom:0;/);
  assert.match(css, /transform:none !important/);
  assert.match(css, /\.catalog-grid \{[\s\S]*?repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(min-width:600px\) and \(max-width:1100px\)[\s\S]*?repeat\(4,minmax\(0,1fr\)\)/);
  assert.equal((app.match(/className="catalog-grid"/g) || []).length, 6);
});

test("React UI stack uses Headless UI and local shadcn primitives without importing Svelte Bits UI", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const pkg = JSON.parse(await read("../package.json"));
  const config = JSON.parse(await read("../components.json"));
  const button = await read("../app/components/ui/button.jsx");
  const badge = await read("../app/components/ui/badge.jsx");

  assert.match(app, /from "@headlessui\/react"/);
  assert.match(app, /from "\.\/ui\/button\.jsx"/);
  assert.match(app, /from "\.\/ui\/card\.jsx"/);
  assert.equal(pkg.dependencies["@headlessui/react"] !== undefined, true);
  assert.equal(pkg.dependencies["class-variance-authority"] !== undefined, true);
  assert.equal(config.tailwind.css, "app/globals.css");
  assert.match(button, /buttonVariants/);
  assert.match(badge, /badgeVariants/);
  assert.doesNotMatch(app, /from ["']bits-ui["']/);
});


test("shared three-card Home hero is declared at module scope and catalogue routes omit spotlight", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const hero = await read("../app/components/three-card-hero.jsx");
  assert.ok(app.indexOf('import ThreeCardHero from "./three-card-hero.jsx"') >= 0);
  assert.ok(hero.indexOf("export default function ThreeCardHero") >= 0);
  assert.match(hero, /home-hero-deck/);
  assert.doesNotMatch(app, /function CatalogSpotlight|<CatalogSpotlight|catalogSpotlight/);
});

test("AnimeSeries declares its unique MAL index only once", async () => {
  const models = await read("../src/models.js");
  assert.match(models, /malId: \{ type: Number, required: true, unique: true, min: 1 \}/);
  assert.doesNotMatch(models, /animeSeriesSchema\.index\(\{\s*malId:\s*1\s*\},\s*\{\s*unique:\s*true\s*\}\)/);
});


test("bottom navigation is visible on touch layouts and hidden on desktop", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /@media \(min-width:1101px\)\s*\{\s*\.bottom-nav\s*\{\s*display:none !important;/);
  assert.match(css, /@media \(max-width:599px\)[\s\S]*?\.bottom-nav/);
  assert.match(css, /@media \(min-width:600px\) and \(max-width:1100px\)/);
});


test("Anime embed keeps Situla MAL/episode/audio routes and uses its configured origin", async () => {
  const page = await read("../app/watch/anime/[malId]/[episode]/[audio]/page.jsx");
  const player = await read("../app/components/media-player.jsx");
  assert.match(page, /normalizeAnimePlayerRoute/);
  assert.match(page, /if \(!route\) notFound\(\)/);
  assert.match(player, /animeSeriesPlaybackUrl\(animeRoute\.malId, animeRoute\.episode, animeRoute\.audio, startAt\)/);
  assert.match(player, /event\.origin !== SERIES_PLAYBACK_ORIGIN/);
  assert.match(player, /normalizeSeriesPlaybackEvent\(event\.data\)/);
  assert.doesNotMatch(player, /function tryAlternateAnimeAudio/);
  assert.doesNotMatch(player, /Try \{audio === "sub" \? "Dub" : "Sub"\} instead/);
  assert.doesNotMatch(player, /episode-picker|Open episode picker|Next Episode|Episode guide|Next season|selectPickerEpisode/);
  assert.match(player, /episodeGuide: Array\.isArray\(payload\.item\.episodeGuide\)/);
  assert.match(player, /id="situla-series-player"/);
  assert.match(player, /attachFullscreenLandscapeLock\(frame\)/);
});

test("Anime catalog has canonical MAL IDs and all catalogue imports run through one seed command", async () => {
  const { MANUAL_ANIME_CATALOG } = await import("../data/anime-catalog.js");
  const { NEW_ANIME_CATALOG } = await import("../data/anime-additions.js");
  const catalogImport = await read("../scripts/catalog-import.js");
  const runner = await read("../scripts/seed.js");
  const marketRefresh = await read("../scripts/refresh-catalog-market-data.js");
  const pkg = JSON.parse(await read("../package.json"));
  assert.ok(MANUAL_ANIME_CATALOG.length >= 80);
  assert.equal(NEW_ANIME_CATALOG.length, 201);
  assert.equal(new Set(NEW_ANIME_CATALOG.map((item) => item.malId)).size, 201);
  assert.equal(new Set(MANUAL_ANIME_CATALOG.map((item) => item.malId)).size, MANUAL_ANIME_CATALOG.length);
  assert.ok(MANUAL_ANIME_CATALOG.every((item) => Number.isSafeInteger(item.malId) && item.malId > 0 && ["TV", "ONA"].includes(item.type)));
  assert.equal(pkg.scripts.seed, "node scripts/seed.js");
  assert.equal(pkg.scripts["seed:cartoons"], "node scripts/seed-cartoons.js");
  assert.equal(Object.keys(pkg.scripts).filter((key) => key.startsWith("seed:")).length, 1);
  assert.match(runner, /seedOfflineCatalog/);
  assert.match(runner, /seedMovieAdditions/);
  assert.match(runner, /seedTvSeries/);
  assert.match(runner, /refreshCatalogMarketData/);
  assert.match(catalogImport, /AnimeSeries/);
  assert.match(catalogImport, /\.insertMany\(pending/);
  assert.doesNotMatch(catalogImport, /fetch\(|axios|api\.jikan|api\.tvmaze|api\.themoviedb/i);
  assert.match(marketRefresh, /graphql\.anilist\.co/);
});


test("Watch pages delegate episode selection to the embedded iframe player", async () => {
  const seriesPlayer = await read("../app/components/media-player.jsx");
  const moviePlayer = await read("../app/watch/[imdbId]/player.jsx");
  const playerUrls = await read("../src/player-urls.js");

  assert.doesNotMatch(seriesPlayer, /episode-picker|Open episode picker|Next Episode|Episode guide|Next season|selectPickerEpisode/);
  assert.doesNotMatch(moviePlayer, /episode-picker|Open episode picker|Next Episode|Episode guide|Next season/);
  assert.ok(seriesPlayer.includes("<iframe") && seriesPlayer.includes("src={playerUrl}"));
  assert.ok(seriesPlayer.includes("tvSeriesPlaybackUrl(tvRoute.tmdbId, tvRoute.season, tvRoute.episode, startAt)"));
  assert.ok(seriesPlayer.includes("animeSeriesPlaybackUrl(animeRoute.malId, animeRoute.episode, animeRoute.audio, startAt)"));
  assert.ok(playerUrls.includes('url.searchParams.set("episodesButton", "true")'));
  assert.ok(playerUrls.includes('url.searchParams.set("nextEpisodeButton", "true")'));
});

test("Home contains no horizontal shelves: Normal and Kids modes each use one vertical feed", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const cartoons = await read("../app/components/cartoons-catalog.jsx");
  const normalStart = app.indexOf('className="home-mode-panel"');
  const normalEnd = app.indexOf('className="kids-mode-panel"', normalStart);
  const normalHome = app.slice(normalStart, normalEnd);
  const kidsStart = cartoons.indexOf('if (homeView) {\n    const featured = cartoonHeroItems');
  const kidsEnd = cartoons.indexOf('return (\n    <section className="pb-8 cartoons-listing-catalog"', kidsStart);
  const kidsHome = cartoons.slice(kidsStart, kidsEnd);

  assert.doesNotMatch(normalHome, /title="Continue watching"|title="Recently opened"/);
  assert.match(normalHome, /<h2>Discover More<\/h2>/);
  assert.match(normalHome, /homeBrowseItems\.slice\(0, homeFeedCount\)/);
  assert.doesNotMatch(normalHome, /title="Popular series"|title="Audience favourites"|homeCategoryShelves\.map/);
  assert.match(kidsHome, /<h2>Discover More<\/h2>/);
  assert.match(kidsHome, /cartoonFeedItems\.slice\(0, homeFeedCount\)/);
  assert.doesNotMatch(kidsHome, /<CartoonShelf|media-row/);
});

test("home series use ranked catalog feeds and mix favorite series across TV and anime", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /loadSeries\("tv"/);
  assert.match(app, /loadSeries\("anime"/);
  assert.match(app, /tv: homeTvShows,/);
  assert.match(app, /anime: homeAnimeShows/);
  assert.match(app, /const homeCollections = useMemo\(\(\) => buildHomeCollections\(/);
  assert.match(app, /favoriteSeriesItems/);
  assert.match(app, /popularSeriesItems/);
  assert.match(app, /favoriteSeriesItems/);
  assert.match(app, /popularSeriesItems/);
});

test("home movie, TV, anime and hero clicks provide item-level loading feedback", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /pendingHomeNavigation/);
  assert.match(app, /media-loading-overlay/);
  assert.match(app, /aria-busy=\{navigating\}/);
  assert.match(app, /hero-route-loading/);
  assert.match(app, /Opening…/);
  assert.match(app, /const openHomeMovie = useCallback\(\(movie, options\) =>/);
  assert.match(app, /const openHomeSeries = useCallback\(\(series, kind, options\) =>/);
  assert.match(app, /router\.prefetch\("\/watch\/" \+ encodeURIComponent\(imdbId\)\)/);
  assert.match(app, /prefetchHomeSpotlight\(featured\)/);
  assert.match(css, /@keyframes situla-button-spin/);
  assert.match(css, /\.media-loading-overlay/);
});

test("desktop homepage hero stays compact without changing the gold palette", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /@media \(min-width:1101px\)[\s\S]*?\.home-page-layout \.hero-card[\s\S]*?min-height:clamp\(340px,43vh,460px\)/);
  assert.match(css, /--accent:#e8b65b/);
  assert.match(css, /#f7d58b/);
});


test("Home and catalog headers share one search trigger without an inline catalog selector", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  const headerStart = app.indexOf('<div className="header-actions">');
  const accountStart = app.indexOf('<div className="header-account-wrap">', headerStart);
  const headerActions = app.slice(headerStart, accountStart);

  assert.ok(headerActions.includes('className="header-search-wrap"'));
  assert.ok(headerActions.includes("<Search"));
  assert.ok(headerActions.includes("setSearchOpen(true)"));
  assert.ok(headerActions.indexOf("header-search-wrap") < headerActions.indexOf("<Search"));
  assert.doesNotMatch(app, /home-media-type|home-search-filter|home-search-control/);
  assert.match(css, /@media \(max-width:767px\)[\s\S]*?header-search-label \{ display:none; \}/);
});

test("Sidebar collapse updates the parent grid and persists between routes", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const sidebar = await read("../app/components/site-sidebar.jsx");
  const css = await read("../app/globals.css");

  assert.match(app, /onCollapsedChange=\{setSidebarCollapsed\}/);
  assert.match(app, /sidebarCollapsed \? " is-sidebar-collapsed" : ""/);
  assert.match(sidebar, /localStorage\.setItem\("situla:sidebar-collapsed:v1"/);
  assert.match(sidebar, /onCollapsedChange\?\.\(collapsed\)/);
  assert.match(sidebar, /site-workspace" \+ \(sidebarCollapsed \? " is-sidebar-collapsed"/);
  assert.match(css, /\.home-page-layout\.is-sidebar-collapsed/);
  assert.match(css, /\.site-workspace\.is-sidebar-collapsed/);
  assert.doesNotMatch(css, /:has\(> \.site-sidebar\.is-collapsed\)/);
});


test("sidebar routes share the exact existing seven-item mobile navigation bar", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const sidebar = await read("../app/components/site-sidebar.jsx");
  const css = await read("../app/globals.css");

  assert.ok(app.includes('import { SITE_KIDS_MOBILE_NAV_ITEMS, SITE_MOBILE_NAV_ITEMS, SiteSidebar } from "./site-sidebar.jsx"'));
  assert.ok(app.includes("(kidsMode ? SITE_KIDS_MOBILE_NAV_ITEMS : SITE_MOBILE_NAV_ITEMS).map((item) =>"));
  assert.ok(sidebar.includes("export const SITE_MOBILE_NAV_ITEMS = SITE_NAV_ITEMS"));
  assert.ok(sidebar.includes('filter((item) => item.id !== "profile")'));
  assert.ok(sidebar.includes('className={"bottom-nav site-workspace-mobile-nav" + (activeKidsMode ? " is-kids-nav" : "")}'));
  assert.ok(sidebar.includes('className={"nav-button site-workspace-mobile-link"'));
  assert.ok(css.includes("grid-template-columns:repeat(7,minmax(0,1fr)) !important"));
  assert.ok(css.includes("border-radius:22px 22px 0 0 !important"));
  assert.ok(css.includes("bottom:0 !important"));
  assert.ok(css.includes("width:100% !important"));
  assert.ok(css.includes(".bottom-nav,.site-workspace-mobile-nav { display:grid !important; }"));
  assert.ok(css.includes(".site-workspace-mobile-nav { display:none !important; }"));
});

test("header account and search controls use a clean, consistent icon treatment", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /\.header-avatar-trigger \{\s*border:0;/);
  assert.match(css, /\.header-avatar-initials \{\s*border:1px solid/);
  assert.match(css, /\.header-notification-trigger \{\s*border-color:rgba\(255,255,255/);
  assert.match(css, /\.site-app-header \.header-search-trigger \{\s*border:1px solid/);
  assert.match(css, /@media \(min-width:768px\) and \(max-width:1100px\)[\s\S]*?header-search-label \{ display:none !important; \}/);
  assert.match(css, /@media \(max-width:767px\)[\s\S]*?header-search-label \{ display:none !important; \}/);
});

test("catalog load-more failures remain visible and can be retried without losing current titles", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /const \[loadMoreError, setLoadMoreError\] = useState\(""\)/);
  assert.match(app, /setLoadMoreError\(statusMessage\)/);
  assert.match(app, /if \(!nextItems\.length\) throw new Error\("No additional movies were returned/);
  assert.match(app, /if \(!nextItems\.length\) throw new Error\("No additional TV series were returned/);
  assert.match(app, /if \(!nextItems\.length\) throw new Error\("No additional Anime titles were returned/);
  assert.equal((app.match(/catalog-load-more-error/g) || []).length, 1);
  assert.equal((app.match(/ref=\{catalogLoadSentinelRef\}/g) || []).length, 4);
  assert.equal((app.match(/aria-busy=\{loadingMore\}/g) || []).length, 0);
  assert.equal((app.match(/limit: "5"/g) || []).length, 2);
  assert.match(app, /loadMoreLock\.current = false/);
  assert.match(css, /\.catalog-load-more-error/);
  assert.match(css, /\.catalog-load-spinner/);
});


test("Cartoon Movie and TV embeds use the configured VidBolt TMDB routes", async () => {
  const { cartoonMoviePlaybackUrl, cartoonTvPlaybackUrl } = await import("../src/player-urls.js");
  const movie = new URL(cartoonMoviePlaybackUrl("12345"));
  const episode = new URL(cartoonTvPlaybackUrl("23456", 2, 7));
  assert.equal(movie.origin + movie.pathname, "https://vidbolt.pro/movie/12345");
  assert.equal(movie.searchParams.get("theme"), "e8b65b");
  assert.equal(episode.origin + episode.pathname, "https://vidbolt.pro/tv/23456/2/7");
  assert.equal(episode.searchParams.get("nextEpisodeButton"), "true");
});

test("Cartoon playback APIs retain same-origin credentials and never call account logout", async () => {
  const cartoonPlayer = await read("../app/components/cartoon-media-player.jsx");
  for (const endpoint of ["/api/playback/start", "/api/playback/heartbeat", "/api/playback/stop"]) {
    const requestStart = cartoonPlayer.indexOf('fetch("' + endpoint + '"');
    assert.notEqual(requestStart, -1, endpoint + " request must exist");
    const requestBlock = cartoonPlayer.slice(requestStart, requestStart + 400);
    assert.match(requestBlock, /credentials: "same-origin"/, endpoint + " must include the Situla login cookie");
  }
  assert.equal(cartoonPlayer.includes("/api/auth/logout"), false);
  assert.doesNotMatch(cartoonPlayer, /revokeCurrentSession|clearAuthCookies/);
});
