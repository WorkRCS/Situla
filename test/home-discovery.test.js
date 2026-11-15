import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildHomeCollections, homeMediaKey, mixHomeSpotlight, toHomeSpotlight } from "../src/home-discovery.js";

test("home spotlight normalizes movie, TV, and anime metadata", () => {
  const movie = toHomeSpotlight({ imdbId: "TT1234567", title: "Film", voteAverage: 8.1 }, "movie");
  const tv = toHomeSpotlight({ tmdbId: 42, title: "Series", firstAirDate: "2024-01-01" }, "tv");
  const anime = toHomeSpotlight({ malId: 99, title: "日本語", titleEnglish: "Anime", score: 9.2 }, "anime");

  assert.equal(movie.heroId, "movie:tt1234567");
  assert.equal(movie.heroTitle, "Film");
  assert.equal(movie.heroRating, 8.1);
  assert.equal(tv.heroMediaLabel, "TV SERIES");
  assert.equal(tv.heroYear, 2024);
  assert.equal(anime.heroTitle, "Anime");
  assert.equal(anime.heroRating, 9.2);
});

test("invalid spotlight records are ignored", () => {
  assert.equal(toHomeSpotlight({ title: "Missing ID" }, "movie"), null);
  assert.equal(toHomeSpotlight({ tmdbId: -1, title: "Invalid" }, "tv"), null);
  assert.equal(toHomeSpotlight({ malId: "NaN", title: "Invalid" }, "anime"), null);
});

test("mixed spotlight alternates media types while multiple sources remain", () => {
  const movies = [1, 2, 3].map((id) => toHomeSpotlight({ imdbId: "tt12345" + id, title: "Movie " + id }, "movie"));
  const tv = [1, 2].map((id) => toHomeSpotlight({ tmdbId: id, title: "TV " + id }, "tv"));
  const anime = [1, 2].map((id) => toHomeSpotlight({ malId: id, title: "Anime " + id }, "anime"));
  const mixed = mixHomeSpotlight({ movies, tv, anime }, () => 0.37);

  assert.equal(mixed.length, 7);
  assert.deepEqual(new Set(mixed.map((item) => item.mediaType)), new Set(["movie", "tv", "anime"]));
  for (let index = 1; index < mixed.length; index += 1) {
    assert.notEqual(mixed[index].mediaType, mixed[index - 1].mediaType);
  }
  assert.equal(new Set(mixed.map((item) => item.heroId)).size, mixed.length);
});

test("mixed spotlight tolerates an empty catalog", () => {
  assert.deepEqual(mixHomeSpotlight({ movies: [], tv: [], anime: [] }), []);
});


test("home collections reserve featured titles and never repeat an ID between shelves", () => {
  const movies = Array.from({ length: 18 }, (_, index) => ({
    imdbId: "tt" + String(5000000 + index),
    title: "Movie " + index,
    popularity: 100 - index,
    voteAverage: 9 - index / 10
  }));
  const tv = Array.from({ length: 30 }, (_, index) => ({
    tmdbId: index + 1,
    title: "TV " + index,
    voteCount: 1000 - index * 10,
    voteAverage: 9.5 - index / 20,
    popularity: 500 - index,
    firstAirDate: "2025-" + String((index % 12) + 1).padStart(2, "0") + "-01"
  }));
  const anime = Array.from({ length: 30 }, (_, index) => ({
    malId: index + 1,
    title: "Anime " + index,
    scoredBy: 2000 - index * 10,
    score: 9.8 - index / 20,
    rank: index + 1,
    airedFrom: "2025-" + String((index % 12) + 1).padStart(2, "0") + "-01"
  }));
  const featured = toHomeSpotlight(movies[0], "movie");
  const spotlightItems = [
    featured,
    toHomeSpotlight(tv[0], "tv"),
    toHomeSpotlight(anime[0], "anime"),
    toHomeSpotlight(movies[1], "movie")
  ];
  const categories = [{
    key: "action",
    name: "Action",
    items: [
      ...movies.slice(0, 12),
      ...Array.from({ length: 8 }, (_, index) => ({
        imdbId: "tt" + String(6000000 + index),
        title: "Genre Movie " + index,
        popularity: 50 - index
      }))
    ]
  }];

  const collections = buildHomeCollections({
    featured,
    spotlightItems,
    movies,
    tv,
    anime,
    categories
  });

  const keys = [
    ...collections.popularSeriesItems.map((item) => homeMediaKey(item)),
    ...collections.favoriteSeriesItems.map((item) => homeMediaKey(item)),
    ...collections.topTvShows.map((item) => homeMediaKey(item, "tv")),
    ...collections.topAnimeShows.map((item) => homeMediaKey(item, "anime")),
    ...collections.movieItems.map((item) => homeMediaKey(item, "movie")),
    ...collections.categoryShelves.flatMap((category) =>
      category.items.map((item) => homeMediaKey(item, "movie"))
    )
  ].filter(Boolean);

  assert.equal(new Set(keys).size, keys.length, "a title should appear in only one collection");
  assert.ok(!keys.includes(homeMediaKey(featured)), "the active hero title must not repeat below");
  assert.ok(!keys.includes(homeMediaKey(spotlightItems[1])), "trending TV titles must not repeat below");
  assert.ok(collections.popularSeriesItems.length > 0);
  assert.ok(collections.favoriteSeriesItems.length > 0);
  assert.ok(collections.topTvShows.length > 0);
  assert.ok(collections.topAnimeShows.length > 0);
  assert.ok(collections.categoryShelves[0].items.some((item) => item.imdbId === "tt6000000"));
});


test("landing page loads changing discovery pools and gives each collection its own layout", async () => {
  const app = await readFile(new URL("../app/components/situla-app.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.ok(app.includes('new URLSearchParams({ page: "1", limit: "36", random: "true" })'));
  assert.ok(app.includes('params.set("exclude", recentIds.join(","))'));
  assert.ok(app.includes("rememberRecentCatalogIds(recentKey"));
  assert.ok(app.includes("spotlightItems: homeHeroItems"));
  assert.ok(app.includes("items.map((item) => item.mediaType === \"movie\""));
  assert.ok(app.includes('variant="popular"'));
  assert.ok(app.includes('variant="rated"'));
  assert.ok(app.includes('variant="television"'));
  assert.ok(app.includes('variant="anime"'));
  assert.ok(css.includes(".home-collection-popular"));
  assert.ok(css.includes(".home-collection-rated"));
  assert.ok(css.includes(".home-collection-television"));
  assert.ok(css.includes(".home-collection-anime"));
  assert.ok(css.includes(".home-collection-genre"));
});
