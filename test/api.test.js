import test from 'node:test';
import assert from 'node:assert/strict';
import app, { movieDto, movieDetailsDto, tvSeriesDto, tvSeasonDto, animeSeriesDto } from '../src/app.js';
import { Movie, TvSeries, AnimeSeries } from '../src/models.js';
import { hindiMoviePlayerUrl, normalizeTvPlayerRoute, vidlinkMovieUrl, vidlinkTvUrl } from '../src/player-urls.js';

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

test('Movie detail DTO exposes the complete enriched metadata while keeping IMDb as its only catalog ID', () => {
  const dto = movieDetailsDto({
    _id: '507f1f77bcf86cd799439014',
    imdbId: 'tt0133093',
    title: 'The Matrix',
    originalTitle: 'The Matrix',
    overview: 'A sufficiently long synopsis for a complete movie detail API response.',
    posterUrl: 'https://images.example/matrix-poster.jpg',
    backdropUrl: 'https://images.example/matrix-backdrop.jpg',
    releaseDate: '1999-03-31',
    releaseYear: 1999,
    runtime: 136,
    originalLanguage: 'en',
    adult: false,
    tagline: 'Welcome to the Real World.',
    productionCompanies: ['Warner Bros.'],
    productionCountries: ['United States'],
    spokenLanguages: ['English'],
    cast: [{ name: 'Keanu Reeves', character: 'Neo', profileUrl: 'https://images.example/keanu.jpg' }],
    directors: ['Lana Wachowski', 'Lilly Wachowski'],
    writers: ['Lana Wachowski', 'Lilly Wachowski'],
    keywords: ['artificial intelligence'],
    trailerUrl: 'https://www.youtube.com/watch?v=vKQi3bBA1y8',
    sourceUrl: 'https://www.themoviedb.org/movie/603',
    metadataSource: 'TMDB API',
    budget: 63000000,
    revenue: 463517383,
    homepage: 'https://www.warnerbros.com/movies/matrix',
    status: 'Released'
  });
  assert.equal(dto.imdbId, 'tt0133093');
  assert.equal(dto.title, 'The Matrix');
  assert.ok(dto.overview.length > 40);
  assert.equal(dto.posterUrl, 'https://images.example/matrix-poster.jpg');
  assert.equal(dto.backdropUrl, 'https://images.example/matrix-backdrop.jpg');
  assert.equal(dto.cast[0].name, 'Keanu Reeves');
  assert.deepEqual(dto.directors, ['Lana Wachowski', 'Lilly Wachowski']);
  assert.deepEqual(dto.productionCompanies, ['Warner Bros.']);
  assert.equal(dto.trailerUrl, 'https://www.youtube.com/watch?v=vKQi3bBA1y8');
  assert.equal(dto.sourceUrl, 'https://www.themoviedb.org/movie/603');
  for (const forbidden of ['tmdbId', 'tmdbUrl', 'vidlinkId', 'playerUrl']) {
    assert.equal(Object.hasOwn(dto, forbidden), false, forbidden + ' must not become a Movie catalog key or player URL');
  }
});

