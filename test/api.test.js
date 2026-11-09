import test from 'node:test';
import assert from 'node:assert/strict';
import app, { movieDto } from '../src/app.js';

test('admin dashboard routes reject requests without a session cookie', async () => {
  const response = await app.request('/api/admin/dashboard');
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.match(body.error, /Authentication required/);
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
    body: JSON.stringify({ source: 'imdb', ids: ['tt1375666'] })
  });
  assert.equal(response.status, 401);
});


test('movie API DTO exposes metadata and TMDB ID but never player/embed URLs or iframe HTML', () => {
  const dto = movieDto({
    _id: '507f1f77bcf86cd799439011',
    tmdbId: 27205,
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
    tmdbUrl: 'https://www.themoviedb.org/movie/27205',
    playbackUrl: 'https://player.example/should-not-be-returned',
    playerUrl: 'https://vidlink.pro/movie/27205',
    embedUrl: 'https://example.test/embed',
    iframeHtml: '<iframe src="https://example.test/embed"></iframe>'
  });

  assert.equal(dto.tmdbId, 27205);
  assert.equal(dto.title, 'Inception');
  assert.match(dto.posterUrl, /image\.tmdb\.org/);
  assert.match(dto.backdropUrl, /image\.tmdb\.org/);
  for (const forbidden of ['playbackUrl', 'playerUrl', 'embedUrl', 'iframeHtml']) {
    assert.equal(Object.hasOwn(dto, forbidden), false, forbidden + ' must never be returned by the movie API');
  }
});
