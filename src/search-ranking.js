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

export function searchRelevanceScore(item, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const names = [
    item?.title, item?.originalTitle, item?.titleEnglish, item?.titleJapanese
  ].map(normalizeSearchText).filter(Boolean);
  if (!names.length) return 0;

  let best = 0;
  for (const name of names) {
    if (name === normalizedQuery) best = Math.max(best, 1000);
    else if (name.startsWith(normalizedQuery)) best = Math.max(best, 900);
    else if (name.includes(normalizedQuery)) best = Math.max(best, 820);

    const words = name.split(' ').filter(Boolean);
    let matchedTokens = 0;
    let fuzzyTokens = 0;
    let fuzzyPenalty = 0;
    for (const token of queryTokens) {
      if (words.some((word) => word === token)) {
        matchedTokens += 1;
        continue;
      }
      if (words.some((word) => word.startsWith(token))) {
        matchedTokens += 1;
        continue;
      }
      if (words.some((word) => word.includes(token))) {
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
      const score = fuzzyTokens
        ? 680 - fuzzyPenalty * 35
        : (words.length === queryTokens.length ? 780 : 740);
      best = Math.max(best, score);
    } else if (matchedTokens > 0) {
      best = Math.max(best, 350 + Math.round(300 * matchedTokens / queryTokens.length));
    }
  }
  return best;
}

export function searchResultDate(item) {
  const date = String(item?.releaseDate || item?.firstAirDate || item?.airedFrom || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  const year = Number(item?.releaseYear);
  return Number.isInteger(year) && year >= 1000 && year <= 9999 ? String(year).padStart(4, '0') + '-01-01' : '';
}

export function rankSearchResults(items, query = '') {
  const normalizedQuery = normalizeSearchText(query);
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      item,
      index,
      score: normalizedQuery ? searchRelevanceScore(item, normalizedQuery) : 0,
      date: searchResultDate(item)
    }))
    .sort((left, right) =>
      right.score - left.score ||
      right.date.localeCompare(left.date) ||
      left.index - right.index
    )
    .map(({ item }) => item);
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
