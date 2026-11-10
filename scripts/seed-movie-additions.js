import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import { Movie } from "../src/models.js";
import { MOVIE_ADDITION_TARGET, MOVIE_DISCOVERY_PARTS } from "../data/movie-additions.js";

const CINEMETA_API = String(process.env.CINEMETA_API_BASE || "https://v3-cinemeta.strem.io").replace(/\/$/, "");
const METAHUB_IMAGES = "https://images.metahub.space";
const USER_AGENT = "Situla-Movie-Catalog/1.0 (https://github.com/WorkRCS/Situla)";
const METADATA_SOURCE = "Cinemeta API";
const LEGACY_METADATA_SOURCES = [METADATA_SOURCE, "TMDB API"];
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

function toStringList(value) {
  const values = Array.isArray(value) ? value : (typeof value === "string" ? [value] : []);
  return [...new Set(values.flatMap((item) => {
    const text = typeof item === "string"
      ? item
      : String(item?.name || item?.title || item?.value || "").trim();
    return text.split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean);
  }))];
}

function toCastList(value) {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set();
  return values.map((person) => {
    if (typeof person === "string") {
      return { name: person.trim(), character: "", profileUrl: null };
    }
    return {
      name: String(person?.name || person?.title || "").trim(),
      character: String(person?.character || person?.role || "").trim(),
      profileUrl: safeHttpsUrl(person?.profileUrl || person?.profile || person?.image)
    };
  }).filter((person) => {
    if (!person.name || seen.has(person.name.toLowerCase())) return false;
    seen.add(person.name.toLowerCase());
    return true;
  }).slice(0, 12);
}

function parseRuntimeMinutes(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Math.round(Number(value));
  const text = String(value || "").toLowerCase().trim();
  if (!text) return null;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const minutes = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (hours || minutes) {
    const total = Math.round((Number(hours?.[1] || 0) * 60) + Number(minutes?.[1] || 0));
    return total > 0 ? total : null;
  }
  const simple = text.match(/^(\d{1,3})(?:\s*(?:minutes?|mins?|m))?$/);
  return simple ? Number(simple[1]) : null;
}

function parseReleaseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    return null;
  }
  return match[1] + "-" + match[2] + "-" + match[3];
}

