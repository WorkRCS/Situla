import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TV_SERIES_CANDIDATES } from "../data/tv-additions.js";
import { STATIC_TV_SERIES } from "../data/tv-catalog.js";
import {
  buildSeasonRecords,
  isExactTvmazeMatch,
  mapTvmazeShow,
  MIN_TV_EPISODE_STILL_RATIO,
  normalizeShowName,
  stripHtml,
  validateTvSeriesRecord
} from "../scripts/seed-tv-series.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const still = (number) =>
  "https://static.tvmaze.com/uploads/images/original_untouched/1/" + number + ".jpg";

function fixture() {
  const candidate = {
    tmdbId: 991234,
    title: "Example Series",
    firstAirDate: "2020-01-05",
    posterUrl: "https://image.tmdb.org/t/p/w500/example.jpg",
    genres: ["Drama"],
    network: "Example Network",
    country: "United States",
    creators: ["Example Creator"],
    referenceUrl: "https://example.com/series"
  };
  const show = {
    id: 123,
    name: "Example Series",
    premiered: "2020-01-05",
    status: "Ended",
    averageRuntime: 44,
    summary: "<p>A complete example series synopsis that is longer than eighty characters and provides a useful description.</p>",
    image: { original: "https://static.tvmaze.com/uploads/images/original_untouched/1/poster.jpg" },
    rating: { average: 8.1 },
    genres: ["Drama"],
    network: { name: "Example Network", country: { name: "United States" } },
    externals: { imdb: "tt1234567" },
    _embedded: {
      episodes: [
        { season: 0, number: 1, name: "Special", summary: "A special.", airdate: "2019-12-01", runtime: 20, image: { original: still(1) } },
        { season: 1, number: 1, name: "Pilot", summary: "<p>The first episode.</p>", airdate: "2020-01-05", runtime: 44, image: { original: still(2) } },
        { season: 1, number: 2, name: "Second", summary: "The second episode.", airdate: "2020-01-12", runtime: 43, image: { original: still(3) } },
        { season: 1, number: 3, name: "Third", summary: "The third episode.", airdate: "2020-01-19", runtime: 43, image: { original: still(4) } },
        { season: 1, number: 4, name: "Finale", summary: "The final episode.", airdate: "2020-01-26", runtime: 45 }
      ]
    }
  };
  return { candidate, show };
}

test("TV candidate pack has at least 200 unique TMDB IDs and policy-safe metadata", () => {
  assert.ok(TV_SERIES_CANDIDATES.length >= 200);
  const ids = TV_SERIES_CANDIDATES.map((item) => item.tmdbId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => Number.isSafeInteger(id) && id > 0));
  const legacyIds = new Set(STATIC_TV_SERIES.map((item) => item.tmdbId));
  assert.ok(ids.every((id) => !legacyIds.has(id)), "New TV candidate IDs must not collide with the 70 legacy static IDs.");
  assert.ok(TV_SERIES_CANDIDATES.every((item) =>
    item.title && /^\d{4}-\d{2}-\d{2}$/.test(item.firstAirDate) &&
    item.numberOfSeasons > 0 && item.numberOfEpisodes > 0 &&
    /^https:\/\/.+/i.test(item.posterUrl) &&
    Array.isArray(item.genres) &&
    !item.genres.some((genre) => /adult|erotica|porn|hentai/i.test(genre))
  ));
  const keys = TV_SERIES_CANDIDATES.map((item) =>
    normalizeShowName(item.title) + "|" + item.firstAirDate.slice(0, 4)
  );
  assert.equal(new Set(keys).size, keys.length);
});

test("TVmaze matching requires an exact normalized title and explicit matching premiere year", () => {
  const candidate = { title: "The Good Place", firstAirDate: "2016-09-19" };
  assert.equal(isExactTvmazeMatch({ id: 1, name: "The Good Place", premiered: "2016-09-19" }, candidate), true);
  assert.equal(isExactTvmazeMatch({ id: 1, name: "The Good Place (UK)", premiered: "2016-09-19" }, candidate), false);
  assert.equal(isExactTvmazeMatch({ id: 1, name: "The Good Place", premiered: "2018-01-01" }, candidate), false);
  assert.equal(isExactTvmazeMatch({ id: 1, name: "The Good Place", premiered: null }, candidate), false);
  assert.equal(normalizeShowName("Parks & Recreation"), "parks and recreation");
});

test("TV metadata mapper preserves numbered season and episode records and passes the Anime-equivalent artwork gate", () => {
  const { candidate, show } = fixture();
  const mapped = mapTvmazeShow(show, candidate);
  assert.ok(mapped);
  assert.equal(mapped.tmdbId, candidate.tmdbId);
  assert.equal(mapped.overview.startsWith("A complete example"), true);
  assert.equal(mapped.numberOfSeasons, 1);
  assert.equal(mapped.numberOfEpisodes, 5);
  assert.deepEqual(mapped.seasons.map((season) => season.seasonNumber), [0, 1]);
  assert.equal(mapped.seasons[1].episodes[0].episodeNumber, 1);
  assert.equal(mapped.seasons[1].episodes[0].stillUrl, still(2));
  assert.equal(mapped.sourceUrl, "https://www.tvmaze.com/shows/123");
  assert.equal(mapped.externalImdbId, "tt1234567");
  assert.equal(mapped.adult, false);
  assert.equal(mapped.backdropUrl, null, "a portrait poster must not be reused as a landscape backdrop");
  assert.equal(validateTvSeriesRecord(mapped), true);
  assert.equal(MIN_TV_EPISODE_STILL_RATIO, 0.8);
});

