import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import { TvSeries } from "../src/models.js";
import { TV_SERIES_CANDIDATES } from "../data/tv-additions.js";

const TV_SERIES_TARGET_ADDITIONS = 200;
const MIN_TV_EPISODES = 5;
const MIN_TV_EPISODE_STILL_RATIO = 0.8;
const REQUEST_INTERVAL_MS = 520;
const USER_AGENT = "Situla-TV-Catalog/3.0 (https://github.com/WorkRCS/Situla)";
const TVMAZE_API = "https://api.tvmaze.com";
const DISALLOWED_GENRES = new Set(["adult", "erotica", "porn", "pornographic", "hentai"]);
const imageValidationCache = new Map();
let nextRequestAt = 0;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export function normalizeShowName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

export function stripHtml(value) {
  return String(value || "").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim().slice(0, 4000);
}

export function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isExactTvmazeMatch(show, candidate) {
  if (!show?.id || normalizeShowName(show.name) !== normalizeShowName(candidate?.title)) return false;
  const expectedYear = String(candidate?.firstAirDate || "").slice(0, 4);
  const actualYear = String(show?.premiered || "").slice(0, 4);
  return /^\d{4}$/.test(expectedYear) && /^\d{4}$/.test(actualYear) && expectedYear === actualYear;
}

export function buildSeasonRecords(episodes, fallbackPoster = null) {
  const grouped = new Map();
  const seenEpisodes = new Set();

  for (const episode of Array.isArray(episodes) ? episodes : []) {
    if (episode?.season == null || episode?.number == null) continue;
    const seasonNumber = Number(episode.season);
    const episodeNumber = Number(episode.number);
    if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 ||
        !Number.isSafeInteger(episodeNumber) || episodeNumber < 1) continue;

    const episodeKey = seasonNumber + ":" + episodeNumber;
    if (seenEpisodes.has(episodeKey)) throw new Error("Duplicate TVmaze episode " + episodeKey + ".");
    seenEpisodes.add(episodeKey);

    const name = String(episode.name || "").trim().slice(0, 240);
    if (!name) throw new Error("TVmaze episode " + episodeKey + " has no title.");

    if (!grouped.has(seasonNumber)) grouped.set(seasonNumber, []);
    grouped.get(seasonNumber).push({
      episodeNumber,
      name,
      overview: stripHtml(episode.summary),
      airDate: /^\d{4}-\d{2}-\d{2}$/.test(String(episode.airdate || "")) ? episode.airdate : null,
      runtime: Number(episode.runtime) > 0 ? Number(episode.runtime) : null,
      stillUrl: safeHttpsUrl(episode.image?.original || episode.image?.medium),
      voteAverage: Math.max(0, Math.min(10, Number(episode.rating?.average) || 0))
    });
  }

  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([seasonNumber, seasonEpisodes]) => {
    seasonEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    return {
      seasonNumber,
      name: seasonNumber === 0 ? "Specials" : "Season " + seasonNumber,
      overview: "",
      airDate: seasonEpisodes.find((episode) => episode.airDate)?.airDate || null,
      episodeCount: seasonEpisodes.length,
      posterUrl: fallbackPoster,
      voteAverage: 0,
      episodes: seasonEpisodes
    };
  });
}

