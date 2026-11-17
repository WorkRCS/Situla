import "dotenv/config";
import mongoose from "mongoose";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import { CartoonEpisode, CartoonMovie, CartoonSeries } from "../src/models.js";
import { approvedCartoonMovieFilter, approvedCartoonSeriesFilter } from "../src/cartoon-catalog.js";
import {
  buildCartoonEpisodeData,
  deriveCartoonBadges,
  isChildrenAnimation,
  isCartoonYearAllowed,
  normalizeCartoonText,
  readCartoonYear
} from "../src/cartoon-seed.js";

const TARGET_MOVIES = 200;
const TARGET_SERIES = 300;
const MAX_TVMAZE_PAGES = 120;
const CINEMETA = "https://v3-cinemeta.strem.io";
const TVMAZE = "https://api.tvmaze.com";
const STREAMX = "https://api.streamx.qzz.io";
const WIKIDATA = "https://query.wikidata.org/sparql";
const DATA_DIR = resolve(process.cwd(), "data");
const CACHE_DIR = resolve(DATA_DIR, ".cartoon-seed-cache");
const USER_AGENT = "Situla-Cartoon-Seed/1.0 (https://github.com/WorkRCS/Situla)";
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE_REFRESH = process.argv.includes("--refresh");
let nextTvMazeRequestAt = 0;

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const isPlainObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

const PINNED_SERIES = [
  { tmdbId: 70058, tvmazeId: 35173, imdbId: "tt2649730", title: "Motu Patlu", audioLanguages: ["Hindi"], dubLanguages: [] },
  { tmdbId: 65733, tvmazeId: 55578, imdbId: "tt4083422", title: "Doraemon (2005)", originalLanguage: "Japanese", audioLanguages: ["Japanese", "Hindi"], dubLanguages: ["Hindi"] },
  { tvmazeId: 78908, imdbId: "tt2827710", title: "Ninja Hattori Returns", originalLanguage: "Japanese", audioLanguages: ["Japanese", "Hindi"], dubLanguages: ["Hindi"] },
  { imdbId: "tt21195494", title: "Oggy and the Cockroaches: Next Generation", originalLanguage: "English", audioLanguages: ["English", "Hindi"], dubLanguages: ["Hindi"] }
];
const MOVIE_SEARCH_TERMS = [
  "Motu Patlu in Wonderland", "Motu Patlu Mission Moon", "Motu Patlu Deep Sea Adventure",
  "Motu Patlu Kung Fu Kings", "Motu Patlu Khazaane Ki Race", "Motu Patlu Kung Fu King Returns",
  "Motu Patlu in Carnival Island", "Motu Patlu Race Against Time", "Motu Patlu in Alien World",
  "Motu Patlu in Double Trouble", "Motu Patlu King of Kings", "Motu Patlu The Invisible Plane",
  "Motu Patlu in Dragon World", "Motu Patlu in Hong Kong", "Motu Patlu in Octopus World",
  "Motu Patlu in the City of Gold", "Motu Patlu Dino Invasion", "Motu Patlu Challenge of Kung Fu Brothers",
  "Motu Patlu Superheroes Supervillains from Mars", "Motu Patlu Robo Kids", "Motu Patlu Game of Zones",
  "Motu Patlu Alien Ghost", "Motu Patlu Dangerous Road Trip Switzerland", "Motu Patlu vs Dr Destroyer",
  "Crayon Shin-chan The Adult Empire Strikes Back", "Crayon Shin-chan The Battle of the Warring States",
  "Crayon Shin-chan The Kasukabe Boys of the Evening Sun", "Crayon Shin-chan Kasukabe Animal Kingdom",
  "Crayon Shin-chan The Spy", "Crayon Shin-chan Robot Dad", "Crayon Shin-chan Cactus Attack",
  "Crayon Shin-chan Food for Survival", "Crayon Shin-chan Our Dinosaur Diary",
  "Crayon Shin-chan Spicy Kasukabe Dancers", "cartoon movie family animation", "children animated movie"
];
const SERIES_SEARCH_TERMS = [
  "Motu Patlu", "Doraemon", "Ninja Hattori Returns",
  "Oggy and the Cockroaches Next Generation", "Oggy Oggy",
  "cartoon", "children animation", "kids animation", "animated family"
];
const SHINCHAN_HINDI_DUB = /adult empire|battle of the warring states|kasukabe boys|kasukabe animal kingdom|the spy|robot dad|cactus attack|food for survival|our dinosaur diary|spicy kasukabe dancers/i;
const MOTU_PATLU_TITLE = /motu[\s-]*patlu/i;

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value, limit = 5000) {
  return String(value || "").replace(/<\/?[^>]+>/g, " ").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ").trim().slice(0, limit);
}

