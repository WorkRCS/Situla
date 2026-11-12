export const PREMIUM_FEED_LIMIT = 10;
export const PREMIUM_FEED_WINDOW_YEARS = 10;

export function getRollingTenYearWindow(now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const startYear = currentYear - PREMIUM_FEED_WINDOW_YEARS + 1;
  return Object.freeze({
    startYear,
    endYear: currentYear,
    startDate: String(startYear).padStart(4, '0') + '-01-01',
    endDateExclusive: String(currentYear + 1).padStart(4, '0') + '-01-01'
  });
}

function dateMissingFilter(dateField) {
  return { $or: [
    { [dateField]: { $exists: false } },
    { [dateField]: null },
    { [dateField]: '' }
  ] };
}

export function buildRecentDateWindowFilter(dateField, yearField, window) {
  if (!dateField || !yearField || !window) throw new TypeError('A date field, year field and calendar window are required.');
  return { $or: [
    { [dateField]: { $gte: window.startDate, $lt: window.endDateExclusive } },
    { $and: [dateMissingFilter(dateField), { [yearField]: { $gte: window.startYear, $lte: window.endYear } }] }
  ] };
}

export function buildOlderDateWindowFilter(dateField, yearField, window) {
  if (!dateField || !yearField || !window) throw new TypeError('A date field, year field and calendar window are required.');
  return { $or: [
    { [dateField]: { $lt: window.startDate } },
    { $and: [dateMissingFilter(dateField), { [yearField]: { $lt: window.startYear } }] }
  ] };
}

export function mergeRecentAndOlderFeedItems(recentItems = [], olderItems = [], limit = PREMIUM_FEED_LIMIT) {
  const maxItems = Math.max(0, Math.min(PREMIUM_FEED_LIMIT, Math.floor(Number(limit) || 0)));
  const merged = [];
  const seen = new Set();
  for (const item of [...recentItems, ...olderItems]) {
    if (!item || merged.length >= maxItems) continue;
    const identity = item._id ?? item.imdbId ?? item.tmdbId ?? item.malId;
    if (identity === undefined || identity === null) continue;
    const key = String(identity);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}