export function mapTvmazeShow(show, candidate) {
  if (!isExactTvmazeMatch(show, candidate)) return null;

  const overview = stripHtml(show.summary);
  if (overview.length < 80) return null;

  const imageUrl = safeHttpsUrl(show.image?.original || show.image?.medium) ||
    safeHttpsUrl(candidate.posterUrl);
  if (!imageUrl) return null;

  const genres = Array.isArray(show.genres) && show.genres.length
    ? show.genres.map((genre) => String(genre).trim()).filter(Boolean)
    : (Array.isArray(candidate.genres) ? candidate.genres : []);
  if (genres.some((genre) => DISALLOWED_GENRES.has(String(genre).toLowerCase().trim()))) return null;

  const rawEpisodes = show?._embedded?.episodes;
  if (!Array.isArray(rawEpisodes) || rawEpisodes.length < MIN_TV_EPISODES) return null;

  let seasons;
  try {
    seasons = buildSeasonRecords(rawEpisodes, imageUrl);
  } catch {
    return null;
  }

  const numberOfEpisodes = seasons.reduce((total, season) => total + season.episodeCount, 0);
  const numberOfSeasons = seasons.filter((season) => season.seasonNumber > 0).length;
  if (numberOfEpisodes < MIN_TV_EPISODES || numberOfSeasons < 1) return null;

  const firstAirDate = /^\d{4}-\d{2}-\d{2}$/.test(String(show.premiered || ""))
    ? show.premiered : candidate.firstAirDate;
  const imdb = String(show.externals?.imdb || "").trim().toLowerCase();

  return {
    tmdbId: Number(candidate.tmdbId),
    externalImdbId: /^tt\d{5,12}$/.test(imdb) ? imdb : null,
    title: String(show.name).trim(),
    originalTitle: String(show.name).trim(),
    overview,
    posterUrl: imageUrl,
    // A poster is not a landscape backdrop. Only store a separately supplied backdrop.
    backdropUrl: safeHttpsUrl(candidate.backdropUrl),
    firstAirDate,
    releaseYear: Number(firstAirDate.slice(0, 4)) || null,
    runtime: Number(show.averageRuntime || show.runtime) > 0
      ? Number(show.averageRuntime || show.runtime) : null,
    adult: false,
    metadataSource: "TVmaze",
    sourceId: Number(show.id),
    sourceUrl: "https://www.tvmaze.com/shows/" + encodeURIComponent(show.id),
    referenceUrl: String(candidate.referenceUrl || ""),
    voteAverage: Math.max(0, Math.min(10, Number(show.rating?.average) || 0)),
    voteCount: 0,
    popularity: Number(show.weight) || 0,
    genres,
    keywords: [],
    certification: "",
    status: String(show.status || ""),
    numberOfSeasons,
    numberOfEpisodes,
    network: String(show.network?.name || show.webChannel?.name || candidate.network || "").trim(),
    country: String(show.network?.country?.name || show.webChannel?.country?.name || candidate.country || "").trim(),
    creators: Array.isArray(candidate.creators) ? candidate.creators : [],
    seasons
  };
}

export function validateTvSeriesRecord(record) {
  const fail = (message) => { throw new Error(message + " (TMDB " + record?.tmdbId + ")"); };
  if (!Number.isSafeInteger(Number(record?.tmdbId)) || Number(record.tmdbId) < 1) fail("Invalid TMDB ID");
  if (!String(record?.title || "").trim()) fail("Missing series title");
  if (String(record?.overview || "").trim().length < 80) fail("Series synopsis is too short");
  if (!safeHttpsUrl(record?.posterUrl)) fail("Missing or invalid poster");
  if (record?.backdropUrl && !safeHttpsUrl(record.backdropUrl)) fail("Invalid backdrop URL");
  if (record?.adult === true) fail("Adult series rejected");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record?.firstAirDate || ""))) fail("Invalid premiere date");
  if (!Array.isArray(record?.genres) ||
      record.genres.some((genre) => DISALLOWED_GENRES.has(String(genre).toLowerCase().trim()))) {
    fail("Invalid or disallowed genres");
  }
  if (!Array.isArray(record?.seasons) || !record.seasons.length) fail("Missing season guide");

  const seasonNumbers = new Set();
  let regularSeasonCount = 0;
  let totalEpisodes = 0;
  let totalStills = 0;

  for (const season of record.seasons) {
    const seasonNumber = Number(season?.seasonNumber);
    if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || seasonNumbers.has(seasonNumber)) {
      fail("Invalid or duplicate season number");
    }
    seasonNumbers.add(seasonNumber);
    if (seasonNumber > 0) regularSeasonCount += 1;

    if (!Array.isArray(season.episodes) || !season.episodes.length ||
        Number(season.episodeCount) !== season.episodes.length) {
      fail("Season episode count does not match its guide");
    }

    const episodeNumbers = new Set();
    for (const episode of season.episodes) {
      const episodeNumber = Number(episode?.episodeNumber);
      if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1 ||
          episodeNumbers.has(episodeNumber) || !String(episode?.name || "").trim()) {
        fail("Invalid, duplicate or untitled episode in season " + seasonNumber);
      }
      episodeNumbers.add(episodeNumber);
      if (episode.stillUrl) {
        if (!safeHttpsUrl(episode.stillUrl)) fail("Invalid episode still URL");
        totalStills += 1;
      }
      totalEpisodes += 1;
    }
  }

  if (regularSeasonCount < 1 || Number(record.numberOfSeasons) !== regularSeasonCount) {
    fail("Season total does not match the guide");
  }
  if (totalEpisodes < MIN_TV_EPISODES || Number(record.numberOfEpisodes) !== totalEpisodes) {
    fail("Episode total does not match the guide");
  }
  if (totalStills / totalEpisodes < MIN_TV_EPISODE_STILL_RATIO) {
    fail("Episode still coverage is below " + Math.round(MIN_TV_EPISODE_STILL_RATIO * 100) + "%");
  }
  return true;
}

