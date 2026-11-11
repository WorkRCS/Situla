import { normalizeAnimePlayerRoute } from "./anime-player-route.js";
export { normalizeAnimePlayerRoute };

export const MOVIE_PLAYBACK_ORIGIN = "https://vidlink.pro";
export const SERIES_PLAYBACK_ORIGIN = "https://vidbolt.pro";
const SERIES_THEME_COLOR = "e8b65b";
const IMDB_TITLE_ID = /^tt\d{5,12}$/i;
const TMDB_TV_ID = /^[0-9]{1,12}$/;
export const HINDI_PLAYBACK_ORIGIN = "https://slast430did.com";
const HINDI_PLAYBACK_BASE_URL = HINDI_PLAYBACK_ORIGIN + "/play/";

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

// TV and Anime use Situla's configured series playback source.
function withSeriesPlaybackTheme(url, startAt = 0) {
  const resumeAt = Number(startAt);
  if (Number.isFinite(resumeAt) && resumeAt > 0) url.searchParams.set("startAt", String(Math.floor(resumeAt)));
  url.searchParams.set("theme", SERIES_THEME_COLOR);
  url.searchParams.set("title", "false");
  // Keep episode navigation inside the series viewing controls.
  url.searchParams.set("nextEpisodeButton", "true");
  url.searchParams.set("episodesButton", "true");
  return url.toString();
}

export function tvSeriesPlaybackUrl(tmdbId, season, episode, startAt = 0) {
  const route = normalizeTvPlayerRoute(tmdbId, season, episode);
  if (!route) return null;
  const url = new URL("/tv/" + route.tmdbId + "/" + route.season + "/" + route.episode, SERIES_PLAYBACK_ORIGIN);
  return withSeriesPlaybackTheme(url, startAt);
}

export function animeSeriesPlaybackUrl(malId, episode, audio, startAt = 0) {
  const route = normalizeAnimePlayerRoute(malId, episode, audio);
  if (!route) return null;
  const url = new URL("/anime/mal/" + route.malId + "/" + route.episode, SERIES_PLAYBACK_ORIGIN);
  // Preserve Situla's existing sub/dub route: prefer original Japanese audio for Sub
  // and English audio for Dub. Other tracks, including Hindi when available, remain
  // selectable inside the audio menu.
  url.searchParams.set("audio", route.audio === "sub" ? "Japanese" : "en");
  return withSeriesPlaybackTheme(url, startAt);
}

const SERIES_PLAYER_EVENTS = new Set(["ready", "play", "pause", "timeupdate", "durationchange", "ended", "error"]);

// Series playback posts simple frame events (type/time/duration).
export function normalizeSeriesPlaybackEvent(payload) {
  let data = payload;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.data && typeof data.data === "object" && data.type === "PLAYER_EVENT") {
    data = data.data;
  }
  const event = String(data.type || "").toLowerCase();
  if (!SERIES_PLAYER_EVENTS.has(event)) return null;
  return {
    event,
    currentTime: Number(data.time ?? data.currentTime),
    duration: Number(data.duration)
  };
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

function withMovieTheme(url, startAt = 0) {
  for (const [key, value] of Object.entries(MOVIE_PLAYER_THEME)) {
    url.searchParams.set(key, value);
  }
  const resumeAt = Number(startAt);
  if (Number.isFinite(resumeAt) && resumeAt > 0) {
    url.searchParams.set("startAt", String(Math.floor(resumeAt)));
  }
  return url;
}

export function moviePlaybackUrl(imdbId, startAt = 0) {
  const id = String(imdbId || "").trim().toLowerCase();
  if (!IMDB_TITLE_ID.test(id)) return null;
  return withMovieTheme(new URL(MOVIE_PLAYBACK_ORIGIN + "/movie/" + encodeURIComponent(id)), startAt).toString();
}

export function hindiMoviePlaybackUrl(imdbId, startAt = 0) {
  const id = String(imdbId || "").trim().toLowerCase();
  if (!IMDB_TITLE_ID.test(id)) return null;

  // The playback service resolves IMDb titles from the path segment, not ?id=...
  // Keep the verified path shape for supported Hindi movie playback.
  const url = new URL(encodeURIComponent(id), HINDI_PLAYBACK_BASE_URL);
  withMovieTheme(url, startAt);
  return url.toString();
}
