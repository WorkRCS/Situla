import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildHomeCollections, homeMediaKey, homeMediaRoute, mixHomeSpotlight, toHomeSpotlight } from "../src/home-discovery.js";

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



test("home media IDs resolve to real detail/watch routes", () => {
  assert.equal(homeMediaRoute({ imdbId: "TT1234567" }, "movie"), "/watch/tt1234567");
  assert.equal(homeMediaRoute({ tmdbId: 123 }, "tv"), "/tv/123");
  assert.equal(homeMediaRoute({ malId: 456 }, "anime"), "/anime/456");
  assert.equal(homeMediaRoute({ imdbId: "1234567" }, "movie"), null);
  assert.equal(homeMediaRoute({ tmdbId: 0 }, "tv"), null);
  assert.equal(homeMediaRoute({ malId: "not-a-number" }, "anime"), null);
  assert.equal(homeMediaRoute({ malId: 456 }, "unknown"), null);
});

test("landing cards explicitly navigate and use live database catalogue ordering", async () => {
  const app = await readFile(new URL("../app/components/situla-app.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const movieRoute = await readFile(new URL("../app/watch/[imdbId]/page.jsx", import.meta.url), "utf8");
  const tvRoute = await readFile(new URL("../app/tv/[tmdbId]/page.jsx", import.meta.url), "utf8");
  const animeRoute = await readFile(new URL("../app/anime/[malId]/page.jsx", import.meta.url), "utf8");

  assert.ok(app.includes('import { buildHomeCollections, homeMediaRoute, mixHomeSpotlight, toHomeSpotlight }'));
  assert.ok(app.includes("onOpen?.(movie);"));
  assert.ok(app.includes("onOpen?.(item, kind);"));
  assert.ok(!app.includes("navigate: false"));
  assert.ok(app.includes("if (!movieCardHref(movie)) return openMovie(movie, options);"));
  assert.ok(app.includes("if (!seriesCardHref(series, kind))"));
  assert.ok(movieRoute.includes("{ imdbId }"));
  assert.ok(tvRoute.includes("{ tmdbId }"));
  assert.ok(animeRoute.includes("{ malId }"));

  assert.ok(app.includes('new URLSearchParams({ page: "1", limit: "36" })'));
  assert.ok(app.includes('fetch(endpoint, { cache: "no-store", signal })'));
  assert.ok(!app.includes('new URLSearchParams({ page: "1", limit: "36", random: "true" })'));
  assert.ok(app.includes("spotlightItems: homeHeroItems"));
  assert.ok(app.includes('activeHeroId={homeHeroItems[heroIndex]?.heroId}'));
  assert.ok(app.includes("const trendingItems = items.filter((item) => item.heroId !== activeHeroId);"));
  assert.ok(!app.includes('className="spotlight-strip"'));
  assert.ok(!app.includes("homeFreshMoviesRequested"));
  assert.ok(app.includes("LIVE DATABASE · MOVIES · TV · ANIME"));
  assert.ok(app.includes("RECORDED VOTE COUNTS"));
  assert.ok(app.includes("PROVIDER RATING DATA"));
  assert.ok(app.includes('variant="popular"'));
  assert.ok(app.includes('variant="rated"'));
  assert.ok(app.includes('variant="television"'));
  assert.ok(app.includes('variant="anime"'));

  const discoveryStart = api.indexOf("app.get('/api/movies/discover'");
  const discoveryEnd = api.indexOf("app.get('/api/search'", discoveryStart);
  const discovery = api.slice(discoveryStart, discoveryEnd);
  assert.ok(discovery.includes("HOME_DISCOVERY_LIMIT"));
  assert.ok(discovery.includes("HOME_MOVIE_DISCOVERY_SORT"));
  assert.ok(discovery.includes("{ $sort: HOME_MOVIE_DISCOVERY_SORT }"));
  assert.ok(!discovery.includes("$sample"));
  assert.ok(discovery.includes("Movie.countDocuments"));

  assert.ok(css.includes(".home-collection-popular"));
  assert.ok(css.includes(".home-collection-rated"));
  assert.ok(css.includes(".home-collection-television"));
  assert.ok(css.includes(".home-collection-anime"));
  assert.ok(css.includes(".home-collection-genre"));

  const mixedShelfStyle = css.match(/\.home-mixed-shelf\s*\\{([^}]*)\\}/)?.[1] || "";
  assert.match(mixedShelfStyle, /background:\s*transparent/);
  assert.match(mixedShelfStyle, /border:\s*0/);
  assert.match(mixedShelfStyle, /box-shadow:\s*none/);
  assert.doesNotMatch(mixedShelfStyle, /linear-gradient|radial-gradient/);

  const collectionPanelStyle = css.match(/\.home-collection-popular,\\s*\.home-collection-rated,\\s*\.home-collection-anime,\\s*\.home-collection-genre\\s*\\{([^}]*)\\}/)?.[1] || "";
  assert.match(collectionPanelStyle, /background:\s*transparent/);
  assert.match(collectionPanelStyle, /border:\s*0/);
  assert.match(collectionPanelStyle, /box-shadow:\s*none/);
  assert.match(css, /\.home-collection-television\\s*\\{\\s*padding-top:0;\\s*border-top:0;/);
  assert.match(css, /\.home-movie-shelf\\s*\\{\\s*padding-top:0;\\s*border-top:0;/);
});
