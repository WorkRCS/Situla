import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { migrateLegacyTvIds } from "./seed-tv-series.js";

export async function migrateTvSeriesToTmdb() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME before migrating TV IDs.");
  }
  if (!process.env.TMDB_API_READ_ACCESS_TOKEN && !process.env.TMDB_API_KEY) {
    throw new Error("Set TMDB_API_READ_ACCESS_TOKEN or TMDB_API_KEY before migrating TV IDs.");
  }
  const result = await migrateLegacyTvIds();
  console.log("TV-to-TMDB migration finished:", result);
  return result;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  migrateTvSeriesToTmdb()
    .catch((error) => {
      console.error("TV-to-TMDB migration failed:", error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
