const VIDLINK_ORIGIN = "https://vidlink.pro";
const IMDB_TITLE_ID = /^tt\d{5,12}$/i;
const HINDI_MOVIE_PLAYER = "https://slast430did.com/play/";

// Normalize route params before they are used by Server or Client Components.
export function normalizeTvPlayerRoute(imdbId, season, episode) {
  const id = String(imdbId || "").trim().toLowerCase();
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  if (!IMDB_TITLE_ID.test(id)) return null;
  if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0) return null;
  if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1) return null;

  return { imdbId: id, season: seasonNumber, episode: episodeNumber };
}

// Match Situla's warm-gold player controls on both Movie providers.
// No mute parameter is added: playback remains under the provider's normal
// user-initiated audio controls, with the iframe autoplay permission retained.
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

export function vidlinkTvUrl(imdbId, season, episode) {
  const route = normalizeTvPlayerRoute(imdbId, season, episode);
  if (!route) return null;
  return VIDLINK_ORIGIN + "/tv/" + encodeURIComponent(route.imdbId) + "/" +
    route.season + "/" + route.episode;
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