function toHttps(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractImdbId(value) {
  const match = String(value || "").match(/tt\d{5,12}/i);
  return match ? match[0].toLowerCase() : "";
}

function parseDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function parseYearFromText(value) {
  const match = String(value || "").trim().match(/^(\d{4})/);
  return match ? Number(match[1]) : readCartoonYear(value);
}

function parseRuntime(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Math.max(0, Math.round(Number(match[1]))) : null;
}

function parseLanguage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const known = {
    hi: "Hindi", hin: "Hindi", hindi: "Hindi",
    ja: "Japanese", jpn: "Japanese", japanese: "Japanese",
    en: "English", eng: "English", english: "English",
    fr: "French", fra: "French", french: "French",
    es: "Spanish", spa: "Spanish", spanish: "Spanish",
    pt: "Portuguese", por: "Portuguese", portuguese: "Portuguese",
    ko: "Korean", kor: "Korean", korean: "Korean",
    zh: "Chinese", zho: "Chinese", chinese: "Chinese",
    de: "German", deu: "German", german: "German",
    it: "Italian", ita: "Italian", italian: "Italian",
    ru: "Russian", rus: "Russian", russian: "Russian"
  };
  return known[raw.toLowerCase()] || (raw.length <= 40 ? raw : "");
}

function cacheFile(namespace, key) {
  const digest = createHash("sha1").update(namespace + ":" + key).digest("hex");
  return resolve(CACHE_DIR, namespace + "-" + digest + ".json");
}

async function readCache(namespace, key) {
  if (FORCE_REFRESH) return null;
  try {
    return JSON.parse(await readFile(cacheFile(namespace, key), "utf8"));
  } catch {
    return null;
  }
}

async function writeCache(namespace, key, value) {
  if (value == null) return;
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile(namespace, key), JSON.stringify(value), "utf8");
}

async function requestJson(url, { headers = {}, timeoutMs = 18000, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow"
      });
      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = parseNumber(response.headers.get("retry-after")) * 1000;
        await delay(Math.max(retryAfter, 800 * (attempt + 1)));
        lastError = new Error("HTTP " + response.status + " for " + url);
        continue;
      }
      if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(500 * (attempt + 1));
    }
  }
  throw lastError || new Error("Request failed: " + url);
}

async function cachedJson(namespace, key, url, options = {}) {
  const cached = await readCache(namespace, key);
  if (cached !== null) return cached;
  const value = await requestJson(url, options);
  await writeCache(namespace, key, value);
  return value;
}

