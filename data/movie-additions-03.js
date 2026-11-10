// TMDB discovery batch 3: Indian cinema across languages and regions.
export const MOVIE_DISCOVERY_PART_03 = {
  key: "indian-cinema",
  label: "Indian cinema",
  pages: 14,
  params: {
    sort_by: "popularity.desc",
    with_origin_country: "IN",
    "vote_count.gte": "30",
    "with_runtime.gte": "65"
  }
};
