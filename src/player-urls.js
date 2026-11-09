const VIDLINK_ORIGIN = "https://vidlink.pro";
const IMDB_TITLE_ID = /^tt\d{5,12}$/i;

export function vidlinkMovieUrl(imdbId) {
  const id = String(imdbId || "").trim().toLowerCase();
  if (!IMDB_TITLE_ID.test(id)) return null;
  return VIDLINK_ORIGIN + "/movie/" + encodeURIComponent(id);
}

export function vidlinkTvUrl(imdbId, season, episode) {
  const id = String(imdbId || "").trim().toLowerCase();
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  if (!IMDB_TITLE_ID.test(id)) return null;
  if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0) return null;
  if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1) return null;
  return VIDLINK_ORIGIN + "/tv/" + encodeURIComponent(id) + "/" +
    seasonNumber + "/" + episodeNumber;
}

const HINDI_MOVIE_PLAYER = "https://slast430did.com/play/";

export function hindiMoviePlayerUrl(imdbId) {
  const id = String(imdbId || "").trim().toLowerCase();
  if (!IMDB_TITLE_ID.test(id)) return null;
  const url = new URL(HINDI_MOVIE_PLAYER);
  url.searchParams.set("id", id);
  return url.toString();
}
