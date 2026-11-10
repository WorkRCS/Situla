import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import { Movie } from "../src/models.js";
import { MOVIE_ADDITION_TARGET, MOVIE_DISCOVERY_PARTS } from "../data/movie-additions.js";

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMAGE = "https://image.tmdb.org/t/p";
const USER_AGENT = "Situla-Movie-Catalog/1.0 (https://github.com/WorkRCS/Situla)";
const MIN_OVERVIEW_LENGTH = 80;
const MIN_CAST_MEMBERS = 1;
const imageValidationCache = new Map();
let nextRequestAt = 0;
let requestQueue = Promise.resolve();
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const IMDB_ID = /^tt\d{5,12}$/i;
const DISALLOWED_GENRES = new Set(["adult", "erotica", "porn", "pornographic", "hentai"]);

export function normalizeMovieTitle(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeImdbId(value) {
  const id = String(value || "").trim().toLowerCase();
  return IMDB_ID.test(id) ? id : null;
}

export function stripMovieMarkup(value) {
  return String(value || "")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

export function tmdbImageUrl(path, size = "original") {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return null;
  return TMDB_IMAGE + "/" + size + path;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && Boolean(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function titleYearKey(title, year) {
  return normalizeMovieTitle(title) + "|" + String(year || "");
}

function getTmdbToken() {
  return String(process.env.TMDB_API_READ_ACCESS_TOKEN || "").trim();
}

async function acquireRequestSlot() {
  const previous = requestQueue;
  let release;
  requestQueue = new Promise((resolveQueue) => { release = resolveQueue; });
  await previous;
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait) await sleep(wait);
  nextRequestAt = Date.now() + 260;
  release();
}

function tmdbUrl(path) {
  const url = new URL(TMDB_API + path);
  if (!getTmdbToken()) {
    const key = String(process.env.TMDB_API_KEY || "").trim();
    if (key) url.searchParams.set("api_key", key);
  }
  return url;
}

async function tmdbRequest(path, attempt = 0) {
  await acquireRequestSlot();
  let response;
  try {
    const headers = { Accept: "application/json", "User-Agent": USER_AGENT };
    if (getTmdbToken()) headers.Authorization = "Bearer " + getTmdbToken();
    response = await fetch(tmdbUrl(path), {
      headers,
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    if (attempt < 3) {
      await sleep(1000 * (attempt + 1));
      return tmdbRequest(path, attempt + 1);
    }
    throw error;
  }

  if ((response.status === 429 || response.status >= 500) && attempt < 6) {
    const retry = Number(response.headers.get("retry-after"));
    const retryMs = Number.isFinite(retry) && retry > 0
      ? Math.min(retry * 1000, 30000)
      : Math.min(1000 * (2 ** attempt), 20000);
    await sleep(retryMs);
    return tmdbRequest(path, attempt + 1);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("TMDB returned HTTP " + response.status + (detail ? ": " + detail.slice(0, 180) : ""));
  }
  return response.json();
}

export function mapTmdbMovie(details, candidate = {}) {
  const imdbId = normalizeImdbId(details?.external_ids?.imdb_id);
  if (!imdbId || details?.adult === true) return null;

  const title = String(details.title || "").trim();
  const originalTitle = String(details.original_title || title).trim();
  const overview = stripMovieMarkup(details.overview || "");
  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(details.release_date || ""))
    ? details.release_date : null;
  const releaseYear = releaseDate ? Number(releaseDate.slice(0, 4)) : null;
  const runtime = Number(details.runtime) > 0 ? Number(details.runtime) : null;
  const originalLanguage = String(details.original_language || "").trim().toLowerCase();

  const genres = Array.isArray(details.genres)
    ? details.genres.map((item) => String(item?.name || "").trim()).filter(Boolean)
    : [];
  const productionCompanies = Array.isArray(details.production_companies)
    ? details.production_companies.map((item) => String(item?.name || "").trim()).filter(Boolean)
    : [];
  const productionCountries = Array.isArray(details.production_countries)
    ? details.production_countries.map((item) => String(item?.name || "").trim()).filter(Boolean)
    : [];
  const spokenLanguages = Array.isArray(details.spoken_languages)
    ? details.spoken_languages.map((item) => String(item?.english_name || item?.name || item?.iso_639_1 || "").trim()).filter(Boolean)
    : (originalLanguage ? [originalLanguage] : []);

  const credits = details.credits || {};
  const cast = Array.isArray(credits.cast) ? credits.cast.slice(0, 12).map((person) => ({
    name: String(person?.name || "").trim(),
    character: String(person?.character || "").trim(),
    profileUrl: tmdbImageUrl(person?.profile_path, "w185")
  })).filter((person) => person.name) : [];
  const directors = Array.isArray(credits.crew)
    ? [...new Set(credits.crew.filter((person) => String(person?.job || "").toLowerCase() === "director")
      .map((person) => String(person?.name || "").trim()).filter(Boolean))]
    : [];
  const writers = Array.isArray(credits.crew)
    ? [...new Set(credits.crew.filter((person) =>
      ["writer", "screenplay", "story"].includes(String(person?.job || "").toLowerCase()))
      .map((person) => String(person?.name || "").trim()).filter(Boolean))]
    : [];

  const keywordItems = details.keywords?.keywords || details.keywords?.results || [];
  const keywords = Array.isArray(keywordItems)
    ? keywordItems.map((item) => String(item?.name || "").trim()).filter(Boolean).slice(0, 30)
    : [];

  const videoItems = Array.isArray(details.videos?.results) ? details.videos.results : [];
  const trailer = videoItems.find((item) =>
    item?.site === "YouTube" && item?.type === "Trailer" && item?.official && item?.key
  ) || videoItems.find((item) => item?.site === "YouTube" && item?.type === "Trailer" && item?.key);
  const releaseDateGroups = Array.isArray(details.release_dates?.results) ? details.release_dates.results : [];
  const usRelease = releaseDateGroups.find((item) => item.iso_3166_1 === "US") ||
    releaseDateGroups.find((item) => item.iso_3166_1 === "IN");
  const certification = String(usRelease?.release_dates?.find((item) => item.certification)?.certification || "").trim();

  const posters = [
    details.poster_path,
    ...(Array.isArray(details.images?.posters) ? details.images.posters
      .slice().sort((a, b) => Number(b.vote_average || 0) - Number(a.vote_average || 0))
      .map((image) => image.file_path) : []),
    candidate.poster_path
  ].filter(Boolean);
  const backdrops = [
    details.backdrop_path,
    ...(Array.isArray(details.images?.backdrops) ? details.images.backdrops
      .slice().sort((a, b) => Number(b.vote_average || 0) - Number(a.vote_average || 0))
      .map((image) => image.file_path) : []),
    candidate.backdrop_path
  ].filter(Boolean);

  const collection = details.belongs_to_collection;
  return {
    imdbId,
    title,
    originalTitle,
    overview,
    tagline: String(details.tagline || "").trim(),
    posterUrl: tmdbImageUrl(posters[0], "w500"),
    posterCandidates: [...new Set(posters.map((path) => tmdbImageUrl(path, "w500")).filter(Boolean))],
    backdropUrl: tmdbImageUrl(backdrops[0], "original"),
    backdropCandidates: [...new Set(backdrops.map((path) => tmdbImageUrl(path, "original")).filter(Boolean))],
    releaseDate,
    releaseYear,
    runtime,
    originalLanguage,
    genres,
    keywords,
    certification,
    voteAverage: Math.max(0, Math.min(10, Number(details.vote_average) || 0)),
    voteCount: Math.max(0, Number(details.vote_count) || 0),
    popularity: Math.max(0, Number(details.popularity) || 0),
    adult: false,
    status: String(details.status || ""),
    budget: Math.max(0, Number(details.budget) || 0),
    revenue: Math.max(0, Number(details.revenue) || 0),
    homepage: safeHttpsUrl(details.homepage) || "",
    productionCompanies,
    productionCountries,
    spokenLanguages,
    cast,
    directors,
    writers,
    trailerUrl: trailer?.key ? "https://www.youtube.com/watch?v=" + encodeURIComponent(trailer.key) : "",
    collection: collection ? {
      name: String(collection.name || "").trim(),
      posterUrl: tmdbImageUrl(collection.poster_path, "w500"),
      backdropUrl: tmdbImageUrl(collection.backdrop_path, "original")
    } : null,
    metadataSource: "TMDB API",
    sourceUrl: "https://www.themoviedb.org/movie/" + Number(details.id)
  };
}

export function validateMovieRecord(record) {
  const fail = (message) => { throw new Error(message + " (" + (record?.imdbId || "unknown IMDb ID") + ")"); };
  if (!normalizeImdbId(record?.imdbId)) fail("Missing or invalid IMDb ID");
  if (!String(record?.title || "").trim()) fail("Missing title");
  if (!String(record?.originalTitle || "").trim()) fail("Missing original title");
  if (String(record?.overview || "").trim().length < MIN_OVERVIEW_LENGTH) fail("Missing or too-short synopsis");
  if (!safeHttpsUrl(record?.posterUrl)) fail("Missing or invalid poster");
  if (!safeHttpsUrl(record?.backdropUrl)) fail("Missing or invalid landscape banner/backdrop");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record?.releaseDate || ""))) fail("Missing or invalid release date");
  if (!Number.isSafeInteger(Number(record?.releaseYear)) || Number(record.releaseYear) < 1870) fail("Missing or invalid release year");
  if (!Number.isFinite(Number(record?.runtime)) || Number(record.runtime) <= 0) fail("Missing or invalid runtime");
  if (!String(record?.originalLanguage || "").trim()) fail("Missing original language");
  if (!Array.isArray(record?.genres) || !record.genres.length ||
      record.genres.some((genre) => DISALLOWED_GENRES.has(String(genre).toLowerCase().trim()))) {
    fail("Missing or disallowed genres");
  }
  if (!Array.isArray(record?.productionCompanies) || !record.productionCompanies.length) fail("Missing production company");
  if (!Array.isArray(record?.productionCountries) || !record.productionCountries.length) fail("Missing production country");
  if (!Array.isArray(record?.spokenLanguages) || !record.spokenLanguages.length) fail("Missing spoken language");
  if (!Array.isArray(record?.cast) || record.cast.length < MIN_CAST_MEMBERS) fail("Missing credited cast");
  if (!Array.isArray(record?.directors) || !record.directors.length) fail("Missing director credit");
  if (record?.adult === true) fail("Adult content is not allowed");
  if (!String(record?.sourceUrl || "").startsWith("https://www.themoviedb.org/movie/")) fail("Missing TMDB source attribution");
  return true;
}

async function verifyRemoteImage(value) {
  const url = safeHttpsUrl(value);
  if (!url) return false;
  if (imageValidationCache.has(url)) return imageValidationCache.get(url);

  const check = (async () => {
    try {
      const head = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT, Accept: "image/*,*/*;q=0.8" },
        signal: AbortSignal.timeout(9000)
      });
      const type = String(head.headers.get("content-type") || "").toLowerCase();
      if (head.ok && type.startsWith("image/")) return true;
    } catch {}

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT, Range: "bytes=0-0", Accept: "image/*" },
        signal: AbortSignal.timeout(9000)
      });
      const type = String(response.headers.get("content-type") || "").toLowerCase();
      const valid = response.ok && type.startsWith("image/");
      await response.body?.cancel().catch(() => {});
      return valid;
    } catch {
      return false;
    }
  })();

  imageValidationCache.set(url, check);
  return check;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  }));
  return output;
}

