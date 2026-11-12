import "dotenv/config";
import mongoose from "mongoose";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { connectDatabase } from "../src/db.js";
import { Movie, TvSeries, AnimeSeries } from "../src/models.js";

const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const JIKAN_API = "https://api.jikan.moe/v4/anime/";
const DAY_MS = 24 * 60 * 60 * 1000;
const JIKAN_REQUEST_INTERVAL_MS = 450;
const BULK_BATCH_SIZE = 500;
const USER_AGENT = "Situla-Catalog-Market-Data/1.0 (https://github.com/WorkRCS/Situla)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Estimate fresh public vote growth as a seven-day rate from the previous snapshot. */
export function calculateVoteVelocity7d(previousVotes, previousSnapshotAt, currentVotes, now = new Date()) {
  const previous = Math.max(0, safeNumber(previousVotes));
  const current = Math.max(0, safeNumber(currentVotes));
  if (!previous || current <= previous || !previousSnapshotAt) return 0;
  const previousTime = new Date(previousSnapshotAt).getTime();
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(previousTime) || !Number.isFinite(nowTime) || nowTime <= previousTime) return 0;
  const elapsedDays = Math.max(1, (nowTime - previousTime) / DAY_MS);
  return Math.round(((current - previous) * 7) / elapsedDays);
}

async function writeInBatches(Model, operations) {
  let written = 0;
  for (let index = 0; index < operations.length; index += BULK_BATCH_SIZE) {
    const batch = operations.slice(index, index + BULK_BATCH_SIZE);
    if (batch.length) {
      await Model.bulkWrite(batch, { ordered: false });
      written += batch.length;
    }
  }
  return written;
}

async function refreshImdbVotes(now) {
  const [movies, shows] = await Promise.all([
    Movie.find({ imdbId: /^tt[0-9]{5,12}$/i })
      .select("imdbId voteCount marketDataUpdatedAt")
      .lean(),
    TvSeries.find({ externalImdbId: /^tt[0-9]{5,12}$/i })
      .select("externalImdbId voteCount marketDataUpdatedAt")
      .lean()
  ]);

  const movieById = new Map(movies.map((item) => [String(item.imdbId).toLowerCase(), item]));
  const tvById = new Map(shows.map((item) => [String(item.externalImdbId).toLowerCase(), item]));
  const wanted = new Set([...movieById.keys(), ...tvById.keys()]);
  if (!wanted.size) return { movies: 0, tv: 0 };

  const response = await fetch(IMDB_RATINGS_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10 * 60 * 1000)
  });
  if (!response.ok || !response.body) {
    throw new Error("IMDb public ratings dataset download failed with HTTP " + response.status + ".");
  }

  const movieOps = [];
  const tvOps = [];
  const input = Readable.fromWeb(response.body).pipe(createGunzip());
  const rows = createInterface({ input, crlfDelay: Infinity });
  let first = true;

  for await (const line of rows) {
    if (first) {
      first = false;
      continue;
    }
    const [rawId, rawRating, rawVotes] = line.split("\t");
    const id = String(rawId || "").toLowerCase();
    if (!wanted.has(id)) continue;

    const voteAverage = Math.min(10, Math.max(0, safeNumber(rawRating)));
    const voteCount = Math.max(0, Math.floor(safeNumber(rawVotes)));
    const fieldsFor = (previous) => ({
      voteAverage,
      voteCount,
      voteVelocity7d: calculateVoteVelocity7d(
        previous.voteCount,
        previous.marketDataUpdatedAt,
        voteCount,
        now
      ),
      marketDataUpdatedAt: now
    });
    const movie = movieById.get(id);
    const tv = tvById.get(id);
    if (movie) movieOps.push({
      updateOne: { filter: { imdbId: id }, update: { $set: fieldsFor(movie) } }
    });
    if (tv) tvOps.push({
      updateOne: { filter: { externalImdbId: id }, update: { $set: fieldsFor(tv) } }
    });
    if (movie) wanted.delete(id);
    if (tv) wanted.delete(id);
  }

  return {
    movies: await writeInBatches(Movie, movieOps),
    tv: await writeInBatches(TvSeries, tvOps)
  };
}

async function fetchJikanAnime(malId, attempt = 0) {
  const response = await fetch(JIKAN_API + encodeURIComponent(malId), {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json"
    },
    signal: AbortSignal.timeout(20_000)
  });

  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 4) throw new Error("Jikan request failed for MAL " + malId + " (HTTP " + response.status + ").");
    const retryAfter = Number(response.headers.get("retry-after")) * 1000;
    await sleep(Math.max(retryAfter || 0, 1_000 * (attempt + 1)));
    return fetchJikanAnime(malId, attempt + 1);
  }
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error("Jikan request failed for MAL " + malId + " (HTTP " + response.status + ").");
  }

  const payload = await response.json();
  return payload?.data || null;
}

async function refreshAnimeVotes(now) {
  const records = await AnimeSeries.find({ malId: { $gt: 0 }, type: { $in: ["TV", "ONA"] } })
    .select("malId score scoredBy rank popularity marketDataUpdatedAt")
    .lean();

  const operations = [];
  let unavailable = 0;
  for (let index = 0; index < records.length; index += 1) {
    const item = records[index];
    if (index > 0) await sleep(JIKAN_REQUEST_INTERVAL_MS);

    let live;
    try {
      live = await fetchJikanAnime(item.malId);
    } catch (error) {
      unavailable += 1;
      console.warn("Anime market data skipped for MAL " + item.malId + ": " + error.message);
      continue;
    }
    if (!live) {
      unavailable += 1;
      continue;
    }

    const scoredBy = Math.max(0, Math.floor(safeNumber(live.scored_by)));
    const fields = {
      score: Math.min(10, Math.max(0, safeNumber(live.score))),
      scoredBy,
      rank: Number.isFinite(Number(live.rank)) && Number(live.rank) > 0 ? Number(live.rank) : null,
      popularity: Number.isFinite(Number(live.popularity)) && Number(live.popularity) > 0
        ? Number(live.popularity)
        : null,
      voteVelocity7d: calculateVoteVelocity7d(item.scoredBy, item.marketDataUpdatedAt, scoredBy, now),
      marketDataUpdatedAt: now
    };
    operations.push({
      updateOne: { filter: { malId: item.malId }, update: { $set: fields } }
    });
  }

  return {
    anime: await writeInBatches(AnimeSeries, operations),
    animeUnavailable: unavailable
  };
}

export async function refreshCatalogMarketData({ now = new Date() } = {}) {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME before refreshing catalogue market data.");
  }
  await connectDatabase();
  const imdb = await refreshImdbVotes(now);
  const anime = await refreshAnimeVotes(now);
  return { ...imdb, ...anime, updatedAt: now.toISOString() };
}

async function main() {
  const result = await refreshCatalogMarketData();
  console.log("Public catalogue market data refresh complete:", result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
    .catch((error) => {
      console.error("Situla catalogue market data refresh failed:", error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