test("TV mapper rejects wrong title/year, adult content, short synopsis and incomplete guides", () => {
  const { candidate, show } = fixture();
  assert.equal(mapTvmazeShow({ ...show, name: "Different Series" }, candidate), null);
  assert.equal(mapTvmazeShow({ ...show, premiered: "2022-01-01" }, candidate), null);
  assert.equal(mapTvmazeShow({ ...show, genres: ["Adult"] }, candidate), null);
  assert.equal(mapTvmazeShow({ ...show, summary: "Too short." }, candidate), null);
  assert.equal(mapTvmazeShow({
    ...show, _embedded: { episodes: show._embedded.episodes.slice(0, 4) }
  }, candidate), null);
});

test("Season mapper sanitizes HTML, ignores malformed episode numbers and rejects duplicate keys", () => {
  const seasons = buildSeasonRecords([
    { season: 1, number: 1, name: "Pilot", summary: "<p>Hello&nbsp;world</p>", image: { original: still(1) } },
    { season: 1, number: 0, name: "Invalid" },
    { season: -1, number: 2, name: "Invalid" },
    { season: 1, number: 2, name: "Second" }
  ]);
  assert.equal(seasons.length, 1);
  assert.equal(seasons[0].episodeCount, 2);
  assert.equal(seasons[0].episodes[0].overview, "Hello world");
  assert.equal(seasons[0].episodes[0].stillUrl, still(1));
  assert.equal(stripHtml("<p>A &amp; B</p>"), "A & B");
  assert.throws(() => buildSeasonRecords([
    { season: 1, number: 1, name: "Pilot" },
    { season: 1, number: 1, name: "Duplicate" }
  ]), /Duplicate TVmaze episode/);
  assert.throws(() => buildSeasonRecords([
    { season: 1, number: 1, name: "" }
  ]), /has no title/);
});

test("TV database validator enforces consistent totals, unique episodes and 80% reachable-still coverage", () => {
  const { candidate, show } = fixture();
  const record = mapTvmazeShow(show, candidate);
  assert.equal(validateTvSeriesRecord(record), true);

  const tooFewStills = structuredClone(record);
  tooFewStills.seasons[1].episodes[2].stillUrl = null;
  assert.throws(() => validateTvSeriesRecord(tooFewStills), /still coverage/);

  const duplicateEpisode = structuredClone(record);
  duplicateEpisode.seasons[1].episodes[1].episodeNumber = 1;
  assert.throws(() => validateTvSeriesRecord(duplicateEpisode), /duplicate or untitled episode/);

  const skippedEpisode = structuredClone(record);
  skippedEpisode.seasons[1].episodes[2].episodeNumber = 8;
  assert.throws(() => validateTvSeriesRecord(skippedEpisode), /Non-contiguous episode numbering/);

  const skippedSeason = structuredClone(record);
  skippedSeason.seasons[1].seasonNumber = 2;
  assert.throws(() => validateTvSeriesRecord(skippedSeason), /Non-contiguous season numbering/);

  const wrongTotal = structuredClone(record);
  wrongTotal.numberOfEpisodes += 1;
  assert.throws(() => validateTvSeriesRecord(wrongTotal), /Episode total does not match/);
});

test("TV seed is new-only and cannot overwrite an existing series document", async () => {
  const script = await read("../scripts/seed-tv-series.js");
  const pkg = JSON.parse(await read("../package.json"));
  const ci = await read("../.github/workflows/ci.yml");
  const workflow = await read("../.github/workflows/seed-tv-series.yml");
  const api = await read("../src/app.js");

  assert.equal(pkg.scripts["seed:tv"], "node scripts/seed-catalog.js --tv");
  assert.equal(pkg.scripts["seed:tv:legacy-online"], "node scripts/seed-static-catalog.js --tv && node scripts/seed-tv-series.js");
  assert.equal(pkg.scripts["check:tv"], "node --test test/tv-catalog.test.js");
  assert.match(script, /TV_SERIES_TARGET_ADDITIONS = 200/);
  assert.match(script, /TvSeries\.insertMany\(newRecords/);
  assert.doesNotMatch(script, /bulkWrite|updateOne|findOneAndUpdate|\$set|STATIC_TV_SERIES/);
  assert.match(script, /MIN_TV_EPISODE_STILL_RATIO = 0\.8/);
  assert.match(script, /verifyRemoteImage/);
  assert.match(script, /validateTvSeriesRecord/);
  assert.match(script, /isExactTvmazeMatch/);
  assert.match(api, /select\('-seasons\.episodes'\)/);
  assert.match(api, /'seasons\.episodes': 0/);
  assert.match(ci, /npm run check:tv/);
  assert.match(workflow, /timeout-minutes: 60/);
  assert.match(workflow, /Default catalogue seed reads committed data files only/);
  assert.doesNotMatch(workflow, /TVmaze metadata|Cinemeta metadata by IMDb ID/);
  assert.doesNotMatch(workflow, /TMDB_API_READ_ACCESS_TOKEN/);
});
