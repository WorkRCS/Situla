import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STATIC_MOVIES } from "../data/movie-catalog.js";
import { STATIC_TV_SERIES } from "../data/tv-catalog.js";
import { TV_SERIES_CANDIDATES } from "../data/tv-additions.js";
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
import { isPopularCatalogItem } from "../src/catalog-popularity.js";

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
  assert.match(script, /isPopular/);
});

test("canonical catalogue keys and complete-content validators remain separate", () => {
  assert.equal(validateOfflineMovie({
    imdbId: "tt1234567", title: "Example", originalTitle: "Example",
    overview: "A complete plot summary with more than eighty characters for the example title.",
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
  assert.ok(STATIC_TV_SERIES.every((item) => Number(item.tmdbId) > 0));
  assert.ok(TV_SERIES_CANDIDATES.every((item) => Number(item.tmdbId) > 0));
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
  assert.equal(prepared.movie.records.length, 0);
  assert.equal(prepared.tv.records.length, 0);
  assert.ok(prepared.anime.records.length >= 190);
  assert.ok(prepared.movie.rejected["synopsis shorter than 80 characters"] > 0);
  assert.ok(prepared.tv.rejected["synopsis shorter than 80 characters"] > 0);
  assert.ok(prepared.anime.records.every((item) => validateOfflineAnime(item)));
});

test("Popular badge uses explicit flags or catalogue-native popularity semantics", () => {
  assert.equal(isPopularCatalogItem({ isPopular: true }, "movie"), true);
  assert.equal(isPopularCatalogItem({ isPopular: false, voteCount: 900000 }, "movie"), false);
  assert.equal(isPopularCatalogItem({ voteCount: 12000 }, "movie"), true);
  assert.equal(isPopularCatalogItem({ popularity: 70 }, "tv"), true);
  assert.equal(isPopularCatalogItem({ rank: 30 }, "anime"), true);
  assert.equal(isPopularCatalogItem({ popularity: 12 }, "anime"), true);
  assert.equal(isPopularCatalogItem({ rank: 900, scoredBy: 1000 }, "anime"), false);
});

test("catalog cards show the green Popular tag and search asks for a title only", async () => {
  const app = await read("../app/components/situla-app.jsx");
  const css = await read("../app/globals.css");
  assert.match(app, /className="popular-pill">Popular<\/span>/);
  assert.match(app, /placeholder="Search & Title"/);
  assert.doesNotMatch(app, /Search a title or IMDb \/ TMDB \/ MAL ID/);
  assert.match(css, /\.popular-pill[\s\S]*?background: #15803d/);
});
