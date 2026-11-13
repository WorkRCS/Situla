import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../src/db.js";
import { AnimeSeries } from "../src/models.js";
import { NEW_ANIME_CATALOG } from "../data/anime-additions.js";

function normalizeTitle(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function validHttps(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function validateNewAnime(records = NEW_ANIME_CATALOG) {
  if (!Array.isArray(records) || records.length !== 201) {
    throw new Error("Expected exactly 201 curated new Anime records.");
  }
  const ids = new Set();
  const anilistIds = new Set();
  const titles = new Set();
  for (const item of records) {
    if (!Number.isSafeInteger(item?.malId) || item.malId < 1) throw new Error("Invalid MAL ID.");
    if (ids.has(item.malId)) throw new Error("Duplicate MAL ID: " + item.malId);
    ids.add(item.malId);
    if (item.anilistId !== undefined && item.anilistId !== null) {
      if (!Number.isSafeInteger(item.anilistId) || item.anilistId < 1 || anilistIds.has(item.anilistId)) {
        throw new Error("Invalid or duplicate AniList ID for MAL " + item.malId);
      }
      if (item.anilistUrl !== "https://anilist.co/anime/" + item.anilistId) {
        throw new Error("Incorrect canonical AniList URL for MAL " + item.malId);
      }
      anilistIds.add(item.anilistId);
    }
    const title = normalizeTitle(item.titleEnglish || item.title);
    if (!title || titles.has(title)) throw new Error("Duplicate/empty Anime title: " + item.malId);
    titles.add(title);
    if (!item.title || !item.titleEnglish || String(item.synopsis || "").trim().length < 80) {
      throw new Error("Anime title or synopsis missing for MAL " + item.malId);
    }
    if (!validHttps(item.posterUrl) || !validHttps(item.bannerUrl)) {
      throw new Error("Poster/banner missing for MAL " + item.malId);
    }
    if (item.malUrl !== "https://myanimelist.net/anime/" + item.malId) {
      throw new Error("Incorrect canonical MAL URL for MAL " + item.malId);
    }
    if (!Array.isArray(item.episodeGuide) || item.episodeGuide.length < 5) {
      throw new Error("Episode guide missing for MAL " + item.malId);
    }
    const guideKeys = new Set();
    let stills = 0;
    for (const episode of item.episodeGuide) {
      const key = Number(episode.seasonNumber) + ":" + Number(episode.episodeNumber);
      if (!Number.isSafeInteger(episode.episodeNumber) || episode.episodeNumber < 1 || !episode.title) {
        throw new Error("Invalid episode guide entry for MAL " + item.malId);
      }
      if (guideKeys.has(key)) throw new Error("Duplicate season/episode " + key + " for MAL " + item.malId);
      guideKeys.add(key);
      if (validHttps(episode.imageUrl)) stills += 1;
    }
    if (stills / item.episodeGuide.length < 0.8) throw new Error("Insufficient episode artwork for MAL " + item.malId);
  }
}

export async function seedAnimeAdditions() {
  validateNewAnime();
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME in .env first.");
  }

  await connectDatabase();
  const existing = await AnimeSeries.find({})
    .select("malId anilistId title titleEnglish")
    .lean();
  const existingIds = new Set(existing.map((item) => Number(item.malId)));
  const existingAniListIds = new Set(existing.map((item) => Number(item.anilistId)).filter((id) => Number.isSafeInteger(id) && id > 0));
  const existingTitles = new Set(existing.flatMap((item) => [item.title, item.titleEnglish]).filter(Boolean).map(normalizeTitle));

  const newRecords = NEW_ANIME_CATALOG.filter((item) => {
    const title = normalizeTitle(item.titleEnglish || item.title);
    return !existingIds.has(item.malId) && !(item.anilistId && existingAniListIds.has(item.anilistId)) && !existingTitles.has(title);
  });
  const skipped = NEW_ANIME_CATALOG.length - newRecords.length;

  if (!newRecords.length) {
    console.log("No new Anime to insert. Existing MAL IDs/titles were left untouched.");
    return { inserted: 0, skipped, total: await AnimeSeries.countDocuments() };
  }

  // This path is insert-only: no update/upsert operation can touch legacy Anime docs.
  // The unique MAL index protects against a second process inserting the same ID.
  let inserted = 0;
  try {
    const created = await AnimeSeries.insertMany(newRecords, { ordered: false });
    inserted = created.length;
  } catch (error) {
    const partial = Array.isArray(error.insertedDocs) ? error.insertedDocs.length : 0;
    const writeErrors = error.writeErrors || error.result?.writeErrors || [];
    const duplicateOnly = writeErrors.length > 0 && writeErrors.every((entry) => Number(entry.code || entry.err?.code) === 11000);
    if (!partial && !duplicateOnly) throw error;
    inserted = partial;
    console.warn("Some MAL IDs were inserted by another seed process; duplicates were left unchanged.");
  }
  const total = await AnimeSeries.countDocuments();
  console.log("New Anime inserted:", inserted);
  console.log("Existing MAL IDs/titles skipped without update:", skipped + (newRecords.length - inserted));
  console.log("Anime collection total:", total);
  return { inserted, skipped: skipped + (newRecords.length - inserted), total };
}

seedAnimeAdditions()
  .catch((error) => {
    console.error("Anime additions seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
