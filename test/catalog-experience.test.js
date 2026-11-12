import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("opening the search modal closes the account menu without calling an undeclared notifications setter", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /if \(!searchOpen\) return;\s*setAccountOpen\(false\);/);
  assert.doesNotMatch(app, /setNotificationsOpen/);
});

test("Movie discovery falls back when recent exclusions exhaust the catalog and avoids an empty load-more state", async () => {
  const api = await read("../src/app.js");
  const app = await read("../app/components/situla-app.jsx");
  const discoverStart = api.indexOf("app.get('/api/movies/discover'");
  const discoverEnd = api.indexOf("app.get('/api/search'", discoverStart);
  const discover = api.slice(discoverStart, discoverEnd);
  assert.match(discover, /if \(excludedIds\.length && \(!result\.items\?\.length \|\| total === 0\)\)/);
  assert.match(discover, /Movie\.aggregate\(\[\{ \$match: baseFilter \}, \{ \$facet: facets \}\]\)/);
  assert.match(discover, /if \(!result\.items\?\.length && total > 0\)/);
  assert.match(discover, /Movie\.find\(baseFilter\)/);
  assert.match(discover, /featured: result\.featured\?\.length \? result\.featured : \[fallbackItems\[0\]\]/);
  assert.match(app, /if \(isDiscover && !items\.length && \(recentIds\.length > 0 \|\| Number\(payload\.pagination\?\.total\) > 0\)\)/);
  assert.match(app, /fetch\("\/api\/movies\?page=1&limit=10"/);
  assert.match(app, /const hasMoreMovies = movies\.length > 0 && movies\.length < moviesTotal/);
});

test("TV and Anime initial catalog requests rotate to a random first batch", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const api = await read("../src/app.js");
  assert.match(app, /\/api\/tv\?page=1&limit=10&random=true/);
  assert.match(app, /\/api\/anime\?page=1&limit=10&random=true/);
  assert.match(app, /readRecentCatalogIds\(recentKey\)/);
  assert.match(app, /rememberRecentCatalogIds\(recentKey/);
  assert.match(api, /publicFilter\.imdbId = \{ \$nin: excludedIds, \$regex: IMDB_ID \}/);
});

test("TV and Anime load-more requests exclude already visible canonical IDs", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const api = await read("../src/app.js");
  assert.match(app, /exclude: tvShows\.map\(\(item\) => item\.tmdbId\)/);
  assert.match(app, /exclude: animeShows\.map\(\(item\) => item\.malId\)/);
  assert.match(app, /current\.map\(\(item\) => Number\(item\.tmdbId\)\)/);
  assert.match(app, /current\.map\(\(item\) => Number\(item\.malId\)\)/);
  assert.match(app, /rememberRecentCatalogIds\("situla:recent-catalog:tv", nextItems\.map\(\(item\) => item\.tmdbId\)\)/);
  assert.match(app, /rememberRecentCatalogIds\("situla:recent-catalog:anime", nextItems\.map\(\(item\) => item\.malId\)\)/);
  assert.match(app, /rememberRecentCatalogIds\(recentKey, nextItems\.map\(\(item\) => item\.imdbId\)\)/);
  assert.doesNotMatch(app, /current\.map\(\(item\) => item\.imdbId\)/);
  assert.match(api, /randomFilter\.tmdbId = \{ \$nin: excludedIds, \$type: 'number', \$gt: 0 \}/);
  assert.match(api, /randomFilter\.malId = \{ \$nin: excludedIds, \$type: 'number', \$gt: 0 \}/);
  assert.equal((api.match(/\$sample: \{ size: limit \}/g) || []).length, 3);
});

