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


test("Situla homepage hero rotates through mixed media discovery every three seconds", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /setHeroMovies\(homeMoviePicks\)/);
  assert.match(app, /setInterval\([\s\S]*?\}, 3000\)/);
  assert.match(app, /homeHeroItems\[heroIndex % Math\.max\(1, homeHeroItems\.length\)\]/);
  assert.match(app, /Previous featured title/);
  assert.match(app, /Next featured title/);
  assert.match(app, /onMouseEnter=\{\(\) => setHeroPaused\(true\)\}/);
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
  assert.match(app, /NAV_ITEMS\.filter\(\(item\) => item\.id !== "search"\)/);
  assert.match(app, /className="hero-content"/);
  assert.match(css, /\.hero-card/);
  assert.match(css, /\.hero-progress-fill/);
  assert.match(css, /@media \(max-width: 620px\)/);
});


test("Situla landing keeps the original gold palette and uses a distinct discovery layout", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");

  assert.match(app, /className=\{tab === "home" \? "home-page-layout"/);
  assert.match(app, /className="home-discovery"/);
  assert.match(app, /className="discovery-card discovery-movies"/);
  assert.match(app, /className="discovery-card discovery-tv"/);
  assert.match(app, /className="discovery-card discovery-anime"/);
  assert.match(app, /className="spotlight-strip"/);
  assert.match(css, /--accent:#e8b65b/);
  assert.match(css, /#f7d58b/);
  assert.doesNotMatch(css, /#55b8ff|#69c7ff|#2388ee/);
  assert.match(css, /\.home-discovery-grid/);
  assert.match(css, /\.spotlight-chip\.active/);
});

test("home page auto-advances and lets visitors select a spotlight title", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /setInterval\([\s\S]*?\}, 10000\)/);
  assert.match(app, /onClick=\{\(\) => setHeroIndex\(index\)\}/);
  assert.match(app, /aria-pressed=\{index === heroIndex\}/);
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

test("home and catalog spotlights refresh and rotate across all media types", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /chooseFreshSpotlight\(homeHeroItems, "situla:spotlight:home", "heroId"\)/);
  assert.match(app, /chooseFreshSpotlight\(uniqueHeroMovies, "situla:spotlight:movies"\)/);
  assert.match(app, /chooseFreshSpotlight\(items, "situla:spotlight:tv", "tmdbId"\)/);
  assert.match(app, /chooseFreshSpotlight\(items, "situla:spotlight:anime", "malId"\)/);
  assert.match(app, /mixHomeSpotlight\(\{/);
  assert.match(app, /loadSeries\("\/api\/tv\?page=1&limit=32"/);
  assert.match(app, /loadSeries\("\/api\/anime\?page=1&limit=32"/);
  assert.match(app, /setInterval\([\s\S]*?\}, 3000\)/);
  assert.match(app, /setCatalogSpotlightItems\(items\)/);
  assert.match(app, /\}, 10000\)/);
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
  assert.equal((app.match(/className="catalog-grid"/g) || []).length, 5);
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


test("catalog spotlight component is declared at module scope for every catalogue route", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.ok(app.indexOf("function CatalogSpotlight") < app.indexOf("function MovieShelf"));
  assert.match(app, /function CatalogSpotlight\([\s\S]*?return \([\s\S]*?catalog-spotlight/);
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
  assert.match(player, /function tryAlternateAnimeAudio/);
  assert.match(player, /Try \{audio === "sub" \? "Dub" : "Sub"\} instead/);
  assert.doesNotMatch(player, /episode-picker|Open episode picker|Next Episode|Episode guide|Next season|selectPickerEpisode/);
  assert.match(player, /episodeGuide: Array\.isArray\(payload\.item\.episodeGuide\)/);
  assert.match(player, /id="situla-series-player"/);
  assert.match(player, /attachFullscreenLandscapeLock\(frame\)/);
});

test("Anime catalog is a manually curated MAL list and the seed command uses the offline bulk seeder", async () => {
  const { MANUAL_ANIME_CATALOG } = await import("../data/anime-catalog.js");
  const { NEW_ANIME_CATALOG } = await import("../data/anime-additions.js");
  const script = await read("../scripts/seed-static-catalog.js");
  const animeSeed = await read("../scripts/seed-anime-additions.js");
  const pkg = JSON.parse(await read("../package.json"));
  assert.ok(MANUAL_ANIME_CATALOG.length >= 80);
  assert.equal(NEW_ANIME_CATALOG.length, 200);
  assert.equal(new Set(NEW_ANIME_CATALOG.map((item) => item.malId)).size, 200);
  assert.equal(new Set(MANUAL_ANIME_CATALOG.map((item) => item.malId)).size, MANUAL_ANIME_CATALOG.length);
  assert.ok(MANUAL_ANIME_CATALOG.every((item) => Number.isSafeInteger(item.malId) && item.malId > 0 && ["TV", "ONA"].includes(item.type)));
  assert.equal(pkg.scripts["seed:anime"], "node scripts/seed-anime-additions.js");
  assert.match(animeSeed, /AnimeSeries\.insertMany/);
  assert.doesNotMatch(animeSeed, /bulkWrite|updateOne|findOneAndUpdate|\$set/);
  assert.doesNotMatch(script, /AnimeSeries|MANUAL_ANIME_CATALOG|--anime/);
  assert.match(script, /Model\.bulkWrite/);
  assert.match(script, /\$setOnInsert/);
  assert.doesNotMatch(script, /fetch\(|axios|api\.jikan|api\.tvmaze|api\.themoviedb/i);
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

test("home page omits personal watch-history shelves and shows catalog discovery sections", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.doesNotMatch(app, /title="Continue watching"/);
  assert.doesNotMatch(app, /title="Recently opened"/);
  assert.match(app, /title="Popular series"/);
  assert.match(app, /title="Favorite series"/);
  assert.match(app, /title="Top TV series"/);
  assert.match(app, /title="Top anime series"/);
  assert.match(app, /categoryShelves\.map\(\(category\)/);
  assert.match(app, /title=\{category\.name\}/);
});

test("home series use ranked catalog feeds and mix favorite series across TV and anime", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /loadSeries\("\/api\/tv\?page=1&limit=32"/);
  assert.match(app, /loadSeries\("\/api\/anime\?page=1&limit=32"/);
  assert.match(app, /homeTvShows\.map\(\(item\) => \(\{ \.\.\.item, homeMediaKind: "tv" \}\)\)/);
  assert.match(app, /homeAnimeShows\.map\(\(item\) => \(\{ \.\.\.item, homeMediaKind: "anime" \}\)\)/);
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
  assert.match(app, /function openHomeMovie\(movie, options\)/);
  assert.match(app, /function openHomeSeries\(series, kind, options\)/);
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
