import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STATIC_TV_SERIES } from "../data/tv-catalog.js";
import { TV_SERIES_CANDIDATES } from "../data/tv-additions.js";
import {
  buildSeasonRecords,
  isExactTvmazeMatch,
  mapTvmazeShow,
  normalizeShowName,
  stripHtml
} from "../scripts/seed-tv-series.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("TV candidate pack has more than 200 unique new TMDB IDs and policy-safe metadata references", () => {
  assert.ok(TV_SERIES_CANDIDATES.length >= 200);
  const staticIds = new Set(STATIC_TV_SERIES.map((item) => item.tmdbId));
  const candidateIds = TV_SERIES_CANDIDATES.map((item) => item.tmdbId);
  assert.equal(new Set(candidateIds).size, candidateIds.length);
  assert.ok(candidateIds.every((id) => Number.isSafeInteger(id) && id > 0 && !staticIds.has(id)));
  assert.ok(TV_SERIES_CANDIDATES.every((item) =>
    item.title && item.firstAirDate && item.numberOfSeasons > 0 && item.numberOfEpisodes > 0 &&
    /^https:\/\/.+/i.test(item.posterUrl) &&
    Array.isArray(item.genres) &&
    !item.genres.some((genre) => /adult|erotica|porn|hentai/i.test(genre))
  ));
  const keys = TV_SERIES_CANDIDATES.map((item) =>
    normalizeShowName(item.title) + "|" + item.firstAirDate.slice(0, 4)
  );
  assert.equal(new Set(keys).size, keys.length);
});

test("TVmaze candidate matching requires an exact normalized title and compatible air year", () => {
  const candidate = { title: "The Good Place", firstAirDate: "2016-09-19" };
  assert.equal(isExactTvmazeMatch({ id: 1, name: "The Good Place", premiered: "2016-09-19" }, candidate), true);
  assert.equal(isExactTvmazeMatch({ id: 1, name: "The Good Place (UK)", premiered: "2016-09-19" }, candidate), false);
  assert.equal(isExactTvmazeMatch({ id: 1, name: "The Good Place", premiered: "2018-01-01" }, candidate), false);
  assert.equal(normalizeShowName("Parks & Recreation"), "parks and recreation");
});

test("TV metadata mapper keeps full numbered seasons and episode descriptions", () => {
  const candidate = {
    tmdbId: 991234, title: "Example Series", firstAirDate: "2020-01-05",
    posterUrl: "https://image.tmdb.org/t/p/w500/example.jpg", genres: ["Drama"],
    network: "Example Network", country: "United States", creators: ["Example Creator"],
    referenceUrl: "https://example.com/series"
  };
  const show = {
    id: 123, name: "Example Series", premiered: "2020-01-05", status: "Ended",
    averageRuntime: 44, summary: "<p>A complete example series synopsis longer than forty characters.</p>",
    image: { original: "https://static.tvmaze.com/uploads/images/original_untouched/1/2.jpg" },
    rating: { average: 8.1 }, genres: ["Drama"],
    network: { name: "Example Network", country: { name: "United States" } },
    externals: { imdb: "tt1234567" },
    _embedded: { episodes: [
      { season: 0, number: 1, name: "Special", summary: "A special.", airdate: "2019-12-01", runtime: 20 },
      { season: 1, number: 1, name: "Pilot", summary: "<p>The first episode.</p>", airdate: "2020-01-05", runtime: 44,
        image: { original: "https://static.tvmaze.com/uploads/images/original_untouched/1/3.jpg" } },
      { season: 1, number: 2, name: "Second", summary: "The second episode.", airdate: "2020-01-12", runtime: 43 },
      { season: 2, number: 1, name: "Return", summary: "The season two premiere.", airdate: "2021-01-05", runtime: 45 }
    ]}
  };
  const mapped = mapTvmazeShow(show, candidate);
  assert.ok(mapped);
  assert.equal(mapped.tmdbId, candidate.tmdbId);
  assert.equal(mapped.overview, "A complete example series synopsis longer than forty characters.");
  assert.equal(mapped.numberOfSeasons, 2);
  assert.equal(mapped.numberOfEpisodes, 4);
  assert.deepEqual(mapped.seasons.map((season) => season.seasonNumber), [0, 1, 2]);
  assert.equal(mapped.seasons[1].episodes[0].episodeNumber, 1);
  assert.equal(mapped.seasons[1].episodes[0].stillUrl, "https://static.tvmaze.com/uploads/images/original_untouched/1/3.jpg");
  assert.equal(mapped.sourceUrl, "https://www.tvmaze.com/shows/123");
  assert.equal(mapped.externalImdbId, "tt1234567");
  assert.equal(mapped.adult, false);
});

