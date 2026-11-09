import 'dotenv/config';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { connectDatabase } from './db.js';
import { Movie, TvSeries, AnimeSeries } from './models.js';

const app = new Hono();
const IMDB_ID = /^tt\d{5,12}$/i;

app.use('*', logger());
app.use('*', async (c, next) => {
  await next();
  const isPlayerRedirect = c.req.path.startsWith('/api/player/');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', isPlayerRedirect ? 'SAMEORIGIN' : 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), picture-in-picture=(), fullscreen=(self "https://vidlink.pro"), autoplay=(self "https://vidlink.pro")');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net data:; img-src 'self' data: https:; frame-src https://vidlink.pro; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors " + (isPlayerRedirect ? "'self'" : "'none'"));
});
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

function pageOptions(c, defaultLimit = 20, maxLimit = 40) {
  const requestedPage = Number(c.req.query('page') || 1);
  const requestedLimit = Number(c.req.query('limit') || defaultLimit);
  return {
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1,
    limit: Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, maxLimit) : defaultLimit
  };
}

function safeText(value) {
  return String(value || '').trim().slice(0, 80);
}

export function movieDto(movie) {
  const imdbId = String(movie.imdbId || '').toLowerCase();
  return {
    id: String(movie._id),
    imdbId,
    imdbUrl: IMDB_ID.test(imdbId) ? 'https://www.imdb.com/title/' + imdbId + '/' : null,
    playerAvailable: Number(movie.vidlinkId) > 0,
    title: movie.title,
    originalTitle: movie.originalTitle || '',
    overview: movie.overview || '',
    posterUrl: movie.posterUrl || null,
    backdropUrl: movie.backdropUrl || null,
    releaseDate: movie.releaseDate || null,
    releaseYear: movie.releaseYear || null,
    runtime: movie.runtime || null,
    voteAverage: Number(movie.voteAverage) || 0,
    voteCount: Number(movie.voteCount) || 0,
    popularity: Number(movie.popularity) || 0,
    genres: Array.isArray(movie.genres) ? movie.genres : [],
    keywords: Array.isArray(movie.keywords) ? movie.keywords : [],
    certification: movie.certification || '',
    createdAt: movie.createdAt,
    updatedAt: movie.updatedAt
  };
}

export function tvSeriesDto(series) {
  const imdbId = String(series.imdbId || '').toLowerCase();
  return {
    id: String(series._id),
    imdbId,
    imdbUrl: IMDB_ID.test(imdbId) ? 'https://www.imdb.com/title/' + imdbId + '/' : null,
    playerAvailable: Number(series.vidlinkId) > 0,
    title: series.title,
    originalTitle: series.originalTitle || '',
    overview: series.overview || '',
    posterUrl: series.posterUrl || null,
    backdropUrl: series.backdropUrl || null,
    firstAirDate: series.firstAirDate || null,
    releaseYear: series.releaseYear || null,
    voteAverage: Number(series.voteAverage) || 0,
    voteCount: Number(series.voteCount) || 0,
    popularity: Number(series.popularity) || 0,
    genres: Array.isArray(series.genres) ? series.genres : [],
    keywords: Array.isArray(series.keywords) ? series.keywords : [],
    numberOfSeasons: Number(series.numberOfSeasons) || (series.seasons || []).length,
    numberOfEpisodes: Number(series.numberOfEpisodes) || (series.seasons || []).reduce((sum, season) => sum + (Number(season.episodeCount) || 0), 0),
    seasons: (series.seasons || []).map((season) => ({
      seasonNumber: season.seasonNumber,
      name: season.name || '',
      airDate: season.airDate || null,
      episodeCount: Number(season.episodeCount) || (season.episodes || []).length,
      posterUrl: season.posterUrl || null
    })),
    status: series.status || '',
    certification: series.certification || ''
  };
}