async function tvmazeJson(key, url) {
  const cached = await readCache("tvmaze", key);
  if (cached !== null) return cached;
  const wait = Math.max(0, nextTvMazeRequestAt - Date.now());
  if (wait) await delay(wait);
  nextTvMazeRequestAt = Date.now() + 550;
  const value = await requestJson(url, { timeoutMs: 20000, retries: 3 });
  await writeCache("tvmaze", key, value);
  return value;
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function discoverCinemeta(type, genres, searches) {
  const candidates = new Map();
  for (const genre of genres) {
    for (let skip = 0; skip < 2400; skip += 100) {
      const extra = "genre=" + encodeURIComponent(genre) + "&skip=" + skip;
      const url = CINEMETA + "/catalog/" + type + "/top/" + extra + ".json";
      let payload;
      try {
        payload = await cachedJson("cinemeta-catalog", type + "-" + genre + "-" + skip, url);
      } catch (error) {
        console.warn("Cinemeta catalog page failed:", genre, skip, error.message);
        break;
      }
      const metas = Array.isArray(payload?.metas) ? payload.metas : [];
      for (const item of metas) {
        const imdbId = extractImdbId(item?.id || item?.imdb_id);
        if (imdbId) candidates.set(imdbId, { ...item, imdbId });
      }
      if (!metas.length || metas.length < 20) break;
    }
  }
  for (const term of searches) {
    const extra = "search=" + encodeURIComponent(term);
    const url = CINEMETA + "/catalog/" + type + "/top/" + extra + ".json";
    try {
      const payload = await cachedJson("cinemeta-search", type + "-" + term, url);
      for (const item of Array.isArray(payload?.metas) ? payload.metas : []) {
        const imdbId = extractImdbId(item?.id || item?.imdb_id);
        if (imdbId) candidates.set(imdbId, { ...item, imdbId });
      }
    } catch (error) {
      console.warn("Cinemeta search failed:", term, error.message);
    }
  }
  return [...candidates.values()];
}

async function fetchCinemetaMeta(type, imdbId) {
  const url = CINEMETA + "/meta/" + type + "/" + encodeURIComponent(imdbId) + ".json";
  try {
    const payload = await cachedJson("cinemeta-meta", type + "-" + imdbId, url);
    return isPlainObject(payload?.meta) ? payload.meta : null;
  } catch {
    return null;
  }
}

function pinnedForShow(show) {
  const imdbId = extractImdbId(show.externals?.imdb);
  return PINNED_SERIES.find((item) => item.imdbId === imdbId ||
    (item.tvmazeId && Number(item.tvmazeId) === Number(show.id))) || null;
}

function isTvMazeCandidate(show) {
  const pin = pinnedForShow(show);
  const year = parseYearFromText(show.premiered);
  if (!isCartoonYearAllowed(year)) return false;
  const genres = Array.isArray(show.genres) ? show.genres : [];
  const animationType = String(show.type || "").toLowerCase() === "animation";
  const animationGenre = genres.some((genre) => normalizeCartoonText(genre) === "animation");
  if (!animationType && !animationGenre) return false;
  return isChildrenAnimation({
    genres,
    type: animationType ? "Animation" : "",
    rating: show.rating?.certification || "",
    pinned: Boolean(pin)
  });
}

async function discoverTvMazeShows() {
  const candidates = new Map();
  for (const term of SERIES_SEARCH_TERMS) {
    try {
      const rows = await tvmazeJson("search-" + term,
        TVMAZE + "/search/shows?q=" + encodeURIComponent(term));
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.show?.id && isTvMazeCandidate(row.show)) candidates.set(Number(row.show.id), row.show);
      }
    } catch (error) {
      console.warn("TVmaze search failed:", term, error.message);
    }
  }

  for (const pin of PINNED_SERIES) {
    try {
      const lookupUrl = pin.tvmazeId
        ? TVMAZE + "/shows/" + pin.tvmazeId
        : TVMAZE + "/lookup/shows?imdb=" + encodeURIComponent(pin.imdbId);
      const show = await tvmazeJson(
        "pinned-show-" + (pin.tvmazeId || pin.imdbId),
        lookupUrl
      );
      if (show?.id) candidates.set(Number(show.id), show);
    } catch (error) {
      console.warn("Pinned TVmaze lookup failed:", pin.title, error.message);
    }
  }

  for (let page = 0; page < MAX_TVMAZE_PAGES && candidates.size < 1200; page += 1) {
    let rows;
    try {
      rows = await tvmazeJson("shows-page-" + page, TVMAZE + "/shows?page=" + page);
    } catch (error) {
      console.warn("TVmaze discovery page failed:", page, error.message);
      break;
    }
    if (!Array.isArray(rows) || !rows.length) break;
    for (const show of rows) {
      if (show?.id && isTvMazeCandidate(show)) candidates.set(Number(show.id), show);
    }
    if (rows.length < 250) break;
  }
  return [...candidates.values()];
}

