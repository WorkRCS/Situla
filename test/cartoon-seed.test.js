import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCartoonEpisodeData,
  deriveCartoonBadges,
  isCartoonYearAllowed,
  isChildrenAnimation
} from "../src/cartoon-seed.js";

test("Cartoon dataset strictly accepts 2000 and later", () => {
  assert.equal(isCartoonYearAllowed("1999-12-31"), false);
  assert.equal(isCartoonYearAllowed(1999), false);
  assert.equal(isCartoonYearAllowed("2000-01-01"), true);
  assert.equal(isCartoonYearAllowed(2026), true);
  assert.equal(isCartoonYearAllowed("unknown"), false);
});

test("only child-safe animated genres and explicit pinned titles qualify", () => {
  assert.equal(isChildrenAnimation({ genres: ["Animation", "Children"] }), true);
  assert.equal(isChildrenAnimation({ genres: ["Animation", "Family"] }), true);
  assert.equal(isChildrenAnimation({ genres: ["Animation", "Comedy"], rating: "TV-Y7" }), true);
  assert.equal(isChildrenAnimation({ genres: ["Animation", "Adult"] }), false);
  assert.equal(isChildrenAnimation({ genres: ["Animation", "Horror", "Family"] }), false);
  assert.equal(isChildrenAnimation({ genres: ["Drama"], pinned: true }), false);
});

test("episode guide maps unique season/episode records and builds summaries", () => {
  const result = buildCartoonEpisodeData(70058, [
    { season: 1, number: 1, name: "Pilot", airdate: "2012-10-16", image: { original: "https://example.com/1.jpg" } },
    { season: 1, number: 2, name: "Race", airdate: "2012-10-17" },
    { season: 0, number: 1, name: "Special", airdate: "2013-01-01" },
    { season: 1, number: 1, name: "Duplicate" },
    { season: -1, number: 1, name: "Invalid" }
  ], "https://example.com/poster.jpg");
  assert.equal(result.numberOfEpisodes, 3);
  assert.equal(result.numberOfSeasons, 1);
  assert.equal(result.seasons.length, 2);
  assert.equal(result.episodes[0].seriesTmdbId, 70058);
  assert.equal(result.episodes[0].stillUrl, "https://example.com/1.jpg");
  assert.equal(result.episodes[0].tmdbEpisodeId, null);
});

test("Hot, Popular and Featured badges are based on public score/popularity values", () => {
  const records = deriveCartoonBadges([
    { tmdbId: 1, releaseYear: 2026, voteAverage: 8, voteCount: 5000, popularity: 100 },
    { tmdbId: 2, releaseYear: 2005, voteAverage: 5, voteCount: 3, popularity: 1 }
  ], { currentYear: 2026 });
  assert.equal(records.find((item) => item.tmdbId === 1).popular, true);
  assert.equal(records.find((item) => item.tmdbId === 1).hot, true);
  assert.equal(records.find((item) => item.tmdbId === 1).featured, true);
  assert.equal(records.find((item) => item.tmdbId === 2).popular, false);
  assert.equal(records.find((item) => item.tmdbId === 2).hot, false);
});