async function fetchDiscoveryCandidates() {
  const partResults = await Promise.all(MOVIE_DISCOVERY_PARTS.map(async (part) => {
    const found = [];
    const seen = new Set();
    for (let page = 1; page <= part.pages; page += 1) {
      const params = new URLSearchParams({
        include_adult: "false",
        include_video: "false",
        language: "en-US",
        page: String(page),
        ...part.params
      });
      const payload = await tmdbRequest("/discover/movie?" + params.toString());
      const items = Array.isArray(payload?.results) ? payload.results : [];
      if (!items.length) break;
      for (const item of items) {
        const id = Number(item?.id);
        if (!Number.isSafeInteger(id) || id < 1 || item.adult === true || seen.has(id)) continue;
        seen.add(id);
        found.push({ ...item, discoveryPart: part.key });
      }
      console.log("  " + part.label + " · page " + page + " · " + items.length + " candidates");
      if (page >= Number(payload.total_pages || part.pages)) break;
    }
    return found;
  }));

  // Interleave the five source parts so the final 500 are not drawn from one ranking alone.
  const ordered = [];
  const cursors = partResults.map(() => 0);
  let hasItems = true;
  while (hasItems) {
    hasItems = false;
    for (let index = 0; index < partResults.length; index += 1) {
      const candidate = partResults[index][cursors[index]];
      if (candidate) {
        ordered.push(candidate);
        cursors[index] += 1;
        hasItems = true;
      }
    }
  }

  const seenIds = new Set();
  return ordered.filter((candidate) => {
    if (seenIds.has(Number(candidate.id))) return false;
    seenIds.add(Number(candidate.id));
    return true;
  });
}