async function resolveWikidataIds(records, mediaKind) {
  const property = mediaKind === "movie" ? "P4947" : "P4983";
  const map = new Map();
  const ids = [...new Set(records.map((item) => extractImdbId(item.imdbId)).filter(Boolean))];
  for (let offset = 0; offset < ids.length; offset += 25) {
    const batch = ids.slice(offset, offset + 25);
    const values = batch.map((id) => '"' + id + '"').join(" ");
    const query = "SELECT ?imdb ?tmdb WHERE { VALUES ?imdb { " + values +
      " } ?item wdt:P345 ?imdb; wdt:" + property + " ?tmdb. }";
    const url = WIKIDATA + "?query=" + encodeURIComponent(query) + "&format=json";
    try {
      const payload = await cachedJson("wikidata-" + mediaKind, batch.join("-"), url, {
        headers: { accept: "application/sparql-results+json", "user-agent": USER_AGENT },
        timeoutMs: 25000,
        retries: 3
      });
      for (const binding of payload?.results?.bindings || []) {
        const imdbId = extractImdbId(binding?.imdb?.value);
        const tmdbId = Number(binding?.tmdb?.value);
        if (imdbId && Number.isSafeInteger(tmdbId) && tmdbId > 0) map.set(imdbId, tmdbId);
      }
    } catch (error) {
      console.warn("Wikidata ID batch failed:", mediaKind, offset, error.message);
    }
    await delay(250);
  }
  return map;
}

async function resolveStreamxId(mediaKind, imdbId) {
  const kind = mediaKind === "movie" ? "movie" : "series";
  const url = STREAMX + "/meta/" + kind + "/" + encodeURIComponent(imdbId) + "?enrich=0";
  try {
    const payload = await cachedJson("streamx-id", mediaKind + "-" + imdbId, url, {
      timeoutMs: 12000,
      retries: 1
    });
    const tmdbId = Number(payload?.meta?.externalIds?.tmdb || payload?.externalIds?.tmdb);
    return Number.isSafeInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
  } catch {
    return null;
  }
}

function isAdultMetadata(meta) {
  const genres = Array.isArray(meta?.genres) ? meta.genres : [];
  return meta?.adult === true || genres.some((genre) =>
    ["adult", "erotica", "porn", "pornographic", "hentai", "gore", "horror"].includes(normalizeCartoonText(genre))
  );
}

