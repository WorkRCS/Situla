import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../src/db.js";
import { AnimeSeries } from "../src/models.js";

function validImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export async function auditAnimeArtwork({ apply = process.argv.includes("--apply") } = {}) {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME in .env first.");
  }

  await connectDatabase();
  const records = await AnimeSeries.find({})
    .select("malId title titleEnglish posterUrl bannerUrl backdropUrl")
    .lean();

  const missingPoster = [];
  const missingBanner = [];
  const withoutAnyArtwork = [];

  for (const item of records) {
    const posterOk = validImageUrl(item.posterUrl);
    const bannerOk = validImageUrl(item.bannerUrl || item.backdropUrl);
    if (!posterOk) missingPoster.push(item);
    if (!bannerOk) missingBanner.push(item);
    // Keep a legacy record when at least its poster OR banner/backdrop is valid.
    // Delete only records with neither kind of artwork.
    if (!posterOk && !bannerOk) withoutAnyArtwork.push(item);
  }

  console.log("Anime artwork audit");
  console.log("Records checked:", records.length);
  console.log("Poster missing:", missingPoster.length);
  console.log("Banner missing:", missingBanner.length);
  console.log("No usable poster AND no usable banner:", withoutAnyArtwork.length);
  console.log("Mode:", apply ? "APPLY" : "DRY RUN");
  for (const item of withoutAnyArtwork.slice(0, 30)) {
    console.log("Would remove:", item.malId, "-", item.titleEnglish || item.title);
  }
  if (withoutAnyArtwork.length > 30) console.log("...and", withoutAnyArtwork.length - 30, "more.");

  if (!apply) {
    console.log("Dry run only. No Anime records were deleted. Run npm run audit:anime:apply to remove only records with no usable artwork at all.");
    return { checked: records.length, missingPoster: missingPoster.length, missingBanner: missingBanner.length, removed: 0, candidates: withoutAnyArtwork.length };
  }

  if (!withoutAnyArtwork.length) {
    console.log("Nothing to delete.");
    return { checked: records.length, missingPoster: missingPoster.length, missingBanner: missingBanner.length, removed: 0, candidates: 0 };
  }

  const ids = withoutAnyArtwork.map((item) => item.malId);
  const result = await AnimeSeries.deleteMany({ malId: { $in: ids } });
  const removed = Number(result.deletedCount || 0);
  console.log("Deleted Anime records without poster and banner:", removed);
  return { checked: records.length, missingPoster: missingPoster.length, missingBanner: missingBanner.length, removed, candidates: ids.length };
}

auditAnimeArtwork()
  .catch((error) => {
    console.error("Anime artwork audit failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
