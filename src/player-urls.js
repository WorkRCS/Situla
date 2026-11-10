const VIDLINK_ORIGIN = "https://vidlink.pro";
const IMDB_TITLE_ID = /^tt\d{5,12}$/i;
const TMDB_TV_ID = /^[0-9]{1,12}$/;
const MAL_ANIME_ID = /^[0-9]{1,10}$/;
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

// Match Situla's warm-gold player controls on both Movie providers.
// No mute parameter is added: playback remains under the provider's normal
// user-initiated audio controls, with the iframe autoplay permission retained.
// Anime playback uses the provider's MyAnimeList ID, one-based episode number,
 // and an explicit sub/dub track. fallback=true asks VidLink to try the other track.
export function normalizeAnimePlayerRoute(malId, episode, audio) {
  const malText = String(malId ?? "").trim();
  const episodeText = String(episode ?? "").trim();
  const audioText = String(audio ?? "").trim().toLowerCase();
  if (!MAL_ANIME_ID.test(malText)) return null;
  const malNumber = Number(malText);
  const episodeNumber = Number(episodeText);
  if (!Number.isSafeInteger(malNumber) || malNumber < 1) return null;
  if (!/^[0-9]+$/.test(episodeText) || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1) return null;
  if (audioText !== "sub" && audioText !== "dub") return null;
  return { malId: malNumber, episode: episodeNumber, audio: audioText };
}

const ANIME_PLAYER_THEME = Object.freeze({
  primaryColor: "e8b65b",
  secondaryColor: "171a23",
  iconColor: "ffffff",
  icons: "default",
  player: "default",
  title: "false",
  poster: "true",
  autoplay: "false"
});

export function vidlinkAnimeUrl(malId, episode, audio, { fallback = true, startAt = 0 } = {}) {
  const route = normalizeAnimePlayerRoute(malId, episode, audio);
  if (!route) return null;
  const url = new URL(
    "/anime/" + route.malId + "/" + route.episode + "/" + route.audio,
    VIDLINK_ORIGIN
  );
  for (const [key, value] of Object.entries(ANIME_PLAYER_THEME)) url.searchParams.set(key, value);
  if (fallback) url.searchParams.set("fallback", "true");
  const resumeAt = Number(startAt);
  if (Number.isSafeInteger(resumeAt) && resumeAt > 0) url.searchParams.set("startAt", String(resumeAt));
  return url.toString();
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
  return VIDLINK_ORIGIN + "/tv/" + route.tmdbId + "/" + route.season + "/" + route.episode;
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