export function tvSeasonDto(season) {
  return {
    seasonNumber: season.seasonNumber,
    name: season.name || '',
    overview: season.overview || '',
    airDate: season.airDate || null,
    episodeCount: Number(season.episodeCount) || (season.episodes || []).length,
    posterUrl: season.posterUrl || null,
    episodes: (season.episodes || []).map((episode) => ({
      episodeNumber: episode.episodeNumber,
      name: episode.name || '',
      overview: episode.overview || '',
      airDate: episode.airDate || null,
      runtime: episode.runtime || null,
      stillUrl: episode.stillUrl || null,
      voteAverage: Number(episode.voteAverage) || 0
    }))
  };
}

export function animeSeriesDto(anime) {
  return {
    id: String(anime._id),
    malId: anime.malId,
    malUrl: 'https://myanimelist.net/anime/' + anime.malId,
    title: anime.title,
    titleEnglish: anime.titleEnglish || '',
    titleJapanese: anime.titleJapanese || '',
    synopsis: anime.synopsis || '',
    posterUrl: anime.posterUrl || null,
    trailerUrl: anime.trailerUrl || null,
    airedFrom: anime.airedFrom || null,
    releaseYear: anime.releaseYear || null,
    episodes: anime.episodes ?? null,
    duration: anime.duration || '',
    score: Number(anime.score) || 0,
    scoredBy: Number(anime.scoredBy) || 0,
    rank: anime.rank ?? null,
    popularity: anime.popularity ?? null,
    status: anime.status || '',
    season: anime.season || '',
    type: anime.type || 'TV',
    source: anime.source || '',
    genres: Array.isArray(anime.genres) ? anime.genres : [],
    themes: Array.isArray(anime.themes) ? anime.themes : [],
    demographics: Array.isArray(anime.demographics) ? anime.demographics : [],
    rating: anime.rating || ''
  };
}

app.get('/api/health', async (c) => {
  const required = ['MONGODB_URI', 'MONGODB_DB_NAME'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) return c.json({ status: 'needs_configuration', missing, database: 'not_checked' }, 503);
  try {
    await connectDatabase();
    await Movie.db.db.admin().ping();
    return c.json({ status: 'ok', service: 'situla-backend', database: 'connected' });
  } catch (error) {
    console.error('Health check failed:', error.message);
    return c.json({ status: 'error', database: 'unavailable' }, 503);
  }
});

const MOVIE_CATEGORIES = [
  { key: 'action', name: 'Action' },
  { key: 'adventure', name: 'Adventure' },
  { key: 'science-fiction', name: 'Science Fiction' },
  { key: 'fantasy', name: 'Fantasy' },
  { key: 'mystery', name: 'Mystery' },
  { key: 'horror', name: 'Horror' }
];

app.get('/api/movies/discover', async (c) => {
  try {
    await connectDatabase();
    const baseFilter = { imdbId: IMDB_ID, adult: { $ne: true } };
    const facets = {
      featured: [{ $sample: { size: 1 } }],
      items: [{ $sort: { popularity: -1, releaseDate: -1 } }, { $limit: 40 }],
      total: [{ $count: 'value' }]
    };
    for (const category of MOVIE_CATEGORIES) {
      facets[category.key] = [
        { $match: { genres: category.name } },
        { $sort: { popularity: -1, releaseDate: -1 } },
        { $limit: 18 }
      ];
    }
    const [result] = await Movie.aggregate([{ $match: baseFilter }, { $facet: facets }]);
    const categories = MOVIE_CATEGORIES.map((category) => ({
      key: category.key,
      name: category.name === 'Science Fiction' ? 'Sci-Fi' : category.name,
      genre: category.name,
      items: (result?.[category.key] || []).map(movieDto)
    })).filter((category) => category.items.length > 0);
    const total = Number(result?.total?.[0]?.value || 0);
    return c.json({
      featured: result?.featured?.[0] ? movieDto(result.featured[0]) : null,
      items: (result?.items || []).map(movieDto),
      categories,
      pagination: { page: 1, limit: 40, total, totalPages: Math.ceil(total / 40) }
    });
  } catch (error) {
    console.error('Movie discovery feed failed:', error.message);
    return c.json({ error: 'Movie discovery is temporarily unavailable.' }, 503);
  }
});

