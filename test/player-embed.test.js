import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hindiMoviePlayerUrl, normalizeAnimePlayerRoute, normalizeTvPlayerRoute, vidlinkAnimeUrl, vidlinkMovieUrl, vidlinkTvUrl } from "../src/player-urls.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Anime episode route keeps MAL ID, episode and selected audio provider-specific", () => {
  assert.deepEqual(normalizeAnimePlayerRoute("40748", "1", "sub"), {
    malId: 40748,
    episode: 1,
    audio: "sub"
  });
  assert.equal(normalizeAnimePlayerRoute("tt1234567", "1", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("40748", "0", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("40748", "1.5", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("40748", "1", "unknown"), null);
  const anime = new URL(vidlinkAnimeUrl("40748", "1", "sub"));
  assert.equal(anime.origin + anime.pathname, "https://vidlink.pro/anime/40748/1/sub");
  assert.equal(anime.searchParams.get("primaryColor"), "e8b65b");
  assert.equal(anime.searchParams.get("fallback"), "true");
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
  const tv = new URL(vidlinkTvUrl("1399", "2", "8"));
  assert.equal(tv.origin + tv.pathname, "https://vidlink.pro/tv/1399/2/8");
  assert.equal(tv.searchParams.get("primaryColor"), "e8b65b");
  assert.equal(tv.searchParams.get("secondaryColor"), "171a23");
  assert.equal(vidlinkTvUrl("tt1234567", "2", "8"), null);
});

test("TV episode server route validates params and the player has a route-level recovery boundary", async () => {
  const page = await read("../app/watch/tv/[tmdbId]/[season]/[episode]/page.jsx");
  const errorBoundary = await read("../app/watch/tv/[tmdbId]/[season]/[episode]/error.jsx");
  const player = await read("../app/components/media-player.jsx");

  assert.match(page, /normalizeTvPlayerRoute/);
  assert.match(page, /if \(!route\) notFound\(\)/);
  assert.match(errorBoundary, /export default function TvEpisodeError/);
  assert.match(errorBoundary, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(player, /Array\.isArray\(seriesInfo\?\.seasons\)/);
  assert.match(player, /String\(item\.imdbId \|\| ""\)\.toLowerCase\(\)/);
  assert.match(player, /!tvRoute \|\| String\(data\.mediaType/);
});

test("Hindi movie iframe blocks popups and top-level redirects while retaining playback scripts", async () => {
  const moviePlayer = await read("../app/watch/[imdbId]/player.jsx");
  const seriesPlayer = await read("../app/components/media-player.jsx");

  assert.match(moviePlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.match(moviePlayer, /sandbox=\{playerLanguage === "hi" \? "allow-scripts allow-same-origin allow-forms allow-presentation" : undefined\}/);
  assert.doesNotMatch(moviePlayer, /allow-popups|allow-top-navigation/i);
  assert.match(seriesPlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.doesNotMatch(seriesPlayer, /\bsandbox\s*=/i);
});

test("Hindi/English player switch is restricted to the Movie watch page", async () => {
  const moviePlayer = await read("../app/watch/[imdbId]/player.jsx");
  const seriesPlayer = await read("../app/components/media-player.jsx");

  assert.match(moviePlayer, /hindiMoviePlayerUrl/);
  assert.match(moviePlayer, /playerLanguage === "hi"/);
  assert.match(moviePlayer, /Switch to /);
  assert.match(moviePlayer, /situla:movie-player-language:v1/);
  assert.doesNotMatch(seriesPlayer, /slast430did|hindiMoviePlayerUrl/);
});

test("both Movie providers use Situla gold controls without a mute override", () => {
  const english = new URL(vidlinkMovieUrl("tt0133093"));
  const hindi = new URL(hindiMoviePlayerUrl("tt0133093"));

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
});


test("Situla homepage hero rotates through live discovery movies every three seconds", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /setHeroMovies\(uniqueHeroMovies\)/);
  assert.match(app, /setInterval\([\s\S]*?\}, 3000\)/);
  assert.match(app, /heroMovies\[heroIndex % heroMovies\.length\]/);
  assert.match(app, /Previous featured movie/);
  assert.match(app, /Next featured movie/);
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
  assert.match(app, /setInterval\([\s\S]*?\}, 3000\)/);
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
  assert.match(progress, /role="progressbar"/);
  assert.match(progress, /aria-valuenow=\{Math\.round\(safeValue\)\}/);
  assert.match(headless, /ui-card/);
});

test("Movies, TV and Anime choose a different spotlight on refresh and rotate it", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /chooseFreshSpotlight\(uniqueHeroMovies, "situla:spotlight:home"\)/);
  assert.match(app, /chooseFreshSpotlight\(items, "situla:spotlight:movies"\)/);
  assert.match(app, /chooseFreshSpotlight\(items, "situla:spotlight:tv", "tmdbId"\)/);
  assert.match(app, /chooseFreshSpotlight\(items, "situla:spotlight:anime", "malId"\)/);
  assert.match(app, /setInterval\([\s\S]*?\}, 3000\)/);
  assert.match(app, /setCatalogSpotlightItems\(items\)/);
});

