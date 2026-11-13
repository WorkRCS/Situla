import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import { Movie, TvSeries, AnimeSeries } from "../src/models.js";

const CINEMETA_API = String(process.env.CINEMETA_API_BASE || "https://v3-cinemeta.strem.io").replace(/\/$/, "");
const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const TVMAZE_API = "https://api.tvmaze.com";
const CINEMETA_REQUEST_INTERVAL_MS = 300;
const TVMAZE_REQUEST_INTERVAL_MS = 550;
const ANILIST_REQUEST_INTERVAL_MS = 2_200;
const ANILIST_BATCH_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const BULK_BATCH_SIZE = 500;
const USER_AGENT = "Situla-Catalog-Market-Data/2.0 (https://github.com/WorkRCS/Situla)";

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Estimate fresh public signal growth as a seven-day rate from the previous snapshot. */
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

function parseProviderCount(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.floor(Number(value)));
  const text = String(value || "").trim().toLowerCase().replace(/,/g, "");
  const match = text.match(/^([\d.]+)\s*([kmb])?$/);
  if (!match) return 0;
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : match[2] === "b" ? 1_000_000_000 : 1;
  return Math.max(0, Math.floor(Number(match[1]) * multiplier));
}

async function fetchJsonWithRetry(url, label, attempt = 0) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 4) throw new Error(label + " failed (HTTP " + response.status + ").");
    const retryAfter = Number(response.headers.get("retry-after")) * 1_000;
    await sleep(Math.max(retryAfter || 1_500 * (attempt + 1), 1_000));
    return fetchJsonWithRetry(url, label, attempt + 1);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(label + " failed (HTTP " + response.status + ").");
  return response.json();
}

async function refreshCinemetaMovieRatings(now) {
  const records = await Movie.find({ imdbId: /^tt[0-9]{5,12}$/i })
    .select("imdbId voteAverage voteCount marketDataUpdatedAt")
    .lean();
  const operations = [];
  let unavailable = 0;

  for (let index = 0; index < records.length; index += 1) {
    if (index > 0) await sleep(CINEMETA_REQUEST_INTERVAL_MS);
    const item = records[index];
    const imdbId = String(item.imdbId).toLowerCase();
    let payload;
    try {
      payload = await fetchJsonWithRetry(
        CINEMETA_API + "/meta/movie/" + encodeURIComponent(imdbId) + ".json",
        "Cinemeta Movie metadata for " + imdbId
      );
    } catch (error) {
      unavailable += 1;
      console.warn("Movie public rating skipped for " + imdbId + ": " + error.message);
      continue;
    }

    const meta = payload?.meta;
    if (!meta) {
      unavailable += 1;
      continue;
    }
    const rating = Math.min(10, Math.max(0, safeNumber(meta.imdbRating ?? meta.voteAverage)));
    const votes = parseProviderCount(meta.imdbVotes ?? meta.voteCount);
    const fields = { marketDataUpdatedAt: now };
    if (rating > 0) fields.voteAverage = rating;
    if (votes > 0) {
      fields.voteCount = votes;
      fields.voteVelocity7d = calculateVoteVelocity7d(item.voteCount, item.marketDataUpdatedAt, votes, now);
    }
    if (rating > 0 || votes > 0) {
      operations.push({ updateOne: { filter: { imdbId }, update: { $set: fields } } });
    } else {
      unavailable += 1;
    }
  }

  return {
    cinemetaMovies: await writeInBatches(Movie, operations),
    cinemetaMoviesUnavailable: unavailable
  };
}

export function normalizeMarketTitle(value) {
  return String(value || "").normalize("NFKD")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function chooseTvmazeMatch(candidates, record) {
  const expectedTitles = new Set(
    [record?.title, record?.originalTitle].map(normalizeMarketTitle).filter(Boolean)
  );
  if (!expectedTitles.size) return null;
  const year = Number(record?.releaseYear) || Number(String(record?.firstAirDate || "").slice(0, 4));
  const shows = (Array.isArray(candidates) ? candidates : [])
    .map((entry) => entry?.show || entry)
    .filter((show) => show && expectedTitles.has(normalizeMarketTitle(show.name)));
  const matches = shows.filter((show) => {
    const premieredYear = Number(String(show.premiered || "").slice(0, 4));
    return !year || !premieredYear || Math.abs(premieredYear - year) <= 1;
  });
  return matches.sort((a, b) => {
    const aYear = Number(String(a.premiered || "").slice(0, 4));
    const bYear = Number(String(b.premiered || "").slice(0, 4));
    return year ? Math.abs(aYear - year) - Math.abs(bYear - year) : 0;
  })[0] || null;
}

async function fetchTvmazeResource(url, attempt = 0) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 4) throw new Error("TVmaze request failed (HTTP " + response.status + ").");
    const retryAfter = Number(response.headers.get("retry-after")) * 1_000;
    await sleep(Math.max(retryAfter || 0, 1_000 * (attempt + 1)));
    return fetchTvmazeResource(url, attempt + 1);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("TVmaze request failed (HTTP " + response.status + ").");
  return response.json();
}

