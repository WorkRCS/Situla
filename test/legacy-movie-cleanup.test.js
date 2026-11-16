import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PRE_2000_MOVIE_FILTER,
  PRE_2000_TV_FILTER,
  PRE_2000_ANIME_FILTER,
  PRE_2000_CARTOON_MOVIE_FILTER,
  PRE_2000_CARTOON_SERIES_FILTER,
  isPre2000Movie,
  isPre2000TvSeries,
  isPre2000Anime,
  isPre2000CartoonMovie,
  isPre2000CartoonSeries,
  shouldDelete
} from "../scripts/delete-movies-before-2000.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("pre-2000 cutoff removes only records released before 2000", () => {
  assert.equal(isPre2000Movie({ releaseYear: 1999, releaseDate: "1999-12-31" }), true);
  assert.equal(isPre2000Movie({ releaseYear: 1900 }), true);
  assert.equal(isPre2000Movie({ releaseYear: 2000, releaseDate: "2000-01-01" }), false);
  assert.equal(isPre2000Movie({ releaseYear: 2026 }), false);
  assert.equal(isPre2000Movie({ releaseYear: null, releaseDate: "1999-06-30" }), true);
  assert.equal(isPre2000Movie({ releaseYear: undefined, releaseDate: "1899" }), true);
  assert.equal(isPre2000Movie({ releaseYear: 2001, releaseDate: "1999-06-30" }), false);
  assert.equal(isPre2000Movie({ releaseYear: null, releaseDate: "unknown" }), false);
  assert.equal(isPre2000Movie({}), false);
});

test("TV series use firstAirDate when releaseYear is absent", () => {
  assert.equal(isPre2000TvSeries({ releaseYear: 1999, firstAirDate: "1999-12-31" }), true);
  assert.equal(isPre2000TvSeries({ releaseYear: null, firstAirDate: "1988-03-01" }), true);
  assert.equal(isPre2000TvSeries({ releaseYear: 2000, firstAirDate: "1999-12-31" }), false);
  assert.equal(isPre2000TvSeries({ firstAirDate: "2000-01-01" }), false);
  assert.equal(isPre2000TvSeries({}), false);
});

test("Anime uses airedFrom and its releaseYear fallback", () => {
  assert.equal(isPre2000Anime({ releaseYear: 1999, airedFrom: "1999-04-01" }), true);
  assert.equal(isPre2000Anime({ releaseYear: null, airedFrom: "1998-04-03" }), true);
  assert.equal(isPre2000Anime({ releaseYear: 2000, airedFrom: "1999-12-31" }), false);
  assert.equal(isPre2000Anime({ airedFrom: "2000-01-01" }), false);
  assert.equal(isPre2000Anime({}), false);
});

test("Cartoon movie and series use their own release/premiere date fields", () => {
  assert.equal(isPre2000CartoonMovie({ releaseYear: null, releaseDate: "1999-01-01" }), true);
  assert.equal(isPre2000CartoonMovie({ releaseYear: 2000 }), false);
  assert.equal(isPre2000CartoonSeries({ releaseYear: null, firstAirDate: "1997-01-01" }), true);
  assert.equal(isPre2000CartoonSeries({ releaseYear: 2000 }), false);
});

test("Mongo cleanup filters use the correct date field and 2000 boundary", () => {
  const cases = [
    [PRE_2000_MOVIE_FILTER, "releaseDate"],
    [PRE_2000_TV_FILTER, "firstAirDate"],
    [PRE_2000_ANIME_FILTER, "airedFrom"],
    [PRE_2000_CARTOON_MOVIE_FILTER, "releaseDate"],
    [PRE_2000_CARTOON_SERIES_FILTER, "firstAirDate"]
  ];

  for (const [filter, dateField] of cases) {
    assert.deepEqual(filter.$or[0], { releaseYear: { $type: "number", $lt: 2000 } });
    assert.equal(filter.$or[1].releaseYear, null);
    assert.match(filter.$or[1][dateField].$regex.source, /^\^\(\?:18\|19\)/);
  }
});

test("permanent cleanup still requires an explicit confirmation flag", () => {
  assert.equal(shouldDelete([]), false);
  assert.equal(shouldDelete(["--dry-run"]), false);
  assert.equal(shouldDelete(["--confirm-delete"]), true);
  assert.equal(shouldDelete(["--dry-run", "--confirm-delete"]), true);
});

test("cleanup targets only the five requested top-level media collections", async () => {
  const script = await read("../scripts/delete-movies-before-2000.js");
  for (const model of ["Movie", "TvSeries", "AnimeSeries", "CartoonMovie", "CartoonSeries"]) {
    assert.match(script, new RegExp('name: "' + model + '",\\s*model: ' + model + ','));
  }
  assert.match(script, /target\\.model\\.countDocuments\\(target\\.filter\\)/);
  assert.match(script, /item\\.model\\.deleteMany\\(item\\.filter\\)/);
  assert.doesNotMatch(script, /CartoonEpisode|User|GuestSession|WatchHistory/);
  assert.match(script, /if \(!confirm\)[\s\S]*?DRY RUN ONLY/);
});
