import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import { TvSeries } from "../src/models.js";

const TVMAZE_API = "https://api.tvmaze.com";
const TARGET_SERIES = 65;
const FORCE_REFRESH = process.env.SEED_TV_FORCE === "true";
const REQUEST_INTERVAL_MS = 520;
const USER_AGENT = "Situla-TV-Catalog-Importer/1.0 (TVmaze API; https://www.tvmaze.com/api)";

export const CURATED_TV_SHOWS = [
  "Friends",
  "The Big Bang Theory",
  "How I Met Your Mother",
  "Brooklyn Nine-Nine",
  "Parks and Recreation",
  "Modern Family",
  "Community",
  "Scrubs",
  "Seinfeld",
  "Frasier",
  "Cheers",
  "Abbott Elementary",
  "Young Sheldon",
  "The Good Place",
  "Gilmore Girls",
  "Anne with an E",
  "Downton Abbey",
  "Doctor Who",
  "Smallville",
  "Supergirl",
  "The Flash",
  "Lois & Clark: The New Adventures of Superman",
  "Star Trek: The Next Generation",
  "Star Trek: Voyager",
  "Star Trek: Deep Space Nine",
  "Star Trek: Enterprise",
  "Star Trek: Strange New Worlds",
  "Lost",
  "Person of Interest",
  "Elementary",
  "Monk",
  "Psych",
  "Castle",
  "Bones",
  "NCIS",
  "CSI: Crime Scene Investigation",
  "Blue Bloods",
  "The Mentalist",
  "The Rookie",
  "White Collar",
  "Burn Notice",
  "Chuck",
  "Leverage",
  "Covert Affairs",
  "Without a Trace",
  "Cold Case",
  "The West Wing",
  "The Good Wife",
  "Madam Secretary",
  "Designated Survivor",
  "This Is Us",
  "Parenthood",
  "One Tree Hill",
  "Gossip Girl",
  "Wednesday",
  "Stranger Things",
  "Avatar: The Last Airbender",
  "The Legend of Korra",
  "Gravity Falls",
  "Adventure Time",
  "Phineas and Ferb",
  "SpongeBob SquarePants",
  "The Dragon Prince",
  "Hilda",
  "Bluey",
  "Pokémon",
  "The Muppet Show",
  "Andor",
  "The Mandalorian",
  "Loki",
  "WandaVision",
  "Hawkeye",
  "A Series of Unfortunate Events",
  "Sweet Tooth",
  "The Dark Crystal: Age of Resistance",
  "Merlin",
  "Once Upon a Time",
  "The Orville",
  "The Librarians",
  "Eureka",
  "Warehouse 13",
  "MacGyver",
  "Magnum P.I.",
  "Hawaii Five-0",
  "Full House",
  "The Fresh Prince of Bel-Air",
  "Boy Meets World",
  "That's So Raven",
  "Wizards of Waverly Place",
  "Good Luck Charlie",
  "iCarly",
  "Victorious",
  "Drake & Josh",
  "Kim Possible",
  "The Suite Life of Zack & Cody",
  "The Middle",
  "Superstore",
  "My Name Is Earl",
  "Malcolm in the Middle",
  "Home Improvement",
  "The Wonder Years",
  "The Pretender",
  "Sliders",
  "Stargate SG-1",
  "Stargate Atlantis",
  "Stargate Universe",
  "Fringe",
  "The Simpsons",
  "The Orville",
  "The IT Crowd",
  "The Nanny",
  "Fresh Off the Boat",
  "Speechless",
  "Raising Hope",
  "3rd Rock from the Sun"
];

const DISALLOWED_GENRES = new Set(["adult", "erotica", "pornographic", "hentai"]);
let nextRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function normalizeShowName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function stripHtml(value) {
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
    .slice(0, 4000);
}
async function tvmazeRequest(path, attempt = 0) {
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait) await sleep(wait);
  nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;

  let response;
  try {
    response = await fetch(TVMAZE_API + path, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    if (attempt < 3) {
      await sleep(1000 * (attempt + 1));
      return tvmazeRequest(path, attempt + 1);
    }
    throw error;
  }

  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 30000)
      : Math.min(1000 * (2 ** attempt), 15000);
    await sleep(delay);
    return tvmazeRequest(path, attempt + 1);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("TVmaze returned HTTP " + response.status + " for " + path);
  return response.json();
}

function buildSeasonRecords(episodes, fallbackPoster) {
  const grouped = new Map();
  for (const episode of episodes) {
    const seasonNumber = Number(episode.season);
    const episodeNumber = Number(episode.number);
    if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0) continue;
    if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1) continue;
    if (!grouped.has(seasonNumber)) grouped.set(seasonNumber, []);
    grouped.get(seasonNumber).push({
      episodeNumber,
      name: String(episode.name || "Episode " + episodeNumber).slice(0, 240),
      overview: stripHtml(episode.summary),
      airDate: episode.airdate || null,
      runtime: Number(episode.runtime) > 0 ? Number(episode.runtime) : null,
      stillUrl: episode.image?.original || episode.image?.medium || null,
      voteAverage: Number(episode.rating?.average) || 0
    });
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seasonNumber, seasonEpisodes]) => {
      seasonEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      return {
        seasonNumber,
        name: seasonNumber === 0 ? "Specials" : "Season " + seasonNumber,
        overview: "",
        airDate: seasonEpisodes.find((episode) => episode.airDate)?.airDate || null,
        episodeCount: seasonEpisodes.length,
        posterUrl: fallbackPoster || null,
        voteAverage: 0,
        episodes: seasonEpisodes
      };
    });
}

