import mongoose from 'mongoose';

const movieSchema = new mongoose.Schema({
  tmdbId: { type: Number, required: true, unique: true },
  imdbId: { type: String, trim: true },
  playbackUrl: { type: String, trim: true, maxlength: 2048, default: null },
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
  tmdbUrl: { type: String, default: '' },
  lastSyncedAt: { type: Date, default: Date.now }
}, { timestamps: true, versionKey: false });
movieSchema.index({ moderationStatus: 1, releaseYear: -1, popularity: -1 });
movieSchema.index({ imdbId: 1 }, { unique: true, partialFilterExpression: { imdbId: { $type: 'string' } } });
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
