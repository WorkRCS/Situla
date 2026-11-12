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
} from "../scripts/seed-catalog.js";
import { calculateDecayedTrendScore, getCatalogBadge } from "../src/catalog-popularity.js";
import { calculateVoteVelocity7d, chooseTvmazeMatch } from "../scripts/refresh-catalog-market-data.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("offline catalog seeder is bounded to 2020–2026 and has no metadata API/network client", async () => {
  const script = await read("../scripts/seed-catalog.js");
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(CATALOG_YEAR_START, 2020);
  assert.equal(CATALOG_YEAR_END, 2026);
  assert.equal(pkg.scripts["seed:catalog"], "node scripts/seed-catalog.js");
  assert.equal(pkg.scripts["seed:movies"], "node scripts/seed-catalog.js --movies");
  assert.equal(pkg.scripts["seed:tv"], "node scripts/seed-catalog.js --tv");
  assert.equal(pkg.scripts["seed:anime"], "node scripts/seed-catalog.js --anime");
  assert.doesNotMatch(script, /fetch\s*\(|axios|api\.themoviedb|api\.tvmaze|cinemeta/i);
  assert.match(script, /\.insertMany\(pending/);
  assert.match(script, /TvSeries/);
  assert.match(script, /AnimeSeries/);
  assert.doesNotMatch(script, /isPopular/);
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
  assert.equal(prepared.anime.records.length, 200);
  assert.ok(prepared.movie.rejected["synopsis shorter than 80 characters"] > 0);
  assert.ok(prepared.tv.rejected["synopsis shorter than 80 characters"] > 0);
  assert.ok(prepared.anime.records.every((item) => validateOfflineAnime(item)));
});

test("Hot, Popular and Featured badges are all automatic public-market classifications", async () => {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  // Removed legacy/manual flags cannot influence the outcome.
  assert.equal(getCatalogBadge({ isPopular: true, isFeatured: true }, "movie", now), null);
  assert.equal(getCatalogBadge({ isPopular: false, isFeatured: false }, "tv", now), null);

  // Real vote volume, Bayesian-smoothed rating and provider reach qualify Popular.
  assert.equal(getCatalogBadge({
    voteAverage: 8.1, voteCount: 120000, popularity: 150
  }, "movie", now)?.key, "popular");
  assert.equal(getCatalogBadge({
    score: 8.3, scoredBy: 50000, rank: 150, popularity: 180
  }, "anime", now)?.key, "popular");
  assert.equal(getCatalogBadge({
    voteAverage: 8.0, voteCount: 5000, popularity: 90
  }, "tv", now)?.key, "popular");

  // Vote count alone cannot rescue poor quality; a tiny sample is not Popular.
  assert.equal(getCatalogBadge({
    voteAverage: 5.4, voteCount: 250000, popularity: 150
  }, "movie", now), null);
  assert.equal(getCatalogBadge({
    voteAverage: 8.6, voteCount: 20, popularity: 200
  }, "tv", now), null);
  assert.equal(getCatalogBadge({
    voteAverage: 6.8, voteCount: 0, popularity: 0
  }, "movie", now), null);

  // Featured is an automatic quality spotlight, never an Admin flag or low-rating bucket.
  assert.equal(getCatalogBadge({
    voteAverage: 7.8, voteCount: 300, popularity: 5
  }, "movie", now)?.key, "featured");
  assert.equal(getCatalogBadge({
    score: 7.9, scoredBy: 400, rank: 1500, popularity: 900
  }, "anime", now)?.key, "featured");
  assert.equal(getCatalogBadge({
    voteAverage: 4.1, voteCount: 0
  }, "movie", now), null);

  // Hot responds to actual Situla playback activity or public vote growth.
  assert.equal(getCatalogBadge({
    trendScore: 9, trendUpdatedAt: new Date(now).toISOString(),
    voteAverage: 4.2, voteCount: 500000
  }, "tv", now)?.key, "hot");
  assert.equal(getCatalogBadge({
    voteAverage: 7.1, voteCount: 1000, voteVelocity7d: 250,
    releaseDate: new Date(now - (30 * 24 * 60 * 60 * 1000)).toISOString()
  }, "movie", now)?.key, "hot");
  assert.equal(getCatalogBadge({
    score: 8.0, scoredBy: 5000, rank: 30, popularity: 30,
    airedFrom: new Date(now - (60 * 24 * 60 * 60 * 1000)).toISOString()
  }, "anime", now)?.key, "hot");

  const staleTrend = {
    trendScore: 12,
    trendUpdatedAt: new Date(now - (60 * 24 * 60 * 60 * 1000)).toISOString()
  };
  assert.notEqual(getCatalogBadge(staleTrend, "tv", now)?.key, "hot");
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
  assert.match(app, /catalogBadge: getCatalogBadge/);
  assert.match(refresh, /datasets\.imdbws\.com/);
  assert.match(refresh, /api\.jikan\.moe/);
  assert.match(refresh, /api\.tvmaze\.com/);
  assert.match(refresh, /refreshTvmazeMarketData/);
  assert.match(refresh, /externalImdbId/);
  assert.match(refresh, /calculateVoteVelocity7d/);
  assert.equal(pkg.scripts["refresh:catalog-signals"], "node scripts/refresh-catalog-market-data.js");
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /MONGODB_URI/);
});

test("catalog cards render differentiated automatic badges and search asks for a title only", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /movie\.catalogBadge\.label/);
  assert.match(app, /item\.catalogBadge\.label/);
  assert.doesNotMatch(app, /catalogBadge\.icon/);
  assert.doesNotMatch(app, /popular-pill|isPopularCatalogItem/);
  assert.match(app, /placeholder="Search & Title"/);
  assert.doesNotMatch(app, /Search a title or IMDb \/ TMDB \/ MAL ID/);
  assert.match(css, /\.catalog-badge-hot/);
  assert.match(css, /\.catalog-badge-popular/);
  assert.match(css, /\.catalog-badge-featured/);
  assert.ok(css.includes("rgba(8, 75, 43"));
  assert.ok(css.includes("rgba(126, 25, 55"));
  assert.ok(css.includes("rgba(108, 67, 14"));
});