function movieFromMeta(meta, tmdbId) {
  const imdbId = extractImdbId(meta?.imdb_id || meta?.id);
  const title = cleanText(meta?.name || meta?.title, 240);
  const originalTitle = cleanText(meta?.original_name || meta?.originalTitle || title, 240);
  const overview = cleanText(meta?.description || meta?.overview, 5000);
  const releaseDate = parseDate(meta?.released || meta?.releaseDate);
  const year = readCartoonYear(releaseDate) || parseYearFromText(meta?.releaseInfo) || parseYearFromText(meta?.year);
  const genres = Array.isArray(meta?.genres) ? meta.genres.map((item) => cleanText(item, 80)).filter(Boolean) : [];
  const pinnedFranchise = MOTU_PATLU_TITLE.test(title) || /crayon[\s-]*shin|shin[\s-]*chan/i.test(title);
  if (!imdbId || !tmdbId || !title || overview.length < 60 || !toHttps(meta?.poster) ||
      !isCartoonYearAllowed(year) || isAdultMetadata(meta)) return null;
  if (!isChildrenAnimation({ genres, rating: meta?.certification || meta?.contentRating || "", pinned: pinnedFranchise })) return null;
  const originalLanguage = parseLanguage(meta?.language || meta?.original_language);
  const audioLanguages = originalLanguage ? [originalLanguage] : [];
  if (MOTU_PATLU_TITLE.test(title) && originalLanguage === "Hindi" && !audioLanguages.includes("Hindi")) audioLanguages.push("Hindi");
  const dubLanguages = isShinchanHindiTitle(title) ? ["Hindi"] : [];
  return {
    tmdbId,
    imdbId,
    title,
    originalTitle,
    aliases: [],
    overview,
    posterUrl: toHttps(meta.poster),
    backdropUrl: toHttps(meta.background),
    releaseDate,
    releaseYear: year,
    runtime: parseRuntime(meta.runtime),
    genres,
    keywords: [...new Set([...genres, ...(Array.isArray(meta.tags) ? meta.tags : [])].map((item) => cleanText(item, 80)).filter(Boolean))],
    originalLanguage,
    audioLanguages,
    dubLanguages,
    country: Array.isArray(meta.country) ? meta.country.map((item) => cleanText(item, 80)) : [],
    certification: cleanText(meta.certification || meta.contentRating, 40),
    minimumAge: null,
    contentWarnings: [],
    kidsApproved: true,
    voteAverage: Math.max(0, Math.min(10, parseNumber(meta.imdbRating || meta.rating))),
    voteCount: parseNumber(meta.imdbVotes || meta.votes),
    popularity: parseNumber(meta.popularity),
    featured: false,
    hot: false,
    popular: false,
    playbackStatus: "unverified",
    metadataSource: "Cinemeta keyless metadata; TMDB ID matched via Wikidata/StreamX",
    sourceUrl: CINEMETA + "/meta/movie/" + imdbId + ".json",
    trendScore: 0,
    trendUpdatedAt: null
  };
}

