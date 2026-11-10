# Situla

Situla is a mobile-first movie, TV and anime catalog built as a Next.js website. Catalog content is stored in MongoDB. Movie, TV and Anime catalog additions are curated in the repository as static data; the normal seed commands do not run crawlers or call IMDb, TMDB, TVmaze or MAL APIs.

## Identifiers and playback

- Movies: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. Playback uses `https://vidlink.pro/movie/{imdbId}`.
- TV series: numeric TMDB TV ID is the required unique Situla catalog key. Playback uses `https://vidlink.pro/tv/{tmdbId}/{season}/{episode}`. The detail route is `/tv/{tmdbId}`, and the player route is `/watch/tv/{tmdbId}/{season}/{episode}`.
- Anime: MAL ID is the required catalog and playback key. Playback uses `https://vidlink.pro/anime/{malId}/{episode}/{subOrDub}?fallback=true`. `sub` and `dub` are validated; the player can switch to the alternate audio.
- Movie, TV and Anime VidLink embeds share Situla's warm-gold player theme (`primaryColor=e8b65b`, `secondaryColor=171a23`). The optional Hindi Movie player uses the IMDb path format `https://slast430did.com/play/{imdbId}` with the same Situla theme.

The provider controls stream availability, resolution and audio tracks. Situla does not download or store copyrighted video files.

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` and `MONGODB_DB_NAME`.
4. Run `npm install`.
5. Run `npm run dev` to start only the local Next.js website at `http://localhost:3000`. It does not run a seed, crawler or migration.
6. Open `http://localhost:3000`. The health endpoint is `/api/health`.

## Static catalogue seed

The static lists are committed to the repository:

- `data/movie-catalog.js`: 70 curated Movie additions keyed by IMDb ID. The source shortlist is the public IMDb Top 250 JSON list; Situla stores catalogue facts (title, ID, poster reference, year, runtime, rating and genres), not its long plot descriptions.
- `data/tv-catalog.js`: 70 curated TV additions keyed by TMDB numeric ID. The source data is a curated TV dataset containing TMDB IDs, first-air dates, aggregate season/episode totals, genres and poster references.
- `data/anime-catalog.js`: 81 Anime entries keyed by MAL ID (the original 11 starter entries plus 70 additions). The source is a MIT-licensed seasonal Anime dataset; long synopsis text is not copied.

Run all three lists with one command:

```sh
npm run seed:catalog
```

Or seed one category only:

```sh
npm run seed:movies
npm run seed:tv
npm run seed:anime
```

These commands only read the committed JavaScript data files and write to MongoDB using bulk upserts. They do not call any metadata API, crawl a website, or require TMDB/MAL credentials. Each upsert uses `$setOnInsert`: existing records with the same primary ID are left untouched, and the terminal reports how many records were added versus already present. The one-time run requires only `MONGODB_URI` and `MONGODB_DB_NAME` in `.env`, plus Atlas network access for your current IP.

The 70 new static TV entries include season and overall episode totals but deliberately do not invent per-season or per-episode metadata. Their detail pages let the viewer enter season and episode numbers directly for VidLink playback. Existing TV entries that already have full episode guides continue to use the season/episode dropdown and guide.

The seed scripts are separate from the development server. `npm run dev` never runs a seed automatically.

## Legacy TV identifier migration

For an older database that still stores TV primary IDs as IMDb IDs, the optional legacy migration is:

```sh
npm run migrate:tv-tmdb
```

This legacy migration resolves old IMDb cross-references through TMDB and therefore requires `TMDB_API_READ_ACCESS_TOKEN` or `TMDB_API_KEY`. It is not part of any static seed command and is not needed for the new static TMDB-keyed TV records. Back up MongoDB before running a migration. Movie documents and Anime/MAL IDs are not changed.

## Manual catalogue maintenance

Edit the corresponding file under `data/` to add another static record:

- Movie: unique `imdbId` matching `tt...`.
- TV series: unique positive numeric `tmdbId`, with `numberOfSeasons` and `numberOfEpisodes`. Add embedded `seasons` and `episodes` only when you have verified episode-level data.
- Anime: unique positive numeric `malId`, with `type: "TV"` or `"ONA"`.

The public API remains read-only for catalogue data; there are no public admin or crawler endpoints.

## Metadata sources and limitations

- Movie IDs and factual catalogue fields are curated from the [IMDb Top 250 public-list dataset](https://github.com/sharmadhiraj/free-json-datasets/blob/master/docs/sports-entertainment/imdb_top_movies.json).
- The static TV additions use the [Vetustas Archiva TV dataset](https://github.com/0xShady/vetustas-archiva/tree/main/datasets), which is MIT-licensed. TMDB links identify the corresponding series records.
- Static Anime additions use the [Anime Stats Tracker seasonal dataset](https://github.com/zyhe16/anime-stats-tracker), which is MIT-licensed. The primary IDs remain MyAnimeList IDs.
- Some previously imported TV records retain TVmaze-sourced metadata and episode guides. Their TVmaze source links and existing guide remain intact.
- Poster images are stored as external image URLs; Situla does not re-host those image files.
- In the About section, Situla displays the TMDB notice: “This product uses the TMDB API but is not endorsed or certified by TMDB.”

## API

- `GET /api/health`
- `GET /api/movies?page=1&limit=40`
- `GET /api/movies/discover`
- `GET /api/movies/suggestions?q=inception`
- `GET /api/search?q=the+office` (searches Movies, TV series and Anime together)
- `GET /api/movies/:imdbId`
- `GET /api/tv?page=1&limit=40`
- `GET /api/tv/:tmdbId`
- `GET /api/tv/:tmdbId/seasons/:seasonNumber`
- `GET /api/anime?page=1&limit=40`
- `GET /api/anime/:malId`

## Browser access

The website is restricted to Brave Browser only. Brave is recognized through its documented `Sec-CH-UA` brand hint when supplied, with a browser-side `navigator.brave.isBrave()` verification fallback. Successful Brave verification is cached in a first-party cookie for up to 400 days.

The native Android app, source project, and Android build workflow have been permanently removed from this repository. Existing Android app builds are not allowed to access the website.
