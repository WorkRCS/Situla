import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchYearOptions } from "../src/search-year-options.js";

test("search year selector contains only distinct years present in database values", () => {
  const result = buildSearchYearOptions([
    [2024, 2020, 2011, null],
    ["2024-12-01", "2018-07-10", "unknown", ""],
    ["2009", 1900, 1800, 2035]
  ], { minimumYear: 1870, maximumYear: 2026 });

  assert.deepEqual(result.years, [2024, 2020, 2018, 2011, 2009, 1900]);
  assert.equal(result.oldestYear, 1900);
  assert.equal(result.newestYear, 2024);
});

test("search year selector does not fabricate missing years or render years outside DB bounds", () => {
  const result = buildSearchYearOptions(["2025-01-01", "2022-06-01", "2014", "1998-12-31"], {
    minimumYear: 2000,
    maximumYear: 2026
  });

  assert.deepEqual(result.years, [2025, 2022, 2014]);
  assert.equal(result.oldestYear, 2014);
  assert.equal(result.newestYear, 2025);
});

test("empty catalog year values returns an empty range", () => {
  assert.deepEqual(buildSearchYearOptions([null, "", "unknown"]), {
    years: [],
    oldestYear: null,
    newestYear: null
  });
});