function firstValidImageUrl(urls) {
  return [...new Set(urls.map(safeHttpsUrl).filter(Boolean))];
}

async function prepareMovie(candidate) {
  const details = await tmdbRequest(
    "/movie/" + Number(candidate.id) +
    "?language=en-US&include_image_language=en%2Cnull&append_to_response=external_ids,images,credits,keywords,release_dates,videos"
  );
  if (!details || details.adult === true) return null;

  const mapped = mapTmdbMovie(details, candidate);
  if (!mapped) return null;
  if (!mapped.releaseDate || mapped.releaseDate > new Date().toISOString().slice(0, 10)) return null;

  const posters = firstValidImageUrl(mapped.posterCandidates);
  const backdrops = firstValidImageUrl(mapped.backdropCandidates);
  let posterUrl = null;
  for (const url of posters) {
    if (await verifyRemoteImage(url)) {
      posterUrl = url;
      break;
    }
  }
  if (!posterUrl) return null;

  let backdropUrl = null;
  for (const url of backdrops) {
    if (await verifyRemoteImage(url)) {
      backdropUrl = url;
      break;
    }
  }
  if (!backdropUrl) return null;

  const record = {
    ...mapped,
    posterUrl,
    backdropUrl
  };
  delete record.posterCandidates;
  delete record.backdropCandidates;
  validateMovieRecord(record);
  return record;
}

