import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../src/db.js";
import { AnimeSeries } from "../src/models.js";
import { MANUAL_ANIME_CATALOG } from "../data/anime-catalog.js";

export async function seedManualAnimeCatalog() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME in .env before adding Anime records.");
  }
  if (!Array.isArray(MANUAL_ANIME_CATALOG) || MANUAL_ANIME_CATALOG.length === 0) {
    throw new Error("The manual Anime catalog is empty. Add entries to data/anime-catalog.js first.");
  }

  const seen = new Set();
  for (const item of MANUAL_ANIME_CATALOG) {
    const malId = Number(item?.malId);
    if (!Number.isSafeInteger(malId) || malId < 1) throw new Error("Every Anime record needs a positive numeric MAL ID.");
    if (seen.has(malId)) throw new Error("Duplicate MAL ID in data/anime-catalog.js: " + malId);
    seen.add(malId);
    if (typeof item.title !== "string" || !item.title.trim()) throw new Error("MAL " + malId + " is missing a title.");
    if (item.episodes != null && (!Number.isSafeInteger(Number(item.episodes)) || Number(item.episodes) < 1)) {
      throw new Error("MAL " + malId + " has an invalid episode count.");
    }
    if (item.type !== "TV" && item.type !== "ONA") {
      throw new Error("MAL " + malId + " must be a TV or ONA entry for the Anime series catalog.");
    }
  }

  await connectDatabase();
  let added = 0;
  let alreadyPresent = 0;
  for (const item of MANUAL_ANIME_CATALOG) {
    const result = await AnimeSeries.updateOne(
      { malId: Number(item.malId) },
      { $setOnInsert: { ...item, malId: Number(item.malId) } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (result.upsertedCount > 0) {
      added += 1;
      console.log("  + Added " + item.title + " · MAL " + item.malId);
    } else {
      alreadyPresent += 1;
      console.log("  = Kept existing " + item.title + " · MAL " + item.malId);
    }
  }

  const total = await AnimeSeries.countDocuments();
  console.log("Manual Anime catalog complete: " + added + " added, " + alreadyPresent + " already present, " + total + " total Anime records.");
  return { added, alreadyPresent, total };
}

seedManualAnimeCatalog()
  .catch((error) => {
    console.error("Manual Anime catalog failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