test("global search uses shared type/year filters and direct media navigation", async () => {
  const api = await read("../src/app.js");
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(api, /app\.get\('\/api\/search'/);
  assert.match(api, /buildSearchYearFilter/);
  assert.match(api, /rankSearchResults\(uniqueItems, query\)/);
  assert.match(api, /candidateLimit/);
  assert.match(api, /fuzzyPattern/);
  assert.match(api, /Promise\.allSettled\(\[textTask, partialTask\]\)/);
  assert.match(api, /hasMoreCandidate/);
  assert.match(api, /hasMore/);
  assert.match(app, /className="search-overlay"/);
  assert.match(app, /role="dialog" aria-modal="true"/);
  assert.match(app, /search-type-filters/);
  assert.match(app, /search-year-filter/);
  assert.match(app, /searchInput\.trim\(\)\.length < 3/);
  assert.match(app, /setSearchInput\(event\.target\.value\)/);
  assert.match(app, /loadMoreSearch/);
  assert.match(app, /onClick=\{\(\) => openSearchResult\(item\)\}/);
  assert.match(app, /router\.push\("\/watch\/" \+ encodeURIComponent\(imdbId\)\)/);
  assert.match(app, /router\.push\("\/tv\/" \+ tmdbId\)/);
  assert.match(app, /router\.push\("\/anime\/" \+ encodeURIComponent\(malId\)\)/);
  assert.match(css, /\.search-type-button\.active/);
  assert.match(css, /\.search-year-filter select/);
  assert.doesNotMatch(api, /activeGroups.*Math\.random\(\)/s);
});

test("premium homepage keeps TV and Anime shelves in the server-provided newest-first order", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /const premiumCatalog = accountUser\?\.planId === "premium"/);
  assert.match(app, /const topTvShows = useMemo\(\(\) => premiumCatalog\s*\? homeTvShows\.slice\(0, 20\)/);
  assert.match(app, /const topAnimeShows = useMemo\(\(\) => premiumCatalog\s*\? homeAnimeShows\.slice\(0, 20\)/);
  assert.match(app, /title=\{premiumCatalog \? "Latest TV series" : "Top TV series"\}/);
  assert.match(app, /title=\{premiumCatalog \? "Latest anime series" : "Top anime series"\}/);
});

test("catalog loading is bounded and off-screen image/grid work is deferred", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /AbortSignal\.timeout\(30_000\)/);
  assert.match(app, /AbortSignal\.timeout\(20_000\)/);
  assert.match(app, /loadMoreLock\.current/);
  assert.match(app, /loading="lazy"/);
  assert.match(app, /decoding="async"/);
  assert.match(css, /\.catalog-grid > \* \{[\s\S]*?content-visibility:auto/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(app, /document\.visibilityState !== "visible"/);
  assert.match(app, /\}, 10000\)/);
});

test("seed:catalog runs one offline 2020–2026 catalogue seed command", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(pkg.scripts["seed:catalog"], "node scripts/seed-catalog.js");
  assert.equal(pkg.scripts["seed:movies"], "node scripts/seed-catalog.js --movies");
  assert.equal(pkg.scripts["seed:tv"], "node scripts/seed-catalog.js --tv");
  assert.equal(pkg.scripts["seed:anime"], "node scripts/seed-catalog.js --anime");
  assert.equal(pkg.scripts["seed:catalog:legacy-online"].includes("legacy-online"), true);
});

test("search is rendered above the app through a body portal and uses responsive header controls", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /import \{ createPortal \} from "react-dom"/);
  assert.ok(app.indexOf("createPortal(") > app.indexOf("</header>"));
  assert.match(app, /createPortal\([\s\S]*document\.body/);
  assert.match(app, /className="header-search search-box header-search-trigger"/);
  assert.match(app, /aria-haspopup="dialog"/);
  assert.doesNotMatch(app, /<label className="header-search search-box"/);
  assert.match(css, /@media \(max-width:1100px\)[\s\S]*?\.header-search-trigger[\s\S]*?header-search-label \{ display:none; \}/);
  assert.match(css, /\.search-overlay \{[\s\S]*?z-index:1200/);
});

test("watch title lockup has compact spacing and a restrained responsive size", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /\.watch-topbar \.watch-title \{[\s\S]*?gap:2px/);
  assert.match(css, /\.watch-title h1 \{[\s\S]*?margin:0;[\s\S]*?font-size:clamp\(12px,1\.05vw,15px\)/);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*?\.watch-title h1 \{[\s\S]*?font-size:12px/);
});

test("TV and Anime detail pages share the adaptive cinematic detail system", async () => {
  const tv = await read("../app/tv/[tmdbId]/detail.jsx");
  const anime = await read("../app/anime/[malId]/detail.jsx");
  const css = await read("../app/globals.css");
  for (const source of [tv, anime]) {
    assert.match(source, /series-detail-page/);
    assert.match(source, /series-detail-hero/);
    assert.match(source, /series-detail-layout/);
    assert.match(source, /series-detail-poster/);
    assert.match(source, /series-detail-description/);
    assert.match(source, /series-detail-panel/);
  }
  assert.match(css, /@media \(max-width:767px\)[\s\S]*?\.series-detail-layout \{ grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /@media \(min-width:1500px\)/);
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)/);
});

