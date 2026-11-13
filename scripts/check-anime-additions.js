import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MANUAL_ANIME_CATALOG } from "../data/anime-catalog.js";
import { NEW_ANIME_CATALOG } from "../data/anime-additions.js";

function key(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function https(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

assert.equal(NEW_ANIME_CATALOG.length, 201, "Expected exactly 201 new Anime records.");
const ids = new Set();
const anilistIds = new Set();
const titles = new Set(MANUAL_ANIME_CATALOG.flatMap((item) => [item.title, item.titleEnglish]).filter(Boolean).map(key));
let episodeCount = 0;
let stillCount = 0;

for (const item of NEW_ANIME_CATALOG) {
  assert.ok(Number.isSafeInteger(item.malId) && item.malId > 0, "Invalid MAL ID.");
  assert.ok(!ids.has(item.malId), "Duplicate MAL ID: " + item.malId);
  ids.add(item.malId);
  if (item.anilistId !== undefined) {
    assert.ok(Number.isSafeInteger(item.anilistId) && item.anilistId > 0, "Invalid AniList ID for MAL " + item.malId);
    assert.ok(!anilistIds.has(item.anilistId), "Duplicate AniList ID: " + item.anilistId);
    anilistIds.add(item.anilistId);
    assert.equal(item.anilistUrl, "https://anilist.co/anime/" + item.anilistId);
  }

  const title = key(item.titleEnglish || item.title);
  assert.ok(title && !titles.has(title), "Duplicate Anime title: " + title);
  titles.add(title);

  assert.ok(item.title && item.titleEnglish, "Missing title for MAL " + item.malId);
  assert.ok(String(item.synopsis || "").trim().length > 80, "Missing synopsis for MAL " + item.malId);
  assert.ok(https(item.posterUrl) && https(item.posterFallbackUrl), "Missing poster for MAL " + item.malId);
  assert.ok(https(item.bannerUrl) && https(item.backdropUrl), "Missing banner for MAL " + item.malId);
  assert.equal(item.malUrl, "https://myanimelist.net/anime/" + item.malId);
  assert.equal(item.type, "TV");
  assert.ok(Array.isArray(item.episodeGuide) && item.episodeGuide.length >= 5, "Missing episode guide for MAL " + item.malId);

  const guideIds = new Set();
  let stills = 0;
  for (const episode of item.episodeGuide) {
    assert.ok(Number.isSafeInteger(episode.episodeNumber) && episode.episodeNumber > 0);
    assert.ok(Number.isSafeInteger(episode.seasonNumber) && episode.seasonNumber >= 0);
    assert.ok(String(episode.title || "").trim(), "Episode title missing for MAL " + item.malId);
    const episodeKey = episode.seasonNumber + ":" + episode.episodeNumber;
    assert.ok(!guideIds.has(episodeKey), "Duplicate episode " + episodeKey + " in MAL " + item.malId);
    guideIds.add(episodeKey);
    if (https(episode.imageUrl)) stills += 1;
  }
  assert.ok(stills / item.episodeGuide.length >= 0.8, "Insufficient episode still coverage for MAL " + item.malId);
  episodeCount += item.episodeGuide.length;
  stillCount += stills;
}

const seeder = await readFile(new URL("../scripts/catalog-import.js", import.meta.url), "utf8");
const runner = await readFile(new URL("../scripts/seed.js", import.meta.url), "utf8");
assert.match(seeder, /AnimeSeries/);
assert.match(seeder, /\.insertMany\(pending/);
assert.doesNotMatch(seeder, /updateOne|findOneAndUpdate|\$set|deleteMany|deleteOne/);
assert.match(runner, /seedOfflineCatalog/);
assert.match(runner, /refreshCatalogMarketData/);

console.log("Anime static check passed.");
console.log("New unique MAL records:", ids.size);
console.log("Episode guides:", episodeCount);
console.log("Verified episode still URLs:", stillCount);
console.log("Unified catalogue import remains insert-only; existing Anime records are not replaced.");