test("Situla header keeps the logo with the name, and the theme switch is removed", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const layout = await read("../app/layout.jsx");
  const css = await read("../app/globals.css");

  assert.match(app, /className="brand-lockup"/);
  assert.match(app, /src="\/icon\.svg"/);
  assert.match(app, /DISCOVER MOVIES/);
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


test("Anime VidLink URLs require MAL ID, episode and sub/dub, and request fallback", () => {
  assert.deepEqual(normalizeAnimePlayerRoute("5", "1", "sub"), { malId: 5, episode: 1, audio: "sub" });
  assert.deepEqual(normalizeAnimePlayerRoute(5114, 64, "DUB"), { malId: 5114, episode: 64, audio: "dub" });
  assert.equal(normalizeAnimePlayerRoute("tt1234567", "1", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("0", "1", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("5", "0", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("5", "1.5", "sub"), null);
  assert.equal(normalizeAnimePlayerRoute("5", "1", "raw"), null);

  const sub = new URL(vidlinkAnimeUrl(5, 1, "sub"));
  assert.equal(sub.origin + sub.pathname, "https://vidlink.pro/anime/5/1/sub");
  assert.equal(sub.searchParams.get("fallback"), "true");
  assert.equal(sub.searchParams.get("primaryColor"), "e8b65b");
  assert.equal(sub.searchParams.get("autoplay"), "false");

  const dub = new URL(vidlinkAnimeUrl(5114, 64, "dub", { startAt: 125 }));
  assert.equal(dub.pathname, "/anime/5114/64/dub");
  assert.equal(dub.searchParams.get("fallback"), "true");
  assert.equal(dub.searchParams.get("startAt"), "125");
  const noFallback = new URL(vidlinkAnimeUrl(5, 2, "sub", { fallback: false }));
  assert.equal(noFallback.searchParams.has("fallback"), false);
  assert.equal(vidlinkAnimeUrl(5, 0, "sub"), null);
});

test("Anime episode route validates MAL ID, episode and audio, with an in-player alternate audio action", async () => {
  const page = await read("../app/watch/anime/[malId]/[episode]/[audio]/page.jsx");
  const player = await read("../app/components/media-player.jsx");
  assert.match(page, /normalizeAnimePlayerRoute/);
  assert.match(page, /if \(!route\) notFound\(\)/);
  assert.match(player, /vidlinkAnimeUrl\(animeRoute\.malId, animeRoute\.episode, animeRoute\.audio/);
  assert.match(player, /fallback: true/);
  assert.match(player, /function tryAlternateAnimeAudio/);
  assert.match(player, /Try \{audio === "sub" \? "Dub" : "Sub"\} instead/);
  assert.match(player, /function playNextAnimeEpisode/);
  assert.match(player, /Next episode/);
  assert.match(player, /episodeGuide: Array\.isArray\(payload\.item\.episodeGuide\)/);
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


test("TV player exposes working Next Episode and Next Season navigation from verified season metadata", async () => {
  const player = await read("../app/components/media-player.jsx");
  assert.match(player, /function playNextEpisode\(\)/);
  assert.match(player, /function playNextSeason\(\)/);
  assert.match(player, /router\.push\("\/watch\/tv\/" \+ encodeURIComponent\(tvRoute\.tmdbId\) \+ "\/" \+ Number\(nextSeason\.seasonNumber\) \+ "\/1"\)/);
  assert.match(player, /Next episode[\s\S]*?disabled=\{!nextEpisode \|\| !catalogVerified\}/);
  assert.match(player, /Next season[\s\S]*?disabled=\{!nextSeason \|\| !catalogVerified\}/);
  assert.match(player, /episodeCount\) > 0 && Number\(item\.seasonNumber\) > 0/);
});
