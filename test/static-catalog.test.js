import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STATIC_MOVIES } from "../data/movie-catalog.js";
import { STATIC_TV_SERIES } from "../data/tv-catalog.js";
import { MANUAL_ANIME_CATALOG } from "../data/anime-catalog.js";
import { NEW_ANIME_CATALOG } from "../data/anime-additions.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("static packs contain 70 new IMDb Movies and 70 TMDB TV records", () => {
  assert.equal(STATIC_MOVIES.length, 70);
  assert.equal(new Set(STATIC_MOVIES.map((item) => item.imdbId)).size, 70);
  assert.ok(STATIC_MOVIES.every((item) => /^tt\d{5,12}$/.test(item.imdbId)));
  assert.ok(STATIC_MOVIES.every((item) => item.posterUrl && item.title && item.runtime > 0));

  assert.equal(STATIC_TV_SERIES.length, 70);
  assert.equal(new Set(STATIC_TV_SERIES.map((item) => item.tmdbId)).size, 70);
  assert.ok(STATIC_TV_SERIES.every((item) => Number.isSafeInteger(item.tmdbId) && item.tmdbId > 0));
  assert.ok(STATIC_TV_SERIES.every((item) => item.posterUrl && item.title && item.adult === false));
  assert.ok(STATIC_TV_SERIES.every((item) => item.numberOfSeasons > 0 && item.numberOfEpisodes > 0));
  assert.ok(STATIC_TV_SERIES.every((item) => Array.isArray(item.seasons) && item.seasons.length === 0));
});

test("legacy MAL entries remain available without being part of the new-only additions pack", () => {
  assert.ok(MANUAL_ANIME_CATALOG.length >= 80);
  assert.equal(new Set(MANUAL_ANIME_CATALOG.map((item) => item.malId)).size, MANUAL_ANIME_CATALOG.length);
  assert.ok(MANUAL_ANIME_CATALOG.every((item) => Number.isSafeInteger(item.malId) && item.malId > 0));
  assert.ok(MANUAL_ANIME_CATALOG.every((item) => item.title));
  assert.ok(MANUAL_ANIME_CATALOG.every((item) => item.posterUrl && item.synopsis && item.synopsis.length > 80));
});

test("200 new Anime entries have unique MAL IDs, matching posters/banners and episode still guides", () => {
  assert.equal(NEW_ANIME_CATALOG.length, 200);
  assert.equal(new Set(NEW_ANIME_CATALOG.map((item) => item.malId)).size, 200);
  const normalize = (value) => String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const legacyNames = new Set(
    MANUAL_ANIME_CATALOG.flatMap((item) => [item.title, item.titleEnglish]).filter(Boolean).map(normalize)
  );
  const newNames = NEW_ANIME_CATALOG.map((item) => normalize(item.titleEnglish || item.title));
  assert.equal(new Set(newNames).size, NEW_ANIME_CATALOG.length);
  assert.ok(newNames.every((name) => name && !legacyNames.has(name)));
  assert.ok(NEW_ANIME_CATALOG.every((item) =>
    Number.isSafeInteger(item.malId) && item.malId > 0 &&
    item.posterUrl && item.posterFallbackUrl && item.bannerUrl && item.backdropUrl &&
    item.synopsis && item.synopsis.length > 80 &&
    item.malUrl === "https://myanimelist.net/anime/" + item.malId &&
    item.sourceUrl && item.episodeGuide.length >= 5
  ));
  let episodeCount = 0;
  let stillCount = 0;
  for (const item of NEW_ANIME_CATALOG) {
    const keys = new Set();
    let stills = 0;
    for (const episode of item.episodeGuide) {
      const key = episode.seasonNumber + ":" + episode.episodeNumber;
      assert.ok(!keys.has(key));
      keys.add(key);
      assert.ok(episode.title);
      assert.ok(episode.seasonNumber >= 1 && episode.episodeNumber >= 1);
      if (episode.imageUrl) stills += 1;
    }
    assert.ok(stills / item.episodeGuide.length >= 0.8);
    episodeCount += item.episodeGuide.length;
    stillCount += stills;
  }
  assert.equal(episodeCount, 2883);
  assert.equal(stillCount, 2883);
});

