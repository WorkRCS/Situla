import "dotenv/config";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDatabase } from "../src/db.js";
import { CartoonMovie, CartoonSeries, CartoonEpisode } from "../src/models.js";

const MOTU_PATLU = Object.freeze({
  tmdbId: 70058,
  tvmazeId: 35173,
  imdbId: "tt2649730",
  title: "Motu Patlu",
  firstAirDate: "2012-10-16",
  posterUrl: "https://image.tmdb.org/t/p/original/tftiVAuoHlgcylhY4JgwGloQaRI.jpg",
  voteAverage: 7.0,
  voteCount: 15
});

const ROLL_NO_21_PATTERN = /roll[\s._-]*no\.?[\s._-]*21/i;
const ROLL_NO_21_FILTER = {
  $or: [
    { title: ROLL_NO_21_PATTERN },
    { originalTitle: ROLL_NO_21_PATTERN },
    { aliases: ROLL_NO_21_PATTERN }
  ]
};

function stripHtml(value) {
  return String(value || "")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}

function validHttps(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchMotuPatlu() {
  const response = await fetch("https://api.tvmaze.com/shows/" + MOTU_PATLU.tvmazeId + "?embed=episodes", {
    headers: {
      Accept: "application/json",
      "User-Agent": "Situla-Kids-Catalog/1.0 (https://github.com/WorkRCS/Situla)"
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error("TVmaze metadata request failed with HTTP " + response.status + ".");
  const show = await response.json();

  if (String(show?.name || "").trim().toLowerCase() !== MOTU_PATLU.title.toLowerCase()) {
    throw new Error("TVmaze returned a different show; refusing to replace the Kids catalogue.");
  }
  if (String(show?.externals?.imdb || "").toLowerCase() !== MOTU_PATLU.imdbId) {
    throw new Error("Motu Patlu IMDb identity could not be verified; refusing the import.");
  }
  if (validDate(show?.premiered) !== MOTU_PATLU.firstAirDate) {
    throw new Error("Motu Patlu premiere date did not match the verified 2012-10-16 date.");
  }
  if (!validHttps(MOTU_PATLU.posterUrl)) {
    throw new Error("The verified TMDB poster URL is invalid.");
  }

  const rawEpisodes = show?._embedded?.episodes;
  if (!Array.isArray(rawEpisodes) || rawEpisodes.length < 5) {
    throw new Error("Motu Patlu's public episode guide is incomplete; no catalogue records were changed.");
  }

  const seasons = new Map();
  const episodes = [];
  const seen = new Set();
  for (const entry of rawEpisodes) {
    const seasonNumber = Number(entry?.season);
    const episodeNumber = Number(entry?.number);
    const name = String(entry?.name || "").trim();
    if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 ||
        !Number.isSafeInteger(episodeNumber) || episodeNumber < 1 || !name) continue;
    const key = seasonNumber + ":" + episodeNumber;
    if (seen.has(key)) throw new Error("Duplicate Motu Patlu episode " + key + "; refusing to import an ambiguous guide.");
    seen.add(key);

    const airDate = validDate(entry.airdate);
    const stillUrl = validHttps(entry.image?.original || entry.image?.medium);
    const episode = {
      seriesTmdbId: MOTU_PATLU.tmdbId,
      seasonNumber,
      episodeNumber,
      tmdbEpisodeId: null,
      name: name.slice(0, 240),
      overview: stripHtml(entry.summary).slice(0, 3000),
      airDate,
      runtime: Number(entry.runtime) > 0 ? Number(entry.runtime) : null,
      stillUrl,
      voteAverage: Math.max(0, Math.min(10, Number(entry.rating?.average) || 0)),
      kidsApproved: true
    };
    episodes.push(episode);
    if (!seasons.has(seasonNumber)) seasons.set(seasonNumber, []);
    seasons.get(seasonNumber).push(episode);
  }

  if (episodes.length < 5) throw new Error("Motu Patlu did not yield a usable episode guide.");
  const orderedSeasons = [...seasons.entries()].sort(([a], [b]) => a - b);
  const regularSeasons = orderedSeasons.filter(([seasonNumber]) => seasonNumber > 0);
  if (!regularSeasons.length) throw new Error("Motu Patlu's regular seasons could not be verified.");

  for (const [seasonNumber, rows] of orderedSeasons) {
    rows.sort((a, b) => a.episodeNumber - b.episodeNumber);
    const numbers = rows.map((item) => item.episodeNumber);
    if (new Set(numbers).size !== numbers.length) throw new Error("Duplicate episode numbers found in season " + seasonNumber + ".");
  }

  const lastAirDate = episodes.map((item) => item.airDate).filter(Boolean).sort().at(-1) || validDate(show.ended);
  const series = {
    tmdbId: MOTU_PATLU.tmdbId,
    title: MOTU_PATLU.title,
    originalTitle: "मोटू पतलू",
    aliases: ["Motu and Patlu", "The Adventures of Motu Patlu"],
    overview: stripHtml(show.summary) ||
      "Motu and Patlu, two friends from Furfuri Nagar, find themselves in comic adventures and are often rescued by their friends and good luck.",
    posterUrl: MOTU_PATLU.posterUrl,
    backdropUrl: null,
    firstAirDate: MOTU_PATLU.firstAirDate,
    lastAirDate,
    releaseYear: 2012,
    genres: ["Animation", "Comedy", "Kids", "Action & Adventure"],
    keywords: ["Indian animation", "family comedy", "Nickelodeon"],
    originalLanguage: "hi",
    country: ["India"],
    networks: [String(show.network?.name || show.webChannel?.name || "Nickelodeon").trim()],
    certification: "",
    minimumAge: null,
    contentWarnings: [],
    kidsApproved: true,
    voteAverage: MOTU_PATLU.voteAverage,
    voteCount: MOTU_PATLU.voteCount,
    popularity: Math.max(0, Number(show.weight) || 0),
    status: String(show.status || "Running"),
    numberOfSeasons: regularSeasons.length,
    numberOfEpisodes: episodes.length,
    seasons: orderedSeasons.map(([seasonNumber, rows]) => ({
      seasonNumber,
      name: seasonNumber === 0 ? "Specials" : "Season " + seasonNumber,
      overview: "",
      airDate: rows.find((item) => item.airDate)?.airDate || "",
      posterUrl: null,
      episodeCount: rows.length
    })),
    featured: true,
    hot: false,
    popular: true,
    playbackStatus: "unverified",
    metadataSource: "TMDB and TVmaze public catalogue data",
    sourceUrl: "https://www.themoviedb.org/tv/" + MOTU_PATLU.tmdbId,
    trendScore: 0,
    trendUpdatedAt: null
  };

  return { series, episodes };
}

export async function replaceKidsCatalog() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) {
    throw new Error("Set MONGODB_URI and MONGODB_DB_NAME before running this Kids catalogue migration.");
  }

  // Complete all external metadata validation before touching existing catalogue records.
  const { series, episodes } = await fetchMotuPatlu();
  await connectDatabase();

  await CartoonSeries.updateOne(
    { tmdbId: MOTU_PATLU.tmdbId },
    { $set: series },
    { upsert: true, runValidators: true }
  );
  await CartoonEpisode.deleteMany({ seriesTmdbId: MOTU_PATLU.tmdbId });
  await CartoonEpisode.insertMany(episodes, { ordered: true });

  const approvedSeries = await CartoonSeries.find({ kidsApproved: true })
    .select("tmdbId title originalTitle aliases")
    .lean();
  const keepSeriesIds = [...new Set(approvedSeries
    .filter((item) => !ROLL_NO_21_PATTERN.test(String(item.title || "")) &&
      !ROLL_NO_21_PATTERN.test(String(item.originalTitle || "")) &&
      !(Array.isArray(item.aliases) && item.aliases.some((alias) => ROLL_NO_21_PATTERN.test(String(alias)))))
    .map((item) => Number(item.tmdbId))
    .filter((id) => Number.isSafeInteger(id) && id > 0))];

  const orphanEpisodes = await CartoonEpisode.deleteMany({ seriesTmdbId: { $nin: keepSeriesIds } });
  const removedSeries = await CartoonSeries.deleteMany({
    $or: [{ kidsApproved: { $ne: true } }, ROLL_NO_21_FILTER]
  });
  const removedMovies = await CartoonMovie.deleteMany({
    $or: [{ kidsApproved: { $ne: true } }, ROLL_NO_21_FILTER]
  });

  const summary = {
    motuPatluTmdbId: MOTU_PATLU.tmdbId,
    motuPatluEpisodesImported: episodes.length,
    motuPatluSeasonsImported: series.numberOfSeasons,
    unapprovedOrOrphanEpisodesRemoved: orphanEpisodes.deletedCount,
    unapprovedAndRollNo21SeriesRemoved: removedSeries.deletedCount,
    unapprovedAndRollNo21MoviesRemoved: removedMovies.deletedCount
  };
  console.log("Kids catalogue migration completed:", JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  replaceKidsCatalog()
    .catch((error) => {
      console.error("Kids catalogue migration failed:", error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
