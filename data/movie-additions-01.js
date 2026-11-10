// TMDB discovery batch 1: highly rated global cinema.
// IMDb IDs are resolved from TMDB external_ids at seed time; TMDB IDs are never used as Situla movie keys.
export const MOVIE_DISCOVERY_PART_01 = {
  key: "global-top-rated",
  label: "Global top-rated films",
  pages: 14,
  params: {
    sort_by: "vote_average.desc",
    "vote_count.gte": "500",
    "with_runtime.gte": "65"
  }
};