test("Anime cleanup is dry-run by default and only deletes records with no poster or banner", async () => {
  const audit = await read("../scripts/audit-anime-artwork.js");
  assert.match(audit, /process\.argv\.includes\("--apply"\)/);
  assert.match(audit, /if \(!apply\)/);
  assert.match(audit, /filter\(\(check\) => !check\.posterOk && !check\.bannerOk\)/);
  assert.match(audit, /AnimeSeries\.deleteMany/);
  assert.match(audit, /for \(const method of \["HEAD", "GET"\]\)/);
  assert.match(audit, /reports\/anime-artwork-audit\.json/);
  assert.match(audit, /backdropPromise/);
  assert.doesNotMatch(audit, /Movie\.deleteMany|TvSeries\.deleteMany/);
});

test("Anime additions are seeded only for new MAL IDs/titles and never update old records", async () => {
  const script = await read("../scripts/seed-anime-additions.js");
  const staticSeed = await read("../scripts/seed-static-catalog.js");
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(pkg.scripts["seed:anime"], "node scripts/seed-catalog.js --anime");
  assert.equal(pkg.scripts["seed:anime:legacy-curated"], "node scripts/seed-anime-additions.js");
  assert.equal(pkg.scripts["check:anime"], "node scripts/check-anime-additions.js");
  assert.equal(pkg.scripts["audit:anime"], "node scripts/audit-anime-artwork.js");
  assert.equal(pkg.scripts["audit:anime:apply"], "node scripts/audit-anime-artwork.js --apply");
  assert.match(script, /NEW_ANIME_CATALOG/);
  assert.match(script, /existingIds/);
  assert.match(script, /existingTitles/);
  assert.match(script, /AnimeSeries\.insertMany/);
  assert.doesNotMatch(script, /bulkWrite|updateOne|findOneAndUpdate|\$set/);
  assert.doesNotMatch(script, /\bfetch\s*\(|axios|api\.jikan|api\.tvmaze|api\.themoviedb/i);
  assert.doesNotMatch(staticSeed, /AnimeSeries|MANUAL_ANIME_CATALOG|--anime/);
  assert.match(staticSeed, /STATIC_MOVIES/);
  assert.match(staticSeed, /STATIC_TV_SERIES/);
});

test("Anime list and search APIs omit heavy episode guides while detail API exposes them", async () => {
  const api = await read("../src/app.js");
  assert.match(api, /export function animeSeriesDto/);
  assert.match(api, /episodeGuide: Array\.isArray\(anime\.episodeGuide\)/);
  assert.match(api, /AnimeSeries\.find\(filter\)\.select\('-episodeGuide -relatedAnime'\)/);
  const search = api.slice(api.indexOf("app.get('/api/search'"), api.indexOf("app.get('/api/movies/suggestions'"));
  assert.match(search, /type: 'anime'[\s\S]*?Model: AnimeSeries/);
  assert.match(search, /dateField: 'airedFrom'/);
  assert.match(search, /select: 'malId title titleEnglish[\s\S]*?rating'/);
  assert.doesNotMatch(search, /select: '[^']*episodeGuide/);
  assert.match(api, /AnimeSeries\.findOne\(\{ malId, type: \{ \$in: \['TV', 'ONA'\] \} \}\)\.lean\(\)/);
});

test("Anime detail renders season-specific episode stills, franchise posters and Next Episode", async () => {
  const detail = await read("../app/anime/[malId]/detail.jsx");
  assert.match(detail, /episodeGuide/);
  assert.match(detail, /episodeRouteNumber/);
  assert.match(detail, /Season \{seasonNumber\} episode guide/);
  assert.match(detail, /item\.imageUrl/);
  assert.match(detail, /Related seasons and entries/);
  assert.match(detail, /Next episode/);
  assert.match(detail, /anime\.bannerUrl/);
  assert.match(detail, /Manual episode selection/);
});

test("static TV detail allows manual season and episode selection when no guide exists", async () => {
  const detail = await read("../app/tv/[tmdbId]/detail.jsx");
  assert.match(detail, /const hasEpisodeGuide =/);
  assert.match(detail, /type="number" min="0"/);
  assert.match(detail, /type="number" min="1"/);
  assert.match(detail, /Enter the season and episode number to open the episode in Situla/);
  assert.match(detail, /{hasEpisodeGuide && <div className="episode-guide-section/);
});