async function fetchTvmazeShow(record) {
  const referenceUrl = String(record.referenceUrl || "");
  const referenceTail = referenceUrl.split("/shows/")[1] || "";
  const referenceId = Number(record.sourceId) ||
    Number(referenceTail.split("/")[0].split("?")[0].split("#")[0]) || 0;
  if (referenceId > 0) {
    const direct = await fetchTvmazeResource(TVMAZE_API + "/shows/" + referenceId);
    const matchedDirect = chooseTvmazeMatch(direct ? [direct] : [], record);
    if (matchedDirect) return matchedDirect;
  }
  const query = encodeURIComponent(record.title || record.originalTitle || "");
  if (!query) return null;
  const results = await fetchTvmazeResource(TVMAZE_API + "/search/shows?q=" + query);
  return chooseTvmazeMatch(results, record);
}

async function refreshTvmazeMarketData(now) {
  const records = await TvSeries.find({ tmdbId: { $gt: 0 } })
    .select("tmdbId title originalTitle firstAirDate releaseYear sourceId referenceUrl")
    .lean();
  const operations = [];
  let unavailable = 0;

  for (let index = 0; index < records.length; index += 1) {
    if (index > 0) await sleep(TVMAZE_REQUEST_INTERVAL_MS);
    const item = records[index];
    let live;
    try {
      live = await fetchTvmazeShow(item);
    } catch (error) {
      unavailable += 1;
      console.warn("TV market data skipped for TMDB " + item.tmdbId + ": " + error.message);
      continue;
    }
    if (!live) {
      unavailable += 1;
      continue;
    }

    const rating = Number(live.rating?.average);
    const weight = Number(live.weight);
    const fields = {
      providerRating: Number.isFinite(rating) && rating > 0 ? Math.min(10, Math.max(0, rating)) : 0,
      providerPopularity: Number.isFinite(weight) && weight > 0 ? weight : 0,
      marketDataUpdatedAt: now
    };
    operations.push({
      updateOne: { filter: { tmdbId: item.tmdbId }, update: { $set: fields } }
    });
  }

  return {
    tvmaze: await writeInBatches(TvSeries, operations),
    tvmazeUnavailable: unavailable
  };
}

function cleanAniListDescription(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 5_000);
}

function dateFromAniList(value) {
  const year = Number(value?.year);
  const month = Number(value?.month);
  const day = Number(value?.day);
  if (!Number.isInteger(year) || year < 1880) return null;
  return year + "-" + String(month > 0 ? month : 1).padStart(2, "0") +
    "-" + String(day > 0 ? day : 1).padStart(2, "0");
}

function animeStatusLabel(status) {
  return ({
    FINISHED: "Finished Airing",
    RELEASING: "Currently Airing",
    NOT_YET_RELEASED: "Not yet aired",
    CANCELLED: "Cancelled",
    HIATUS: "On Hiatus"
  })[String(status || "").toUpperCase()] || "";
}

async function fetchAniListBatch(records, attempt = 0) {
  const fields = "id idMal averageScore popularity trending favourites " +
    "title { romaji english native } description(asHtml: false) " +
    "startDate { year month day } season seasonYear episodes duration status format genres " +
    "bannerImage coverImage { large extraLarge } " +
    "tags { name rank isAdult isMediaSpoiler isGeneralSpoiler }";
  const selections = records.map((record, index) => {
    const id = Number(record.anilistId) > 0
      ? "id: " + Number(record.anilistId)
      : "idMal: " + Number(record.malId);
    return "a" + index + ": Media(" + id + ", type: ANIME) { " + fields + " }";
  });
  const response = await fetch(ANILIST_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "query { " + selections.join("\n") + " }" }),
    signal: AbortSignal.timeout(30_000)
  });

  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 4) throw new Error("AniList GraphQL request failed (HTTP " + response.status + ").");
    const retryAfter = Number(response.headers.get("retry-after")) * 1_000;
    await sleep(Math.max(retryAfter || 5_000 * (attempt + 1), 2_500));
    return fetchAniListBatch(records, attempt + 1);
  }
  if (!response.ok) throw new Error("AniList GraphQL request failed (HTTP " + response.status + ").");
  const payload = await response.json();
  if (!payload?.data) {
    const message = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => error.message).filter(Boolean).join("; ")
      : "No GraphQL data returned.";
    throw new Error("AniList GraphQL response was incomplete: " + message);
  }
  return records.map((record, index) => payload.data["a" + index] || null);
}