function parseReleaseYear(meta) {
  const explicit = Number(meta?.year);
  if (Number.isSafeInteger(explicit) && explicit >= 1870 && explicit <= new Date().getUTCFullYear() + 2) {
    return explicit;
  }
  const source = String(meta?.releaseInfo || meta?.released || "");
  const match = source.match(/(?:^|\D)(18\d{2}|19\d{2}|20\d{2}|21\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function parseRating(value) {
  const rating = Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(rating) ? Math.max(0, Math.min(10, rating)) : 0;
}

function parseCount(value) {
  const count = Number.parseInt(String(value || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function trailerUrl(meta) {
  const trailers = [
    ...(Array.isArray(meta?.trailers) ? meta.trailers : []),
    ...(Array.isArray(meta?.videos) ? meta.videos : [])
  ];
  const trailer = trailers.find((item) => /trailer/i.test(String(item?.type || item?.name || ""))) ||
    trailers.find((item) => item?.source || item?.key || item?.url);
  const source = String(trailer?.source || trailer?.key || trailer?.url || meta?.trailer || "").trim();
  if (!source) return "";
  const direct = safeHttpsUrl(source);
  if (direct) return direct;
  return /^[a-zA-Z0-9_-]{6,}$/.test(source)
    ? "https://www.youtube.com/watch?v=" + encodeURIComponent(source)
    : "";
}

export function cinemetaCatalogUrl(part, skip = 0) {
  const segments = [];
  if (part.genre) segments.push("genre=" + encodeURIComponent(part.genre));
  if (skip > 0) segments.push("skip=" + Math.max(0, Math.floor(skip)));
  // Stremio encodes multiple extra parameters in one path segment, joined with "&".
  return CINEMETA_API + "/catalog/movie/" + encodeURIComponent(part.catalogId || "top") +
    (segments.length ? "/" + segments.join("&") : "") + ".json";
}

export function cinemetaMetaUrl(imdbId) {
  const id = normalizeImdbId(imdbId);
  if (!id) throw new Error("A valid IMDb title ID is required for Cinemeta metadata lookup.");
  return CINEMETA_API + "/meta/movie/" + id + ".json";
}

export function mapCinemetaMovie(details, candidate = {}) {
  const imdbId = normalizeImdbId(details?.imdb_id || details?.imdbId || details?.id || candidate?.imdbId || candidate?.id);
  if (!imdbId || details?.type && details.type !== "movie") return null;

  const genres = toStringList(details.genres?.length ? details.genres : details.genre);
  const adult = details.adult === true || details.isAdult === true ||
    genres.some((genre) => DISALLOWED_GENRES.has(genre.toLowerCase().trim()));
  if (adult) return null;

  const title = String(details.name || details.title || candidate?.name || "").trim();
  const originalTitle = String(details.originalTitle || details.originalName || details.original_title || title).trim();
  const overview = stripMovieMarkup(details.description || details.overview || "");
  const releaseDate = parseReleaseDate(details.released || details.releaseDate || details.release_date || "");
  const releaseYear = parseReleaseYear(details) || (releaseDate ? Number(releaseDate.slice(0, 4)) : null);
  const runtime = parseRuntimeMinutes(details.runtime);
  const languageValues = toStringList(details.originalLanguage || details.language || details.languages);
  const countryValues = toStringList(details.productionCountries || details.production_countries || details.country || details.countries);
  const companyValues = toStringList(details.productionCompanies || details.production_companies || details.productionCompany);
  const cast = toCastList(details.cast || details.actors);
  const directors = toStringList(details.directors || details.director);
  const writers = toStringList(details.writers || details.writer);
  const imdbRating = parseRating(details.imdbRating || details.voteAverage || details.rating);
  const posterFallback = METAHUB_IMAGES + "/poster/medium/" + imdbId + "/img";
  const backdropFallback = METAHUB_IMAGES + "/background/medium/" + imdbId + "/img";
  const collection = details.collection || details.belongs_to_collection || null;

  return {
    imdbId,
    title,
    originalTitle,
    overview,
    tagline: String(details.tagline || "").trim(),
    posterUrl: safeHttpsUrl(details.poster) || posterFallback,
    posterCandidates: [...new Set([details.poster, posterFallback].map(safeHttpsUrl).filter(Boolean))],
    backdropUrl: safeHttpsUrl(details.background || details.backdrop) || backdropFallback,
    backdropCandidates: [...new Set([details.background, details.backdrop, backdropFallback].map(safeHttpsUrl).filter(Boolean))],
    releaseDate,
    releaseYear,
    runtime,
    originalLanguage: languageValues[0] || "",
    genres,
    keywords: toStringList(details.keywords).slice(0, 30),
    certification: String(details.certification || details.contentRating || "").trim(),
    voteAverage: imdbRating,
    voteCount: parseCount(details.imdbVotes || details.voteCount),
    popularity: 0,
    adult: false,
    status: String(details.status || "").trim(),
    budget: Number(details.budget) > 0 ? Number(details.budget) : 0,
    revenue: Number(details.revenue) > 0 ? Number(details.revenue) : 0,
    homepage: safeHttpsUrl(details.website || details.homepage) || "",
    productionCompanies: companyValues,
    productionCountries: countryValues,
    spokenLanguages: languageValues,
    cast,
    directors,
    writers,
    trailerUrl: trailerUrl(details),
    collectionInfo: collection ? {
      name: String(collection.name || "").trim(),
      posterUrl: safeHttpsUrl(collection.poster || collection.posterUrl),
      backdropUrl: safeHttpsUrl(collection.background || collection.backdropUrl)
    } : null,
    metadataSource: METADATA_SOURCE,
    sourceUrl: "https://www.imdb.com/title/" + imdbId + "/"
  };
}

export function validateMovieRecord(record) {
  const fail = (message) => { throw new Error(message + " (" + (record?.imdbId || "unknown IMDb ID") + ")"); };
  const imdbId = normalizeImdbId(record?.imdbId);
  if (!imdbId) fail("Missing or invalid IMDb ID");
  if (!String(record?.title || "").trim()) fail("Missing title");
  if (!String(record?.originalTitle || "").trim()) fail("Missing original title");
  if (String(record?.overview || "").trim().length < MIN_OVERVIEW_LENGTH) fail("Missing or too-short synopsis");
  if (!safeHttpsUrl(record?.posterUrl)) fail("Missing or invalid poster");
  if (!safeHttpsUrl(record?.backdropUrl)) fail("Missing or invalid landscape banner/backdrop");
  if (!Number.isSafeInteger(Number(record?.releaseYear)) || Number(record.releaseYear) < 1870) fail("Missing or invalid release year");
  if (record?.releaseDate && !parseReleaseDate(record.releaseDate)) fail("Invalid release date");
  if (!Number.isFinite(Number(record?.runtime)) || Number(record.runtime) <= 0) fail("Missing or invalid runtime");
  if (!Array.isArray(record?.genres) || !record.genres.length ||
      record.genres.some((genre) => DISALLOWED_GENRES.has(String(genre).toLowerCase().trim()))) {
    fail("Missing or disallowed genres");
  }
  if (!Array.isArray(record?.cast) || record.cast.length < MIN_CAST_MEMBERS) fail("Missing credited cast");
  if (!Array.isArray(record?.directors) || !record.directors.length) fail("Missing director credit");
  if (record?.adult === true) fail("Adult content is not allowed");
  if (String(record?.sourceUrl || "") !== "https://www.imdb.com/title/" + imdbId + "/") {
    fail("Missing IMDb source link");
  }
  return true;
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

async function cinemetaRequest(url, attempt = 0) {
  await acquireRequestSlot();
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    if (attempt < 3) {
      await sleep(1000 * (attempt + 1));
      return cinemetaRequest(url, attempt + 1);
    }
    throw new Error("Cinemeta network request failed: " + error.message);
  }

  if ((response.status === 429 || response.status >= 500) && attempt < 6) {
    const retry = Number(response.headers.get("retry-after"));
    const retryMs = Number.isFinite(retry) && retry > 0
      ? Math.min(retry * 1000, 30000)
      : Math.min(1000 * (2 ** attempt), 20000);
    await sleep(retryMs);
    return cinemetaRequest(url, attempt + 1);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Cinemeta returned HTTP " + response.status + (detail ? ": " + detail.slice(0, 180) : ""));
  }
  return response.json();
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

async function fetchDiscoveryCandidates() {
  const partResults = await Promise.all(MOVIE_DISCOVERY_PARTS.map(async (part) => {
    const found = [];
    const seen = new Set();
    let skip = 0;
    for (let page = 0; page < part.pages; page += 1) {
      const payload = await cinemetaRequest(cinemetaCatalogUrl(part, skip));
      const items = Array.isArray(payload?.metas) ? payload.metas : [];
      if (!items.length) break;
      for (const item of items) {
        const imdbId = normalizeImdbId(item?.imdb_id || item?.id);
        if (!imdbId || item?.type && item.type !== "movie" || item?.adult === true || seen.has(imdbId)) continue;
        seen.add(imdbId);
        found.push({ ...item, id: imdbId, imdbId, discoveryPart: part.key });
      }
      console.log("  " + part.label + " · page " + (page + 1) + " · " + items.length + " candidates");
      // Move by the actual batch length so smaller catalog pages do not create gaps.
      skip += items.length;
    }
    return found;
  }));

  // Interleave the five provider catalogues so one genre/ranking cannot dominate the pack.
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
    if (seenIds.has(candidate.imdbId)) return false;
    seenIds.add(candidate.imdbId);
    return true;
  });
}

function firstValidImageUrl(urls) {
  return [...new Set(urls.map(safeHttpsUrl).filter(Boolean))];
}

async function prepareMovie(candidate) {
  const response = await cinemetaRequest(cinemetaMetaUrl(candidate.imdbId));
  const details = response?.meta;
  if (!details) return null;

  const mapped = mapCinemetaMovie(details, candidate);
  if (!mapped || !mapped.releaseYear || mapped.releaseYear > new Date().getUTCFullYear() ||
      mapped.releaseDate && mapped.releaseDate > new Date().toISOString().slice(0, 10)) return null;

  let posterUrl = null;
  for (const url of firstValidImageUrl(mapped.posterCandidates)) {
    if (await verifyRemoteImage(url)) {
      posterUrl = url;
      break;
    }
  }
  if (!posterUrl) return null;

  let backdropUrl = null;
  for (const url of firstValidImageUrl(mapped.backdropCandidates)) {
    if (await verifyRemoteImage(url)) {
      backdropUrl = url;
      break;
    }
  }
  if (!backdropUrl) return null;

  const record = { ...mapped, posterUrl, backdropUrl };
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
  if (!Array.isArray(MOVIE_DISCOVERY_PARTS) || MOVIE_DISCOVERY_PARTS.length !== 5 ||
      MOVIE_DISCOVERY_PARTS.some((part) => !part.key || !part.catalogId ||
        !Number.isSafeInteger(part.pages) || part.pages < 1 ||
        !Number.isSafeInteger(part.pageSize) || part.pageSize < 1)) {
    throw new Error("Movie discovery must contain five valid Cinemeta catalogue parts.");
  }

  await connectDatabase();
  const additionQuery = { metadataSource: { $in: LEGACY_METADATA_SOURCES } };
  const [existing, existingAdditionCount] = await Promise.all([
    Movie.find({}).select("imdbId title originalTitle releaseYear").lean(),
    Movie.countDocuments(additionQuery)
  ]);
  const targetRemaining = Math.max(0, MOVIE_ADDITION_TARGET - existingAdditionCount);
  if (!targetRemaining) {
    console.log("Movie additions already complete: " + existingAdditionCount + " verified IMDb-keyed additions are present.");
    return { inserted: 0, existingAdditions: existingAdditionCount, total: await Movie.countDocuments() };
  }

  const occupiedIds = new Set(existing.map((item) => normalizeImdbId(item.imdbId)).filter(Boolean));
  const occupiedTitleYears = new Set(existing.flatMap((item) =>
    [item.title, item.originalTitle].filter(Boolean).map((title) => titleYearKey(title, item.releaseYear))
  ));
  console.log("Movie seed: preparing " + targetRemaining +
    " complete, unique IMDb-keyed records from five public Cinemeta catalogue parts.");

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
      if (occupiedIds.has(candidate.imdbId) || newIds.has(candidate.imdbId)) continue;
      try {
        const record = await prepareMovie(candidate);
        if (!record) {
          failures.push(candidate.imdbId + " (missing required metadata or validated artwork)");
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
        failures.push(candidate.imdbId + " (" + error.message + ")");
      }
    }
  }));

  if (newRecords.length !== targetRemaining) {
    throw new Error("Movie seed preflight stopped before database writes: verified " + newRecords.length +
      " of " + targetRemaining + " required films. Each record needs a unique IMDb ID, title/original title, " +
      "an 80+ character synopsis, verified poster and landscape banner, release year, runtime, genre, cast and director. " +
      "Optional release date, language, company, country, tagline and trailer fields are stored when Cinemeta provides them. " +
      "Candidate failures: " + failures.slice(0, 15).join("; "));
  }

  // Insert-only: never update or replace existing Movie documents.
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
      .select("imdbId title originalTitle overview posterUrl backdropUrl releaseDate releaseYear runtime genres cast directors adult sourceUrl metadataSource")
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
  const additionCount = await Movie.countDocuments(additionQuery);
  console.log("Movie seed complete: " + saved.length + " records inserted; " +
    additionCount + "/" + MOVIE_ADDITION_TARGET + " new IMDb-keyed additions present; " + total + " total movies.");
  if (additionCount !== MOVIE_ADDITION_TARGET) {
    throw new Error("Movie additions are currently " + additionCount + "/" + MOVIE_ADDITION_TARGET +
      ". Re-run npm run seed:movie-additions to safely fill the remaining IMDb IDs.");
  }
  return { inserted: saved.length, additionsPresent: additionCount, total };
}

export { MIN_OVERVIEW_LENGTH, MOVIE_ADDITION_TARGET, METADATA_SOURCE };
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