function rememberTitleYear(map, title, year) {
  const key = titleYearKey(title, year);
  if (key.startsWith("|")) return;
  map.add(key);
}

export async function seedMovieAdditions() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME before running the movie seed.");
  }
  if (!getTmdbToken() && !String(process.env.TMDB_API_KEY || "").trim()) {
    throw new Error("Set TMDB_API_READ_ACCESS_TOKEN (recommended) or TMDB_API_KEY before running the movie seed.");
  }
  if (!Array.isArray(MOVIE_DISCOVERY_PARTS) || MOVIE_DISCOVERY_PARTS.length !== 5 ||
      MOVIE_DISCOVERY_PARTS.some((part) => !part.key || !Number.isSafeInteger(part.pages) || part.pages < 1)) {
    throw new Error("Movie discovery must contain five valid part files.");
  }

  await connectDatabase();
  const [existing, existingAdditionCount] = await Promise.all([
    Movie.find({}).select("imdbId title originalTitle releaseYear").lean(),
    Movie.countDocuments({ metadataSource: "TMDB API" })
  ]);
  const targetRemaining = Math.max(0, MOVIE_ADDITION_TARGET - existingAdditionCount);
  if (!targetRemaining) {
    console.log("Movie additions already complete: " + existingAdditionCount + " TMDB-enriched movies are present.");
    return { inserted: 0, existingAdditions: existingAdditionCount, total: await Movie.countDocuments() };
  }

  const occupiedIds = new Set(existing.map((item) => normalizeImdbId(item.imdbId)).filter(Boolean));
  const occupiedTitleYears = new Set(existing.flatMap((item) =>
    [item.title, item.originalTitle].filter(Boolean).map((title) => titleYearKey(title, item.releaseYear))
  ));
  console.log("Movie seed: preparing " + targetRemaining + " complete, unique IMDb-keyed records from five TMDB discovery parts.");

  const candidates = await fetchDiscoveryCandidates();
  const newRecords = [];
  const newIds = new Set();
  const newTitleYears = new Set();
  const failures = [];
  let cursor = 0;

  await Promise.all(Array.from({ length: 4 }, async () => {
    while (newRecords.length < targetRemaining) {
      const index = cursor++;
      if (index >= candidates.length) return;
      const candidate = candidates[index];
      try {
        const record = await prepareMovie(candidate);
        if (!record) {
          failures.push("TMDB " + candidate.id + " (missing IMDb cross-reference or required metadata/artwork)");
          continue;
        }
        if (newRecords.length >= targetRemaining) continue;
        const titleKeys = [...new Set([record.title, record.originalTitle]
          .filter(Boolean).map((title) => titleYearKey(title, record.releaseYear)))];
        if (occupiedIds.has(record.imdbId) || newIds.has(record.imdbId) ||
            titleKeys.some((key) => occupiedTitleYears.has(key) || newTitleYears.has(key))) continue;
        newIds.add(record.imdbId);
        for (const title of [record.title, record.originalTitle].filter(Boolean)) {
          rememberTitleYear(newTitleYears, title, record.releaseYear);
        }
        newRecords.push(record);
        console.log("  ✓ " + record.title + " (" + record.releaseYear + ") · " + record.imdbId);
      } catch (error) {
        failures.push("TMDB " + candidate.id + " (" + error.message + ")");
      }
    }
  }));

  if (newRecords.length !== targetRemaining) {
    throw new Error("Movie seed preflight stopped before database writes: verified " + newRecords.length +
      " of " + targetRemaining + " required films. Each record needs a valid unique IMDb ID, full title/original title, " +
      "an 80+ character synopsis, verified poster and landscape banner, date, runtime, genres, production company/country, " +
      "cast and director credits. Candidate failures: " + failures.slice(0, 15).join("; "));
  }

  // Insert-only, like the Anime additions seed. Existing Movie records are never updated or replaced.
  let insertedDocuments = [];
  try {
    insertedDocuments = await Movie.insertMany(newRecords, { ordered: false });
  } catch (error) {
    const partial = Array.isArray(error.insertedDocs) ? error.insertedDocs : [];
    const writeErrors = error.writeErrors || error.result?.writeErrors || [];
    const duplicateOnly = writeErrors.length > 0 &&
      writeErrors.every((entry) => Number(entry.code || entry.err?.code) === 11000);
    if (!duplicateOnly) throw error;
    insertedDocuments = partial;
    console.warn("Some IMDb IDs were inserted by another seed process; existing documents were left unchanged.");
  }

  const insertedIds = insertedDocuments.map((item) => normalizeImdbId(item.imdbId)).filter(Boolean);
  const saved = insertedIds.length
    ? await Movie.find({ imdbId: { $in: insertedIds } })
      .select("imdbId title originalTitle overview posterUrl backdropUrl releaseDate releaseYear runtime originalLanguage genres productionCompanies productionCountries spokenLanguages cast directors adult sourceUrl metadataSource")
      .lean()
    : [];
  const savedById = new Map(saved.map((item) => [normalizeImdbId(item.imdbId), item]));
  const invalid = insertedIds.filter((id) => {
    const item = savedById.get(id);
    if (!item) return true;
    try {
      validateMovieRecord(item);
      return false;
    } catch {
      return true;
    }
  });
  if (invalid.length) {
    throw new Error("Movie database verification failed for inserted IMDb IDs: " + invalid.join(", "));
  }

  const total = await Movie.countDocuments();
  const additionCount = await Movie.countDocuments({ metadataSource: "TMDB API" });
  console.log("Movie seed complete: " + saved.length + " records inserted; " +
    additionCount + "/" + MOVIE_ADDITION_TARGET + " TMDB movie additions present; " + total + " total movies.");
  if (additionCount !== MOVIE_ADDITION_TARGET) {
    throw new Error("Movie additions are currently " + additionCount + "/" + MOVIE_ADDITION_TARGET +
      ". Re-run npm run seed:movie-additions to safely fill the remaining IMDb IDs.");
  }
  return { inserted: saved.length, additionsPresent: additionCount, total };
}

export { MIN_OVERVIEW_LENGTH, MOVIE_ADDITION_TARGET };
const isDirectRun = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  seedMovieAdditions()
    .catch((error) => {
      console.error("Situla Movie seed failed:", error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
