import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shuffleCartoonCatalog } from "../src/cartoon-catalog.js";

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
