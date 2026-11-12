export const PREMIUM_FEED_LIMIT = 10;

/**
 * Build a deterministic newest-first Mongo sort using the catalog's actual
 * release/air-date field. The stored releaseYear is only a secondary fallback
 * for records without a full date; no calendar-year cutoff is applied.
 */
export function buildNewestFirstSort(dateField, tieBreakers = {}) {
  if (!dateField || typeof dateField !== 'string') {
    throw new TypeError('A catalog date field is required.');
  }
  return Object.freeze({
    [dateField]: -1,
    releaseYear: -1,
    ...tieBreakers
  });
}
