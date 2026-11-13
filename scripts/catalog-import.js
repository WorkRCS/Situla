import "dotenv/config";
import { connectDatabase } from "../src/db.js";
import { Movie, TvSeries, AnimeSeries } from "../src/models.js";
import { STATIC_MOVIES } from "../data/movie-catalog.js";
import { MANUAL_MOVIES_2020_2026 } from "../data/movie-curated-2020-2026.js";
import { STATIC_TV_SERIES } from "../data/tv-catalog.js";
import { TV_SERIES_CANDIDATES } from "../data/tv-additions.js";
import { MANUAL_TV_SERIES_2020_2026 } from "../data/tv-curated-2020-2026.js";
import { MANUAL_ANIME_CATALOG } from "../data/anime-catalog.js";
import { NEW_ANIME_CATALOG } from "../data/anime-additions.js";

export const CATALOG_YEAR_START = 2020;
export const CATALOG_YEAR_END = 2026;
const DISALLOWED_GENRES = /^(adult|erotica|porn|pornographic|hentai)$/i;
const IMDB_ID = /^tt\d{5,12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function safeHttps(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function titleKey(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function getYear(value) {
  const year = Number(value);
  return Number.isSafeInteger(year) ? year : null;
}

export function catalogReleaseYear(record, kind) {
  if (kind === "movie") {
    return getYear(record?.releaseYear) || getYear(String(record?.releaseDate || "").slice(0, 4));
  }
  if (kind === "tv") {
    return getYear(record?.releaseYear) || getYear(String(record?.firstAirDate || "").slice(0, 4));
  }
  return getYear(record?.releaseYear) || getYear(String(record?.airedFrom || "").slice(0, 4));
}

function hasSafeGenres(record) {
  return Array.isArray(record?.genres) &&
    record.genres.length > 0 &&
    !record.genres.some((genre) => DISALLOWED_GENRES.test(String(genre || "").trim()));
}

export function validateOfflineMovie(record) {
  const id = String(record?.imdbId || "").toLowerCase();
  if (!IMDB_ID.test(id)) throw new Error("invalid IMDb ID");
  if (!String(record?.title || "").trim() || !String(record?.originalTitle || "").trim()) throw new Error("missing title/original title");
  if (String(record?.overview || "").trim().length < 80) throw new Error("synopsis shorter than 80 characters");
  if (!safeHttps(record?.posterUrl)) throw new Error("missing HTTPS poster");
  if (!safeHttps(record?.backdropUrl) || record.posterUrl === record.backdropUrl) throw new Error("missing separate landscape backdrop");
  if (!DATE.test(String(record?.releaseDate || "")) && !catalogReleaseYear(record, "movie")) throw new Error("missing release date/year");
  if (!Number.isFinite(Number(record?.runtime)) || Number(record.runtime) <= 0) throw new Error("missing runtime");
  if (!hasSafeGenres(record)) throw new Error("missing or disallowed genres");
  if (!Array.isArray(record?.cast) || !record.cast.length) throw new Error("missing credited cast");
  if (!Array.isArray(record?.directors) || !record.directors.length) throw new Error("missing director credit");
  if (record?.adult === true) throw new Error("adult title rejected");
  if (record?.sourceUrl !== "https://www.imdb.com/title/" + id + "/") throw new Error("missing canonical IMDb source link");
  return true;
}

export function validateOfflineTv(record) {
  const id = Number(record?.tmdbId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("invalid TMDB TV ID");
  if (!String(record?.title || "").trim()) throw new Error("missing series title");
  if (String(record?.overview || "").trim().length < 80) throw new Error("synopsis shorter than 80 characters");
  if (!safeHttps(record?.posterUrl)) throw new Error("missing HTTPS poster");
  if (!safeHttps(record?.backdropUrl) || record.posterUrl === record.backdropUrl) throw new Error("missing separate landscape backdrop");
  if (!DATE.test(String(record?.firstAirDate || ""))) throw new Error("missing premiere date");
  if (record?.adult === true || !hasSafeGenres(record)) throw new Error("adult series or disallowed genres");
  if (!Array.isArray(record?.seasons) || !record.seasons.length) throw new Error("missing complete season/episode guide");

  const seasons = new Set();
  let regularSeasons = 0;
  let totalEpisodes = 0;
  for (const season of record.seasons) {
    const seasonNumber = Number(season?.seasonNumber);
    if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || seasons.has(seasonNumber)) {
      throw new Error("invalid or duplicate season number");
    }
    seasons.add(seasonNumber);
    if (seasonNumber > 0) regularSeasons += 1;
    if (!Array.isArray(season.episodes) || season.episodes.length === 0 ||
        Number(season.episodeCount) !== season.episodes.length) {
      throw new Error("season episode total does not match guide");
    }
    const episodeNumbers = new Set();
    for (const episode of season.episodes) {
      const number = Number(episode?.episodeNumber);
      if (!Number.isSafeInteger(number) || number < 1 || episodeNumbers.has(number) ||
          !String(episode?.name || "").trim()) throw new Error("invalid or duplicate episode entry");
      episodeNumbers.add(number);
      if (!safeHttps(episode?.stillUrl)) throw new Error("episode still missing");
      totalEpisodes += 1;
    }
    const ordered = [...episodeNumbers].sort((a, b) => a - b);
    if (seasonNumber > 0 && ordered.some((number, index) => number !== index + 1)) {
      throw new Error("non-contiguous episode numbers");
    }
  }
  const orderedSeasons = [...seasons].filter((number) => number > 0).sort((a, b) => a - b);
  if (orderedSeasons.some((number, index) => number !== index + 1)) throw new Error("non-contiguous season numbers");
  if (regularSeasons !== Number(record.numberOfSeasons)) throw new Error("season total does not match guide");
  if (totalEpisodes !== Number(record.numberOfEpisodes)) throw new Error("episode total does not match guide");
  return true;
}

export function validateOfflineAnime(record) {
  const id = Number(record?.malId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("invalid MAL ID");
  if (!String(record?.title || "").trim()) throw new Error("missing original title");
  if (String(record?.synopsis || "").trim().length < 80) throw new Error("synopsis shorter than 80 characters");
  if (!safeHttps(record?.posterUrl) || !safeHttps(record?.posterFallbackUrl)) throw new Error("missing poster or poster fallback");
  if (!safeHttps(record?.bannerUrl) || !safeHttps(record?.backdropUrl)) throw new Error("missing landscape banner/backdrop");
  if (!catalogReleaseYear(record, "anime")) throw new Error("missing release year");
  if (!Number.isSafeInteger(Number(record?.episodes)) || Number(record.episodes) < 1) throw new Error("missing episode total");
  if (record?.adult === true || !hasSafeGenres(record) || ["rx", "hentai"].includes(String(record?.rating || "").toLowerCase())) {
    throw new Error("adult anime or disallowed genres");
  }
  if (record?.malUrl !== "https://myanimelist.net/anime/" + id) throw new Error("missing canonical MAL URL");
  if (!Array.isArray(record?.episodeGuide) || record.episodeGuide.length !== Number(record.episodes)) {
    throw new Error("episode guide count does not match episode total");
  }
  const seen = new Set();
  for (const episode of record.episodeGuide) {
    const season = Number(episode?.seasonNumber);
    const number = Number(episode?.episodeNumber);
    const key = season + ":" + number;
    if (!Number.isSafeInteger(season) || season < 1 || !Number.isSafeInteger(number) || number < 1 ||
        seen.has(key) || !String(episode?.title || "").trim()) throw new Error("invalid or duplicate episode guide entry");
    if (!safeHttps(episode?.imageUrl)) throw new Error("episode still missing");
    seen.add(key);
  }
  return true;
}

export function prepareOfflineCatalog() {
  const sources = {
    movie: [...MANUAL_MOVIES_2020_2026, ...STATIC_MOVIES],
    tv: [...MANUAL_TV_SERIES_2020_2026, ...STATIC_TV_SERIES, ...TV_SERIES_CANDIDATES],
    anime: [...MANUAL_ANIME_CATALOG, ...NEW_ANIME_CATALOG]
  };
  const validators = {
    movie: validateOfflineMovie,
    tv: validateOfflineTv,
    anime: validateOfflineAnime
  };
  const prepared = {};
  for (const [kind, source] of Object.entries(sources)) {
    const inWindow = source.filter((record) => {
      const year = catalogReleaseYear(record, kind);
      return year !== null && year >= CATALOG_YEAR_START && year <= CATALOG_YEAR_END;
    });
    const unique = new Map();
    const uniqueTitles = new Set();
    const rejected = {};
    for (const record of inWindow) {
      try {
        validators[kind](record);
        const idField = kind === "movie" ? "imdbId" : kind === "tv" ? "tmdbId" : "malId";
        const id = kind === "movie" ? String(record[idField]).toLowerCase() : String(Number(record[idField]));
        const displayTitle = kind === "anime" ? record.titleEnglish || record.title : record.title;
        const displayYear = catalogReleaseYear(record, kind);
        const normalizedTitleKey = titleKey(displayTitle) + "|" + String(displayYear || "");
        if (!unique.has(id) && !uniqueTitles.has(normalizedTitleKey)) {
          unique.set(id, record);
          uniqueTitles.add(normalizedTitleKey);
        }
      } catch (error) {
        const reason = error.message || "record validation failed";
        rejected[reason] = (rejected[reason] || 0) + 1;
      }
    }
    prepared[kind] = { inWindow: inWindow.length, records: [...unique.values()], rejected };
  }
  return prepared;
}

async function insertNewOnly({ label, kind, Model, idField, records }) {
  const projection = { [idField]: 1, title: 1, titleEnglish: 1, releaseYear: 1, releaseDate: 1, firstAirDate: 1, airedFrom: 1 };
  const existing = await Model.find({}, projection).lean();
  const existingIds = new Set(existing.map((item) =>
    kind === "movie" ? String(item[idField] || "").toLowerCase() : String(Number(item[idField]))
  ));
  const existingTitles = new Set(existing.map((item) => {
    const title = kind === "anime" ? item.titleEnglish || item.title : item.title;
    return titleKey(title) + "|" + String(catalogReleaseYear(item, kind) || "");
  }));
  const pending = records.filter((record) => {
    const id = kind === "movie" ? String(record[idField]).toLowerCase() : String(Number(record[idField]));
    const title = kind === "anime" ? record.titleEnglish || record.title : record.title;
    const key = titleKey(title) + "|" + String(catalogReleaseYear(record, kind) || "");
    return !existingIds.has(id) && !existingTitles.has(key);
  }).map((record) => ({ ...record }));

  if (pending.length) {
    await Model.insertMany(pending, { ordered: false });
  }
  const total = await Model.countDocuments();
  const inserted = pending.length;
  const alreadyPresent = records.length - inserted;
  console.log(label + ": " + inserted + " inserted, " + alreadyPresent + " already present/skipped; " + total + " total in collection.");
  return { inserted, alreadyPresent, total };
}

export async function seedOfflineCatalog(selectedKinds = ["movie", "tv", "anime"]) {
  const prepared = prepareOfflineCatalog();
  const summary = {};
  const selections = {
    movie: { flag: "--movies", label: "Movies", Model: Movie, idField: "imdbId" },
    tv: { flag: "--tv", label: "TV series", Model: TvSeries, idField: "tmdbId" },
    anime: { flag: "--anime", label: "Anime", Model: AnimeSeries, idField: "malId" }
  };
  for (const kind of selectedKinds) {
    const group = prepared[kind];
    summary[kind] = {
      inWindow: group.inWindow,
      valid: group.records.length,
      rejected: group.rejected
    };
    if (!group.records.length) {
      console.warn(selections[kind].label + ": no locally committed 2020–2026 records pass the complete-content validation.");
    }
    for (const [reason, count] of Object.entries(group.rejected)) {
      console.warn(selections[kind].label + ": " + count + " rejected — " + reason + ".");
    }
  }

  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME in .env before running the offline catalog seed.");
  }
  await connectDatabase();

  for (const kind of selectedKinds) {
    const group = prepared[kind];
    const selection = selections[kind];
    const result = await insertNewOnly({
      label: selection.label,
      kind,
      Model: selection.Model,
      idField: selection.idField,
      records: group.records
    });
    summary[kind] = { ...summary[kind], ...result };
  }

  const hasUsableRecordsForEveryKind = selectedKinds.every((kind) => prepared[kind].records.length > 0);
  if (!hasUsableRecordsForEveryKind) {
    console.warn("PARTIAL OFFLINE SEED: the local data pack does not yet contain complete, policy-compliant Movie, TV and Anime records for the entire 2020–2026 catalogue.");
  }
  return { hasUsableRecordsForEveryKind, summary };
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    "--movies": "movie",
    "--tv": "tv",
    "--anime": "anime"
  };
  const invalid = args.filter((arg) => !options[arg]);
  if (invalid.length) throw new Error("Unknown seed option: " + invalid.join(", ") + ". Use --movies, --tv, and/or --anime.");
  const selectedKinds = args.length ? args.map((arg) => options[arg]) : ["movie", "tv", "anime"];
  const uniqueKinds = [...new Set(selectedKinds)];
  const result = await seedOfflineCatalog(uniqueKinds);
  console.log("Offline catalogue seed summary:", result.summary);
}
