import test from 'node:test';
import assert from 'node:assert/strict';
import app, { movieDto, tvSeriesDto, tvSeasonDto, animeSeriesDto } from '../src/app.js';
import { Movie, TvSeries, AnimeSeries } from '../src/models.js';
import { hindiMoviePlayerUrl, vidlinkMovieUrl, vidlinkTvUrl } from '../src/player-urls.js';

test('admin and crawler API routes are removed', async () => {
  const paths = [
    '/api/admin/login',
    '/api/admin/dashboard',
    '/api/admin/import-ids',
    '/api/admin/crawl',
    '/api/admin/tmdb-status'
  ];
  for (const path of paths) {
    const response = await app.request(path, { method: path.endsWith('/login') || path.endsWith('/import-ids') || path.endsWith('/crawl') ? 'POST' : 'GET' });
    assert.equal(response.status, 404, path);
  }
});

test('health route requires only MongoDB settings and does not connect if absent', async (t) => {
  const names = ['MONGODB_URI', 'MONGODB_DB_NAME'];
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
  assert.match(response.headers.get('permissions-policy') || '', /picture-in-picture=\(\)/);
});

test('movie DTO exposes only IMDb catalog identity, not a fixed provider mapping', () => {
  const dto = movieDto({
    _id: '507f1f77bcf86cd799439011',
    imdbId: 'TT1375666',
    title: 'Inception',
    originalTitle: 'Inception',
    overview: 'A movie overview.',
    posterUrl: 'https://images.example/inception.jpg',
    backdropUrl: 'https://images.example/inception-backdrop.jpg',
    releaseDate: '2010-07-16',
    releaseYear: 2010,
    runtime: 148,
    voteAverage: 8.8,
    voteCount: 100,
    popularity: 10,
    genres: ['Science Fiction'],
    keywords: ['dreams'],
    certification: 'PG-13',
    tmdbId: 27205,
    vidlinkId: 27205,
    playbackUrl: 'https://player.example/should-not-be-returned',
    playerUrl: 'https://vidlink.pro/movie/27205',
    embedUrl: 'https://example.test/embed',
    iframeHtml: '<iframe src="https://example.test/embed"></iframe>'
  });

  assert.equal(dto.imdbId, 'tt1375666');
  assert.equal(dto.imdbUrl, 'https://www.imdb.com/title/tt1375666/');
  assert.equal(dto.title, 'Inception');
  assert.equal(dto.posterUrl, 'https://images.example/inception.jpg');
  assert.equal(dto.backdropUrl, 'https://images.example/inception-backdrop.jpg');
  assert.equal(dto.playerAvailable, undefined);
  assert.equal(Object.hasOwn(dto, 'vidlinkId'), false);
  for (const forbidden of ['tmdbId', 'tmdbUrl', 'playbackUrl', 'playerUrl', 'embedUrl', 'iframeHtml']) {
    assert.equal(Object.hasOwn(dto, forbidden), false, forbidden + ' must never be returned');
  }
});

test('TV DTO is keyed by IMDb and embeds seasons without a fixed provider mapping', () => {
  const dto = tvSeriesDto({
    _id: '507f1f77bcf86cd799439012',
    imdbId: 'tt0944947',
    vidlinkId: 1399,
    title: 'Game of Thrones',
    posterUrl: 'https://images.example/got.jpg',
    backdropUrl: 'https://images.example/got-bg.jpg',
    firstAirDate: '2011-04-17',
    releaseYear: 2011,
    voteAverage: 9.2,
    numberOfSeasons: 8,
    numberOfEpisodes: 73,
    seasons: [{ seasonNumber: 1, name: 'Season 1', episodeCount: 10, episodes: [{ episodeNumber: 1, name: 'Winter Is Coming' }] }],
    genres: ['Drama'],
    tmdbId: 1399
  });
  assert.equal(dto.imdbId, 'tt0944947');
  assert.equal(dto.playerAvailable, undefined);
  assert.equal(Object.hasOwn(dto, 'vidlinkId'), false);
  assert.equal(dto.seasons[0].seasonNumber, 1);
  assert.equal(Object.hasOwn(dto, 'tmdbId'), false);
  assert.equal(dto.posterUrl, 'https://images.example/got.jpg');
});