async function tvmazeRequest(path, attempt = 0) {
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait) await sleep(wait);
  nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;

  let response;
  try {
    response = await fetch(TVMAZE_API + path, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    if (attempt < 3) {
      await sleep(1000 * (attempt + 1));
      return tvmazeRequest(path, attempt + 1);
    }
    throw error;
  }

  if (response.status === 404) return null;
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retry = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retry) && retry > 0
      ? Math.min(retry * 1000, 30000) : Math.min(1000 * (2 ** attempt), 15000));
    return tvmazeRequest(path, attempt + 1);
  }
  if (!response.ok) throw new Error("TVmaze returned HTTP " + response.status + ".");
  return response.json();
}

async function findTvmazeShow(candidate) {
  const query = encodeURIComponent(candidate.title);
  const direct = await tvmazeRequest("/singlesearch/shows?q=" + query + "&embed=episodes");
  if (isExactTvmazeMatch(direct, candidate) && Array.isArray(direct?._embedded?.episodes)) return direct;

  const results = await tvmazeRequest("/search/shows?q=" + query);
  const matches = (Array.isArray(results) ? results : [])
    .map((entry) => entry?.show)
    .filter((show) => isExactTvmazeMatch(show, candidate))
    .sort((a, b) => Number(Boolean(b?.image)) - Number(Boolean(a?.image)));
  const match = matches[0];
  if (!match?.id) return null;
  if (Array.isArray(match?._embedded?.episodes)) return match;
  return tvmazeRequest("/shows/" + encodeURIComponent(match.id) + "?embed=episodes");
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
        signal: AbortSignal.timeout(10000)
      });
      const type = String(head.headers.get("content-type") || "").toLowerCase();
      if (head.ok && type.startsWith("image/")) return true;
    } catch {}

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT, Range: "bytes=0-0", Accept: "image/*" },
        signal: AbortSignal.timeout(10000)
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
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  }));
  return output;
}

