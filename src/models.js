import mongoose from 'mongoose';

const imdbIdField = {
  type: String,
  required: true,
  trim: true,
  lowercase: true,
  match: /^tt\d{5,12}$/
};

const movieCastSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  character: { type: String, default: '' },
  profileUrl: { type: String, default: null }
}, { _id: false, versionKey: false });

const movieCollectionSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  posterUrl: { type: String, default: null },
  backdropUrl: { type: String, default: null }
}, { _id: false, versionKey: false });

const movieSchema = new mongoose.Schema({
  imdbId: imdbIdField,
  title: { type: String, required: true, trim: true },
  originalTitle: { type: String, default: '' },
  overview: { type: String, default: '' },
  tagline: { type: String, default: '' },
  posterUrl: { type: String, default: null },
  backdropUrl: { type: String, default: null },
  releaseDate: { type: String, default: null },
  releaseYear: { type: Number, default: null },
  runtime: { type: Number, min: 0, default: null },
  originalLanguage: { type: String, default: '' },
  adult: { type: Boolean, default: false },
  status: { type: String, default: '' },
  homepage: { type: String, default: '' },
  sourceUrl: { type: String, default: '' },
  metadataSource: { type: String, default: '' },
  budget: { type: Number, min: 0, default: 0 },
  revenue: { type: Number, min: 0, default: 0 },
  voteAverage: { type: Number, min: 0, max: 10, default: 0 },
  voteCount: { type: Number, min: 0, default: 0 },
  popularity: { type: Number, default: 0 },
  genres: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
  certification: { type: String, default: '' },
  productionCompanies: { type: [String], default: [] },
  productionCountries: { type: [String], default: [] },
  spokenLanguages: { type: [String], default: [] },
  cast: { type: [movieCastSchema], default: [] },
  directors: { type: [String], default: [] },
  writers: { type: [String], default: [] },
  trailerUrl: { type: String, default: '' },
  collectionInfo: { type: movieCollectionSchema, default: null }
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
  referenceUrl: { type: String, default: "" },
  network: { type: String, default: "" },
  country: { type: String, default: "" },
  creators: { type: [String], default: [] },
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


const userSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  displayName: { type: String, required: true, trim: true, maxlength: 80 },
  passwordHash: { type: String, default: null, select: false },
  hasPassword: { type: Boolean, default: false },
  googleSub: { type: String, default: null },
  emailVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  planId: { type: String, enum: ['free', 'premium'], default: 'free' },
  membership: {
    billingCycle: { type: String, enum: ['monthly', 'six-months', 'yearly', null], default: null },
    status: { type: String, enum: ['inactive', 'active', 'expired'], default: 'inactive' },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    activatedBy: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false, strict: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleSub: 1 }, { unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } });
userSchema.index({ role: 1, status: 1 });

const authSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  tokenHash: { type: String, required: true, unique: true },
  ipHash: { type: String, default: null },
  rememberMe: { type: Boolean, default: true },
  lastSeenAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false, strict: true });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

const deviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  slot: { type: Number, min: 0, max: 2, default: null },
  tokenHash: { type: String, required: true, unique: true },
  label: { type: String, default: 'Browser', maxlength: 180 },
  lastSeenAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false, strict: true });
deviceSchema.index({ userId: 1, revokedAt: 1 });
deviceSchema.index({ userId: 1, slot: 1 }, {
  unique: true,
  partialFilterExpression: { slot: { $type: 'number' } }
});

const guestAccessSchema = new mongoose.Schema({
  ipHash: { type: String, required: true, unique: true },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false, strict: true });

const guestSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  ipHash: { type: String, required: true },
  guestAccessId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuestAccess', required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false, strict: true });
guestSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
guestSessionSchema.index({ ipHash: 1, expiresAt: 1 });

const usageStateSchema = new mongoose.Schema({
  ownerType: { type: String, enum: ['user', 'guest'], required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  usedSeconds: { type: Number, min: 0, default: 0 },
  cooldownUntil: { type: Date, default: null },
  cycleStartedAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false, strict: true });
usageStateSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });
usageStateSchema.index({ cooldownUntil: 1 });

const playbackSessionSchema = new mongoose.Schema({
  ownerType: { type: String, enum: ['user', 'guest'], required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  guestAccessId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuestAccess', default: null },
  mediaType: { type: String, enum: ['movie', 'tv', 'anime'], required: true },
  mediaId: { type: String, required: true },
  season: { type: Number, default: null },
  episode: { type: Number, default: null },
  audio: { type: String, enum: ['sub', 'dub', null], default: null },
  startedAt: { type: Date, required: true },
  lastHeartbeatAt: { type: Date, required: true },
  isPlaying: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'ended', 'expired', 'locked'], default: 'active' },
  endedAt: { type: Date, default: null },
  lastClientTime: { type: Number, min: 0, default: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false, strict: true });
playbackSessionSchema.index(
  { ownerType: 1, ownerId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
playbackSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
playbackSessionSchema.index({ userId: 1, status: 1 });

const authRateLimitSchema = new mongoose.Schema({
  keyHash: { type: String, required: true, unique: true },
  count: { type: Number, min: 0, default: 0 },
  windowEndsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false, strict: true });
authRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const AuthSession = mongoose.models.AuthSession || mongoose.model('AuthSession', authSessionSchema);
export const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);
export const GuestAccess = mongoose.models.GuestAccess || mongoose.model('GuestAccess', guestAccessSchema);
export const GuestSession = mongoose.models.GuestSession || mongoose.model('GuestSession', guestSessionSchema);
export const UsageState = mongoose.models.UsageState || mongoose.model('UsageState', usageStateSchema);
export const PlaybackSession = mongoose.models.PlaybackSession || mongoose.model('PlaybackSession', playbackSessionSchema);
export const AuthRateLimit = mongoose.models.AuthRateLimit || mongoose.model('AuthRateLimit', authRateLimitSchema);
