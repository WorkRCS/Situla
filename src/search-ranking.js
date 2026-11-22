const MAX_EDIT_DISTANCE = 2;

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function escapeSearchRegex(value) {
  return String(value || '').replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
}

function editDistanceWithinLimit(left, right, limit = MAX_EDIT_DISTANCE) {
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    let minimum = current[0];
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost
      );
      current[column] = value;
      minimum = Math.min(minimum, value);
    }
    if (minimum > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

function flattenSearchValues(value) {
  if (Array.isArray(value)) return value.flatMap(flattenSearchValues);
  if (value && typeof value === 'object') return [];
  return value === null || value === undefined ? [] : [String(value)];
}

function scoreSearchText(value, normalizedQuery, queryTokens, { metadata = false } = {}) {
  const name = normalizeSearchText(value);
  if (!name) return 0;
  if (name === normalizedQuery) return metadata ? 620 : 1000;
  if (name.startsWith(normalizedQuery)) return metadata ? 570 : 900;
  if (name.includes(normalizedQuery)) return metadata ? 530 : 820;
  const words = name.split(' ').filter(Boolean);
  let matchedTokens = 0;
  let fuzzyTokens = 0;
  let fuzzyPenalty = 0;
  for (const token of queryTokens) {
    if (words.some((word) => word === token || word.startsWith(token) || word.includes(token))) {
      matchedTokens += 1;
      continue;
    }
    const maxDistance = token.length >= 6 ? 2 : 1;
    const distance = Math.min(...words.map((word) => editDistanceWithinLimit(token, word, maxDistance)));
    if (distance <= maxDistance) {
      matchedTokens += 1;
      fuzzyTokens += 1;
      fuzzyPenalty += distance;
    }
  }
  if (matchedTokens === queryTokens.length) {
    if (metadata) return fuzzyTokens ? 450 - fuzzyPenalty * 25 : 490;
    return fuzzyTokens ? 680 - fuzzyPenalty * 35 : (words.length === queryTokens.length ? 780 : 740);
  }
  if (matchedTokens > 0) return (metadata ? 170 : 350) + Math.round(300 * matchedTokens / queryTokens.length);
  return 0;
}

export function searchRelevanceScore(item, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  const rawQuery = String(query).trim().toLocaleLowerCase();
  const identifiers = [
    item?.imdbId, item?.externalImdbId, item?.tmdbId, item?.malId, item?.anilistId
  ].map((value) => String(value ?? '').trim().toLocaleLowerCase()).filter(Boolean);
  if (identifiers.includes(rawQuery)) return 1300;
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const titleValues = [
    item?.title, item?.originalTitle, item?.titleEnglish, item?.titleJapanese,
    ...flattenSearchValues(item?.aliases)
  ];
  const metadataValues = [
    ...flattenSearchValues(item?.searchTerms),
    ...flattenSearchValues(item?.genres),
    ...flattenSearchValues(item?.keywords),
    ...flattenSearchValues(item?.directors),
    ...flattenSearchValues(item?.writers),
    ...flattenSearchValues(item?.creators),
    ...flattenSearchValues(item?.themes),
    ...flattenSearchValues(item?.demographics),
    ...flattenSearchValues(item?.studios),
    ...flattenSearchValues(item?.producers),
    ...flattenSearchValues(item?.anilistTags),
    item?.network,
    item?.country
  ];
  let best = 0;
  for (const value of titleValues) best = Math.max(best, scoreSearchText(value, normalizedQuery, queryTokens));
  for (const value of metadataValues) best = Math.max(best, scoreSearchText(value, normalizedQuery, queryTokens, { metadata: true }));
  return best;
}

export function searchResultDate(item) {
  const date = String(item?.releaseDate || item?.firstAirDate || item?.airedFrom || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  const year = Number(item?.releaseYear);
  return Number.isInteger(year) && year >= 1000 && year <= 9999 ? String(year).padStart(4, '0') + '-01-01' : '';
}

export function rankSearchResults(items, query = '', sort = 'relevance') {
  const normalizedQuery = normalizeSearchText(query);
  const records = (Array.isArray(items) ? items : []).map((item, index) => ({
    item,
    index,
    score: normalizedQuery ? searchRelevanceScore(item, normalizedQuery) : 0,
    date: searchResultDate(item),
    popularity: Number(item?.popularity) || 0,
    rating: Number(item?.voteAverage ?? item?.score) || 0,
    votes: Number(item?.voteCount ?? item?.scoredBy) || 0
  }));
  records.sort((left, right) => {
    if (sort === 'newest') return right.date.localeCompare(left.date) || right.score - left.score || left.index - right.index;
    if (sort === 'popular') return right.popularity - left.popularity || right.rating - left.rating || right.score - left.score || right.date.localeCompare(left.date) || left.index - right.index;
    if (sort === 'rating') return right.rating - left.rating || right.votes - left.votes || right.popularity - left.popularity || right.date.localeCompare(left.date) || left.index - right.index;
    return right.score - left.score || right.date.localeCompare(left.date) || left.index - right.index;
  });
  return records.map(({ item }) => item);
}

export function buildSearchYearFilter(dateField, yearField, year) {
  const value = Number(year);
  if (!dateField || !yearField || !Number.isInteger(value) || value < 1870 || value > 9999) {
    throw new TypeError('A valid date field, year field and calendar year are required.');
  }
  const startDate = String(value).padStart(4, '0') + '-01-01';
  const endDateExclusive = String(value + 1).padStart(4, '0') + '-01-01';
  return {
    $or: [
      { [dateField]: { $gte: startDate, $lt: endDateExclusive } },
      {
        $and: [
          { $or: [
            { [dateField]: { $exists: false } },
            { [dateField]: null },
            { [dateField]: '' }
          ] },
          { [yearField]: value }
        ]
      }
    ]
  };
}