function createSeriesRecord(show, meta, tmdbId, episodeData) {
  const pin = pinnedForShow(show);
  const imdbId = extractImdbId(show.externals?.imdb) || pin?.imdbId || "";
  const title = cleanText(show.name || meta?.name || pin?.title, 240);
  const originalTitle = cleanText(meta?.original_name || meta?.originalTitle || title, 240);
  const overview = cleanText(show.summary || meta?.description || meta?.overview || "", 5000);
  const firstAirDate = parseDate(show.premiered || meta?.released);
  const lastAirDate = parseDate(show.ended || "");
  const year = readCartoonYear(firstAirDate) || parseYearFromText(meta?.releaseInfo) || parseYearFromText(meta?.year);
  const genres = [...new Set([
    ...(Array.isArray(show.genres) ? show.genres : []),
    ...(Array.isArray(meta?.genres) ? meta.genres : [])
  ].map((item) => cleanText(item, 80)).filter(Boolean))];
  const originalLanguage = parseLanguage(show.language || meta?.language || pin?.originalLanguage);
  const audioLanguages = [];
  for (const value of [originalLanguage, ...(Array.isArray(meta?.languages) ? meta.languages : []),
    ...(Array.isArray(meta?.audioLanguages) ? meta.audioLanguages : []), ...(pin?.audioLanguages || [])]) {
    const language = parseLanguage(value);
    if (language && !audioLanguages.includes(language)) audioLanguages.push(language);
  }
  const dubLanguages = [...new Set(pin?.dubLanguages || [])];
  if (!tmdbId || !title || overview.length < 50 || !isCartoonYearAllowed(year) ||
      !episodeData.numberOfEpisodes) return null;
  if (!isChildrenAnimation({
    genres,
    type: show.type,
    rating: show.rating?.certification || meta?.certification || meta?.contentRating || "",
    pinned: Boolean(pin)
  })) return null;
  const posterUrl = toHttps(show.image?.original || show.image?.medium || meta?.poster);
  if (!posterUrl) return null;
  const numberOfSeasons = episodeData.numberOfSeasons;
  const numberOfEpisodes = episodeData.numberOfEpisodes;
  const country = show.network?.country?.name
    ? [cleanText(show.network.country.name, 80)]
    : (Array.isArray(meta?.country) ? meta.country.map((item) => cleanText(item, 80)).filter(Boolean) : []);
  return {
    tmdbId,
    title,
    originalTitle,
    aliases: [],
    overview,
    posterUrl,
    backdropUrl: toHttps(meta?.background || meta?.backdrop),
    firstAirDate,
    lastAirDate,
    releaseYear: year,
    genres,
    keywords: [...new Set([...genres, ...(Array.isArray(meta?.tags) ? meta.tags : [])].map((item) => cleanText(item, 80)).filter(Boolean))],
    originalLanguage,
    audioLanguages,
    dubLanguages,
    country,
    networks: [show.network?.name || show.webChannel?.name].filter(Boolean).map((item) => cleanText(item, 100)),
    certification: cleanText(show.rating?.certification || meta?.certification || meta?.contentRating || "", 40),
    minimumAge: null,
    contentWarnings: [],
    kidsApproved: true,
    voteAverage: Math.max(0, Math.min(10, parseNumber(show.rating?.average || meta?.imdbRating || meta?.rating))),
    voteCount: parseNumber(meta?.imdbVotes || meta?.votes),
    popularity: parseNumber(show.weight || meta?.popularity),
    status: cleanText(show.status || "", 60),
    numberOfSeasons,
    numberOfEpisodes,
    seasons: episodeData.seasons,
    featured: false,
    hot: false,
    popular: false,
    playbackStatus: "unverified",
    metadataSource: "TVmaze (CC BY-SA) + Cinemeta keyless metadata; TMDB ID matched via Wikidata/StreamX",
    sourceUrl: show.url || (imdbId ? "https://www.imdb.com/title/" + imdbId + "/" : ""),
    trendScore: 0,
    trendUpdatedAt: null
  };
}

function isShinchanHindiTitle(title) {
  return SHINCHAN_HINDI_DUB.test(String(title || ""));
}

async function buildMovieRecords(existingIds, needed) {
  console.log("\\n[1/4] Discovering animated family movie candidates via public Cinemeta…");
  const candidates = await discoverCinemeta("movie", ["Animation", "Family"], MOVIE_SEARCH_TERMS);
  console.log("Cinemeta movie candidate IDs:", candidates.length);
  const metaRows = await mapLimit(candidates, 8, async (candidate) => ({
    imdbId: candidate.imdbId,
    meta: await fetchCinemetaMeta("movie", candidate.imdbId)
  }));
  const usableMeta = metaRows.filter((row) => row.meta);
  const unresolved = usableMeta.filter((row) => !Number(row.meta.moviedb_id));
  const wikidata = await resolveWikidataIds(unresolved.map((row) => ({ imdbId: row.imdbId })), "movie");
  const streamxRows = await mapLimit(unresolved.filter((row) => !wikidata.has(row.imdbId)), 8, async (row) => ({
    imdbId: row.imdbId,
    tmdbId: await resolveStreamxId("movie", row.imdbId)
  }));
  const streamx = new Map(streamxRows.filter((row) => row.tmdbId).map((row) => [row.imdbId, row.tmdbId]));
  const rows = [];
  for (const row of usableMeta) {
    const tmdbId = Number(row.meta.moviedb_id) || wikidata.get(row.imdbId) || streamx.get(row.imdbId);
    const item = movieFromMeta({ ...row.meta, imdb_id: row.meta.imdb_id || row.imdbId }, tmdbId);
    if (item && !existingIds.has(Number(item.tmdbId))) rows.push(item);
  }
  const unique = [...new Map(rows.map((item) => [item.tmdbId, item])).values()];
  return deriveCartoonBadges(unique).slice(0, needed);
}

