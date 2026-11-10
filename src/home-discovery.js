const MEDIA_CONFIG = {
  movie: { idField: "imdbId", label: "MOVIE" },
  tv: { idField: "tmdbId", label: "TV SERIES" },
  anime: { idField: "malId", label: "ANIME" }
};

export function toHomeSpotlight(item, mediaType) {
  const config = MEDIA_CONFIG[mediaType];
  if (!item || !config) return null;

  const rawId = item[config.idField];
  const id = mediaType === "movie" ? String(rawId || "").trim().toLowerCase() : Number(rawId);
  const validId = mediaType === "movie"
    ? /^tt\d{5,12}$/.test(id)
    : Number.isSafeInteger(id) && id > 0;
  if (!validId) return null;

  const title = mediaType === "anime" ? (item.titleEnglish || item.title) : item.title;
  const date = item.releaseDate || item.firstAirDate || item.airedFrom || "";
  const heroYear = Number(item.releaseYear) || (String(date).slice(0, 4) || "");
  const heroPoster = item.posterUrl || item.posterFallbackUrl || null;

  return {
    ...item,
    mediaType,
    heroId: mediaType + ":" + String(id),
    heroTitle: title || "Untitled",
    heroMediaLabel: config.label,
    heroOverview: item.overview || item.synopsis || "",
    heroYear,
    heroRating: Number(mediaType === "anime" ? item.score : item.voteAverage) || 0,
    heroRuntime: mediaType === "anime" ? 0 : Number(item.runtime) || 0,
    heroEpisodes: mediaType === "anime" ? Number(item.episodes) || 0 : 0,
    heroGenres: Array.isArray(item.genres) ? item.genres : [],
    heroImage: item.backdropUrl || item.bannerUrl || heroPoster,
    heroPoster
  };
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function mixHomeSpotlight({ movies = [], tv = [], anime = [] } = {}, random = Math.random) {
  const groups = [
    movies.filter(Boolean),
    tv.filter(Boolean),
    anime.filter(Boolean)
  ].map((items) => shuffled(items, random));
  const mixed = [];
  let previousType = "";

  while (groups.some((group) => group.length)) {
    let available = groups.filter((group) => group.length && group[0].mediaType !== previousType);
    if (!available.length) available = groups.filter((group) => group.length);
    const source = available[Math.floor(random() * available.length)] || available[0];
    const next = source.shift();
    if (next) {
      mixed.push(next);
      previousType = next.mediaType;
    }
  }

  return mixed;
}