test("TV and Anime catalogue cards keep metadata but hide synopsis outside detail pages", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const tvDetail = await read("../app/tv/[tmdbId]/detail.jsx");
  const animeDetail = await read("../app/anime/[malId]/detail.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /className=\{"movie-card series-card series-card-" \+ kind\}/);
  assert.match(app, /series-card-category/);
  assert.doesNotMatch(app, /series-card-description|const synopsis = isTv/);
  assert.doesNotMatch(css, /series-card-description/);
  assert.match(tvDetail, /series-detail-description/);
  assert.match(animeDetail, /series-detail-description/);
  assert.match(app, /catalog-page-layout/);
});

test("movie, TV, and Anime cards have direct routes and preserve click metadata without double navigation", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /function movieCardHref\(movie\)/);
  assert.match(app, /"\/watch\/" \+ encodeURIComponent\(imdbId\)/);
  assert.match(app, /function seriesCardHref\(item, kind\)/);
  assert.match(app, /"\/tv\/" \+ tmdbId/);
  assert.match(app, /"\/anime\/" \+ encodeURIComponent\(malId\)/);
  assert.match(app, /<Link[\s\S]*?href=\{href\}[\s\S]*?prefetch=\{false\}/);
  assert.match(app, /onOpen\?\.\(movie, \{ navigate: false \}\)/);
  assert.match(app, /onOpen\?\.\(item, kind, \{ navigate: false \}\)/);
  assert.match(app, /const openMovie = useCallback\(\(movie, \{ navigate = true \} = \{\}\) =>/);
  assert.match(app, /const openTvSeries = useCallback\(\(series, \{ navigate = true \} = \{\}\) =>/);
  assert.match(app, /const openAnimeSeries = useCallback\(\(series, \{ navigate = true \} = \{\}\) =>/);
});


test("TV and Anime series cards both share their poster, title, and canonical detail link", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  const seriesCard = app.slice(app.indexOf("function SeriesCard"), app.indexOf("function CatalogSpotlight"));
  assert.match(seriesCard, /const isAnime = kind === "anime"/);
  assert.match(seriesCard, /if \(!href \|\| \(!isTv && !isAnime\) \|\| sharePreparing\) return/);
  assert.match(seriesCard, /const shareTitle = title \|\| \(isTv \? "TV series" : "Anime"\)/);
  assert.match(seriesCard, /const posterUrl = item\.posterUrl \|\| item\.posterFallbackUrl/);
  assert.match(seriesCard, /\{\(isTv \|\| isAnime\) && href &&/);
  assert.match(seriesCard, /title=\{"Share poster and " \+ \(isTv \? "TV series" : "Anime"\) \+ " link"\}/);
  assert.match(app, /navigator\.canShare\(data\)/);
  assert.match(app, /new File\(\[blob\]/);
  assert.match(app, /navigator\.share\(data\)/);
  assert.match(app, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(app, /"\/anime\/" \+ encodeURIComponent\(malId\)/);
  assert.match(css, /\.series-card-tv \.save-button\{top:8px\}/);
  assert.match(css, /\.series-card-tv \.share-button\{top:47px\}/);
  assert.match(css, /\.series-card-tv \.share-feedback\{top:85px\}/);
});

test("Movie, TV and Anime shares attach poster files and keep exact detail links separate", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const api = await read("../src/app.js");
  const share = app.slice(app.indexOf("const SHARE_POSTER_CACHE_LIMIT"), app.indexOf("const MovieCard"));
  const movie = app.slice(app.indexOf("const MovieCard"), app.indexOf("function SeriesPosterImage"));
  const series = app.slice(app.indexOf("const SeriesCard"), app.indexOf("function CatalogSpotlight"));
  const proxy = api.slice(api.indexOf("async function readSharePosterBytes"), api.indexOf("app.route("));
  assert.match(share, /const data = \{ files: \[file\], title, text: title, url \}/);
  assert.match(share, /navigator\.canShare\(data\)/);
  assert.match(share, /navigator\.share\(data\)/);
  assert.doesNotMatch(share, /Poster:/);
  assert.match(share, /\/api\/share-poster\?url=/);
  assert.match(share, /new File\(\[blob\]/);
  assert.match(movie, /shareMediaCard\(\{ title, href, posterUrl \}\)/);
  assert.match(movie, /onPointerEnter=\{prepareSharePoster\}/);
  assert.match(series, /shareMediaCard\(\{ title: shareTitle, href, posterUrl \}\)/);
  assert.match(series, /item\.posterUrl \|\| item\.posterFallbackUrl/);
  assert.match(series, /onPointerEnter=\{prepareSharePoster\}/);
  assert.match(proxy, /normalizeSharePosterUrl/);
  assert.match(proxy, /detectSharePosterMimeType/);
  assert.match(proxy, /redirect: 'manual'/);
  assert.match(proxy, /SHARE_POSTER_MAX_BYTES/);
  assert.match(proxy, /Content-Type/);
});
 
test("Movie, TV and Anime catalogue cards use the same polished card and badge system", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  const movieCard = app.slice(app.indexOf("const MovieCard"), app.indexOf("function SeriesPosterImage"));
  const seriesCard = app.slice(app.indexOf("const SeriesCard"), app.indexOf("function CatalogSpotlight"));
  const cardStyles = css.slice(css.indexOf("/* Premium catalogue polish:"), css.indexOf("@media(prefers-reduced-motion:reduce)"));
  assert.match(movieCard, /className="movie-card"/);
  assert.match(seriesCard, /className=\{"movie-card series-card series-card-" \+ kind\}/);
  assert.match(movieCard, /catalog-badge catalog-badge-/);
  assert.match(seriesCard, /catalog-badge catalog-badge-/);
  assert.match(cardStyles, /\.movie-card \{[\s\S]*?background:transparent/);
  assert.match(cardStyles, /\.movie-card \.movie-poster \{[\s\S]*?inset 0 1px 0/);
  assert.match(cardStyles, /\.movie-card \.catalog-badge::before \{[\s\S]*?display:none;[\s\S]*?content:none/);
  assert.match(cardStyles, /\.movie-card \.catalog-badge-hot/);
  assert.match(cardStyles, /\.movie-card \.catalog-badge-popular/);
  assert.match(cardStyles, /\.movie-card \.catalog-badge-featured/);
  assert.match(cardStyles, /\.movie-card \.series-card-meta \{[\s\S]*?border:0;[\s\S]*?background:transparent/);
  assert.match(cardStyles, /\.movie-card \.series-card-category/);
  assert.match(cardStyles, /\.movie-card:focus-within/);
  assert.doesNotMatch(cardStyles, /backdrop-filter:blur|background:linear-gradient\(155deg/);
  assert.match(css, /prefers-reduced-motion:reduce[\s\S]*?\.movie-card \.movie-poster img/);
});

test("mobile/tablet bottom navigation has no in-app Back or Search button", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  const bottomNav = app.slice(app.indexOf('<nav className="bottom-nav"'));
  assert.doesNotMatch(bottomNav, /navigateBack|aria-label="Go back|>Back</);
  assert.doesNotMatch(bottomNav, /setSearchOpen|>Search</);
  assert.match(app, /NAV_ITEMS\.filter\(\(item\) => item\.id !== "search"\)\.map/);
  assert.match(app, /className="header-search-wrap"/);
  assert.doesNotMatch(app, /function navigateBack\(/);
  assert.match(css, /\.bottom-nav \{ grid-template-columns:repeat\(6,minmax\(0,1fr\)\);/);
});

test("mobile/tablet navigation is fixed to the viewport bottom with rounded top corners", async () => {
  const css = await read("../app/globals.css");
  const app = await read("../app/components/situla-app.jsx");
  const bottomNav = app.slice(app.indexOf('<nav className="bottom-nav"'));
  assert.match(bottomNav, /NAV_ITEMS\.filter/);
  const dockStyles = css.slice(css.indexOf("/* Mobile and tablet navigation:"));
  assert.match(dockStyles, /\.bottom-nav \{[\s\S]*?position:fixed !important;[\s\S]*?left:0 !important;[\s\S]*?right:0 !important;[\s\S]*?bottom:0 !important;[\s\S]*?width:100% !important;/);
  assert.match(dockStyles, /border-radius:22px 22px 0 0 !important/);
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\) !important/);
  assert.match(css, /-webkit-backdrop-filter:blur\(26px\) saturate\(180%\) !important/);
  assert.doesNotMatch(css, /\.bottom-nav,\.rating-pill,\.save-button/);
  assert.match(css, /animation:premium-glass-sheen-forward 1s linear infinite/);
  assert.match(css, /@keyframes premium-glass-sheen-forward[\s\S]*?translateX\(520%\)/);
  assert.equal((css.match(/animation:premium-glass-sheen-forward/g) || []).length, 1);
});

test("all Situla page text is non-selectable", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /\*, \*::before, \*::after \{[\s\S]*?-webkit-user-select:none !important;[\s\S]*?user-select:none !important;/);
});

test("Settings history cards resume the exact saved movie, TV, or Anime route", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const utility = await read("../src/watch-history.js");
  assert.match(app, /createHistoryResumeTarget\(item\)/);
  assert.match(app, /className="history-resume"/);
  assert.match(app, /onClick=\{\(\) => resumeHistoryItem\(item\)\}/);
  assert.match(app, /localStorage\.setItem\(target\.storageKey/);
  assert.match(app, /router\.push\(target\.href\)/);
  assert.match(utility, /"\/watch\/" \+ encodeURIComponent\(imdbId\)/);
  assert.match(utility, /"\/watch\/tv\/" \+ tmdbId \+ "\/" \+ season \+ "\/" \+ episode/);
  assert.match(utility, /"\/watch\/anime\/" \+ malId \+ "\/" \+ episode \+ "\/" \+ audio/);
});

test("Settings About section credits the ID providers and previews Premium", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /IMDb · TV Series IDs: TMDB · Anime IDs: MyAnimeList/);
  assert.match(app, /href="https:\/\/myanimelist\.net\//);
  assert.match(app, /Powered by the/);
  assert.match(app, /Premium Feature/);
  assert.match(app, /premium-status/);
  assert.match(app, /COMING SOON/);
});

test("TV and Anime cards expose the same Save control as Movie cards and feed one My List", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const seriesCard = app.slice(app.indexOf("function SeriesCard"), app.indexOf("function CatalogSpotlight"));
  assert.match(seriesCard, /onSave\?\.\(item, kind\)/);
  assert.match(seriesCard, /className=\{"save-button" \+ \(saved \? " saved" : ""\)\}/);
  assert.match(seriesCard, /aria-pressed=\{saved\}/);
  assert.match(app, /onSave=\{toggleSaved\} saved=\{savedIds\.has\(savedMediaKey\(item, "tv"\)\)\}/);
  assert.match(app, /onSave=\{toggleSaved\} saved=\{savedIds\.has\(savedMediaKey\(item, "anime"\)\)\}/);
  assert.match(app, /normalizeSavedMediaList\(saved\)/);
  assert.doesNotMatch(app, /savedIds\.has\(featured\.imdbId\)/);
  assert.match(app, /savedMovies\.map\(\(item\) => \{/);
  assert.match(app, /kind === "tv" \? openTvSeries : openAnimeSeries/);
  assert.match(app, /Tap the bookmark on any movie, TV series, or anime to save it here\./);
});

test("saved-media helpers preserve legacy movie saves and toggle TV and Anime independently", async () => {
  const { normalizeSavedMediaList, savedMediaKey, toggleSavedMedia } = await import("../src/saved-media.js");
  const legacyMovie = { imdbId: "tt1234567", title: "Movie" };
  const tv = { tmdbId: 123, title: "Series" };
  const anime = { malId: 123, title: "Anime" };
  let saved = normalizeSavedMediaList([legacyMovie]);
  saved = toggleSavedMedia(saved, tv, "tv");
  saved = toggleSavedMedia(saved, anime, "anime");
  assert.deepEqual(saved.map((item) => savedMediaKey(item)), ["anime:123", "tv:123", "movie:tt1234567"]);
  saved = toggleSavedMedia(saved, tv, "tv");
  assert.deepEqual(saved.map((item) => savedMediaKey(item)), ["anime:123", "movie:tt1234567"]);
});

test("catalog refresh failures retain previously rendered Movie, TV and Anime items", async () => {
  const app = await read("../app/components/situla-app.jsx");
  assert.match(app, /Keep previously rendered posters available during a weak connection/);
  assert.match(app, /if \(tvResult.status === "fulfilled"\) setHomeTvShows\(tvResult.value\)/);
  assert.match(app, /if \(animeResult.status === "fulfilled"\) setHomeAnimeShows\(animeResult.value\)/);
  assert.doesNotMatch(app, /TV and anime picks are temporarily unavailable/);
  assert.doesNotMatch(app, /if \(tab === "tv"\) setTvShows\(\[\]\)/);
  assert.doesNotMatch(app, /else setAnimeShows\(\[\]\)/);
});

test("load-more failures keep current catalog cards and do not surface raw server or timeout messages", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const loadMore = app.slice(app.indexOf("async function loadMore"), app.indexOf("function removeHistoryItem"));
  assert.match(loadMore, /const hasExistingItems = tab === "tv"/);
  assert.match(loadMore, /Your current catalog remains available/);
  assert.doesNotMatch(loadMore, /requestError\.message|setMovies\(\[\]\)|setTvShows\(\[\]\)|setAnimeShows\(\[\]\)/);
});
