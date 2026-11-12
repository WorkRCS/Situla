const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

/**
 * Popularity uses each catalogue's native ranking semantics:
 * - Movies and TV: vote volume or provider popularity score.
 * - Anime: MAL rank/popularity are ascending (lower is better), or high score volume.
 * An explicit boolean always wins, so curators can override the derived badge.
 */
export function isPopularCatalogItem(item, mediaType) {
  if (typeof item?.isPopular === "boolean") return item.isPopular;

  if (mediaType === "anime") {
    const rank = number(item?.rank);
    const popularity = number(item?.popularity);
    const scoredBy = number(item?.scoredBy);
    return (rank > 0 && rank <= 100) ||
      (popularity > 0 && popularity <= 100) ||
      scoredBy >= 500_000;
  }

  return number(item?.voteCount) >= 10_000 || number(item?.popularity) >= 50;
}
