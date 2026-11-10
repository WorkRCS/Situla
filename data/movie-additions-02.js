// TMDB discovery batch 2: popular, widely watched cinema.
export const MOVIE_DISCOVERY_PART_02 = {
  key: "global-popular",
  label: "Popular global films",
  pages: 14,
  params: {
    sort_by: "popularity.desc",
    "vote_count.gte": "250",
    "with_runtime.gte": "65"
  }
};