app.get('/api/movies/suggestions', async (c) => {
  try {
    await connectDatabase();
    const query = safeText(c.req.query('q'));
    if (query.length < 2) return c.json({ items: [] });
    if (IMDB_ID.test(query)) {
      const direct = await Movie.findOne({ imdbId: query.toLowerCase() }).lean();
      return c.json({ items: direct ? [movieDto(direct)] : [] });
    }
    const escaped = (value) => value.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
    const tokens = [...new Set(query.toLowerCase().split(/\s+/).filter((token) => token.length >= 2))].slice(0, 6);
    const patterns = tokens.map((token) => new RegExp(escaped(token), 'i'));
    const candidates = await Movie.find({
      imdbId: IMDB_ID,
      title: { $in: patterns }
    }).sort({ popularity: -1, releaseDate: -1 }).limit(40).lean();
    const normalized = query.toLowerCase();
    const ranked = candidates.map((item) => {
      const title = String(item.title || '').toLowerCase();
      const hits = tokens.reduce((count, token) => count + (title.includes(token) ? 1 : 0), 0);
      return { item, score: hits * 10 + (title.includes(normalized) ? 20 : 0) + Math.min(9, Number(item.popularity || 0) / 100) };
    }).sort((a, b) => b.score - a.score);
    return c.json({ items: ranked.slice(0, 8).map(({ item }) => movieDto(item)) });
  } catch (error) {
    console.error('Movie suggestions failed:', error.message);
    return c.json({ items: [], warning: 'Suggestions are temporarily unavailable.' });
  }
});