async function refreshAniListMarketData(now) {
  const records = await AnimeSeries.find({ malId: { $gt: 0 }, type: { $in: ["TV", "ONA"] } })
    .select("malId anilistId title titleEnglish titleJapanese synopsis posterUrl posterFallbackUrl bannerUrl backdropUrl airedFrom releaseYear episodes duration score genres status season")
    .lean();
  const operations = [];
  let unavailable = 0;
  const anilistOwners = new Map();
  for (const record of records) {
    const existingId = Number(record.anilistId);
    if (Number.isSafeInteger(existingId) && existingId > 0) anilistOwners.set(existingId, Number(record.malId));
  }

  for (let offset = 0; offset < records.length; offset += ANILIST_BATCH_SIZE) {
    if (offset > 0) await sleep(ANILIST_REQUEST_INTERVAL_MS);
    const batch = records.slice(offset, offset + ANILIST_BATCH_SIZE);
    let liveRecords;
    try {
      liveRecords = await fetchAniListBatch(batch);
    } catch (error) {
      unavailable += batch.length;
      console.warn("AniList market-data batch skipped: " + error.message);
      continue;
    }

    for (let index = 0; index < batch.length; index += 1) {
      const item = batch[index];
      const live = liveRecords[index];
      if (!live || Number(live.idMal) !== Number(item.malId)) {
        unavailable += 1;
        continue;
      }
      const anilistId = Number(live.id);
      const owner = anilistOwners.get(anilistId);
      if (owner && owner !== Number(item.malId)) {
        unavailable += 1;
        console.warn("AniList duplicate mapping skipped: " + anilistId + " is already linked to MAL " + owner + ".");
        continue;
      }
      anilistOwners.set(anilistId, Number(item.malId));

      const averageScore = Math.min(100, Math.max(0, safeNumber(live.averageScore)));
      const popularity = Math.max(0, Math.floor(safeNumber(live.popularity)));
      const trending = Math.max(0, Math.floor(safeNumber(live.trending)));
      const favourites = Math.max(0, Math.floor(safeNumber(live.favourites)));
      const fields = {
        anilistId,
        anilistUrl: "https://anilist.co/anime/" + anilistId,
        anilistScore: averageScore / 10,
        anilistPopularity: popularity,
        anilistTrending: trending,
        anilistFavourites: favourites,
        anilistTags: (Array.isArray(live.tags) ? live.tags : [])
          .filter((tag) => tag?.name && !tag.isAdult && !tag.isMediaSpoiler && !tag.isGeneralSpoiler)
          .sort((a, b) => Number(b.rank || 0) - Number(a.rank || 0))
          .map((tag) => String(tag.name).trim())
          .filter(Boolean)
          .slice(0, 40),
        anilistUpdatedAt: now
      };

      // Public metadata only fills gaps; curated values remain authoritative.
      if (!item.titleEnglish && live.title?.english) fields.titleEnglish = String(live.title.english).trim();
      if (!item.title && live.title?.romaji) fields.title = String(live.title.romaji).trim();
      if (!item.titleJapanese && live.title?.native) fields.titleJapanese = String(live.title.native).trim();
      if (!item.synopsis) fields.synopsis = cleanAniListDescription(live.description);
      if (!item.posterUrl && (live.coverImage?.extraLarge || live.coverImage?.large)) {
        fields.posterUrl = live.coverImage.extraLarge || live.coverImage.large;
      }
      if (!item.posterFallbackUrl && live.coverImage?.large) fields.posterFallbackUrl = live.coverImage.large;
      if (!item.bannerUrl && live.bannerImage) fields.bannerUrl = live.bannerImage;
      if (!item.backdropUrl && live.bannerImage) fields.backdropUrl = live.bannerImage;
      if (!item.airedFrom) fields.airedFrom = dateFromAniList(live.startDate);
      if (!item.releaseYear && Number(live.seasonYear) > 0) fields.releaseYear = Number(live.seasonYear);
      if (!item.episodes && Number(live.episodes) > 0) fields.episodes = Number(live.episodes);
      if (!item.duration && Number(live.duration) > 0) fields.duration = live.duration + " min per episode";
      if (!item.status && live.status) fields.status = animeStatusLabel(live.status);
      if (!item.season && live.season && Number(live.seasonYear) > 0) {
        fields.season = String(live.season).toLowerCase() + " " + Number(live.seasonYear);
      }
      if (!item.genres?.length && Array.isArray(live.genres)) fields.genres = live.genres.filter(Boolean);
      if (!(Number(item.score) > 0) && averageScore > 0) fields.score = averageScore / 10;

      operations.push({
        updateOne: { filter: { malId: item.malId }, update: { $set: fields } }
      });
    }
  }

  return {
    anilistAnime: await writeInBatches(AnimeSeries, operations),
    anilistAnimeUnavailable: unavailable
  };
}

export async function refreshCatalogMarketData({ now = new Date() } = {}) {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME before refreshing catalogue market data.");
  }
  await connectDatabase();
  const cinemeta = await refreshCinemetaMovieRatings(now);
  const tvmaze = await refreshTvmazeMarketData(now);
  const anilist = await refreshAniListMarketData(now);
  return { ...cinemeta, ...tvmaze, ...anilist, updatedAt: now.toISOString() };
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
