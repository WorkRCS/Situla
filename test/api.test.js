import test from 'node:test';
import assert from 'node:assert/strict';
import app, { movieDto, tvSeriesDto, tvSeasonDto, animeSeriesDto } from '../src/app.js';
import { Movie, TvSeries, TvSeason, AnimeSeries } from '../src/models.js';

test('admin dashboard routes reject requests without a session cookie', async () => {
  const response = await app.request('/api/admin/dashboard');
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.match(body.error, /Authentication required/);
});

test('series admin routes are protected by the same admin session', async () => {
  const requests = [
    ['/api/admin/import-tv-series', 'POST'],
    ['/api/admin/import-anime-series', 'POST'],
    ['/api/admin/tv-series', 'GET'],
    ['/api/admin/anime-series', 'GET']
  ];
  for (const [path, method] of requests) {
    const response = await app.request(path, { method });
    assert.equal(response.status, 401, path);
  }
});

test('health route reports missing server configuration without attempting a database connection', async (t) => {
  const names = ['MONGODB_URI', 'MONGODB_DB_NAME', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET'];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  for (const name of names) delete process.env[name];

  const response = await app.request('/api/health');
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, 'needs_configuration');
  assert.deepEqual(new Set(body.missing), new Set(names));
});

test('IMDb import route rejects requests without an admin session', async () => {
  const response = await app.request('/api/admin/import-ids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ['tt1375666'] })
  });
  assert.equal(response.status, 401);
});

test('movie API DTO exposes IMDb ID and thumbnails without exposing TMDB IDs or player URLs', () => {
  const dto = movieDto({
    _id: '507f1f77bcf86cd799439011',
    imdbId: 'tt1375666',
    title: 'Inception',
    originalTitle: 'Inception',
    overview: 'A movie overview.',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    releaseDate: '2010-07-16',
    releaseYear: 2010,
    runtime: 148,
    voteAverage: 8.8,
    voteCount: 100,
    popularity: 10,
    originalLanguage: 'en',
    genres: ['Science Fiction'],
    keywords: ['dreams'],
    certification: 'PG-13',
    adult: false,
    moderationStatus: 'approved',
    manualReviewNote: '',
    playbackUrl: 'https://player.example/should-not-be-returned',
    playerUrl: 'https://vidsrc.sh/embed/movie/tt1375666',
    embedUrl: 'https://example.test/embed',
    iframeHtml: '<iframe src="https://example.test/embed"></iframe>'
  });

  assert.equal(dto.imdbId, 'tt1375666');
  assert.equal(dto.imdbUrl, 'https://www.imdb.com/title/tt1375666/');
  assert.equal(dto.title, 'Inception');
  assert.match(dto.posterUrl, /image\.tmdb\.org/);
  assert.match(dto.backdropUrl, /image\.tmdb\.org/);
  for (const forbidden of ['tmdbId', 'tmdbUrl', 'playbackUrl', 'playerUrl', 'embedUrl', 'iframeHtml']) {
    assert.equal(Object.hasOwn(dto, forbidden), false, forbidden + ' must never be returned by the movie API');
  }
});

test('TV DTO retains its provider-native series ID, seasons, and artwork', () => {
  const dto = tvSeriesDto({
    _id: '507f1f77bcf86cd799439012',
    tmdbId: 1399,
    imdbId: 'tt0944947',
    title: 'Game of Thrones',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    firstAirDate: '2011-04-17',
    releaseYear: 2011,
    voteAverage: 9.2,
    numberOfSeasons: 8,
    numberOfEpisodes: 73,
    seasons: [{ seasonNumber: 1, name: 'Season 1', episodeCount: 10 }],
    genres: ['Drama'],
    moderationStatus: 'approved'
  });
  assert.equal(dto.tmdbId, 1399);
  assert.equal(dto.seasons[0].seasonNumber, 1);
  assert.match(dto.posterUrl, /image\.tmdb\.org/);
});

test('TV season DTO exposes episode numbers and still artwork', () => {
  const dto = tvSeasonDto({
    seasonNumber: 1,
    episodes: [{ episodeNumber: 1, name: 'Winter Is Coming', stillPath: '/still.jpg', runtime: 62 }]
  });
  assert.equal(dto.episodes[0].episodeNumber, 1);
  assert.match(dto.episodes[0].stillUrl, /image\.tmdb\.org/);
});

test('Anime DTO uses MAL ID and MyAnimeList link, not a TMDB ID', () => {
  const dto = animeSeriesDto({
    _id: '507f1f77bcf86cd799439013',
    malId: 5114,
    title: 'Fullmetal Alchemist: Brotherhood',
    titleEnglish: 'Fullmetal Alchemist: Brotherhood',
    posterUrl: 'https://cdn.myanimelist.net/images/anime/1208/94745l.jpg',
    episodes: 64,
    score: 9.1,
    type: 'TV',
    genres: ['Action', 'Adventure'],
    moderationStatus: 'approved'
  });
  assert.equal(dto.malId, 5114);
  assert.equal(dto.malUrl, 'https://myanimelist.net/anime/5114');
  assert.equal(dto.episodes, 64);
  assert.equal(Object.hasOwn(dto, 'tmdbId'), false);
});

test('media schemas require the correct provider-native IDs', () => {
  const movieError = new Movie({ title: 'Movie without IMDb ID' }).validateSync();
  const tvError = new TvSeries({ title: 'TV without TMDB ID' }).validateSync();
  const seasonError = new TvSeason({ seriesTmdbId: 1399 }).validateSync();
  const animeError = new AnimeSeries({ title: 'Anime without MAL ID' }).validateSync();
  assert.ok(movieError.errors.imdbId);
  assert.ok(tvError.errors.tmdbId);
  assert.ok(seasonError.errors.seasonNumber);
  assert.ok(animeError.errors.malId);
});
