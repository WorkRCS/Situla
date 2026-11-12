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