test("TV mapper rejects mismatched titles, adult-tagged metadata and incomplete guides", () => {
  const candidate = {
    tmdbId: 123, title: "Example", firstAirDate: "2020-01-01",
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg", genres: ["Drama"]
  };
  const base = {
    id: 1, name: "Example", premiered: "2020-01-01",
    summary: "A sufficiently long synopsis for this example series.",
    image: { original: "https://static.tvmaze.com/poster.jpg" }, genres: ["Drama"],
    _embedded: { episodes: [{ season: 1, number: 1, name: "Pilot" }, { season: 1, number: 2, name: "Next" }] }
  };
  assert.equal(mapTvmazeShow({ ...base, name: "Different" }, candidate), null);
  assert.equal(mapTvmazeShow({ ...base, genres: ["Adult"] }, candidate), null);
  assert.equal(mapTvmazeShow({ ...base, summary: "" }, candidate), null);
  assert.equal(mapTvmazeShow({ ...base, _embedded: { episodes: [] } }, candidate), null);
});

test("Season mapper ignores malformed episode numbers and sanitizes HTML descriptions", () => {
  const seasons = buildSeasonRecords([
    { season: 1, number: 1, name: "Pilot", summary: "<p>Hello&nbsp;world</p>", image: { original: "https://images.example/pilot.jpg" } },
    { season: 1, number: 0, name: "Invalid" },
    { season: -1, number: 2, name: "Invalid" },
    { season: 1, number: 2, name: "Second" }
  ]);
  assert.equal(seasons.length, 1);
  assert.equal(seasons[0].episodeCount, 2);
  assert.equal(seasons[0].episodes[0].overview, "Hello world");
  assert.equal(seasons[0].episodes[0].stillUrl, "https://images.example/pilot.jpg");
  assert.equal(stripHtml("<p>A &amp; B</p>"), "A & B");
});

test("TV seed command is add-only for the 200 new titles and refreshes legacy TV only", async () => {
  const script = await read("../scripts/seed-tv-series.js");
  const pkg = JSON.parse(await read("../package.json"));
  const ci = await read("../.github/workflows/ci.yml");
  const workflow = await read("../.github/workflows/seed-tv-series.yml");
  const api = await read("../src/app.js");
  assert.equal(pkg.scripts["seed:tv"], "node scripts/seed-tv-series.js");
  assert.equal(pkg.scripts["check:tv"], "node --test test/tv-catalog.test.js");
  assert.equal(pkg.scripts["seed:catalog"], "npm run seed:movies && npm run seed:tv");
  assert.match(script, /TV_SERIES_TARGET_ADDITIONS = 200/);
  assert.match(script, /if\(newRecords\.length!==TV_SERIES_TARGET_ADDITIONS\)/);
  assert.match(script, /\$setOnInsert:record/);
  assert.match(script, /TvSeries\.bulkWrite\(operations,\{ordered:true\}\)/);
  assert.match(script, /verifyRemoteImage/);
  assert.match(script, /isExactTvmazeMatch/);
  assert.match(api, /select\('-seasons\.episodes'\)/);
  assert.match(api, /'seasons\.episodes': 0/);
  assert.match(ci, /npm run check:tv/);
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(workflow, /TVmaze metadata/);
});