export function mapTvmazeShow(show) {
  const episodes = show?._embedded?.episodes;
  const imdbId = String(show?.externals?.imdb || "").trim().toLowerCase();
  const image = show?.image?.original || show?.image?.medium || null;
  const rating = Number(show?.rating?.average) || 0;
  const genres = Array.isArray(show?.genres)
    ? show.genres.map((genre) => String(genre).trim()).filter(Boolean)
    : [];

  if (!/^tt\d{5,12}$/.test(imdbId)) return { ok: false, reason: "missing-valid-imdb-id" };
  if (!show?.id || !show?.name || !image) return { ok: false, reason: "missing-show-metadata-or-poster" };
  if (genres.some((genre) => DISALLOWED_GENRES.has(genre.toLowerCase()))) return { ok: false, reason: "adult-genre-filter" };
  if (!Array.isArray(episodes) || episodes.length < 2) return { ok: false, reason: "missing-complete-episode-guide" };
  if (!(rating > 0)) return { ok: false, reason: "missing-rating" };

  const seasons = buildSeasonRecords(episodes, image);
  const episodeCount = seasons.reduce((sum, season) => sum + season.episodeCount, 0);
  if (!episodeCount) return { ok: false, reason: "empty-episode-guide" };

  const firstAirDate = show.premiered || seasons.find((season) => season.airDate)?.airDate || null;
  const releaseYear = firstAirDate ? Number(firstAirDate.slice(0, 4)) || null : null;
  const runtime = Number(show.averageRuntime || show.runtime) || null;

  return {
    ok: true,
    item: {
      imdbId,
      title: String(show.name).trim(),
      originalTitle: String(show.name).trim(),
      overview: stripHtml(show.summary),
      posterUrl: image,
      backdropUrl: null,
      firstAirDate,
      releaseYear,
      runtime,
      voteAverage: Math.min(10, rating),
      voteCount: 0,
      popularity: Number(show.weight) || 0,
      genres,
      keywords: [],
      certification: "",
      status: String(show.status || ""),
      numberOfSeasons: seasons.filter((season) => season.seasonNumber > 0).length,
      numberOfEpisodes: episodeCount,
      seasons,
      adult: false,
      metadataSource: "TVmaze",
      sourceId: Number(show.id),
      sourceUrl: String(show.url || ("https://www.tvmaze.com/shows/" + show.id))
    }
  };
}

async function findCuratedShow(name) {
  const results = await tvmazeRequest("/search/shows?q=" + encodeURIComponent(name));
  if (!Array.isArray(results)) return null;
  const expected = normalizeShowName(name);
  const match = results.find((result) => normalizeShowName(result?.show?.name) === expected);
  if (!match?.show?.id) return null;
  return match.show;
}

export async function seedTvSeries({ force = FORCE_REFRESH } = {}) {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    console.warn("TV seed skipped: set MONGODB_URI and MONGODB_DB_NAME in .env to import the curated TV catalog.");
    return { imported: 0, total: 0, skipped: 0, configured: false };
  }
  await connectDatabase();
  const existing = await TvSeries.countDocuments({ metadataSource: "TVmaze" });
  if (!force && existing >= TARGET_SERIES) {
    console.log("Situla TV seed is already complete (" + existing + " TVmaze series).");
    return { imported: 0, total: existing, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;
  const failures = [];
  const seen = new Set();

  console.log("Situla TV seed: preparing " + TARGET_SERIES + "+ curated series from TVmaze.");
  for (const name of CURATED_TV_SHOWS) {
    if (!force && existing + imported >= TARGET_SERIES) break;
    try {
      const searchResult = await findCuratedShow(name);
      if (!searchResult) {
        skipped += 1;
        failures.push(name + " (no exact TVmaze match)");
        continue;
      }
      const detail = await tvmazeRequest("/shows/" + encodeURIComponent(searchResult.id) + "?embed=episodes");
      if (!detail) {
        skipped += 1;
        failures.push(name + " (show details unavailable)");
        continue;
      }
      const mapped = mapTvmazeShow(detail);
      if (!mapped.ok) {
        skipped += 1;
        failures.push(name + " (" + mapped.reason + ")");
        continue;
      }
      if (seen.has(mapped.item.imdbId)) {
        skipped += 1;
        continue;
      }
      seen.add(mapped.item.imdbId);
      await TvSeries.updateOne(
        { imdbId: mapped.item.imdbId },
        { $set: mapped.item },
        { upsert: true, runValidators: true }
      );
      imported += 1;
      console.log("  ✓ " + mapped.item.title + " · " + mapped.item.imdbId + " · " + mapped.item.numberOfEpisodes + " episodes");
    } catch (error) {
      skipped += 1;
      failures.push(name + " (" + error.message + ")");
      console.warn("  ! " + name + ": " + error.message);
    }
  }

  const total = await TvSeries.countDocuments({ metadataSource: "TVmaze" });
  console.log("Situla TV seed complete: " + total + " curated series, " + imported + " added/updated, " + skipped + " skipped.");
  if (failures.length) console.log("Skipped candidates: " + failures.join("; "));
  if (total < TARGET_SERIES) {
    throw new Error("TV seed imported only " + total + " of the required " + TARGET_SERIES + " series. Check the network and TVmaze response, then run npm run seed:tv again.");
  }
  return { imported, total, skipped };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  seedTvSeries().catch((error) => {
    console.error("Situla TV seed failed:", error.message);
    process.exitCode = 1;
  }).finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
}
