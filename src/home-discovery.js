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
  const dateYear = Number(String(date).slice(0, 4)) || "";
  const heroYear = Number(item.releaseYear) || dateYear;
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


const HOME_MEDIA_ID_FIELDS = Object.freeze({
  movie: "imdbId",
  tv: "tmdbId",
  anime: "malId"
});

export function homeMediaKey(item, mediaType = item?.homeMediaKind || item?.mediaType) {
  const field = HOME_MEDIA_ID_FIELDS[mediaType];
  if (!item || !field) return "";
  const rawId = item[field];
  if (mediaType === "movie") {
    const id = String(rawId || "").trim().toLowerCase();
    return /^tt\d{5,12}$/.test(id) ? "movie:" + id : "";
  }
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? mediaType + ":" + id : "";
}

function homeRating(item, mediaType) {
  return Number(mediaType === "anime" ? item?.score : item?.voteAverage) || 0;
}

function homeAudience(item, mediaType) {
  return Number(mediaType === "tv" ? item?.voteCount : item?.scoredBy) || 0;
}

function homeReleaseDate(item) {
  return Date.parse(item?.releaseDate || item?.firstAirDate || item?.airedFrom || "") || 0;
}

function takeUniqueHomeItems(items, mediaType, used, limit, compare) {
  const sorted = compare ? [...items].sort(compare) : [...items];
  const selected = [];
  for (const item of sorted) {
    const kind = mediaType || item?.homeMediaKind || item?.mediaType;
    const key = homeMediaKey(item, kind);
    if (!key || used.has(key)) continue;
    used.add(key);
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

/**
 * Builds independent landing-page collections. The active hero and mixed
 * trending row are reserved first; every later shelf consumes only unseen IDs.
 */
export function buildHomeCollections({
  featured = null,
  spotlightItems = [],
  movies = [],
  tv = [],
  anime = [],
  categories = []
} = {}, { premiumCatalog = false } = {}) {
  const used = new Set();
  // Reserve only the lead spotlight picks. Later shelves may reuse a title
  // in a different editorial context rather than becoming sparse or empty.
  for (const item of [...spotlightItems.slice(0, 5), featured]) {
    const key = homeMediaKey(item);
    if (key) used.add(key);
  }

  const tvItems = takeUniqueHomeItems(tv, "tv", new Set(), tv.length);
  const animeItems = takeUniqueHomeItems(anime, "anime", new Set(), anime.length);
  const mixedSeries = [
    ...tvItems.map((item) => ({ ...item, homeMediaKind: "tv" })),
    ...animeItems.map((item) => ({ ...item, homeMediaKind: "anime" }))
  ];

  const popularSeriesItems = takeUniqueHomeItems(
    mixedSeries,
    null,
    used,
    8,
    (a, b) => homeAudience(b, b.homeMediaKind) - homeAudience(a, a.homeMediaKind) ||
      homeRating(b, b.homeMediaKind) - homeRating(a, a.homeMediaKind)
  );
  const favoriteSeriesItems = takeUniqueHomeItems(
    mixedSeries,
    null,
    used,
    8,
    (a, b) => homeRating(b, b.homeMediaKind) - homeRating(a, a.homeMediaKind) ||
      homeAudience(b, b.homeMediaKind) - homeAudience(a, a.homeMediaKind)
  );
  const topTvShows = takeUniqueHomeItems(
    tvItems,
    "tv",
    used,
    8,
    premiumCatalog
      ? (a, b) => homeReleaseDate(b) - homeReleaseDate(a) ||
        Number(b.popularity || 0) - Number(a.popularity || 0)
      : (a, b) => Number(b.popularity || 0) - Number(a.popularity || 0) ||
        homeReleaseDate(b) - homeReleaseDate(a)
  );
  const topAnimeShows = takeUniqueHomeItems(
    animeItems,
    "anime",
    used,
    8,
    premiumCatalog
      ? (a, b) => homeReleaseDate(b) - homeReleaseDate(a) ||
        homeRating(b, "anime") - homeRating(a, "anime")
      : (a, b) => Number(a.rank || Number.MAX_SAFE_INTEGER) - Number(b.rank || Number.MAX_SAFE_INTEGER) ||
        homeRating(b, "anime") - homeRating(a, "anime")
  );
  const movieItems = takeUniqueHomeItems(
    movies,
    "movie",
    used,
    12,
    (a, b) => Number(b.popularity || 0) - Number(a.popularity || 0) ||
      Number(b.voteAverage || 0) - Number(a.voteAverage || 0)
  );
  const categoryShelves = (Array.isArray(categories) ? categories : [])
    .map((category) => ({
      ...category,
      items: takeUniqueHomeItems(
        Array.isArray(category?.items) ? category.items : [],
        "movie",
        used,
        10,
        (a, b) => Number(b.popularity || 0) - Number(a.popularity || 0) ||
          Number(b.voteAverage || 0) - Number(a.voteAverage || 0)
      )
    }))
    .filter((category) => category.items.length > 0);

  return {
    popularSeriesItems,
    favoriteSeriesItems,
    topTvShows,
    topAnimeShows,
    movieItems,
    categoryShelves
  };
}


const HOME_ROUTE_FIELDS = Object.freeze({
  movie: "imdbId",
  tv: "tmdbId",
  anime: "malId"
});

export function homeMediaRoute(item, mediaType) {
  const field = HOME_ROUTE_FIELDS[mediaType];
  if (!item || !field) return null;

  if (mediaType === "movie") {
    const imdbId = String(item.imdbId || "").trim().toLowerCase();
    return /^tt\d{5,12}$/.test(imdbId) ? "/watch/" + encodeURIComponent(imdbId) : null;
  }

  const rawId = item[field];
  const id = String(rawId ?? "").trim();
  if (!/^\d{1,12}$/.test(id)) return null;
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId < 1) return null;
  return (mediaType === "tv" ? "/tv/" : "/anime/") + encodeURIComponent(String(numericId));
}
