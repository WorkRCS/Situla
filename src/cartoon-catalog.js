const ROLL_NO_21_PATTERN = /roll[\s._-]*no\.?[\s._-]*21/i;
const MIN_CARTOON_YEAR = 2000;

const ROLL_NO_21_EXCLUSIONS = Object.freeze([
  { title: ROLL_NO_21_PATTERN },
  { originalTitle: ROLL_NO_21_PATTERN },
  { aliases: ROLL_NO_21_PATTERN }
]);

function baseApprovedFilter(extra, yearFilter) {
  return {
    ...extra,
    kidsApproved: true,
    $and: [yearFilter],
    $nor: ROLL_NO_21_EXCLUSIONS
  };
}

/** Approved cartoon movies released in 2000 or later. Unknown dates are excluded. */
export function approvedCartoonMovieFilter(extra = {}) {
  return baseApprovedFilter(extra, {
    $or: [
      { releaseDate: { $gte: '2000-01-01' } },
      { releaseDate: { $in: [null, ''] }, releaseYear: { $gte: MIN_CARTOON_YEAR } }
    ]
  });
}

/** Approved cartoon series that first aired in 2000 or later. Unknown dates are excluded. */
export function approvedCartoonSeriesFilter(extra = {}) {
  return baseApprovedFilter(extra, {
    $or: [
      { firstAirDate: { $gte: '2000-01-01' } },
      { firstAirDate: { $in: [null, ''] }, releaseYear: { $gte: MIN_CARTOON_YEAR } }
    ]
  });
}

function readYear(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})(?:-|$)/);
  return match ? Number(match[1]) : null;
}

export function isPost2000CartoonMovie(item = {}) {
  const date = String(item.releaseDate ?? '').trim();
  const year = date ? readYear(date) : Number(item.releaseYear);
  return Number.isInteger(year) && year >= MIN_CARTOON_YEAR;
}

export function isPost2000CartoonSeries(item = {}) {
  const date = String(item.firstAirDate ?? '').trim();
  const year = date ? readYear(date) : Number(item.releaseYear);
  return Number.isInteger(year) && year >= MIN_CARTOON_YEAR;
}


function cartoonShuffleScore(seed, item) {
  const identity = String(seed) + ":" + String(item?.mediaType || "") + ":" + String(item?.tmdbId || "");
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable mixed ordering for one page session; a new seed on refresh changes the order. */
export function shuffleCartoonCatalog(items = [], seed = "") {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) =>
    cartoonShuffleScore(seed, a) - cartoonShuffleScore(seed, b) ||
    String(a?.mediaType || "").localeCompare(String(b?.mediaType || "")) ||
    Number(a?.tmdbId || 0) - Number(b?.tmdbId || 0)
  );
}


function cartoonDateParts(dateValue, yearValue) {
  const date = String(dateValue || "").trim();
  const match = date.match(/^(\\d{4})(?:-(\\d{2})-(\\d{2}))?/);
  const year = Number(yearValue) || (match ? Number(match[1]) : 0);
  if (!Number.isInteger(year) || year < MIN_CARTOON_YEAR) return null;
  return { year, date: match ? match[0] : String(year) + "-01-01" };
}

export function cartoonDatabaseDateRange(movies = [], series = []) {
  const entries = [
    ...(Array.isArray(movies) ? movies : []).map((item) => cartoonDateParts(item?.releaseDate, item?.releaseYear)),
    ...(Array.isArray(series) ? series : []).map((item) => cartoonDateParts(item?.firstAirDate, item?.releaseYear))
  ].filter(Boolean);
  const years = [...new Set(entries.map((item) => item.year))].sort((a, b) => b - a);
  const dates = entries.map((item) => item.date).sort();
  return {
    oldestDate: dates[0] || null,
    newestDate: dates.at(-1) || null,
    oldestYear: years.length ? years.at(-1) : null,
    newestYear: years[0] || null,
    years
  };
}
