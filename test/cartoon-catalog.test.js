import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shuffleCartoonCatalog } from "../src/cartoon-catalog.js";
import { buildCartoonSearchAlternatives } from "../src/cartoon-search.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("mixed Cartoon catalogue shuffle is stable for pagination and changes with a new refresh seed", () => {
  const items = [
    { mediaType: "cartoon_movie", tmdbId: 1, title: "Movie 1" },
    { mediaType: "cartoon_tv", tmdbId: 1, title: "Series 1" },
    { mediaType: "cartoon_movie", tmdbId: 2, title: "Movie 2" },
    { mediaType: "cartoon_tv", tmdbId: 2, title: "Series 2" },
    { mediaType: "cartoon_movie", tmdbId: 3, title: "Movie 3" },
    { mediaType: "cartoon_tv", tmdbId: 3, title: "Series 3" },
    { mediaType: "cartoon_movie", tmdbId: 4, title: "Movie 4" },
    { mediaType: "cartoon_tv", tmdbId: 4, title: "Series 4" }
  ];
  const first = shuffleCartoonCatalog(items, "refresh-one");
  assert.deepEqual(shuffleCartoonCatalog(items, "refresh-one"), first);
  assert.notDeepEqual(shuffleCartoonCatalog(items, "refresh-two"), first);
  assert.equal(first.length, items.length);
  assert.equal(new Set(first.map((item) => item.mediaType + ":" + item.tmdbId)).size, items.length);
  assert.ok(first.some((item) => item.mediaType === "cartoon_movie"));
  assert.ok(first.some((item) => item.mediaType === "cartoon_tv"));
});

test("mixed Cartoon catalogue API is separate from the Kids Home landing view", async () => {
  const [app, component] = await Promise.all([
    read("../src/app.js"),
    read("../app/components/cartoons-catalog.jsx")
  ]);
  assert.ok(app.includes("app.get('/api/cartoons/catalog'"));
  assert.ok(app.includes("shuffleCartoonCatalog(items, shuffleSeed)"));
  assert.ok(component.includes('const homeView = view === "kidsHome";'));
  assert.ok(component.includes('const mixedView = view === "cartoons";'));
  assert.ok(component.includes('"/api/cartoons/catalog"'));
});


test("Cartoon search matches partial titles, aliases and small typing mistakes safely", () => {
  const partial = buildCartoonSearchAlternatives("ider", ["title", "aliases"]);
  assert.ok(partial.some((condition) => condition.title?.test("Spider-Man")));
  assert.ok(partial.some((condition) => condition.aliases?.test("The Amazing Spider-Man")));

  const escaped = buildCartoonSearchAlternatives("A.B", ["title"]);
  assert.ok(escaped.some((condition) => condition.title?.test("A.B")));
  assert.equal(escaped.some((condition) => condition.title?.test("AXB")), false);

  const typo = buildCartoonSearchAlternatives("Mickdy", ["title"]);
  assert.ok(typo.some((condition) => condition.title?.test("Mickey Mouse")));
  assert.deepEqual(buildCartoonSearchAlternatives("", ["title"]), []);
});

test("Kids search API uses tolerant matching but only queries the two approved Cartoon catalogues", async () => {
  const backend = await read("../src/app.js");
  const route = backend.slice(backend.indexOf("app.get('/api/cartoons/search'"), backend.indexOf("app.get('/api/movies/discover'"));
  assert.ok(route.includes("buildCartoonSearchAlternatives(query, ['title', 'originalTitle', 'aliases'])"));
  assert.ok(route.includes("findMatches(CartoonMovie"));
  assert.ok(route.includes("findMatches(CartoonSeries"));
  assert.ok(route.includes("approvedCartoonMovieFilter()"));
  assert.ok(route.includes("approvedCartoonSeriesFilter()"));
  assert.ok(route.includes("rankSearchResults(combined, query)"));
  assert.equal(route.includes("findMatches(Movie"), false);
  assert.equal(route.includes("findMatches(TvSeries"), false);
});
