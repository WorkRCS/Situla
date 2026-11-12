const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_HALF_LIFE_MS = 7 * DAY_MS;
const HOT_TREND_SCORE = 6;

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function releaseTimestamp(item) {
  const raw = item?.releaseDate || item?.firstAirDate || item?.airedFrom;
  if (raw) {
    const parsed = Date.parse(String(raw));
    if (Number.isFinite(parsed)) return parsed;
  }
  const year = Number(item?.releaseYear);
  if (Number.isInteger(year) && year >= 1880 && year <= 2200) {
    return Date.UTC(year, 6, 1);
  }
  return null;
}

function marketSignals(item, mediaType) {
  const isAnime = mediaType === "anime";
  const isTv = mediaType === "tv";
  const votes = Math.max(0, number(isAnime ? item?.scoredBy : item?.voteCount));
  const storedRating = number(isAnime ? item?.score : item?.voteAverage);
  const providerRating = isTv ? number(item?.providerRating) : 0;
  const rating = clamp(storedRating > 0 ? storedRating : providerRating, 0, 10);
  const popularity = Math.max(
    0,
    number(item?.popularity),
    isTv ? number(item?.providerPopularity) : 0
  );
  const rank = Math.max(0, number(item?.rank));

  // Bayesian smoothing protects ratings with very small public vote samples.
  const priorRating = 6.5;
  const priorVotes = isAnime ? 250 : isTv ? 100 : 150;
  const weightedRating = votes > 0
    ? ((rating * votes) + (priorRating * priorVotes)) / (votes + priorVotes)
    : rating;

  const voteScale = isAnime ? 50_000 : isTv ? 20_000 : 50_000;
  const voteDepth = votes > 0
    ? clamp(Math.log1p(votes) / Math.log1p(voteScale), 0, 1)
    : 0;

  // MAL rank/popularity are lower-is-better; TMDB and TVmaze reach are higher-is-better.
  const providerReach = isAnime
    ? Math.max(
        rank > 0 ? 1 / (1 + rank / 250) : 0,
        popularity > 0 ? 1 / (1 + popularity / 250) : 0
      )
    : 1 - Math.exp(-popularity / (isTv ? 24 : 30));

  const marketScore = (weightedRating / 10) * 0.55 + voteDepth * 0.25 + providerReach * 0.20;

  return {
    votes,
    rating,
    weightedRating,
    voteDepth,
    providerReach,
    marketScore,
    minPopularVotes: isAnime ? 500 : isTv ? 200 : 500,
    minFeaturedVotes: isAnime ? 100 : isTv ? 25 : 50,
    minHotVotes: isAnime ? 300 : isTv ? 75 : 100
  };
}
export function calculateDecayedTrendScore(score, updatedAt, now = Date.now()) {
  const value = Math.max(0, number(score));
  const updated = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(String(updatedAt || ""));
  const current = now instanceof Date ? now.getTime() : Number(now);
  if (!value || !Number.isFinite(updated) || !Number.isFinite(current)) return 0;
  const elapsed = Math.max(0, current - updated);
  return value * Math.pow(0.5, elapsed / TREND_HALF_LIFE_MS);
}

/**
 * All three labels are computed automatically from provider market data and
 * first-party playback engagement. No isFeatured/isPopular manual flag is used.
 *
 * Hot: recent playback momentum, fresh vote growth, or strong provider trend.
 * Popular: stable high rating with a meaningful public vote sample and reach.
 * Featured: a high-quality, sufficiently rated title that is not already Hot/Popular.
 */
export function getCatalogBadge(item, mediaType, now = Date.now()) {
  if (!item || !["movie", "tv", "anime"].includes(mediaType)) return null;

  const current = now instanceof Date ? now.getTime() : Number(now);
  const signals = marketSignals(item, mediaType);
  if (!Number.isFinite(current)) return null;

  const trendScore = calculateDecayedTrendScore(item.trendScore, item.trendUpdatedAt, current);
  if (trendScore >= HOT_TREND_SCORE) return { key: "hot", label: "Hot" };
  if (signals.rating <= 0) return null;

  const voteVelocity7d = Math.max(0, number(item.voteVelocity7d));
  const releasedAt = releaseTimestamp(item);
  const ageDays = releasedAt && Number.isFinite(current)
    ? Math.max(0, (current - releasedAt) / DAY_MS)
    : Number.POSITIVE_INFINITY;
  const isFresh = ageDays <= (mediaType === "anime" ? 730 : 365);

  const velocityThreshold = mediaType === "anime" ? 120 : mediaType === "tv" ? 70 : 100;
  const tvmazeHot = mediaType === "tv" &&
    signals.rating >= 7.2 &&
    number(item.providerPopularity) >= 60 &&
    isFresh;
  const publicProviderTrend = mediaType === "anime"
    ? signals.votes >= signals.minHotVotes && isFresh &&
      ((Number(item.rank) > 0 && Number(item.rank) <= 100) ||
       (Number(item.popularity) > 0 && Number(item.popularity) <= 50))
    : signals.votes >= signals.minHotVotes && isFresh &&
      (signals.providerReach >= 0.60 ||
       (voteVelocity7d >= velocityThreshold && signals.rating >= 6.5));

  if (
    trendScore >= HOT_TREND_SCORE ||
    (signals.votes >= signals.minHotVotes && voteVelocity7d >= velocityThreshold && signals.rating >= 6.5) ||
    publicProviderTrend ||
    tvmazeHot
  ) {
    return { key: "hot", label: "Hot" };
  }

  const tvmazePopular = mediaType === "tv" &&
    signals.rating >= 7.5 &&
    number(item.providerPopularity) >= 25 &&
    signals.marketScore >= 0.48;
  if (
    (signals.votes >= signals.minPopularVotes &&
      signals.weightedRating >= 6.8 &&
      signals.marketScore >= 0.48) ||
    tvmazePopular
  ) {
    return { key: "popular", label: "Popular" };
  }

  const tvmazeFeatured = mediaType === "tv" &&
    signals.rating >= 7 &&
    number(item.providerPopularity) > 0 &&
    signals.marketScore >= 0.38;
  if (
    (signals.votes >= signals.minFeaturedVotes &&
      signals.weightedRating >= 6.8 &&
      signals.marketScore >= 0.40) ||
    tvmazeFeatured
  ) {
    return { key: "featured", label: "Featured" };
  }

  return null;
}
/**
 * Atomically record one confirmed transition into playing state. Heartbeats
 * during the same playing session do not add more engagement points.
 */
export async function recordCatalogPlaybackStart(Model, filter, now = new Date()) {
  if (!Model || typeof Model.updateOne !== "function") {
    throw new TypeError("A Mongoose model is required to record catalog momentum.");
  }
  const timestamp = now instanceof Date ? now : new Date(now);
  return Model.updateOne(filter, [{
    $set: {
      trendScore: {
        $add: [
          {
            $multiply: [
              { $ifNull: ["$trendScore", 0] },
              {
                $pow: [
                  0.5,
                  {
                    $divide: [
                      {
                        $max: [
                          0,
                          {
                            $subtract: [
                              { $literal: timestamp },
                              { $ifNull: ["$trendUpdatedAt", { $literal: timestamp }] }
                            ]
                          }
                        ]
                      },
                      TREND_HALF_LIFE_MS
                    ]
                  }
                ]
              }
            ]
          },
          1
        ]
      },
      trendUpdatedAt: { $literal: timestamp }
    }
  }]);
}
