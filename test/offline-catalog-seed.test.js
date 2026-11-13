import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STATIC_MOVIES } from "../data/movie-catalog.js";
import { MANUAL_MOVIES_2020_2026 } from "../data/movie-curated-2020-2026.js";
import { STATIC_TV_SERIES } from "../data/tv-catalog.js";
import { TV_SERIES_CANDIDATES } from "../data/tv-additions.js";
import { MANUAL_TV_SERIES_2020_2026 } from "../data/tv-curated-2020-2026.js";
import { NEW_ANIME_CATALOG } from "../data/anime-additions.js";
import {
  CATALOG_YEAR_END,
  CATALOG_YEAR_START,
  catalogReleaseYear,
  prepareOfflineCatalog,
  validateOfflineAnime,
  validateOfflineMovie,
  validateOfflineTv
} from "../scripts/catalog-import.js";
import { calculateDecayedTrendScore, getCatalogBadge } from "../src/catalog-popularity.js";
import { calculateVoteVelocity7d, chooseTvmazeMatch } from "../scripts/refresh-catalog-market-data.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("one unified seed command runs curated imports, public metadata discovery and market refresh in order", async () => {
  const script = await read("../scripts/catalog-import.js");
  const runner = await read("../scripts/seed.js");
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(CATALOG_YEAR_START, 2020);
  assert.equal(CATALOG_YEAR_END, 2026);
  assert.equal(pkg.scripts.seed, "node scripts/seed.js");
  assert.equal(Object.keys(pkg.scripts).filter((key) => key.startsWith("seed:")).length, 0);
  assert.match(runner, /seedOfflineCatalog/);
  assert.match(runner, /seedMovieAdditions/);
  assert.match(runner, /seedTvSeries/);
  assert.match(runner, /refreshCatalogMarketData/);
  assert.match(runner, /process\.argv/);
  assert.doesNotMatch(runner, /deleteMany|deleteOne|dropCollection/i);
  assert.doesNotMatch(script, /fetch\s*\(|axios|api\.themoviedb|api\.tvmaze|cinemeta/i);
  assert.match(script, /\.insertMany\(pending/);
  assert.match(script, /TvSeries/);
  assert.match(script, /AnimeSeries/);
  assert.doesNotMatch(script, /isPopular/);
  assert.doesNotMatch(await read("../data/movie-curated-2020-2026.js"), /isPopular/);
  assert.doesNotMatch(await read("../data/tv-curated-2020-2026.js"), /isPopular/);
});

test("canonical catalogue keys and complete-content validators remain separate", () => {
  assert.equal(validateOfflineMovie({
    imdbId: "tt1234567", title: "Example", originalTitle: "Example",
    overview: "A complete plot summary for this example title that comfortably exceeds the eighty character minimum.",
    posterUrl: "https://images.example/poster.jpg", backdropUrl: "https://images.example/backdrop.jpg",
    releaseDate: "2022-01-01", releaseYear: 2022, runtime: 100, genres: ["Drama"],
    cast: [{ name: "Actor" }], directors: ["Director"], adult: false,
    sourceUrl: "https://www.imdb.com/title/tt1234567/"
  }), true);
  assert.equal(validateOfflineTv({
    tmdbId: 12, title: "Example Series",
    overview: "A complete plot summary with more than eighty characters for the example television series.",
    posterUrl: "https://images.example/poster.jpg", backdropUrl: "https://images.example/backdrop.jpg",
    firstAirDate: "2022-01-01", releaseYear: 2022, adult: false, genres: ["Drama"],
    numberOfSeasons: 1, numberOfEpisodes: 1,
    seasons: [{ seasonNumber: 1, episodeCount: 1, episodes: [{
      episodeNumber: 1, name: "Pilot", stillUrl: "https://images.example/still.jpg"
    }]}]
  }), true);
  assert.equal(validateOfflineAnime({
    malId: 13, title: "Example Anime", titleEnglish: "Example Anime",
    synopsis: "A complete plot summary with more than eighty characters for the example anime title.",
    posterUrl: "https://images.example/poster.jpg", posterFallbackUrl: "https://images.example/fallback.jpg",
    bannerUrl: "https://images.example/banner.jpg", backdropUrl: "https://images.example/backdrop.jpg",
    releaseYear: 2022, episodes: 1, genres: ["Drama"], rating: "pg_13",
    malUrl: "https://myanimelist.net/anime/13",
    episodeGuide: [{ seasonNumber: 1, episodeNumber: 1, title: "Pilot", imageUrl: "https://images.example/still.jpg" }]
  }), true);
  assert.throws(() => validateOfflineMovie({ imdbId: "tt1234567" }), /title/);
  assert.throws(() => validateOfflineTv({ tmdbId: 12, title: "No guide" }), /synopsis/);
  assert.throws(() => validateOfflineAnime({ malId: 13, title: "No guide" }), /synopsis/);
});