test('TV DTO is keyed by TMDB TV ID while retaining IMDb only as an external reference', () => {
  const dto = tvSeriesDto({
    _id: '507f1f77bcf86cd799439012',
    tmdbId: 1399,
    externalImdbId: 'tt0944947',
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
    genres: ['Drama']
  });
  assert.equal(dto.tmdbId, 1399);
  assert.equal(dto.tmdbUrl, 'https://www.themoviedb.org/tv/1399');
  assert.equal(dto.externalImdbId, 'tt0944947');
  assert.equal(Object.hasOwn(dto, 'imdbId'), false);
  assert.equal(dto.playerAvailable, undefined);
  assert.equal(Object.hasOwn(dto, 'vidlinkId'), false);
  assert.equal(dto.seasons[0].seasonNumber, 1);
  assert.equal(dto.posterUrl, 'https://images.example/got.jpg');
  assert.equal(dto.runtime, null);
  assert.equal(dto.numberOfSeasons, 8);
  assert.equal(dto.numberOfEpisodes, 73);
  assert.equal(dto.adult, false);
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

test('Movie schema remains IMDb-keyed while TV schema requires a unique TMDB ID', () => {
  const movieError = new Movie({ title: 'Movie without IMDb ID' }).validateSync();
  const tvError = new TvSeries({ title: 'TV without TMDB ID' }).validateSync();
  const animeError = new AnimeSeries({ title: 'Anime without MAL ID' }).validateSync();
  assert.ok(movieError.errors.imdbId);
  assert.ok(tvError.errors.tmdbId);
  assert.ok(animeError.errors.malId);
  assert.equal(Movie.schema.path('tmdbId'), undefined);
  assert.equal(Movie.schema.path('vidlinkId'), undefined);
  assert.equal(TvSeries.schema.path('imdbId'), undefined);
  assert.equal(TvSeries.schema.path('vidlinkId'), undefined);
  assert.ok(TvSeries.schema.indexes().some(([keys, options]) => keys.tmdbId === 1 && options.unique === true));
  assert.ok(Movie.schema.indexes().some(([keys, options]) => keys.imdbId === 1 && options.unique === true));
});

test('public Movie and TV APIs validate their distinct identifier formats', async () => {
  const movie = await app.request('/api/movies/27205');
  const tv = await app.request('/api/tv/tt0944947');
  const tvSeason = await app.request('/api/tv/tt0944947/seasons/1');
  const moviePlayer = await app.request('/api/player/movie/tt1375666');
  const tvPlayer = await app.request('/api/player/tv/tt0944947/1/1');
  assert.equal(movie.status, 400);
  assert.equal(tv.status, 400);
  assert.equal(tvSeason.status, 400);
  assert.equal(moviePlayer.status, 404);
  assert.equal(tvPlayer.status, 404);
});


test('VidLink movie URLs remain IMDb-based while TV URLs use numeric TMDB IDs', () => {
  const movieUrl = new URL(vidlinkMovieUrl('tt0848228'));
  assert.equal(movieUrl.origin + movieUrl.pathname, 'https://vidlink.pro/movie/tt0848228');
  assert.equal(movieUrl.searchParams.get('primaryColor'), 'e8b65b');
  assert.equal(movieUrl.searchParams.get('secondaryColor'), '171a23');
  const tvUrl = new URL(vidlinkTvUrl(1399, 1, 1));
  assert.equal(tvUrl.origin + tvUrl.pathname, 'https://vidlink.pro/tv/1399/1/1');
  assert.equal(tvUrl.searchParams.get('primaryColor'), 'e8b65b');
  assert.equal(tvUrl.searchParams.get('secondaryColor'), '171a23');
  const tvSpecialUrl = new URL(vidlinkTvUrl('1399', 0, 1));
  assert.equal(tvSpecialUrl.pathname, '/tv/1399/0/1');
  assert.equal(vidlinkMovieUrl('24428'), null);
  assert.equal(vidlinkTvUrl('tt0944947', 1, 1), null);
  assert.equal(vidlinkTvUrl('1399', -1, 1), null);
  assert.equal(vidlinkTvUrl('1399', 1, 0), null);
  assert.deepEqual(normalizeTvPlayerRoute('1399', '1', '1'), { tmdbId: 1399, season: 1, episode: 1 });
  assert.equal(normalizeTvPlayerRoute('tt0944947', '1', '1'), null);
});

test('Hindi movie player URL receives the same validated IMDb ID and gold theme', () => {
  const hindiUrl = new URL(hindiMoviePlayerUrl('tt4154796'));
  assert.equal(hindiUrl.origin + hindiUrl.pathname, 'https://slast430did.com/play/tt4154796');
  assert.equal(hindiUrl.searchParams.get('id'), null);
  assert.equal(hindiUrl.searchParams.get('primaryColor'), 'e8b65b');
  assert.equal(hindiUrl.searchParams.get('secondaryColor'), '171a23');
  assert.equal(hindiMoviePlayerUrl('24428'), null);
  assert.equal(hindiMoviePlayerUrl('javascript:alert(1)'), null);
});


test('global search returns an empty list for short queries without touching the database', async () => {
  const response = await app.request('/api/search?q=a');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [] });
});

