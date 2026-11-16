import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import { Movie } from "../src/models.js";

const CONFIRM_FLAG = "--confirm-delete";

/**
 * Only the main Movie collection is targeted.
 * A known numeric releaseYear takes precedence; releaseDate is used only
 * for older legacy rows where releaseYear is absent/null.
 */
export const PRE_2000_MOVIE_FILTER = Object.freeze({
  $or: [
    { releaseYear: { $type: "number", $lt: 2000 } },
    {
      releaseYear: null,
      releaseDate: { $regex: /^(?:18|19)\d{2}(?:-|$)/ }
    }
  ]
});

export function isPre2000Movie(movie) {
  const year = Number(movie?.releaseYear);
  if (Number.isInteger(year) && movie.releaseYear !== null && movie.releaseYear !== undefined) {
    return year > 0 && year < 2000;
  }
  const match = String(movie?.releaseDate || "").match(/^(\d{4})(?:-|$)/);
  return Boolean(match && Number(match[1]) > 0 && Number(match[1]) < 2000);
}

export function shouldDelete(argv = process.argv.slice(2)) {
  return Array.isArray(argv) && argv.includes(CONFIRM_FLAG);
}

export async function runPre2000MovieCleanup({ confirm = false } = {}) {
  await connectDatabase();

  const matchedCount = await Movie.countDocuments(PRE_2000_MOVIE_FILTER);
  const sample = await Movie.find(PRE_2000_MOVIE_FILTER)
    .select("imdbId title releaseYear releaseDate")
    .sort({ releaseYear: 1, releaseDate: 1 })
    .limit(20)
    .lean();

  console.log("\nSitula legacy Movie cleanup");
  console.log("Target collection: Movie (movies only)");
  console.log("Rule: release year before 2000");
  console.log("Matching records:", matchedCount);
  console.log("Sample (up to 20):", JSON.stringify(sample, null, 2));

  if (!confirm) {
    console.log("\nDRY RUN ONLY — no records were deleted.");
    console.log("To permanently delete these Movie records, run:");
    console.log("npm run delete:movies:before-2000 -- --confirm-delete");
    return { dryRun: true, matchedCount, deletedCount: 0 };
  }

  const result = await Movie.deleteMany(PRE_2000_MOVIE_FILTER);
  console.log("\nDeletion completed:", result.deletedCount, "Movie records removed.");
  return { dryRun: false, matchedCount, deletedCount: result.deletedCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPre2000MovieCleanup({ confirm: shouldDelete() })
    .catch((error) => {
      console.error("\nPre-2000 Movie cleanup failed:", error?.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
