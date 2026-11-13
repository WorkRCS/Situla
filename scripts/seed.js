import "dotenv/config";
import mongoose from "mongoose";
import { seedOfflineCatalog } from "./catalog-import.js";
import { seedMovieAdditions } from "./cinemeta-movie-import.js";
import { seedTvSeries } from "./tvmaze-series-import.js";
import { refreshCatalogMarketData } from "./refresh-catalog-market-data.js";

/**
 * Single, ordered and rerunnable catalogue entry point.
 * Existing records are never replaced by metadata discovery; only public
 * market-signal fields are refreshed after all insert-only imports finish.
 */
export async function seedSitulaCatalog() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME in .env before running npm run seed.");
  }

  const summary = {};

  console.log("\n[1/4] Importing validated, locally curated Movies, TV and Anime…");
  summary.curated = await seedOfflineCatalog(["movie", "tv", "anime"]);
  if (!summary.curated.hasUsableRecordsForEveryKind) {
    throw new Error("The curated catalogue preflight did not produce valid records for every media type.");
  }

  console.log("\n[2/4] Discovering and importing public Cinemeta Movie metadata…");
  summary.movies = await seedMovieAdditions();

  console.log("\n[3/4] Matching and importing public TVmaze series and episode data…");
  summary.tv = await seedTvSeries();

  console.log("\n[4/4] Refreshing public Cinemeta, TVmaze and AniList market signals…");
  summary.marketData = await refreshCatalogMarketData();

  console.log("\nSitula catalogue seed completed:", JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  seedSitulaCatalog()
    .catch((error) => {
      console.error("\nSitula catalogue seed failed:", error.message);
      console.error("No existing catalogue records were replaced. Re-run npm run seed to safely continue.");
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