async function buildSeriesRecords(existingIds, needed) {
  console.log("\\n[2/4] Discovering animated children series from TVmaze public listings…");
  const discovered = await discoverTvMazeShows();
  console.log("TVmaze animated children candidates:", discovered.length);
  const uniqueByImdb = new Map();
  for (const show of discovered) {
    const pin = pinnedForShow(show);
    const imdbId = extractImdbId(show.externals?.imdb) || pin?.imdbId || "";
    if (imdbId) uniqueByImdb.set(imdbId, show);
  }
  const candidates = [...uniqueByImdb.entries()].map(([imdbId, show]) => ({ imdbId, show, pin: pinnedForShow(show) }));
  const metaRows = await mapLimit(candidates, 8, async (item) => ({
    ...item,
    meta: await fetchCinemetaMeta("series", item.imdbId)
  }));
  const missingTmdb = metaRows.filter((item) => !item.pin?.tmdbId && !Number(item.meta?.moviedb_id));
  const wikidata = await resolveWikidataIds(missingTmdb.map((item) => ({ imdbId: item.imdbId })), "series");
  const streamxRows = await mapLimit(missingTmdb.filter((item) => !wikidata.has(item.imdbId)), 8, async (item) => ({
    imdbId: item.imdbId,
    tmdbId: await resolveStreamxId("series", item.imdbId)
  }));
  const streamx = new Map(streamxRows.filter((item) => item.tmdbId).map((item) => [item.imdbId, item.tmdbId]));
  const ranked = metaRows.map((item) => ({
    ...item,
    tmdbId: Number(item.pin?.tmdbId || item.meta?.moviedb_id) ||
      wikidata.get(item.imdbId) || streamx.get(item.imdbId) || null
  })).filter((item) => item.tmdbId && !existingIds.has(Number(item.tmdbId)));

  ranked.sort((a, b) => {
    if (Boolean(a.pin) !== Boolean(b.pin)) return a.pin ? -1 : 1;
    return parseNumber(b.show.weight) - parseNumber(a.show.weight);
  });

  const output = [];
  const episodes = [];
  const seenTmdb = new Set();
  console.log("[3/4] Loading TVmaze show details and episode thumbnails…");
  for (const item of ranked) {
    if (output.length >= needed) break;
    if (seenTmdb.has(Number(item.tmdbId))) continue;
    const detail = await tvmazeJson("show-detail-" + item.show.id,
      TVMAZE + "/shows/" + item.show.id + "?embed=episodes");
    if (!detail) continue;
    const episodeRows = detail?._embedded?.episodes || [];
    let episodeData = buildCartoonEpisodeData(
      item.tmdbId, episodeRows, detail.image?.original || detail.image?.medium
    );
    const record = createSeriesRecord(detail, item.meta, Number(item.tmdbId), episodeData);
    if (!record) continue;
    seenTmdb.add(Number(record.tmdbId));
    output.push(record);
    episodes.push(...episodeData.episodes);
  }
  const unique = [...new Map(output.map((item) => [item.tmdbId, item])).values()];
  const badges = deriveCartoonBadges(unique);
  const finalIds = new Set(badges.map((item) => item.tmdbId));
  return { records: badges, episodes: episodes.filter((item) => finalIds.has(item.seriesTmdbId)) };
}

