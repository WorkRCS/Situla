import mongoose from 'mongoose';

const imdbIdField = {
  type: String,
  required: true,
  trim: true,
  lowercase: true,
  match: /^tt\d{5,12}$/
};

const movieSchema = new mongoose.Schema({
  imdbId: imdbIdField,
  title: { type: String, required: true, trim: true },
  originalTitle: { type: String, default: '' },
  overview: { type: String, default: '' },
  posterUrl: { type: String, default: null },
  backdropUrl: { type: String, default: null },
  releaseDate: { type: String, default: null },
  releaseYear: { type: Number, default: null },
  runtime: { type: Number, min: 0, default: null },
  voteAverage: { type: Number, min: 0, max: 10, default: 0 },
  voteCount: { type: Number, min: 0, default: 0 },
  popularity: { type: Number, default: 0 },
  genres: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
  certification: { type: String, default: '' }
}, { timestamps: true, versionKey: false, strict: true });

movieSchema.index({ imdbId: 1 }, { unique: true });
movieSchema.index({ popularity: -1, releaseDate: -1 });
movieSchema.index({ title: 'text', originalTitle: 'text' });
movieSchema.index({ releaseYear: -1 });

const tvEpisodeSchema = new mongoose.Schema({
  episodeNumber: { type: Number, required: true, min: 1 },
  name: { type: String, default: '' },
  overview: { type: String, default: '' },
  airDate: { type: String, default: null },
  runtime: { type: Number, min: 0, default: null },
  stillUrl: { type: String, default: null },
  voteAverage: { type: Number, min: 0, max: 10, default: 0 }
}, { _id: false, versionKey: false });

const tvSeasonSchema = new mongoose.Schema({
  seasonNumber: { type: Number, required: true, min: 0 },
  name: { type: String, default: '' },
  overview: { type: String, default: '' },
  airDate: { type: String, default: null },
  episodeCount: { type: Number, min: 0, default: 0 },
  posterUrl: { type: String, default: null },
  voteAverage: { type: Number, min: 0, max: 10, default: 0 },
  episodes: { type: [tvEpisodeSchema], default: [] }
}, { _id: false, versionKey: false });

const tvSeriesSchema = new mongoose.Schema({
  tmdbId: { type: Number, required: true, min: 1 },
  externalImdbId: { type: String, trim: true, lowercase: true, match: /^tt[0-9]{5,12}$/, default: null },
  title: { type: String, required: true, trim: true },
  originalTitle: { type: String, default: '' },
  overview: { type: String, default: '' },
  posterUrl: { type: String, default: null },
  backdropUrl: { type: String, default: null },
  firstAirDate: { type: String, default: null },
  releaseYear: { type: Number, default: null },
  runtime: { type: Number, min: 0, default: null },
  adult: { type: Boolean, default: false },
  metadataSource: { type: String, default: "manual" },
  sourceId: { type: Number, min: 1, default: null },
  sourceUrl: { type: String, default: "" },
  voteAverage: { type: Number, min: 0, max: 10, default: 0 },
  voteCount: { type: Number, min: 0, default: 0 },
  popularity: { type: Number, default: 0 },
  genres: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
  certification: { type: String, default: '' },
  status: { type: String, default: '' },
  numberOfSeasons: { type: Number, min: 0, default: 0 },
  numberOfEpisodes: { type: Number, min: 0, default: 0 },
  seasons: { type: [tvSeasonSchema], default: [] }
}, { timestamps: true, versionKey: false, strict: true });

tvSeriesSchema.index({ tmdbId: 1 }, { unique: true, partialFilterExpression: { tmdbId: { $type: "number" } } });
tvSeriesSchema.index({ externalImdbId: 1 }, { sparse: true });
tvSeriesSchema.index({ popularity: -1, firstAirDate: -1 });
tvSeriesSchema.index({ title: 'text', originalTitle: 'text' });

const animeEpisodeSchema = new mongoose.Schema({
  episodeNumber: { type: Number, required: true, min: 1 },
  absoluteEpisodeNumber: { type: Number, min: 1, default: null },
  seasonNumber: { type: Number, min: 0, default: 1 },
  title: { type: String, required: true, trim: true },
  titleJapanese: { type: String, default: '' },
  overview: { type: String, default: '' },
  airDate: { type: String, default: null },
  runtime: { type: Number, min: 0, default: null },
  imageUrl: { type: String, default: null },
  tvdbEpisodeId: { type: Number, min: 1, default: null }
}, { _id: false, versionKey: false });

const animeRelatedSchema = new mongoose.Schema({
  malId: { type: Number, required: true, min: 1 },
  title: { type: String, required: true, trim: true },
  relationType: { type: String, default: 'RELATED' },
  episodes: { type: Number, min: 0, default: null },
  seasonYear: { type: Number, default: null },
  posterUrl: { type: String, default: null }
}, { _id: false, versionKey: false });

const animeNextAiringSchema = new mongoose.Schema({
  episode: { type: Number, min: 1, default: null },
  airDate: { type: String, default: null }
}, { _id: false, versionKey: false });

const animeSeriesSchema = new mongoose.Schema({
  malId: { type: Number, required: true, unique: true, min: 1 },
  title: { type: String, required: true, trim: true },
  titleEnglish: { type: String, default: '' },
  titleJapanese: { type: String, default: '' },
  synopsis: { type: String, default: '' },
  posterUrl: { type: String, default: null },
  posterFallbackUrl: { type: String, default: null },
  backdropUrl: { type: String, default: null },
  bannerUrl: { type: String, default: null },
  malUrl: { type: String, default: "" },
  sourceUrl: { type: String, default: "" },
  metadataSource: { type: String, default: "" },
  trailerUrl: { type: String, default: null },
  airedFrom: { type: String, default: null },
  releaseYear: { type: Number, default: null },
  episodes: { type: Number, min: 0, default: null },
  duration: { type: String, default: '' },
  score: { type: Number, min: 0, max: 10, default: 0 },
  scoredBy: { type: Number, min: 0, default: 0 },
  rank: { type: Number, min: 0, default: null },
  popularity: { type: Number, min: 0, default: null },
  status: { type: String, default: '' },
  season: { type: String, default: '' },
  type: { type: String, default: 'TV' },
  source: { type: String, default: '' },
  genres: { type: [String], default: [] },
  themes: { type: [String], default: [] },
  demographics: { type: [String], default: [] },
  studios: { type: [String], default: [] },
  producers: { type: [String], default: [] },
  episodeGuide: { type: [animeEpisodeSchema], default: [] },
  relatedAnime: { type: [animeRelatedSchema], default: [] },
  nextAiringEpisode: { type: animeNextAiringSchema, default: null },
  rating: { type: String, default: '' }
}, { timestamps: true, versionKey: false, strict: true });

animeSeriesSchema.index({ type: 1, rank: 1, score: -1 });
animeSeriesSchema.index({ title: 'text', titleEnglish: 'text', titleJapanese: 'text' });

export const Movie = mongoose.models.Movie || mongoose.model('Movie', movieSchema);
export const TvSeries = mongoose.models.TvSeries || mongoose.model('TvSeries', tvSeriesSchema);
export const AnimeSeries = mongoose.models.AnimeSeries || mongoose.model('AnimeSeries', animeSeriesSchema);
