const VALID_IMDB_ID = /^tt\d{5,12}$/i;

function normalizePositiveId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : null;
}

export function savedMediaType(item, preferredType) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const type = String(preferredType || item.mediaType || "").trim().toLowerCase();
  if (type === "movie" && VALID_IMDB_ID.test(String(item.imdbId || ""))) return "movie";
  if (type === "tv" && normalizePositiveId(item.tmdbId)) return "tv";
  if (type === "anime" && normalizePositiveId(item.malId)) return "anime";
  if (type) return null;
  if (VALID_IMDB_ID.test(String(item.imdbId || ""))) return "movie";
  if (normalizePositiveId(item.tmdbId)) return "tv";
  if (normalizePositiveId(item.malId)) return "anime";
  return null;
}

export function savedMediaKey(item, preferredType) {
  const type = savedMediaType(item, preferredType);
  if (type === "movie") return "movie:" + String(item.imdbId).toLowerCase();
  if (type === "tv") return "tv:" + normalizePositiveId(item.tmdbId);
  if (type === "anime") return "anime:" + normalizePositiveId(item.malId);
  return null;
}

export function normalizeSavedMediaList(items, limit = 100) {
  if (!Array.isArray(items)) return [];
  const normalized = [];
  const seen = new Set();
  for (const item of items) {
    const type = savedMediaType(item);
    const key = type ? savedMediaKey(item, type) : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push({ ...item, mediaType: type });
    if (normalized.length >= limit) break;
  }
  return normalized;
}

export function toggleSavedMedia(currentItems, item, preferredType) {
  const key = savedMediaKey(item, preferredType);
  if (!key) return normalizeSavedMediaList(currentItems);
  const current = normalizeSavedMediaList(currentItems);
  if (current.some((entry) => savedMediaKey(entry) === key)) {
    return current.filter((entry) => savedMediaKey(entry) !== key);
  }
  return normalizeSavedMediaList([{ ...item, mediaType: savedMediaType(item, preferredType) }, ...current]);
}
