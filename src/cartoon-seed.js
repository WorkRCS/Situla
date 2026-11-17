const DISALLOWED = new Set(["adult", "erotica", "porn", "pornographic", "hentai", "gore", "horror"]);
const CHILDREN_HINTS = new Set(["children", "childrens", "family", "kids", "kids tv"]);
const MIN_YEAR = 2000;

export function normalizeCartoonText(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function readCartoonYear(value) {
  if (Number.isInteger(value)) return value;
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})(?:-|$)/);
  return match ? Number(match[1]) : null;
}

export function isCartoonYearAllowed(value) {
  const year = readCartoonYear(value);
  return Number.isInteger(year) && year >= MIN_YEAR;
}

export function isSafeCartoonGenreSet(genres = []) {
  const normalized = (Array.isArray(genres) ? genres : []).map((item) => normalizeCartoonText(item));
  return !normalized.some((item) => DISALLOWED.has(item));
}

export function isChildrenAnimation({ genres = [], type = "", rating = "", pinned = false } = {}) {
  const normalized = (Array.isArray(genres) ? genres : []).map((item) => normalizeCartoonText(item));
  const isAnimation = normalized.includes("animation") || normalizeCartoonText(type) === "animation";
  const isChildren = normalized.some((item) => CHILDREN_HINTS.has(item));
  const ratingKey = normalizeCartoonText(rating).replace(/\s+/g, "");
  const safeRating = new Set(["tvy", "tvy7", "tvg", "g", "pg", "u", "ua7", "ua13"]).has(ratingKey);
  return isAnimation && isSafeCartoonGenreSet(genres) && (isChildren || safeRating || pinned === true);
}

export function deriveCartoonBadges(records, { currentYear = new Date().getUTCFullYear() } = {}) {
  const score = (item) => {
    const rating = Number(item.voteAverage) || 0;
    const votes = Number(item.voteCount) || 0;
    const popularity = Number(item.popularity) || 0;
    return rating * 10 + Math.log10(votes + 1) * 8 + Math.log10(popularity + 1) * 5;
  };
  const ranked = [...records].sort((a, b) => score(b) - score(a));
  const featuredIds = new Set(ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.12)))
    .map((item) => String(item.tmdbId)));
  return records.map((item) => {
    const votes = Number(item.voteCount) || 0;
    const popularity = Number(item.popularity) || 0;
    const year = Number(item.releaseYear) || readCartoonYear(item.releaseDate || item.firstAirDate);
    return {
      ...item,
      popular: votes >= 500 || popularity >= 30,
      hot: Number.isInteger(year) && year >= currentYear - 1 && (votes >= 100 || popularity >= 18),
      featured: featuredIds.has(String(item.tmdbId))
    };
  });
}

export function buildCartoonEpisodeData(seriesTmdbId, episodes = [], fallbackPoster = null) {
  const grouped = new Map();
  const documents = [];
  const seen = new Set();
  for (const episode of Array.isArray(episodes) ? episodes : []) {
    const seasonNumber = Number(episode?.season);
    const episodeNumber = Number(episode?.number);
    if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 ||
        !Number.isSafeInteger(episodeNumber) || episodeNumber < 1 ||
        !String(episode?.name || "").trim()) continue;
    const key = seasonNumber + ":" + episodeNumber;
    if (seen.has(key)) continue;
    seen.add(key);
    const airDate = /^\d{4}-\d{2}-\d{2}$/.test(String(episode.airdate || "")) ? episode.airdate : "";
    const stillUrl = episode.image?.original || episode.image?.medium || episode.thumbnail || null;
    const document = {
      seriesTmdbId: Number(seriesTmdbId),
      seasonNumber,
      episodeNumber,
      tmdbEpisodeId: null,
      name: String(episode.name).trim().slice(0, 240),
      overview: String(episode.summary || episode.overview || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000),
      airDate,
      runtime: Number(episode.runtime) > 0 ? Number(episode.runtime) : null,
      stillUrl: typeof stillUrl === "string" && /^https:\/\//i.test(stillUrl) ? stillUrl : null,
      voteAverage: Math.max(0, Math.min(10, Number(episode.rating?.average || episode.voteAverage) || 0)),
      kidsApproved: true
    };
    documents.push(document);
    if (!grouped.has(seasonNumber)) grouped.set(seasonNumber, []);
    grouped.get(seasonNumber).push(document);
  }

  const seasons = [...grouped.entries()].sort(([a], [b]) => a - b).map(([seasonNumber, rows]) => {
    rows.sort((a, b) => a.episodeNumber - b.episodeNumber);
    return {
      seasonNumber,
      name: seasonNumber === 0 ? "Specials" : "Season " + seasonNumber,
      overview: "",
      airDate: rows.find((row) => row.airDate)?.airDate || "",
      posterUrl: fallbackPoster,
      episodeCount: rows.length
    };
  });
  return {
    seasons,
    episodes: documents,
    numberOfSeasons: seasons.filter((season) => season.seasonNumber > 0).length,
    numberOfEpisodes: documents.length
  };
}
