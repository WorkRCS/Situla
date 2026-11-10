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

async function probeImageUrl(value) {
  if (!validImageUrl(value)) return false;
  for (const method of ["HEAD", "GET"]) {
    try {
      const response = await fetch(value, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "SitulaArtworkAudit/1.0" }
      });
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const imageResponse = response.ok &&
        (!contentType || contentType.startsWith("image/") || contentType === "application/octet-stream");
      await response.body?.cancel().catch(() => {});
      if (imageResponse) return true;
    } catch {}
  }
  return false;
}

async function mapWithLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

export async function auditAnimeArtwork({ apply = process.argv.includes("--apply") } = {}) {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME in .env first.");
  }

  await connectDatabase();
  const records = await AnimeSeries.find({})
    .select("malId title titleEnglish posterUrl bannerUrl backdropUrl")
    .lean();

  const imageChecks = await mapWithLimit(records, 16, async (item) => {
    const posterUrl = item.posterUrl;
    const bannerUrl = item.bannerUrl || item.backdropUrl;
    const [posterOk, bannerOk] = await Promise.all([
      probeImageUrl(posterUrl),
      bannerUrl && bannerUrl !== posterUrl ? probeImageUrl(bannerUrl) : probeImageUrl(posterUrl)
    ]);
    return { item, posterOk, bannerOk };
  });

  const missingPoster = imageChecks.filter((check) => !check.posterOk).map((check) => check.item);
  const missingBanner = imageChecks.filter((check) => !check.bannerOk).map((check) => check.item);
  // Keep a legacy record when at least its poster OR banner/backdrop is reachable.
  // Delete only records where both artwork checks fail.
  const withoutAnyArtwork = imageChecks
    .filter((check) => !check.posterOk && !check.bannerOk)
    .map((check) => check.item);

  console.log("Anime artwork audit");
  console.log("Records checked:", records.length);
  console.log("Poster missing/unreachable:", missingPoster.length);
  console.log("Banner missing/unreachable:", missingBanner.length);
  console.log("Remote image checks:", records.length, "records (HEAD with GET fallback, max 16 concurrent).");
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