test("year helper reads canonical date fields without changing canonical IDs", () => {
  assert.equal(catalogReleaseYear({ releaseDate: "2020-03-01" }, "movie"), 2020);
  assert.equal(catalogReleaseYear({ firstAirDate: "2021-04-01" }, "tv"), 2021);
  assert.equal(catalogReleaseYear({ airedFrom: "2022-05-01" }, "anime"), 2022);
  assert.ok(STATIC_MOVIES.every((item) => /^tt\d{5,12}$/.test(item.imdbId)));
  assert.equal(MANUAL_MOVIES_2020_2026.length, 38);
  assert.ok(MANUAL_MOVIES_2020_2026.every((item) => /^tt\d{5,12}$/.test(item.imdbId)));
  assert.ok(STATIC_TV_SERIES.every((item) => Number(item.tmdbId) > 0));
  assert.ok(TV_SERIES_CANDIDATES.every((item) => Number(item.tmdbId) > 0));
  assert.equal(MANUAL_TV_SERIES_2020_2026.length, 8);
  assert.deepEqual(MANUAL_TV_SERIES_2020_2026.map((item) => item.tmdbId), [115004, 87739, 241259, 99581, 93454, 94028, 217667, 249042]);
  assert.ok(NEW_ANIME_CATALOG.every((item) => Number(item.malId) > 0));
});

test("prepared offline packs report real gaps instead of lowering the completeness bar", () => {
  const prepared = prepareOfflineCatalog();
  for (const kind of ["movie", "tv", "anime"]) {
    for (const record of prepared[kind].records) {
      const year = catalogReleaseYear(record, kind);
      assert.ok(year >= CATALOG_YEAR_START && year <= CATALOG_YEAR_END);
    }
  }
  assert.equal(prepared.movie.records.length, 38);
  assert.ok(prepared.movie.records.every((item) => validateOfflineMovie(item)));
  assert.equal(prepared.tv.records.length, 8);
  assert.ok(prepared.tv.records.every((item) => validateOfflineTv(item)));
  assert.equal(prepared.anime.records.length, 201);
  assert.ok(prepared.movie.rejected["synopsis shorter than 80 characters"] > 0);
  assert.ok(prepared.tv.rejected["synopsis shorter than 80 characters"] > 0);
  assert.ok(prepared.anime.records.every((item) => validateOfflineAnime(item)));
});

