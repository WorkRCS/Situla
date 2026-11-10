import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STATIC_MOVIES } from "../data/movie-catalog.js";
import { MOVIE_ADDITION_TARGET, MOVIE_DISCOVERY_PARTS } from "../data/movie-additions.js";
import {
  mapTmdbMovie,
  normalizeImdbId,
  normalizeMovieTitle,
  stripMovieMarkup,
  validateMovieRecord
} from "../scripts/seed-movie-additions.js";

function fixture() {
  return {
    id: 1234,
    title: "Example Film",
    original_title: "Example Original Film",
    overview: "<p>A complete example synopsis with enough detail to exceed eighty characters and explain the premise clearly.</p>",
    tagline: "A test tagline",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    release_date: "2020-01-02",
    runtime: 111,
    original_language: "en",
    adult: false,
    status: "Released",
    homepage: "https://example.com",
    budget: 1000000,
    revenue: 2000000,
    vote_average: 7.8,
    vote_count: 500,
    popularity: 25,
    genres: [{ id: 18, name: "Drama" }],
    production_companies: [{ name: "Example Studios" }],
    production_countries: [{ name: "United States" }],
    spoken_languages: [{ english_name: "English", iso_639_1: "en" }],
    external_ids: { imdb_id: "tt1234567" },
    credits: {
      cast: [
        { name: "Lead Actor", character: "Alex", profile_path: "/person.jpg" },
        { name: "Supporting Actor", character: "Sam", profile_path: null }
      ],
      crew: [
        { name: "Example Director", job: "Director" },
        { name: "Example Writer", job: "Screenplay" }
      ]
    },
    keywords: { keywords: [{ name: "friendship" }] },
    videos: { results: [{ site: "YouTube", type: "Trailer", official: true, key: "abc123" }] },
    release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] }] },
    belongs_to_collection: {
      name: "Example Collection",
      poster_path: "/collection-poster.jpg",
      backdrop_path: "/collection-backdrop.jpg"
    },
    images: { posters: [], backdrops: [] }
  };
}

test("five discovery parts provide the exact 500-movie target without a single fixed provider ID", () => {
  assert.equal(MOVIE_ADDITION_TARGET, 500);
  assert.equal(MOVIE_DISCOVERY_PARTS.length, 5);
  assert.equal(new Set(MOVIE_DISCOVERY_PARTS.map((part) => part.key)).size, 5);
  assert.ok(MOVIE_DISCOVERY_PARTS.every((part) => part.pages >= 10));
  assert.equal(new Set(STATIC_MOVIES.map((item) => item.imdbId)).size, STATIC_MOVIES.length);
});

test("IMDb IDs normalize to the canonical IMDb title key", () => {
  assert.equal(normalizeImdbId("TT0133093"), "tt0133093");
  assert.equal(normalizeImdbId("tt0133093"), "tt0133093");
  assert.equal(normalizeImdbId("27205"), null);
  assert.equal(normalizeImdbId("tt123"), null);
  assert.equal(normalizeMovieTitle("Pokémon & Friends"), "pokemon and friends");
  assert.equal(stripMovieMarkup("<p>A &amp; B</p>"), "A & B");
});

test("TMDB detail mapper preserves full movie details while using IMDb ID as the only catalog key", () => {
  const movie = mapTmdbMovie(fixture(), { id: 1234 });
  assert.ok(movie);
  assert.equal(movie.imdbId, "tt1234567");
  assert.equal(movie.title, "Example Film");
  assert.equal(movie.originalTitle, "Example Original Film");
  assert.ok(movie.overview.length > 80);
  assert.equal(movie.posterUrl, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.equal(movie.backdropUrl, "https://image.tmdb.org/t/p/original/backdrop.jpg");
  assert.equal(movie.runtime, 111);
  assert.equal(movie.releaseYear, 2020);
  assert.deepEqual(movie.genres, ["Drama"]);
  assert.deepEqual(movie.productionCompanies, ["Example Studios"]);
  assert.deepEqual(movie.productionCountries, ["United States"]);
  assert.equal(movie.cast[0].name, "Lead Actor");
  assert.deepEqual(movie.directors, ["Example Director"]);
  assert.deepEqual(movie.writers, ["Example Writer"]);
  assert.equal(movie.trailerUrl, "https://www.youtube.com/watch?v=abc123");
  assert.equal(movie.collection.name, "Example Collection");
  assert.equal(movie.sourceUrl, "https://www.themoviedb.org/movie/1234");
  assert.equal(validateMovieRecord({ ...movie, posterUrl: movie.posterUrl, backdropUrl: movie.backdropUrl }), true);
  assert.equal(Object.hasOwn(movie, "tmdbId"), false);
});

test("movie validator rejects missing artwork, description, credits and adult content", () => {
  const movie = mapTmdbMovie(fixture(), { id: 1234 });
  assert.throws(() => validateMovieRecord({ ...movie, posterUrl: null }), /poster/);
  assert.throws(() => validateMovieRecord({ ...movie, backdropUrl: null }), /banner\/backdrop/);
  assert.throws(() => validateMovieRecord({ ...movie, overview: "Short." }), /synopsis/);
  assert.throws(() => validateMovieRecord({ ...movie, directors: [] }), /director credit/);
  assert.throws(() => validateMovieRecord({ ...movie, productionCompanies: [] }), /production company/);
  assert.throws(() => validateMovieRecord({ ...movie, adult: true }), /Adult content/);
  assert.equal(mapTmdbMovie({ ...fixture(), adult: true }, { id: 1234 }), null);
  assert.equal(mapTmdbMovie({ ...fixture(), external_ids: { imdb_id: null } }, { id: 1234 }), null);
});

test("Movie additions seeder is insert-only and verifies all required fields before writing", async () => {
  const script = await readFile(new URL("../scripts/seed-movie-additions.js", import.meta.url), "utf8");
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const api = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.equal(pkg.scripts["seed:movie-additions"], "node scripts/seed-movie-additions.js");
  assert.equal(pkg.scripts["check:movies"], "node --test test/movie-catalog.test.js");
  assert.match(pkg.scripts["seed:movies"], /seed-static-catalog\.js --movies.*seed:movie-additions/);
  assert.match(script, /Movie\.insertMany\(newRecords/);
  assert.match(script, /existingAdditionCount/);
  assert.match(script, /verifyRemoteImage/);
  assert.match(script, /validateMovieRecord/);
  assert.doesNotMatch(script, /bulkWrite|updateOne|findOneAndUpdate|\$set/);
  assert.match(api, /randomOrder/);
  assert.match(api, /\$sample: \{ size: 40 \}/);
  assert.match(api, /randomFilter\.imdbId = \{ \$nin: excludedIds/);
});
