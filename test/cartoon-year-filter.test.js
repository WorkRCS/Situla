import test from "node:test";
import assert from "node:assert/strict";
import {
  approvedCartoonMovieFilter,
  approvedCartoonSeriesFilter,
  isPost2000CartoonMovie,
  isPost2000CartoonSeries
} from "../src/cartoon-catalog.js";

test("Cartoon movie cutoff accepts 2000 onward and rejects older or unknown years", () => {
  assert.equal(isPost2000CartoonMovie({ releaseDate: "1999-12-31", releaseYear: 1999 }), false);
  assert.equal(isPost2000CartoonMovie({ releaseDate: "2000-01-01", releaseYear: 2000 }), true);
  assert.equal(isPost2000CartoonMovie({ releaseDate: "2026-11-16" }), true);
  assert.equal(isPost2000CartoonMovie({ releaseYear: 1999 }), false);
  assert.equal(isPost2000CartoonMovie({ releaseYear: 2000 }), true);
  assert.equal(isPost2000CartoonMovie({ releaseDate: "not-a-date", releaseYear: 2020 }), false);
  assert.equal(isPost2000CartoonMovie({}), false);
});

test("Cartoon series cutoff accepts only first-air dates from 2000 onward", () => {
  assert.equal(isPost2000CartoonSeries({ firstAirDate: "1999-12-31", releaseYear: 1999 }), false);
  assert.equal(isPost2000CartoonSeries({ firstAirDate: "2000-01-01", releaseYear: 2000 }), true);
  assert.equal(isPost2000CartoonSeries({ firstAirDate: "2026-01-01" }), true);
  assert.equal(isPost2000CartoonSeries({ releaseYear: 1999 }), false);
  assert.equal(isPost2000CartoonSeries({ releaseYear: 2000 }), true);
  assert.equal(isPost2000CartoonSeries({ firstAirDate: "unknown", releaseYear: 2020 }), false);
  assert.equal(isPost2000CartoonSeries({}), false);
});

test("Mongo cartoon filters enforce Kids approval and model-specific date fields", () => {
  const movie = approvedCartoonMovieFilter({ tmdbId: 10 });
  const series = approvedCartoonSeriesFilter({ tmdbId: 20 });
  assert.equal(movie.kidsApproved, true);
  assert.equal(series.kidsApproved, true);
  assert.equal(movie.tmdbId, 10);
  assert.equal(series.tmdbId, 20);
  assert.deepEqual(movie.$and[0].$or[0].releaseDate, { $gte: "2000-01-01" });
  assert.deepEqual(movie.$and[0].$or[1], {
    releaseDate: { $in: [null, ""] },
    releaseYear: { $gte: 2000 }
  });
  assert.deepEqual(series.$and[0].$or[0].firstAirDate, { $gte: "2000-01-01" });
  assert.deepEqual(series.$and[0].$or[1], {
    firstAirDate: { $in: [null, ""] },
    releaseYear: { $gte: 2000 }
  });
  assert.equal(movie.$nor.length, 3);
  assert.equal(series.$nor.length, 3);
});
