import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STATIC_MOVIES } from "../data/movie-catalog.js";
import { MOVIE_ADDITION_TARGET, MOVIE_DISCOVERY_PARTS } from "../data/movie-additions.js";

assert.equal(MOVIE_ADDITION_TARGET, 500, "Movie additions target must be exactly 500.");
assert.equal(MOVIE_DISCOVERY_PARTS.length, 5, "Movie discovery must be split into five parts.");
assert.equal(new Set(MOVIE_DISCOVERY_PARTS.map((part) => part.key)).size, 5, "Discovery part keys must be unique.");
assert.ok(MOVIE_DISCOVERY_PARTS.every((part) =>
  part.label && Number.isSafeInteger(part.pages) && part.pages >= 10 &&
  part.params && part.params.sort_by && part.params["vote_count.gte"] &&
  !/adult|erotica|porn|hentai/i.test(JSON.stringify(part.params))
), "Every part must provide a valid public, non-adult TMDB discovery query.");

const legacyIds = new Set(STATIC_MOVIES.map((item) => String(item.imdbId).toLowerCase()));
assert.equal(legacyIds.size, STATIC_MOVIES.length, "Legacy Movie IMDb IDs must remain unique.");
assert.ok([...legacyIds].every((id) => /^tt\d{5,12}$/.test(id)));

const seeder = await readFile(new URL("../scripts/seed-movie-additions.js", import.meta.url), "utf8");
assert.match(seeder, /MOVIE_ADDITION_TARGET/);
assert.match(seeder, /Movie\.insertMany\(newRecords/);
assert.match(seeder, /validateMovieRecord/);
assert.match(seeder, /verifyRemoteImage/);
assert.match(seeder, /append_to_response=external_ids,images,credits,keywords,release_dates,videos/);
assert.match(seeder, /external_ids\?\.imdb_id/);
assert.match(seeder, /if \(newRecords\.length !== targetRemaining\)/);
assert.doesNotMatch(seeder, /bulkWrite|updateOne|findOneAndUpdate|\$set/);

console.log("Movie additions check passed.");
console.log("Unique legacy Movie IMDb IDs:", legacyIds.size);
console.log("Discovery parts:", MOVIE_DISCOVERY_PARTS.length);
console.log("Verified movie additions target:", MOVIE_ADDITION_TARGET);