async function validateSeriesArtwork(item, candidate) {
  const posters = [...new Set([item.posterUrl, candidate.posterUrl].map(safeHttpsUrl).filter(Boolean))];
  let poster = null;
  for (const option of posters) {
    if (await verifyRemoteImage(option)) {
      poster = option;
      break;
    }
  }
  if (!poster) return null;

  const episodeRefs = item.seasons.flatMap((season, seasonIndex) =>
    season.episodes.map((episode, episodeIndex) => ({ seasonIndex, episodeIndex, episode }))
  );
  const checkedEpisodes = await mapWithConcurrency(episodeRefs, 16, async (entry) => ({
    ...entry,
    stillUrl: entry.episode.stillUrl && await verifyRemoteImage(entry.episode.stillUrl)
      ? entry.episode.stillUrl : null
  }));

  const seasons = item.seasons.map((season, seasonIndex) => ({
    ...season,
    posterUrl: poster,
    episodes: checkedEpisodes
      .filter((entry) => entry.seasonIndex === seasonIndex)
      .map(({ episode, stillUrl }) => ({ ...episode, stillUrl }))
  }));

  const totalEpisodes = seasons.reduce((total, season) => total + season.episodes.length, 0);
  const stillCount = seasons.reduce((total, season) =>
    total + season.episodes.filter((episode) => Boolean(episode.stillUrl)).length, 0);
  if (!totalEpisodes || stillCount / totalEpisodes < MIN_TV_EPISODE_STILL_RATIO) return null;

  const candidateBackdrop = safeHttpsUrl(candidate.backdropUrl);
  const backdropUrl = candidateBackdrop && candidateBackdrop !== poster &&
    await verifyRemoteImage(candidateBackdrop) ? candidateBackdrop : null;

  return { ...item, posterUrl: poster, backdropUrl, seasons };
}

function titleYearKey(title, date) {
  return normalizeShowName(title) + "|" + String(date || "").slice(0, 4);
}

function titleYearConflicts(existingYears, title, date) {
  const key = normalizeShowName(title);
  const years = existingYears.get(key);
  if (!years) return false;
  const year = String(date || "").slice(0, 4);
  return years.has("") || !year || years.has(year);
}

function rememberTitleYear(existingYears, title, date) {
  const key = normalizeShowName(title);
  if (!existingYears.has(key)) existingYears.set(key, new Set());
  existingYears.get(key).add(String(date || "").slice(0, 4));
}

async function prepareCandidate(candidate) {
  const show = await findTvmazeShow(candidate);
  if (!show) return null;
  const mapped = mapTvmazeShow(show, candidate);
  if (!mapped) return null;
  const withArtwork = await validateSeriesArtwork(mapped, candidate);
  if (!withArtwork) return null;
  validateTvSeriesRecord(withArtwork);
  return withArtwork;
}

