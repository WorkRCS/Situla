import mongoose from 'mongoose';

const movieSchema = new mongoose.Schema({
  imdbId: { type: String, required: true, trim: true, lowercase: true },
  title: { type: String, required: true, trim: true },
  originalTitle: { type: String, default: '' },
  overview: { type: String, default: '' },
  posterPath: { type: String, default: null },
  backdropPath: { type: String, default: null },
  releaseDate: { type: String, default: null },
  releaseYear: { type: Number, default: null },
  runtime: { type: Number, min: 0, default: null },
  voteAverage: { type: Number, min: 0, max: 10, default: 0 },
  voteCount: { type: Number, min: 0, default: 0 },
  popularity: { type: Number, default: 0 },
  originalLanguage: { type: String, default: 'en' },
  genreIds: { type: [Number], default: [] },
  genres: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
  certification: { type: String, default: '' },
  adult: { type: Boolean, default: false },
  moderationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  manualReviewNote: { type: String, default: '' },
  lastSyncedAt: { type: Date, default: Date.now }
}, { timestamps: true, versionKey: false });

movieSchema.index({ imdbId: 1 }, { unique: true, partialFilterExpression: { imdbId: { $type: 'string' } } });
movieSchema.index({ moderationStatus: 1, releaseYear: -1, popularity: -1 });
movieSchema.index({ title: 'text', originalTitle: 'text' });
movieSchema.index({ originalLanguage: 1, adult: 1, releaseYear: -1 });

const crawlRunSchema = new mongoose.Schema({
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  startYear: { type: Number, required: true },
  endYear: { type: Number, required: true },
  startPage: { type: Number, required: true },
  requestedPages: { type: Number, required: true },
  pagesProcessed: { type: Number, default: 0 },
  totalPages: { type: Number, default: 0 },
  discoveredCount: { type: Number, default: 0 },
  importedCount: { type: Number, default: 0 },
  updatedCount: { type: Number, default: 0 },
  skippedAdultCount: { type: Number, default: 0 },
  errorMessage: { type: String, default: '' },
  startedAt: { type: Date, default: Date.now },
  finishedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });
crawlRunSchema.index({ createdAt: -1 });

export const Movie = mongoose.models.Movie || mongoose.model('Movie', movieSchema);
export const CrawlRun = mongoose.models.CrawlRun || mongoose.model('CrawlRun', crawlRunSchema);


const tvSeriesSchema = new mongoose.Schema({
  tmdbId: { type: Number, required: true, unique: true, min: 1 },
  imdbId: { type: String, trim: true, lowercase: true, default: null },
  title: { type: String, required: true, trim: true },
  originalTitle: { type: String, default: '' },
  overview: { type: String, default: '' },
  posterPath: { type: String, default: null },
  backdropPath: { type: String, default: null },
  firstAirDate: { type: String, default: null },
  releaseYear: { type: Number, default: null },
  voteAverage: { type: Number, min: 0, max: 10, default: 0 },
  voteCount: { type: Number, min: 0, default: 0 },
  popularity: { type: Number, default: 0 },
  originalLanguage: { type: String, default: 'en' },
  originCountry: { type: [String], default: [] },
  genreIds: { type: [Number], default: [] },
  genres: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
  certification: { type: String, default: '' },
  status: { type: String, default: '' },
  numberOfSeasons: { type: Number, min: 0, default: 0 },
  numberOfEpisodes: { type: Number, min: 0, default: 0 },
  seasons: [{
    tmdbSeasonId: { type: Number, default: null },
    seasonNumber: { type: Number, required: true },
    name: { type: String, default: '' },
    overview: { type: String, default: '' },
    airDate: { type: String, default: null },
    episodeCount: { type: Number, default: 0 },
    posterPath: { type: String, default: null },
    voteAverage: { type: Number, default: 0 }
  }],
  adult: { type: Boolean, default: false },
  moderationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  manualReviewNote: { type: String, default: '' },
  lastSyncedAt: { type: Date, default: Date.now }
}, { timestamps: true, versionKey: false });
tvSeriesSchema.index({ tmdbId: 1 }, { unique: true });
tvSeriesSchema.index({ moderationStatus: 1, popularity: -1, firstAirDate: -1 });
tvSeriesSchema.index({ title: 'text', originalTitle: 'text' });

const tvEpisodeSchema = new mongoose.Schema({
  tmdbEpisodeId: { type: Number, default: null },
  episodeNumber: { type: Number, required: true },
  name: { type: String, default: '' },
  overview: { type: String, default: '' },
  airDate: { type: String, default: null },
  runtime: { type: Number, default: null },
  stillPath: { type: String, default: null },
  voteAverage: { type: Number, default: 0 }
}, { _id: false, versionKey: false });

const tvSeasonSchema = new mongoose.Schema({
  seriesTmdbId: { type: Number, required: true, min: 1 },
  tmdbSeasonId: { type: Number, default: null },
  seasonNumber: { type: Number, required: true, min: 0 },
  name: { type: String, default: '' },
  overview: { type: String, default: '' },
  airDate: { type: String, default: null },
  episodeCount: { type: Number, default: 0 },
  posterPath: { type: String, default: null },
  voteAverage: { type: Number, default: 0 },
  episodes: { type: [tvEpisodeSchema], default: [] },
  lastSyncedAt: { type: Date, default: Date.now }
}, { timestamps: true, versionKey: false });
tvSeasonSchema.index({ seriesTmdbId: 1, seasonNumber: 1 }, { unique: true });

const animeSeriesSchema = new mongoose.Schema({
  malId: { type: Number, required: true, unique: true, min: 1 },
  title: { type: String, required: true, trim: true },
  titleEnglish: { type: String, default: '' },
  titleJapanese: { type: String, default: '' },
  synopsis: { type: String, default: '' },
  posterUrl: { type: String, default: null },
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
  rating: { type: String, default: '' },
  moderationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  manualReviewNote: { type: String, default: '' },
  lastSyncedAt: { type: Date, default: Date.now }
}, { timestamps: true, versionKey: false });
animeSeriesSchema.index({ malId: 1 }, { unique: true });
animeSeriesSchema.index({ moderationStatus: 1, popularity: 1, score: -1 });
animeSeriesSchema.index({ title: 'text', titleEnglish: 'text', titleJapanese: 'text' });

export const TvSeries = mongoose.models.TvSeries || mongoose.model('TvSeries', tvSeriesSchema);
export const TvSeason = mongoose.models.TvSeason || mongoose.model('TvSeason', tvSeasonSchema);
export const AnimeSeries = mongoose.models.AnimeSeries || mongoose.model('AnimeSeries', animeSeriesSchema);
