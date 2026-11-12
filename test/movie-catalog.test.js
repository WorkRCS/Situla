import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STATIC_MOVIES } from "../data/movie-catalog.js";
import { MOVIE_ADDITION_TARGET, MOVIE_DISCOVERY_PARTS } from "../data/movie-additions.js";
import {
  cinemetaCatalogUrl,
  cinemetaMetaUrl,
  mapCinemetaMovie,
  normalizeImdbId,
  normalizeMovieTitle,
  stripMovieMarkup,
  validateMovieRecord
} from "../scripts/seed-movie-additions.js";

function fixture() {
  return {
    id: "tt1234567",
    imdb_id: "tt1234567",
    type: "movie",
    name: "Example Film",
    originalTitle: "Example Original Film",
    description: "<p>A complete example synopsis with enough detail to exceed eighty characters and explain the premise clearly.</p>",
    poster: "https://images.metahub.space/poster/medium/tt1234567/img",
    background: "https://images.metahub.space/background/medium/tt1234567/img",
    releaseInfo: "2020",
    released: "2020-01-02T00:00:00.000Z",
    year: 2020,
    runtime: "1h 51min",
    language: "English",
    country: "United States",
    imdbRating: "7.8",
    imdbVotes: "12,345",
    genres: ["Drama"],
    cast: ["Lead Actor", "Supporting Actor"],
    director: ["Example Director"],
    writer: ["Example Writer"],
    trailers: [{ type: "Trailer", source: "abc123xyz" }]
  };
}

test("five Cinemeta discovery parts provide the exact 500-movie target using IMDb catalogue IDs", () => {
  assert.equal(MOVIE_ADDITION_TARGET, 500);
  assert.equal(MOVIE_DISCOVERY_PARTS.length, 5);
  assert.equal(new Set(MOVIE_DISCOVERY_PARTS.map((part) => part.key)).size, 5);
  assert.ok(MOVIE_DISCOVERY_PARTS.every((part) => part.pages >= 8 && part.pageSize >= 50 && part.catalogId));
  assert.equal(new Set(STATIC_MOVIES.map((item) => item.imdbId)).size, STATIC_MOVIES.length);
  assert.equal(cinemetaCatalogUrl(MOVIE_DISCOVERY_PARTS[0], 0),
    "https://v3-cinemeta.strem.io/catalog/movie/top.json");
  assert.equal(cinemetaCatalogUrl({ catalogId: "top", genre: "Drama" }, 100),
    "https://v3-cinemeta.strem.io/catalog/movie/top/genre=Drama&skip=100.json");
  assert.equal(cinemetaCatalogUrl({ catalogId: "top" }, 100),
    "https://v3-cinemeta.strem.io/catalog/movie/top/skip=100.json");
  assert.equal(cinemetaMetaUrl("TT1234567"),
    "https://v3-cinemeta.strem.io/meta/movie/tt1234567.json");
});

test("IMDb IDs normalize to the canonical IMDb title key", () => {
  assert.equal(normalizeImdbId("TT0133093"), "tt0133093");
  assert.equal(normalizeImdbId("tt0133093"), "tt0133093");
  assert.equal(normalizeImdbId("27205"), null);
  assert.equal(normalizeImdbId("tt123"), null);
  assert.equal(normalizeMovieTitle("Pokémon & Friends"), "pokemon and friends");
  assert.equal(stripMovieMarkup("<p>A &amp; B</p>"), "A & B");
});

test("Cinemeta mapper preserves details while using the IMDb ID as the only catalog key", () => {
  const movie = mapCinemetaMovie(fixture());
  assert.ok(movie);
  assert.equal(movie.imdbId, "tt1234567");
  assert.equal(movie.title, "Example Film");
  assert.equal(movie.originalTitle, "Example Original Film");
  assert.ok(movie.overview.length > 80);
  assert.equal(movie.posterUrl, "https://images.metahub.space/poster/medium/tt1234567/img");
  assert.equal(movie.backdropUrl, "https://images.metahub.space/background/medium/tt1234567/img");
  assert.equal(movie.runtime, 111);
  assert.equal(movie.releaseYear, 2020);
  assert.equal(movie.releaseDate, "2020-01-02");
  assert.deepEqual(movie.genres, ["Drama"]);
  assert.deepEqual(movie.productionCompanies, []);
  assert.deepEqual(movie.productionCountries, ["United States"]);
  assert.deepEqual(movie.spokenLanguages, ["English"]);
  assert.equal(movie.cast[0].name, "Lead Actor");
  assert.deepEqual(movie.directors, ["Example Director"]);
  assert.deepEqual(movie.writers, ["Example Writer"]);
  assert.equal(movie.trailerUrl, "https://www.youtube.com/watch?v=abc123xyz");
  assert.equal(movie.sourceUrl, "https://www.imdb.com/title/tt1234567/");
  assert.equal(movie.metadataSource, "Cinemeta API");
  assert.equal(validateMovieRecord(movie), true);
  assert.equal(Object.hasOwn(movie, "tmdbId"), false);
});

