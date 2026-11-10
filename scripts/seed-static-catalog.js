import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase } from "../src/db.js";
import { Movie, TvSeries, AnimeSeries } from "../src/models.js";
import { STATIC_MOVIES } from "../data/movie-catalog.js";
import { STATIC_TV_SERIES } from "../data/tv-catalog.js";
import { MANUAL_ANIME_CATALOG } from "../data/anime-catalog.js";

// This seeder is intentionally offline with respect to metadata providers.
// It only reads committed JavaScript data files and writes to MongoDB.
const CATALOGS = [
  { flag: "--movies", label: "Movies", Model: Movie, idField: "imdbId", records: STATIC_MOVIES },
  { flag: "--tv", label: "TV Series", Model: TvSeries, idField: "tmdbId", records: STATIC_TV_SERIES },
  { flag: "--anime", label: "Anime", Model: AnimeSeries, idField: "malId", records: MANUAL_ANIME_CATALOG }
];

function validateCatalog({ label, idField, records }) {
  if (!Array.isArray(records) || records.length < 60) {
    throw new Error(label + " static seed must contain at least 60 records.");
  }

  const seen = new Set();
  for (const item of records) {
    const id = item?.[idField];
    const validId = idField === "imdbId"
      ? typeof id === "string" && /^tt\d{5,12}$/i.test(id)
      : Number.isSafeInteger(Number(id)) && Number(id) > 0;
    if (!validId) throw new Error(label + " contains an invalid " + idField + ".");
    const key = idField === "imdbId" ? id.toLowerCase() : String(Number(id));
    if (seen.has(key)) throw new Error(label + " contains duplicate " + idField + " " + key + ".");
    seen.add(key);
    if (typeof item.title !== "string" || !item.title.trim()) {
      throw new Error(label + " record " + key + " is missing a title.");
    }
    if (Array.isArray(item.genres) && item.genres.some((genre) => /^(adult|erotica|porn|hentai)$/i.test(String(genre)))) {
      throw new Error(label + " contains a disallowed adult genre: " + item.title);
    }
    if (label === "TV Series") {
      if (item.adult === true) throw new Error("Adult TV record rejected: " + item.title);
      if (!Number.isSafeInteger(Number(item.numberOfSeasons)) || Number(item.numberOfSeasons) < 1 ||
          !Number.isSafeInteger(Number(item.numberOfEpisodes)) || Number(item.numberOfEpisodes) < 1) {
        throw new Error("TV record needs season and episode totals: " + item.title);
      }
      if (!Array.isArray(item.seasons)) throw new Error("TV seasons must be an array: " + item.title);
    }
    if (label === "Anime" && item.type !== "TV" && item.type !== "ONA") {
      throw new Error("Anime record must be TV or ONA: " + item.title);
    }
    if (label === "Movies" && (!Number.isFinite(Number(item.voteAverage)) || Number(item.voteAverage) < 0 || Number(item.voteAverage) > 10)) {
      throw new Error("Movie record has an invalid IMDb rating: " + item.title);
    }
  }
}

async function upsertCatalog({ label, Model, idField, records }) {
  const operations = records.map((record) => ({
    updateOne: {
      filter: { [idField]: idField === "imdbId" ? record[idField].toLowerCase() : Number(record[idField]) },
      update: { $setOnInsert: { ...record } },
      upsert: true
    }
  }));

  const result = await Model.bulkWrite(operations, { ordered: false });
  const total = await Model.countDocuments();
  const added = Number(result.upsertedCount || 0);
  const alreadyPresent = records.length - added;
  console.log(label + ": " + added + " added, " + alreadyPresent + " already existed; " + total + " total in collection.");
  return { added, alreadyPresent, total };
}

export async function seedStaticCatalog() {
  const flags = process.argv.slice(2);
  const supported = new Set(CATALOGS.map((catalog) => catalog.flag));
  const invalid = flags.filter((flag) => !supported.has(flag));
  if (invalid.length) throw new Error("Unknown seed option: " + invalid.join(", ") + ". Use --movies, --tv, or --anime.");
  const selected = flags.length ? CATALOGS.filter((catalog) => flags.includes(catalog.flag)) : CATALOGS;

  for (const catalog of selected) validateCatalog(catalog);
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME in .env before running the static seed.");
  }

  console.log("Situla static seed starting. No IMDb, TMDB, TVmaze or MAL API requests will be made.");
  await connectDatabase();

  const summary = {};
  for (const catalog of selected) {
    summary[catalog.label] = await upsertCatalog(catalog);
  }

  console.log("Static seed complete:", summary);
  return summary;
}

seedStaticCatalog()
  .catch((error) => {
    console.error("Situla static seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
