// TMDB discovery batch 5: international-language cinema.
// Pipe-separated language codes request titles from any listed original language.
export const MOVIE_DISCOVERY_PART_05 = {
  key: "international-cinema",
  label: "International cinema",
  pages: 14,
  params: {
    sort_by: "vote_average.desc",
    with_original_language: "ja|ko|fr|es|it|de|zh|fa|pt",
    "vote_count.gte": "100",
    "with_runtime.gte": "65"
  }
};