async function writeGeneratedFiles(movies, series, episodes) {
  await mkdir(DATA_DIR, { recursive: true });
  const files = [
    ["cartoon-movies.generated.json", movies],
    ["cartoon-series.generated.json", series],
    ["cartoon-episodes.generated.json", episodes]
  ];
  for (const [name, value] of files) {
    await writeFile(resolve(DATA_DIR, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  }
  return files.map(([name, value]) => ({ file: "data/" + name, count: value.length }));
}

export async function seedCartoonCatalog() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME in .env. No metadata API keys are required.");
  }
  await mkdir(CACHE_DIR, { recursive: true });
  await connectDatabase();

  const [existingMovieRows, existingSeriesRows] = await Promise.all([
    CartoonMovie.find(approvedCartoonMovieFilter()).select("tmdbId").lean(),
    CartoonSeries.find(approvedCartoonSeriesFilter()).select("tmdbId").lean()
  ]);
  const existingMovieIds = new Set(existingMovieRows.map((item) => Number(item.tmdbId)));
  const existingSeriesIds = new Set(existingSeriesRows.map((item) => Number(item.tmdbId)));
  const movieNeed = Math.max(0, TARGET_MOVIES - existingMovieIds.size);
  const seriesNeed = Math.max(0, TARGET_SERIES - existingSeriesIds.size);

  console.log("Situla Cartoon seed — no provider API keys required.");
  console.log("Existing approved post-2000 records:", { movies: existingMovieIds.size, series: existingSeriesIds.size });
  console.log("New records requested:", { movies: movieNeed, series: seriesNeed });
  if (!movieNeed && !seriesNeed) {
    console.log("Target totals are already present; no records were changed.");
    return { moviesInserted: 0, seriesInserted: 0, episodesInserted: 0 };
  }

  const movies = movieNeed ? await buildMovieRecords(existingMovieIds, movieNeed) : [];
  const seriesResult = seriesNeed
    ? await buildSeriesRecords(existingSeriesIds, seriesNeed)
    : { records: [], episodes: [] };
  const series = seriesResult.records.slice(0, seriesNeed);
  const episodes = seriesResult.episodes.filter((item) => series.some((record) => record.tmdbId === item.seriesTmdbId));
  const fileSummary = await writeGeneratedFiles(movies, series, episodes);

  console.log("Generated files:", JSON.stringify(fileSummary));
  console.log("Preflight:", {
    movies: movies.length + existingMovieIds.size, targetMovies: TARGET_MOVIES,
    series: series.length + existingSeriesIds.size, targetSeries: TARGET_SERIES,
    episodeRows: episodes.length
  });

  if (movies.length < movieNeed || series.length < seriesNeed) {
    throw new Error(
      "Preflight incomplete. No database rows were inserted. Need " + movieNeed +
      " new movies and " + seriesNeed + " new series, but found " + movies.length +
      " and " + series.length + ". The generated/cache files remain available for a safe rerun."
    );
  }

  if (DRY_RUN) {
    console.log("DRY RUN — generated files only; MongoDB was not modified.");
    return { dryRun: true, movies: movies.length, series: series.length, episodes: episodes.length };
  }

  const existingEpisodes = await CartoonEpisode.find({
    seriesTmdbId: { $in: series.map((item) => item.tmdbId) }
  }).select("seriesTmdbId seasonNumber episodeNumber").lean();
  const episodeKeys = new Set(existingEpisodes.map((item) =>
    item.seriesTmdbId + ":" + item.seasonNumber + ":" + item.episodeNumber
  ));
  const newEpisodes = episodes.filter((item) =>
    !episodeKeys.has(item.seriesTmdbId + ":" + item.seasonNumber + ":" + item.episodeNumber)
  );

  let moviesInserted = 0;
  let seriesInserted = 0;
  let episodesInserted = 0;
  if (movies.length) moviesInserted = (await CartoonMovie.insertMany(movies, { ordered: false })).length;
  if (series.length) seriesInserted = (await CartoonSeries.insertMany(series, { ordered: false })).length;
  if (newEpisodes.length) episodesInserted = (await CartoonEpisode.insertMany(newEpisodes, { ordered: false })).length;

  const summary = { moviesInserted, seriesInserted, episodesInserted, files: fileSummary };
  console.log("Cartoon seed completed:", JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  seedCartoonCatalog()
    .catch((error) => {
      console.error("Cartoon seed failed:", error?.message || error);
      console.error("Incomplete preflight batches are not inserted. Public metadata cache is kept in data/.cartoon-seed-cache.");
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
