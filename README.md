# Situla

Situla is a mobile-first movie, TV and anime catalog built as a Next.js website. Catalog content is stored in MongoDB. Movies and anime remain manually maintained; the TV catalogue uses TMDB numeric IDs and has an idempotent TVmaze metadata/episode-guide importer that is run separately from the development server.

## Identifiers and playback

- Movies: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. After the Movie record is found in MongoDB, the player is requested directly at `https://vidlink.pro/movie/{imdbId}`.
- TV series: TMDB numeric TV ID is the required unique Situla catalog key. Metadata, posters, episode stills and episode guides remain sourced from TVmaze and stored in MongoDB. Each episode is requested directly at `https://vidlink.pro/tv/{tmdbId}/{season}/{episode}`. The detail route is `/tv/{tmdbId}`, and playback uses `/watch/tv/{tmdbId}/{season}/{episode}`. The series page includes the same episode guide and next-episode navigation.
- The previous TV IMDb value is retained only as the optional `externalImdbId` cross-reference for migration/progress compatibility; it is not used as the TV route or playback ID.
- Anime: MAL ID remains the anime key. Episode playback uses `https://vidlink.pro/anime/{malId}/{episode}/{subOrDub}?fallback=true`; the `sub`/`dub` segment is validated and the alternate audio can be tried from the player.

Movie watch pages keep the optional Hindi player switch using the path-based IMDb format `https://slast430did.com/play/{imdbId}`; Movie English playback remains `https://vidlink.pro/movie/{imdbId}`. TV playback uses the numeric TMDB ID in VidLink's TV path. Anime continues to use MAL IDs. The player provider still controls stream availability, resolution and audio tracks.

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` and `MONGODB_DB_NAME`.
4. Set either `TMDB_API_READ_ACCESS_TOKEN` (preferred) or `TMDB_API_KEY` in `.env`. TMDB credentials are used only server-side to resolve TVmaze's IMDb cross-reference into a numeric TMDB TV ID.
5. Run `npm install`.
6. Run `npm run dev` to start only the local Next.js website at `http://localhost:3000`. This command does not connect to MongoDB or run any seed/migration task.
7. Open `http://localhost:3000` and check `/api/health`.

To import or update the TV catalogue, run the crawler separately (it requires MongoDB and TMDB credentials in `.env`):

```sh
npm run seed:tv
```

To refresh the curated TVmaze metadata and episode guides, even when 65 or more imported records already exist:

```sh
SEED_TV_FORCE=true npm run seed:tv
```

The importer requires MongoDB settings, one TMDB credential, and internet access to both `api.tvmaze.com` and `api.themoviedb.org`. It resolves each curated TVmaze show to its external IMDb reference, calls TMDB's `/find/{external_id}?external_source=imdb_id` endpoint to obtain the numeric TV ID, then stores that `tmdbId` alongside the existing TVmaze posters, stills, full episode lists, summaries, dates, runtimes, genres, status and rating. Series without a confident TMDB match are skipped rather than being assigned an incorrect ID.

## Existing database migration

Back up MongoDB before running a migration. For an existing Situla database that still stores TV series by IMDb ID, run:

```sh
npm run migrate:tv-tmdb
```

The migration uses each legacy TV record's IMDb reference to ask TMDB for the matching TV result. It adds the numeric `tmdbId`, keeps the prior value as `externalImdbId`, and removes the obsolete TV `imdbId` primary-key field. Existing poster data, episode guides, seasons, and playback progress on the device are preserved. Movie documents and Anime/MAL IDs are not changed. Records that cannot be confidently matched are left untouched and reported as unresolved; they will not appear in the TMDB-keyed TV API until corrected.

The `npm run seed:tv` command performs this migration automatically before importing TV metadata. Starting the website with `npm run dev` does not run this migration or the crawler. The migration is idempotent and can be run more than once.

The existing poster files may still be hosted on the old image CDN; this migration stores them as direct URLs but does not re-host the image bytes. To remove that CDN host too, manually replace poster/backdrop URLs with images hosted on your own storage.

## Manual catalog maintenance

Use MongoDB Compass, Atlas Data Explorer, or a controlled database script to insert/update catalog documents.

Movie document minimum fields: `imdbId`, `title`, plus optional `posterUrl`, `releaseYear`, `voteAverage`, and `genres`.

TV document minimum fields: numeric `tmdbId`, `title`, and an embedded `seasons` array containing `seasonNumber` and `episodes`. `externalImdbId` is optional cross-reference metadata and is not used as the TV player key.

Anime is added manually; there is no Anime crawler and no Jikan/MAL API call in the manual seed command. Starter entries and the editable source list live in `data/anime-catalog.js`. Add one object per MyAnimeList entry with a numeric `malId`, `title`, `type: "TV"` (or `"ONA"`) and optional metadata such as `episodes`, `posterUrl`, `synopsis`, `genres` and `score`. Then run:

```sh
npm run seed:anime
```

The command writes only to the Anime collection, inserts missing MAL IDs, and leaves already-existing records untouched. It does not crawl or call any external metadata service. Anime playback validates the MAL ID, one-based episode number and `sub`/`dub` path segment. Situla requests VidLink's `fallback=true` option and provides a player control to manually switch to the other audio track.

The public API is read-only for catalog data. There are no write routes or privileged admin endpoints exposed by the application. The TV seed script writes directly to MongoDB during local development only; it is not exposed as a public API route.


## TV metadata attribution and limitations

TV series metadata, posters and episode stills imported by Situla come from the [TVmaze public API](https://www.tvmaze.com/api), which is licensed under CC BY-SA. Situla links back to each TVmaze show page on the series detail screen. The rating value shown for imported series is TVmaze's rating, not an IMDb user rating. Numeric TV IDs are resolved through the TMDB API's [Find by external ID](https://developer.themoviedb.org/docs/finding-data) endpoint. In the About section, Situla displays the TMDB attribution notice: “This product uses the TMDB API but is not endorsed or certified by TMDB.” The public TVmaze show response does not provide a parental certification field, so Situla leaves `certification` blank rather than inventing a TV rating. The importer filters the curated allowlist and rejects any source record tagged with the Adult genre.

The importer stores metadata and episode-guide information only. It does not download, store, or redistribute copyrighted episode video files. TV playback remains a separate external-provider service; available resolution, audio tracks and stream stability are controlled by that provider and cannot be guaranteed or forced by Situla's parent page.

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
