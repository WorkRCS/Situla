import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PRE_2000_MOVIE_FILTER,
  isPre2000Movie,
  shouldDelete
} from "../scripts/delete-movies-before-2000.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("legacy Movie date rule removes only dates strictly before 2000", () => {
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

test("Mongo cleanup filter scopes numeric years and legacy date fallback", () => {
  assert.deepEqual(PRE_2000_MOVIE_FILTER.$or[0], {
    releaseYear: { $type: "number", $lt: 2000 }
  });
  assert.equal(PRE_2000_MOVIE_FILTER.$or[1].releaseYear, null);
  assert.match(PRE_2000_MOVIE_FILTER.$or[1].releaseDate.$regex, /^\^\(/);
});

test("permanent Movie deletion requires an explicit confirmation flag", () => {
  assert.equal(shouldDelete([]), false);
  assert.equal(shouldDelete(["--dry-run"]), false);
  assert.equal(shouldDelete(["--confirm-delete"]), true);
  assert.equal(shouldDelete(["--dry-run", "--confirm-delete"]), true);
});

test("cleanup command imports and deletes only the Movie model", async () => {
  const script = await read("../scripts/delete-movies-before-2000.js");
  assert.match(script, /import \{ Movie \} from "\.\.\/src\/models\.js"/);
  assert.match(script, /Movie\.countDocuments\(PRE_2000_MOVIE_FILTER\)/);
  assert.match(script, /Movie\.deleteMany\(PRE_2000_MOVIE_FILTER\)/);
  assert.doesNotMatch(script, /CartoonMovie|TvSeries|AnimeSeries/);
  assert.match(script, /if \(!confirm\)[\s\S]*?DRY RUN ONLY/);
});