app.get('/api/movies', async (c) => {
  try {
    await connectDatabase();
    const { page, limit } = pageOptions(c);
    const year = Number(c.req.query('year') || 0);
    const query = safeText(c.req.query('q'));
    const genre = safeText(c.req.query('genre'));
    const filter = { imdbId: IMDB_ID, adult: { $ne: true } };
    if (year >= 1870 && year <= new Date().getFullYear()) filter.releaseYear = year;
    if (genre) filter.genres = genre;
    if (IMDB_ID.test(query)) filter.imdbId = query.toLowerCase();
    else if (query) filter.$text = { $search: query };
    const sort = query && !IMDB_ID.test(query)
      ? { score: { $meta: 'textScore' }, popularity: -1, releaseDate: -1 }
      : { popularity: -1, releaseDate: -1 };
    const randomOrder = c.req.query('random') === 'true';
    const [items, total] = await Promise.all([
      randomOrder
        ? Movie.aggregate([
            { $match: filter },
            { $sample: { size: Math.min(page * limit, 1000) } },
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ])
        : Movie.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Movie.countDocuments(filter)
    ]);
    return c.json({ items: items.map(movieDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Movie catalog read failed:', error.message);
    return c.json({ error: 'Movie catalog is temporarily unavailable.' }, 503);
  }
});

app.get('/api/movies/:imdbId', async (c) => {
  const imdbId = String(c.req.param('imdbId') || '').toLowerCase();
  if (!IMDB_ID.test(imdbId)) return c.json({ error: 'Invalid IMDb title ID.' }, 400);
  try {
    await connectDatabase();
    const movie = await Movie.findOne({ imdbId }).lean();
    if (!movie) return c.json({ error: 'Movie not found.' }, 404);
    return c.json({ item: movieDto(movie), playerAvailable: Number(movie.vidlinkId) > 0 });
  } catch (error) {
    console.error('IMDb movie detail read failed:', error.message);
    return c.json({ error: 'Movie details are temporarily unavailable.' }, 503);
  }
});

app.get('/api/player/movie/:imdbId', async (c) => {
  const imdbId = String(c.req.param('imdbId') || '').toLowerCase();
  if (!IMDB_ID.test(imdbId)) return c.json({ error: 'Invalid IMDb title ID.' }, 400);
  try {
    await connectDatabase();
    const movie = await Movie.findOne({ imdbId }).select('vidlinkId').lean();
    const vidlinkId = Number(movie?.vidlinkId) || 0;
    if (!Number.isSafeInteger(vidlinkId) || vidlinkId <= 0) {
      return c.json({ error: 'No VidLink provider mapping is saved for this IMDb title.' }, 404);
    }
    const params = new URLSearchParams({
      primaryColor: 'e8b65b',
      secondaryColor: '171a23',
      iconColor: 'ffffff',
      icons: 'default',
      player: 'default',
      title: 'false',
      poster: 'true',
      autoplay: 'false',
      nextbutton: 'false'
    });
    const startAt = Number(c.req.query('startAt') || 0);
    if (Number.isFinite(startAt) && startAt > 0) params.set('startAt', String(Math.min(86400, Math.floor(startAt))));
    return c.redirect('https://vidlink.pro/movie/' + vidlinkId + '?' + params.toString(), 302);
  } catch (error) {
    console.error('IMDb movie player redirect failed:', error.message);
    return c.json({ error: 'Movie playback is temporarily unavailable.' }, 503);
  }
});

app.get('/api/player/tv/:imdbId/:seasonNumber/:episodeNumber', async (c) => {
  const imdbId = String(c.req.param('imdbId') || '').toLowerCase();
  const seasonNumber = Number(c.req.param('seasonNumber'));
  const episodeNumber = Number(c.req.param('episodeNumber'));
  if (!IMDB_ID.test(imdbId) || !Number.isSafeInteger(seasonNumber) || seasonNumber < 0 ||
      !Number.isSafeInteger(episodeNumber) || episodeNumber < 1) {
    return c.json({ error: 'Invalid IMDb series, season, or episode.' }, 400);
  }
  try {
    await connectDatabase();
    const series = await TvSeries.findOne({ imdbId }).select('vidlinkId').lean();
    const vidlinkId = Number(series?.vidlinkId) || 0;
    if (!Number.isSafeInteger(vidlinkId) || vidlinkId <= 0) {
      return c.json({ error: 'No VidLink provider mapping is saved for this IMDb series.' }, 404);
    }
    const params = new URLSearchParams({
      primaryColor: 'e8b65b',
      secondaryColor: '171a23',
      iconColor: 'ffffff',
      icons: 'default',
      player: 'default',
      title: 'false',
      poster: 'true',
      autoplay: 'false',
      nextbutton: 'true'
    });
    const startAt = Number(c.req.query('startAt') || 0);
    if (Number.isFinite(startAt) && startAt > 0) params.set('startAt', String(Math.min(86400, Math.floor(startAt))));
    const target = 'https://vidlink.pro/tv/' + vidlinkId + '/' + seasonNumber + '/' + episodeNumber + '?' + params.toString();
    return c.redirect(target, 302);
  } catch (error) {
    console.error('IMDb TV player redirect failed:', error.message);
    return c.json({ error: 'TV playback is temporarily unavailable.' }, 503);
  }
});

app.get('/api/tv', async (c) => {
  try {
    await connectDatabase();
    const { page, limit } = pageOptions(c);
    const query = safeText(c.req.query('q'));
    const filter = { imdbId: IMDB_ID, adult: { $ne: true } };
    if (IMDB_ID.test(query)) filter.imdbId = query.toLowerCase();
    else if (query) filter.$text = { $search: query };
    const sort = query && !IMDB_ID.test(query)
      ? { score: { $meta: 'textScore' }, popularity: -1, firstAirDate: -1 }
      : { popularity: -1, firstAirDate: -1 };
    const randomOrder = c.req.query('random') === 'true';
    const [items, total] = await Promise.all([
      randomOrder
        ? TvSeries.aggregate([
            { $match: filter },
            { $sample: { size: Math.min(page * limit, 1000) } },
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ])
        : TvSeries.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      TvSeries.countDocuments(filter)
    ]);
    return c.json({ items: items.map(tvSeriesDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('TV catalog read failed:', error.message);
    return c.json({ error: 'TV catalog is temporarily unavailable.' }, 503);
  }
});

app.get('/api/tv/:imdbId/seasons/:seasonNumber', async (c) => {
  const imdbId = String(c.req.param('imdbId') || '').toLowerCase();
  const seasonNumber = Number(c.req.param('seasonNumber'));
  if (!IMDB_ID.test(imdbId) || !Number.isSafeInteger(seasonNumber) || seasonNumber < 0) {
    return c.json({ error: 'Invalid IMDb series or season ID.' }, 400);
  }
  try {
    await connectDatabase();
    const series = await TvSeries.findOne({ imdbId }).select('seasons').lean();
    if (!series) return c.json({ error: 'TV series not found.' }, 404);
    const season = (series.seasons || []).find((item) => Number(item.seasonNumber) === seasonNumber);
    if (!season) return c.json({ error: 'Season not found.' }, 404);
    return c.json({ item: tvSeasonDto(season) });
  } catch (error) {
    console.error('TV season read failed:', error.message);
    return c.json({ error: 'TV season episodes are temporarily unavailable.' }, 503);
  }
});

app.get('/api/tv/:imdbId', async (c) => {
  const imdbId = String(c.req.param('imdbId') || '').toLowerCase();
  if (!IMDB_ID.test(imdbId)) return c.json({ error: 'Invalid IMDb series ID.' }, 400);
  try {
    await connectDatabase();
    const item = await TvSeries.findOne({ imdbId }).lean();
    if (!item) return c.json({ error: 'TV series not found.' }, 404);
    return c.json({ item: tvSeriesDto(item) });
  } catch (error) {
    console.error('TV detail read failed:', error.message);
    return c.json({ error: 'TV series details are temporarily unavailable.' }, 503);
  }
});

app.get('/api/anime', async (c) => {
  try {
    await connectDatabase();
    const { page, limit } = pageOptions(c);
    const query = safeText(c.req.query('q'));
    const filter = { type: { $in: ['TV', 'ONA'] } };
    if (/^\d+$/.test(query)) filter.malId = Number(query);
    else if (query) filter.$text = { $search: query };
    const sort = query && !/^\d+$/.test(query)
      ? { score: { $meta: 'textScore' }, rank: 1, popularity: 1 }
      : { rank: 1, score: -1, popularity: 1 };
    const randomOrder = c.req.query('random') === 'true';
    const [items, total] = await Promise.all([
      randomOrder
        ? AnimeSeries.aggregate([
            { $match: filter },
            { $sample: { size: Math.min(page * limit, 1000) } },
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ])
        : AnimeSeries.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      AnimeSeries.countDocuments(filter)
    ]);
    return c.json({ items: items.map(animeSeriesDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Anime catalog read failed:', error.message);
    return c.json({ error: 'Anime catalog is temporarily unavailable.' }, 503);
  }
});

app.get('/api/anime/:malId', async (c) => {
  const malId = Number(c.req.param('malId'));
  if (!Number.isSafeInteger(malId) || malId <= 0) return c.json({ error: 'Invalid MyAnimeList ID.' }, 400);
  try {
    await connectDatabase();
    const item = await AnimeSeries.findOne({ malId, type: { $in: ['TV', 'ONA'] } }).lean();
    if (!item) return c.json({ error: 'Anime series not found.' }, 404);
    return c.json({ item: animeSeriesDto(item) });
  } catch (error) {
    console.error('Anime detail read failed:', error.message);
    return c.json({ error: 'Anime details are temporarily unavailable.' }, 503);
  }
});

app.notFound((c) => c.json({ error: 'Not found.' }, 404));
app.onError((error, c) => {
  console.error('Unhandled application error:', error.message);
  return c.json({ error: 'Internal server error.' }, 500);
});

export default app;