export async function seedTvSeries() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME before running the TV seed.");
  }
  if (!Array.isArray(TV_SERIES_CANDIDATES) || TV_SERIES_CANDIDATES.length < TV_SERIES_TARGET_ADDITIONS) {
    throw new Error("TV candidate pack does not contain enough records to seed 200 new series.");
  }

  await connectDatabase();
  const existingDocuments = await TvSeries.find({})
    .select("tmdbId title firstAirDate")
    .lean();
  const existingIds = new Set(existingDocuments.map((item) => Number(item.tmdbId)));
  const existingTitleYears = new Map();
  for (const item of existingDocuments) rememberTitleYear(existingTitleYears, item.title, item.firstAirDate);

  let representedCandidates = 0;
  for (const candidate of TV_SERIES_CANDIDATES) {
    if (existingIds.has(Number(candidate.tmdbId)) ||
        titleYearConflicts(existingTitleYears, candidate.title, candidate.firstAirDate)) {
      representedCandidates += 1;
    }
  }
  const remainingTarget = Math.max(0, TV_SERIES_TARGET_ADDITIONS - representedCandidates);
  if (!remainingTarget) {
    console.log("TV additions already present: no existing TV document was changed.");
    return { inserted: 0, skipped: representedCandidates, total: await TvSeries.countDocuments() };
  }

  console.log("TV seed: preparing " + remainingTarget + " new records with exact TVmaze title/year matches.");
  const newRecords = [];
  const failures = [];
  const seenIds = new Set();
  const plannedTitleYears = new Map();

  for (const candidate of TV_SERIES_CANDIDATES) {
    if (newRecords.length >= remainingTarget) break;
    const id = Number(candidate.tmdbId);
    const key = titleYearKey(candidate.title, candidate.firstAirDate);
    if (existingIds.has(id) || titleYearConflicts(existingTitleYears, candidate.title, candidate.firstAirDate) ||
        seenIds.has(id) || plannedTitleYears.has(key)) continue;
    seenIds.add(id);

    try {
      const mapped = await prepareCandidate(candidate);
      if (!mapped) {
        failures.push(candidate.title + " (no exact match or complete verified metadata/artwork)");
        continue;
      }
      newRecords.push(mapped);
      existingIds.add(id);
      rememberTitleYear(plannedTitleYears, candidate.title, candidate.firstAirDate);
      console.log("  ✓ " + mapped.title + " · TMDB " + mapped.tmdbId +
        " · " + mapped.numberOfEpisodes + " episodes · " +
        mapped.seasons.reduce((count, season) =>
          count + season.episodes.filter((episode) => episode.stillUrl).length, 0) + " stills");
    } catch (error) {
      failures.push(candidate.title + " (" + error.message + ")");
    }
  }

  if (newRecords.length !== remainingTarget) {
    throw new Error("TV seed preflight stopped before database writes: verified " + newRecords.length +
      " of " + remainingTarget + " required series. Each needs a real synopsis, at least " +
      MIN_TV_EPISODES + " titled episodes, and at least " +
      Math.round(MIN_TV_EPISODE_STILL_RATIO * 100) + "% reachable episode stills. Failures: " +
      failures.slice(0, 12).join("; "));
  }

  // Like the Anime additions seed, TV writes are insert-only. Existing documents are never updated.
  let insertedDocuments = [];
  try {
    insertedDocuments = await TvSeries.insertMany(newRecords, { ordered: false });
  } catch (error) {
    const partial = Array.isArray(error.insertedDocs) ? error.insertedDocs : [];
    const writeErrors = error.writeErrors || error.result?.writeErrors || [];
    const duplicateOnly = writeErrors.length > 0 &&
      writeErrors.every((entry) => Number(entry.code || entry.err?.code) === 11000);
    if (!partial.length && !duplicateOnly) throw error;
    if (!duplicateOnly) throw error;
    insertedDocuments = partial;
    console.warn("Some records were inserted by another seed process; duplicate TMDB IDs were left unchanged.");
  }

  const insertedIds = insertedDocuments.map((item) => Number(item.tmdbId));
  const saved = insertedIds.length
    ? await TvSeries.find({ tmdbId: { $in: insertedIds } })
      .select("tmdbId title overview adult posterUrl backdropUrl firstAirDate genres numberOfSeasons numberOfEpisodes seasons")
      .lean()
    : [];
  const savedById = new Map(saved.map((item) => [Number(item.tmdbId), item]));
  const invalid = insertedIds.filter((id) => {
    const record = savedById.get(id);
    if (!record) return true;
    try {
      validateTvSeriesRecord(record);
      return false;
    } catch {
      return true;
    }
  });
  if (invalid.length) {
    throw new Error("TV database verification failed for inserted TMDB IDs: " + invalid.join(", "));
  }

  const total = await TvSeries.countDocuments();
  const skipped = representedCandidates + (newRecords.length - insertedIds.length);
  console.log("TV seed complete: " + saved.length + " new TV series inserted; " +
    skipped + " candidate records already represented or won by another seed process; " +
    total + " total TV documents. Existing TV records were not modified.");
  if (failures.length) console.warn("Rejected candidates before the target was reached: " + failures.length);
  return { inserted: saved.length, skipped, total };
}

export { MIN_TV_EPISODE_STILL_RATIO, TV_SERIES_TARGET_ADDITIONS };
const isDirectRun = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  seedTvSeries()
    .catch((error) => {
      console.error("Situla TV seed failed:", error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