test('TVmaze importer matches exact candidate titles and maps verified season/episode metadata', async () => {
  const { mapTvmazeShow, normalizeShowName, stripHtml, isExactTvmazeMatch } = await import('../scripts/seed-tv-series.js');
  assert.equal(normalizeShowName('Pokémon & Friends'), 'pokemon and friends');
  assert.equal(stripHtml('<p>Hello &amp; welcome</p>'), 'Hello & welcome');
  const candidate = {
    tmdbId: 991234,
    title: 'Example Show',
    firstAirDate: '2015-01-01',
    posterUrl: 'https://image.tmdb.org/t/p/w500/example-poster.jpg',
    genres: ['Drama']
  };
  const show = {
    id: 321,
    url: 'https://www.tvmaze.com/shows/321/example-show',
    name: 'Example Show',
    type: 'Scripted',
    status: 'Ended',
    premiered: '2015-01-01',
    runtime: 44,
    averageRuntime: 45,
    weight: 77,
    rating: { average: 8.4 },
    genres: ['Drama', 'Mystery'],
    image: { medium: 'https://images.example/poster-medium.jpg', original: 'https://images.example/poster.jpg' },
    externals: { imdb: 'tt1234567' },
    summary: '<p>This is a sufficiently detailed example synopsis for the importer test and it contains enough descriptive text to pass the extended catalogue quality check.</p>',
    _embedded: {
      episodes: [
        { id: 1, season: 1, number: 1, name: 'Pilot', airdate: '2015-01-01', runtime: 45, summary: '<p>First episode.</p>', rating: { average: 8 }, image: { original: 'https://images.example/episode-1.jpg' } },
        { id: 2, season: 1, number: 2, name: 'The Mystery', airdate: '2015-01-08', runtime: 45, summary: '<p>Second episode.</p>', rating: { average: 8.2 }, image: { medium: 'https://images.example/episode-2.jpg' } },
        { id: 3, season: 1, number: 3, name: 'The Discovery', airdate: '2015-01-15', runtime: 44, summary: '<p>Third episode.</p>', image: { original: 'https://images.example/episode-3.jpg' } },
        { id: 4, season: 1, number: 4, name: 'The Secret', airdate: '2015-01-22', runtime: 44, summary: '<p>Fourth episode.</p>', image: { original: 'https://images.example/episode-4.jpg' } },
        { id: 5, season: 1, number: 5, name: 'The Finale', airdate: '2015-01-29', runtime: 46, summary: '<p>Fifth episode.</p>', image: { original: 'https://images.example/episode-5.jpg' } }
      ]
    }
  };
  assert.equal(isExactTvmazeMatch(show, candidate), true);
  const mapped = mapTvmazeShow(show, candidate);
  assert.ok(mapped);
  assert.equal(mapped.tmdbId, 991234);
  assert.equal(mapped.externalImdbId, 'tt1234567');
  assert.equal(Object.hasOwn(mapped, 'imdbId'), false);
  assert.equal(mapped.metadataSource, 'TVmaze');
  assert.equal(mapped.adult, false);
  assert.equal(mapped.runtime, 45);
  assert.equal(mapped.numberOfEpisodes, 5);
  assert.equal(mapped.numberOfSeasons, 1);
  assert.equal(mapped.seasons[0].episodes[0].stillUrl, 'https://images.example/episode-1.jpg');
  assert.equal(mapped.seasons[0].episodes[1].stillUrl, 'https://images.example/episode-2.jpg');
  assert.equal(mapped.sourceUrl, 'https://www.tvmaze.com/shows/321');

  assert.equal(mapTvmazeShow({ ...show, name: 'Different Show' }, candidate), null);
  assert.equal(mapTvmazeShow({ ...show, genres: ['Adult'] }, candidate), null);
  assert.equal(mapTvmazeShow({ ...show, summary: '' }, candidate), null);
  assert.equal(mapTvmazeShow({ ...show, _embedded: { episodes: [] } }, candidate), null);
});
