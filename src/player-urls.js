import { normalizeAnimePlayerRoute } from "./anime-player-route.js";
export { normalizeAnimePlayerRoute };

const VIDLINK_ORIGIN = "https://vidlink.pro";
const IMDB_TITLE_ID = /^tt\d{5,12}$/i;
const TMDB_TV_ID = /^[0-9]{1,12}$/;
const HINDI_MOVIE_PLAYER = "https://slast430did.com/play/";

// Normalize route params before they are used by Server or Client Components.
export function normalizeTvPlayerRoute(tmdbId, season, episode) {
  const id = String(tmdbId ?? "").trim();
  const seasonText = String(season ?? "").trim();
  const episodeText = String(episode ?? "").trim();
  if (!TMDB_TV_ID.test(id)) return null;

  const tmdbNumber = Number(id);
  const seasonNumber = Number(seasonText);
  const episodeNumber = Number(episodeText);
  if (!Number.isSafeInteger(tmdbNumber) || tmdbNumber < 1) return null;
  if (!/^[0-9]+$/.test(seasonText) || !Number.isSafeInteger(seasonNumber) || seasonNumber < 0) return null;
  if (!/^[0-9]+$/.test(episodeText) || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1) return null;

  return { tmdbId: tmdbNumber, season: seasonNumber, episode: episodeNumber };
}

// Anime-only embed provider. Existing MAL ID, episode and sub/dub values stay unchanged.
export const MEGAPLAY_ORIGIN = "https://megaplay.buzz";

export function megaplayAnimeUrl(malId, episode, audio) {
  const route = normalizeAnimePlayerRoute(malId, episode, audio);
  if (!route) return null;
  return new URL("/stream/mal/" + route.malId + "/" + route.episode + "/" + route.audio, MEGAPLAY_ORIGIN).toString();
}

// Adapt MegaPlay's documented player messages to Situla's progress format.
export function normalizeMegaplayPlayerEvent(payload) {
  let data = payload;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.type === "watching-log") {
    return { event: "timeupdate", currentTime: Number(data.currentTime), duration: Number(data.duration) };
  }
  if (String(data.channel || "").toLowerCase() !== "megacloud") return null;
  const map = { time: "timeupdate", complete: "ended", error: "error" };
  const event = String(data.event || "").toLowerCase();
  if (!map[event]) return null;
  return { event: map[event], currentTime: Number(data.time ?? data.currentTime), duration: Number(data.duration) };
}

const MOVIE_PLAYER_THEME = Object.freeze({
  primaryColor: "e8b65b",
  secondaryColor: "171a23",
  iconColor: "ffffff",
  icons: "default",
  player: "default",
  title: "false",
  poster: "true",
  autoplay: "false"
});

function withMovieTheme(url) {
  for (const [key, value] of Object.entries(MOVIE_PLAYER_THEME)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function vidlinkMovieUrl(imdbId) {
  const id = String(imdbId || "").trim().toLowerCase();
  if (!IMDB_TITLE_ID.test(id)) return null;
  return withMovieTheme(new URL(VIDLINK_ORIGIN + "/movie/" + encodeURIComponent(id))).toString();
}

export function vidlinkTvUrl(tmdbId, season, episode) {
  const route = normalizeTvPlayerRoute(tmdbId, season, episode);
  if (!route) return null;
  return withMovieTheme(new URL(VIDLINK_ORIGIN + "/tv/" + route.tmdbId + "/" + route.season + "/" + route.episode)).toString();
}

export function hindiMoviePlayerUrl(imdbId) {
  const id = String(imdbId || "").trim().toLowerCase();
  if (!IMDB_TITLE_ID.test(id)) return null;

  // This provider resolves IMDb titles from the path segment, not ?id=...
  // Keep the verified working shape: https://slast430did.com/play/{imdbId}
  const url = new URL(encodeURIComponent(id), HINDI_MOVIE_PLAYER);
  withMovieTheme(url);
  return url.toString();
}