test("Cinemeta mapper rejects adult titles and malformed IMDb IDs", () => {
  assert.equal(mapCinemetaMovie({ ...fixture(), adult: true }), null);
  assert.equal(mapCinemetaMovie({ ...fixture(), genres: ["Hentai"] }), null);
  assert.equal(mapCinemetaMovie({ ...fixture(), id: "12345", imdb_id: "12345" }), null);
  assert.equal(mapCinemetaMovie({ ...fixture(), type: "series" }), null);
});

test("movie validator rejects missing core fields and invalid artwork", () => {
  const movie = mapCinemetaMovie(fixture());
  assert.throws(() => validateMovieRecord({ ...movie, posterUrl: null }), /poster/);
  assert.throws(() => validateMovieRecord({ ...movie, backdropUrl: null }), /banner\/backdrop/);
  assert.throws(() => validateMovieRecord({ ...movie, overview: "Short." }), /synopsis/);
  assert.throws(() => validateMovieRecord({ ...movie, directors: [] }), /director credit/);
  assert.throws(() => validateMovieRecord({ ...movie, cast: [] }), /credited cast/);
  assert.throws(() => validateMovieRecord({ ...movie, releaseYear: null }), /release year/);
  assert.equal(validateMovieRecord({ ...movie, productionCompanies: [], productionCountries: [] }), true);
});

test("Movies grid refreshes with random discovery and paginates by IMDb ID without duplicate results", async () => {
  const app = await readFile(new URL("../app/components/situla-app.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /const isDiscover = \(tab === "home" && genre === "All"\) \|\| tab === "movies"/);
  assert.match(app, /chooseFreshSpotlight\(uniqueHeroMovies, "situla:spotlight:movies"\)/);
  assert.match(app, /params\.set\("random", "true"\)/);
  assert.match(app, /params\.set\("exclude", movies\.map\(\(item\) => item\.imdbId\)/);
  assert.match(app, /current\.map\(\(item\) => String\(item\.imdbId/);
  assert.doesNotMatch(app, /current\.map\(\(item\) => item\.tmdbId\)/);
  assert.match(app, /function MoviePosterImage/);
  assert.match(app, /AbortSignal\.timeout\(30_000\)/);
  assert.match(api, /items: \[\{ \$sample: \{ size: PREMIUM_FEED_LIMIT \} \}\]/);
  const premiumFeed = await readFile(new URL("../src/premium-feed.js", import.meta.url), "utf8");
  assert.match(premiumFeed, /PREMIUM_FEED_LIMIT = 10/);
  assert.match(api, /randomFilter\.imdbId = \{ \$nin: excludedIds, \$regex: IMDB_ID \}/);
});

test("Movie additions seeder uses Cinemeta, validates before insert, and never contacts TMDB", async () => {
  const script = await readFile(new URL("../scripts/seed-movie-additions.js", import.meta.url), "utf8");
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const api = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/seed-tv-series.yml", import.meta.url), "utf8");
  assert.equal(pkg.scripts["seed:movie-additions:legacy-online"], "node scripts/seed-movie-additions.js");
  assert.equal(pkg.scripts["check:movies"], "node --test test/movie-catalog.test.js");
  assert.equal(pkg.scripts["seed:movies"], "node scripts/seed-catalog.js --movies");
  assert.match(pkg.scripts["seed:movies:legacy-online"], /seed-static-catalog\.js --movies.*seed:movie-additions:legacy-online/);
  assert.match(script, /https:\/\/v3-cinemeta\.strem\.io/);
  assert.match(script, /Movie\.insertMany\(newRecords/);
  assert.match(script, /existingAdditionCount/);
  assert.match(script, /verifyRemoteImage/);
  assert.match(script, /validateMovieRecord/);
  assert.match(script, /metadataSource: \{ \$in: LEGACY_METADATA_SOURCES \}/);
  assert.doesNotMatch(script, /api\.themoviedb\.org|TMDB_API_READ_ACCESS_TOKEN|TMDB_API_KEY/);
  assert.doesNotMatch(workflow, /TMDB_API_READ_ACCESS_TOKEN/);
  assert.doesNotMatch(script, /bulkWrite|updateOne|findOneAndUpdate|\$set/);
  assert.match(api, /randomOrder/);
  assert.match(api, /\$sample: \{ size: limit \}/);
  assert.match(api, /randomFilter\.imdbId = \{ \$nin: excludedIds/);
});