test("AniList 178083 is stored as one season-four record and receives the automatic Featured badge", async () => {
  const matches = NEW_ANIME_CATALOG.filter((item) => Number(item.anilistId) === 178083);
  assert.equal(matches.length, 1);
  const record = matches[0];
  assert.equal(record.malId, 59088);
  assert.equal(record.anilistUrl, "https://anilist.co/anime/178083");
  assert.equal(record.episodes, 13);
  assert.equal(record.episodeGuide.length, 13);
  assert.equal(record.episodeGuide[5].title, "Shows Her Color");
  assert.equal(record.episodeGuide[6].title, "A Sense of Foreboding");
  const api = await read("../src/app.js");
  const models = await read("../src/models.js");
  assert.match(models, /anilistId: \{ type: Number, min: 1 \}/);
  assert.match(models, /animeSeriesSchema\.index\(\{ anilistId: 1 \}, \{ unique: true, sparse: true \}\)/);
  assert.match(api, /anilistId: anime\.anilistId \?\? null/);
  assert.match(api, /select: 'malId anilistId anilistUrl title/);
  assert.deepEqual(getCatalogBadge(record, "anime", Date.UTC(2026, 10, 13)), {
    key: "featured",
    label: "Featured"
  });
});

test("Hot, Popular and Featured badges are all automatic public-market classifications", async () => {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  // Removed legacy/manual flags cannot influence the outcome.
  assert.equal(getCatalogBadge({ isPopular: true, isFeatured: true }, "movie", now)?.key, "featured");
  assert.equal(getCatalogBadge({ isPopular: false, isFeatured: false }, "tv", now)?.key, "featured");
  for (const mediaType of ["movie", "tv", "anime"]) {
    assert.equal(getCatalogBadge({}, mediaType, now)?.key, "featured");
  }

  // Real vote volume, Bayesian-smoothed rating and provider reach qualify Popular.
  assert.equal(getCatalogBadge({
    voteAverage: 8.1, voteCount: 120000, popularity: 150
  }, "movie", now)?.key, "popular");
  assert.equal(getCatalogBadge({
    score: 8.3, scoredBy: 50000, rank: 150, popularity: 180
  }, "anime", now)?.key, "popular");
  assert.equal(getCatalogBadge({
    anilistScore: 8.4, anilistPopularity: 100000, scoredBy: 10000,
    airedFrom: new Date(now - (60 * 24 * 60 * 60 * 1000)).toISOString()
  }, "anime", now)?.key, "popular");
  assert.equal(getCatalogBadge({
    voteAverage: 8.0, voteCount: 5000, popularity: 90
  }, "tv", now)?.key, "popular");

  // Weak or insufficient public signals fall back to the visible Featured label.
  assert.equal(getCatalogBadge({
    voteAverage: 5.4, voteCount: 250000, popularity: 150
  }, "movie", now)?.key, "featured");
  assert.equal(getCatalogBadge({
    voteAverage: 8.6, voteCount: 20, popularity: 200
  }, "tv", now)?.key, "featured");
  assert.equal(getCatalogBadge({
    voteAverage: 6.8, voteCount: 0, popularity: 0
  }, "movie", now)?.key, "featured");

  // Featured is an automatic quality spotlight, never an Admin flag or low-rating bucket.
  assert.equal(getCatalogBadge({
    voteAverage: 7.8, voteCount: 300, popularity: 5
  }, "movie", now)?.key, "featured");
  assert.equal(getCatalogBadge({
    score: 7.9, scoredBy: 400, rank: 1500, popularity: 900
  }, "anime", now)?.key, "featured");
  assert.equal(getCatalogBadge({
    voteAverage: 4.1, voteCount: 0
  }, "movie", now)?.key, "featured");

  // Hot responds to actual Situla playback activity or public vote growth.
  assert.equal(getCatalogBadge({
    trendScore: 9, trendUpdatedAt: new Date(now).toISOString(),
    voteAverage: 4.2, voteCount: 500000
  }, "tv", now)?.key, "hot");
  assert.equal(getCatalogBadge({
    trendScore: 9, trendUpdatedAt: new Date(now).toISOString()
  }, "movie", now)?.key, "hot");
  assert.equal(getCatalogBadge({
    voteAverage: 7.1, voteCount: 1000, voteVelocity7d: 250,
    releaseDate: new Date(now - (30 * 24 * 60 * 60 * 1000)).toISOString()
  }, "movie", now)?.key, "hot");
  assert.equal(getCatalogBadge({
    score: 8.0, scoredBy: 5000, rank: 30, popularity: 30,
    airedFrom: new Date(now - (60 * 24 * 60 * 60 * 1000)).toISOString()
  }, "anime", now)?.key, "hot");
  assert.equal(getCatalogBadge({
    anilistScore: 7.6, anilistTrending: 75,
    airedFrom: new Date(now - (30 * 24 * 60 * 60 * 1000)).toISOString()
  }, "anime", now)?.key, "hot");

  const staleTrend = {
    trendScore: 12,
    trendUpdatedAt: new Date(now - (60 * 24 * 60 * 60 * 1000)).toISOString()
  };
  assert.equal(getCatalogBadge(staleTrend, "tv", now)?.key, "featured");
  assert.ok(Math.abs(calculateDecayedTrendScore(8, new Date(now - sevenDays), now) - 4) < 0.01);

  assert.equal(
    calculateVoteVelocity7d(1000, new Date(now - sevenDays), 1200, now),
    200
  );
  assert.equal(calculateVoteVelocity7d(0, null, 200, now), 0);
});

test("TVmaze public ratings can supply TV badge signals when an IMDb mapping is unavailable", async () => {
  const now = Date.now();
  const match = chooseTvmazeMatch([
    { score: 0.98, show: { id: 12, name: "Example Series", premiered: "2024-01-01", rating: { average: 8.1 }, weight: 70 } },
    { score: 0.99, show: { id: 13, name: "Example Series", premiered: "2014-01-01", rating: { average: 9.9 }, weight: 90 } }
  ], { title: "Example Series", releaseYear: 2024 });
  assert.equal(match?.id, 12);
  assert.equal(chooseTvmazeMatch([{ show: { name: "Different Series", premiered: "2024-01-01" } }],
    { title: "Example Series", releaseYear: 2024 }), null);
  assert.equal(getCatalogBadge({
    firstAirDate: new Date(now - (30 * 24 * 60 * 60 * 1000)).toISOString(),
    providerRating: 8.1,
    providerPopularity: 70
  }, "tv", now)?.key, "hot");
  assert.equal(getCatalogBadge({
    voteAverage: 5.2,
    voteCount: 0,
    providerRating: 8.1,
    providerPopularity: 30
  }, "tv", now)?.key, "popular");
});

test("all three badges use cached public data and require no Admin curation", async () => {
  const adminApi = await read("../src/admin.js");
  const adminUi = await read("../app/components/admin-dashboard.jsx");
  const models = await read("../src/models.js");
  const app = await read("../src/app.js");
  const refresh = await read("../scripts/refresh-catalog-market-data.js");
  const workflow = await read("../.github/workflows/catalogue-market-data.yml");
  const pkg = JSON.parse(await read("../package.json"));

  assert.doesNotMatch(adminApi, /catalog_featured_updated|validCatalogTarget|isFeatured/);
  assert.doesNotMatch(adminUi, /Featured picks|Set featured|Remove featured|updateCatalogFeatured/);
  assert.doesNotMatch(models, /isFeatured|isPopular/);
  assert.match(models, /voteVelocity7d/);
  assert.match(models, /marketDataUpdatedAt/);
  assert.match(models, /anilistPopularity/);
  assert.match(models, /anilistTags/);
  assert.match(app, /catalogBadge: getCatalogBadge/);
  assert.match(refresh, /v3-cinemeta\.strem\.io/);
  assert.match(refresh, /graphql\.anilist\.co/);
  assert.match(refresh, /api\.tvmaze\.com/);
  assert.match(refresh, /refreshTvmazeMarketData/);
  assert.match(refresh, /refreshAniListMarketData/);
  assert.match(refresh, /refreshCinemetaMovieRatings/);
  assert.match(refresh, /calculateVoteVelocity7d/);
  assert.doesNotMatch(refresh, /api\.jikan\.moe|datasets\.imdbws\.com/);
  assert.equal(pkg.scripts.seed, "node scripts/seed.js");
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /MONGODB_URI/);
  assert.match(workflow, /node scripts\/refresh-catalog-market-data\.js/);
});

test("catalog cards render differentiated automatic badges and search asks for a title only", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /resolveCatalogBadge\(movie\.catalogBadge\)/);
  assert.match(app, /resolveCatalogBadge\(item\.catalogBadge\)/);
  assert.doesNotMatch(app, /movie\.catalogBadge &&/);
  assert.doesNotMatch(app, /item\.catalogBadge &&/);
  assert.doesNotMatch(app, /catalogBadge\.icon/);
  assert.doesNotMatch(app, /popular-pill|isPopularCatalogItem/);
  assert.match(app, /placeholder="Search & Title"/);
  assert.doesNotMatch(app, /Search a title or IMDb \/ TMDB \/ MAL ID/);
  assert.match(css, /\.catalog-badge-hot/);
  assert.match(css, /\.catalog-badge-popular/);
  assert.match(css, /\.catalog-badge-featured/);
  assert.ok(css.includes("rgba(20, 83, 45"));
  assert.ok(css.includes("rgba(22, 163, 74"));
  assert.ok(css.includes("rgba(127, 29, 29"));
  assert.ok(css.includes("rgba(220, 38, 38"));
  assert.ok(css.includes("rgba(133, 77, 14"));
  assert.ok(css.includes("rgba(234, 179, 8"));
});