test('TV season DTO exposes embedded episode numbers and direct artwork URLs', () => {
  const dto = tvSeasonDto({
    seasonNumber: 1,
    episodes: [{ episodeNumber: 1, name: 'Winter Is Coming', stillUrl: 'https://images.example/still.jpg', runtime: 62 }]
  });
  assert.equal(dto.episodes[0].episodeNumber, 1);
  assert.equal(dto.episodes[0].stillUrl, 'https://images.example/still.jpg');
});

test('Anime DTO uses MAL ID and no TMDB field', () => {
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
    tmdbId: 123
  });
  assert.equal(dto.malId, 5114);
  assert.equal(dto.malUrl, 'https://myanimelist.net/anime/5114');
  assert.equal(dto.episodes, 64);
  assert.equal(Object.hasOwn(dto, 'tmdbId'), false);
});

test('Movie and TV schemas require unique IMDb IDs; no TMDB provider paths remain', () => {
  const movieError = new Movie({ title: 'Movie without IMDb ID' }).validateSync();
  const tvError = new TvSeries({ title: 'TV without IMDb ID' }).validateSync();
  const animeError = new AnimeSeries({ title: 'Anime without MAL ID' }).validateSync();
  assert.ok(movieError.errors.imdbId);
  assert.ok(tvError.errors.imdbId);
  assert.ok(animeError.errors.malId);
  assert.equal(Movie.schema.path('tmdbId'), undefined);
  assert.equal(Movie.schema.path('vidlinkId'), undefined);
  assert.equal(TvSeries.schema.path('tmdbId'), undefined);
  assert.equal(TvSeries.schema.path('vidlinkId'), undefined);
  assert.ok(TvSeries.schema.indexes().some(([keys, options]) => keys.imdbId === 1 && options.unique === true));
  assert.ok(Movie.schema.indexes().some(([keys, options]) => keys.imdbId === 1 && options.unique === true));
});

test('public movie and TV routes reject non-IMDb identifiers before database access', async () => {
  const movie = await app.request('/api/movies/27205');
  const tv = await app.request('/api/tv/1399');
  const moviePlayer = await app.request('/api/player/movie/tt1375666');
  const tvPlayer = await app.request('/api/player/tv/tt0944947/1/1');
  assert.equal(movie.status, 400);
  assert.equal(tv.status, 400);
  assert.equal(moviePlayer.status, 404);
  assert.equal(tvPlayer.status, 404);
});


test('VidLink movie and TV URLs use direct IMDb IDs and Situla gold theme', () => {
  const movieUrl = new URL(vidlinkMovieUrl('tt0848228'));
  assert.equal(movieUrl.origin + movieUrl.pathname, 'https://vidlink.pro/movie/tt0848228');
  assert.equal(movieUrl.searchParams.get('primaryColor'), 'e8b65b');
  assert.equal(movieUrl.searchParams.get('secondaryColor'), '171a23');
  assert.equal(vidlinkTvUrl('tt0944947', 1, 1), 'https://vidlink.pro/tv/tt0944947/1/1');
  assert.equal(vidlinkMovieUrl('24428'), null);
  assert.equal(vidlinkTvUrl('1399', 1, 1), null);
  assert.equal(vidlinkTvUrl('tt0944947', -1, 1), null);
  assert.equal(vidlinkTvUrl('tt0944947', 1, 0), null);
});

test('Hindi movie player URL receives the same validated IMDb ID and gold theme', () => {
  const hindiUrl = new URL(hindiMoviePlayerUrl('tt0848228'));
  assert.equal(hindiUrl.origin + hindiUrl.pathname, 'https://slast430did.com/play/tt0848228');
  assert.equal(hindiUrl.searchParams.get('id'), null);
  assert.equal(hindiUrl.searchParams.get('primaryColor'), 'e8b65b');
  assert.equal(hindiUrl.searchParams.get('secondaryColor'), '171a23');
  assert.equal(hindiMoviePlayerUrl('24428'), null);
  assert.equal(hindiMoviePlayerUrl('javascript:alert(1)'), null);
});
