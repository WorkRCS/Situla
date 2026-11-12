const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_HALF_LIFE_MS = 7 * DAY_MS;
const HOT_TREND_SCORE = 6;

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function marketSignals(item, mediaType) {
  const isAnime = mediaType === "anime";
  const votes = Math.max(0, number(isAnime ? item?.scoredBy : item?.voteCount));
  const rating = clamp(number(isAnime ? item?.score : item?.voteAverage), 0, 10);
  const popularity = Math.max(0, number(item?.popularity));

  // Bayesian smoothing prevents a small number of extreme ratings from
  // outranking titles with a substantial vote base.
  const priorRating = 6.5;
  const priorVotes = isAnime ? 1_000 : 500;
  const weightedRating = votes + priorVotes > 0
    ? ((rating * votes) + (priorRating * priorVotes)) / (votes + priorVotes)
    : 0;

  const voteScale = isAnime ? 100_000 : 50_000;
  const voteStrength = votes > 0
    ? clamp(Math.log1p(votes) / Math.log1p(voteScale), 0, 1)
    : 0;

  // TMDB popularity is higher-is-better. MAL rank/popularity are
  // lower-is-better, so they are converted into a bounded reach signal.
  const providerReach = isAnime
    ? Math.max(
        number(item?.rank) > 0 ? 1 / (1 + number(item.rank) / 1_500) : 0,
        popularity > 0 ? 1 / (1 + popularity / 1_500) : 0
      )
    : 1 - Math.exp(-popularity / 45);

  const marketScore = (weightedRating / 10) * 0.58 +
    voteStrength * 0.27 +
    providerReach * 0.15;

  return {
    votes,
    weightedRating,
    voteStrength,
    providerReach,
    marketScore,
    minimumVotes: isAnime ? 1_500 : 1_000,
    minimumMarketScore: isAnime ? 0.68 : 0.66
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
 * Returns one strongest catalogue badge:
 * Hot = recent Situla playback momentum (7-day exponential half-life).
 * Popular = reliable provider market signals (Bayesian rating + vote depth + reach).
 * Featured = explicit editorial curation, never an inverse rating bucket.
 *
 * Legacy isPopular booleans are deliberately ignored; old seed data must not
 * pin a badge on a title forever.
 */
export function getCatalogBadge(item, mediaType, now = Date.now()) {
  if (!item || !["movie", "tv", "anime"].includes(mediaType)) return null;

  const trendScore = calculateDecayedTrendScore(item.trendScore, item.trendUpdatedAt, now);
  if (trendScore >= HOT_TREND_SCORE) {
    return { key: "hot", label: "Hot", icon: "🔥" };
  }

  const signals = marketSignals(item, mediaType);
  if (
    signals.votes >= signals.minimumVotes &&
    signals.weightedRating >= 7 &&
    signals.marketScore >= signals.minimumMarketScore
  ) {
    return { key: "popular", label: "Popular", icon: "🎉" };
  }

  if (item.isFeatured === true) {
    return { key: "featured", label: "Featured", icon: "💖" };
  }

  return null;
}

/**
 * Atomically record a qualified playback start with exponential decay.
 * A seven-day half-life makes the value represent recent momentum rather
 * than lifetime views. The update is a single MongoDB pipeline write.
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
