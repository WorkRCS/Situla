import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("TV and Anime initial catalog requests rotate to a random first batch", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const api = await read("../src/app.js");
  assert.match(app, /\/api\/tv\?page=1&limit=40&random=true/);
  assert.match(app, /\/api\/anime\?page=1&limit=40&random=true/);
  assert.match(app, /readRecentCatalogIds\(recentKey\)/);
  assert.match(app, /rememberRecentCatalogIds\(recentKey/);
  assert.match(api, /baseFilter\.imdbId = \{ \$nin: excludedIds, \$regex: IMDB_ID \}/);
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

test("global search interleaves Movies, TV series, and Anime", async () => {
  const api = await read("../src/app.js");
  const app = await read("../app/components/situla-app.jsx");
  assert.match(api, /movies\.map\(\(item\) => \(\{ \.\.\.movieDto\(item\), mediaType: 'movie' \}\)\)/);
  assert.match(api, /shows\.map\(\(item\) => \(\{ \.\.\.tvSeriesDto\(item\), mediaType: 'tv' \}\)\)/);
  assert.match(api, /anime\.map\(\(item\) => \(\{ \.\.\.animeSeriesDto\(item\), mediaType: 'anime' \}\)\)/);
  assert.match(api, /activeGroups.*Math\.random\(\)/s);
  assert.match(app, /className="search-overlay"/);
  assert.match(app, /role="dialog" aria-modal="true"/);
  assert.match(app, /Mixed results · Movies · TV series · Anime/);
  assert.match(app, /View full search page/);
  assert.match(app, /onClick=\{\(\) => setSearchOpen\(true\)\}/);
});

test("catalog loading is bounded and off-screen image/grid work is deferred", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /AbortSignal\.timeout\(20000\)/);
  assert.match(app, /AbortSignal\.timeout\(10000\)/);
  assert.match(app, /loadMoreLock\.current/);
  assert.match(app, /loading="lazy"/);
  assert.match(app, /decoding="async"/);
  assert.match(css, /\.catalog-grid > \* \{[\s\S]*?content-visibility:auto/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(app, /document\.visibilityState !== "visible"/);
  assert.match(app, /\}, 10000\)/);
});

test("seed:catalog runs all three catalog seed commands", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(pkg.scripts["seed:catalog"],
    "npm run seed:movies && npm run seed:tv && npm run seed:anime");
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
  assert.match(app, /function openMovie\(movie, \{ navigate = true \} = \{\}\)/);
  assert.match(app, /function openTvSeries\(series, \{ navigate = true \} = \{\}\)/);
  assert.match(app, /function openAnimeSeries\(series, \{ navigate = true \} = \{\}\)/);
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

test("mobile/tablet navigation uses six balanced iOS-style glass slots and a continuous single-beam shine", async () => {
  const css = await read("../app/globals.css");
  const app = await read("../app/components/situla-app.jsx");
  const bottomNav = app.slice(app.indexOf('<nav className="bottom-nav"'));
  assert.match(bottomNav, /NAV_ITEMS\.filter/);
  assert.match(css, /left:50% !important/);
  assert.match(css, /width:min\(760px,calc\(100% - 24px\)\) !important/);
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
