// TMDB discovery batch 4: animated features.
export const MOVIE_DISCOVERY_PART_04 = {
  key: "animation",
  label: "Animated feature films",
  pages: 14,
  params: {
    sort_by: "popularity.desc",
    with_genres: "16",
    "vote_count.gte": "75",
    "with_runtime.gte": "45"
  }
};
