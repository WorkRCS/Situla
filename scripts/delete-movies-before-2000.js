import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import {
  AnimeSeries,
  CartoonMovie,
  CartoonSeries,
  Movie,
  TvSeries
} from "../src/models.js";

const CONFIRM_FLAG = "--confirm-delete";
const PRE_2000_DATE_PATTERN = /^(?:18|19)\\d{2}(?:-|$)/;

/**
 * Known numeric releaseYear is authoritative. The date field is used only
 * when releaseYear is absent/null, matching the existing Movie cleanup rule.
 */
export function buildPre2000CatalogFilter(dateField) {
  if (!["releaseDate", "firstAirDate", "airedFrom"].includes(dateField)) {
    throw new TypeError("Unsupported catalogue date field.");
  }
  return Object.freeze({
    $or: [
      { releaseYear: { $type: "number", $lt: 2000 } },
      {
        releaseYear: null,
        [dateField]: { $regex: PRE_2000_DATE_PATTERN }
      }
    ]
  });
}

export const PRE_2000_MOVIE_FILTER = buildPre2000CatalogFilter("releaseDate");
export const PRE_2000_TV_FILTER = buildPre2000CatalogFilter("firstAirDate");
export const PRE_2000_ANIME_FILTER = buildPre2000CatalogFilter("airedFrom");
export const PRE_2000_CARTOON_MOVIE_FILTER = buildPre2000CatalogFilter("releaseDate");
export const PRE_2000_CARTOON_SERIES_FILTER = buildPre2000CatalogFilter("firstAirDate");

function isPre2000Record(record, dateField) {
  const rawYear = record?.releaseYear;
  if (rawYear !== null && rawYear !== undefined && rawYear !== "") {
    const year = Number(rawYear);
    if (Number.isInteger(year)) return year > 0 && year < 2000;
  }
  const match = String(record?.[dateField] || "").match(/^(\\d{4})(?:-|$)/);
  return Boolean(match && Number(match[1]) > 0 && Number(match[1]) < 2000);
}

export const isPre2000Movie = (record) => isPre2000Record(record, "releaseDate");
export const isPre2000TvSeries = (record) => isPre2000Record(record, "firstAirDate");
export const isPre2000Anime = (record) => isPre2000Record(record, "airedFrom");
export const isPre2000CartoonMovie = (record) => isPre2000Record(record, "releaseDate");
export const isPre2000CartoonSeries = (record) => isPre2000Record(record, "firstAirDate");

export function shouldDelete(argv = process.argv.slice(2)) {
  return Array.isArray(argv) && argv.includes(CONFIRM_FLAG);
}

const CLEANUP_TARGETS = [
  {
    name: "Movie",
    model: Movie,
    filter: PRE_2000_MOVIE_FILTER,
    projection: "imdbId title releaseYear releaseDate"
  },
  {
    name: "TvSeries",
    model: TvSeries,
    filter: PRE_2000_TV_FILTER,
    projection: "tmdbId title releaseYear firstAirDate"
  },
  {
    name: "AnimeSeries",
    model: AnimeSeries,
    filter: PRE_2000_ANIME_FILTER,
    projection: "malId title releaseYear airedFrom"
  },
  {
    name: "CartoonMovie",
    model: CartoonMovie,
    filter: PRE_2000_CARTOON_MOVIE_FILTER,
    projection: "tmdbId title releaseYear releaseDate"
  },
  {
    name: "CartoonSeries",
    model: CartoonSeries,
    filter: PRE_2000_CARTOON_SERIES_FILTER,
    projection: "tmdbId title releaseYear firstAirDate"
  }
];

export async function runPre2000MovieCleanup({ confirm = false } = {}) {
  await connectDatabase();

  const snapshots = await Promise.all(CLEANUP_TARGETS.map(async (target) => {
    const [count, sample] = await Promise.all([
      target.model.countDocuments(target.filter),
      target.model.find(target.filter)
        .select(target.projection)
        .sort({ releaseYear: 1 })
        .limit(20)
        .lean()
    ]);
    return { name: target.name, model: target.model, filter: target.filter, count, sample };
  }));

  const matchedCount = snapshots.reduce((total, item) => total + item.count, 0);
  const counts = Object.fromEntries(snapshots.map((item) => [item.name, item.count]));

  console.log("\\nSitula pre-2000 catalogue cleanup");
  console.log("Rule: remove records with releaseYear < 2000; use each catalogue's date field only when releaseYear is absent/null.");
  for (const item of snapshots) {
    console.log(item.name + " matches:", item.count);
    console.log(item.name + " sample (up to 20):", JSON.stringify(item.sample, null, 2));
  }
  console.log("Combined matches:", matchedCount);

  if (!confirm) {
    console.log("\\nDRY RUN ONLY — no records were deleted.");
    console.log("To permanently remove these five catalogue sets, run:");
    console.log("npm run delete:catalog:before-2000 -- --confirm-delete");
    return { dryRun: true, matchedCount, deletedCount: 0, counts };
  }

  const results = await Promise.all(snapshots.map(async (item) => ({
    name: item.name,
    deletedCount: (await item.model.deleteMany(item.filter)).deletedCount
  })));
  const deletedCount = results.reduce((total, item) => total + item.deletedCount, 0);
  const deleted = Object.fromEntries(results.map((item) => [item.name, item.deletedCount]));

  console.log("\\nDeletion completed:", deletedCount, "pre-2000 catalogue records removed.");
  for (const item of results) console.log(item.name + " deleted:", item.deletedCount);
  return { dryRun: false, matchedCount, deletedCount, counts, deleted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPre2000MovieCleanup({ confirm: shouldDelete() })
    .catch((error) => {
      console.error("\\nPre-2000 catalogue cleanup failed:", error?.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
