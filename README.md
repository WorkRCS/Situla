# Situla

Situla is a mobile-first movie, TV and anime catalog built as a Next.js website. Catalog content is stored in MongoDB. Movies and anime remain manually maintained; the TV catalogue has an idempotent TVmaze metadata/episode-guide importer that runs automatically before the development server starts.

## Identifiers and playback

- Movies: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. After the Movie record is found in MongoDB, the player is requested directly at `https://vidlink.pro/movie/{imdbId}`.
- TV series: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. Metadata, posters, episode stills and episode guides are sourced from TVmaze and stored in MongoDB. After the TV record is found in MongoDB, each episode is requested directly at `https://vidlink.pro/tv/{imdbId}/{season}/{episode}`. The series page includes an episode guide and the TV player offers next-episode navigation.
- No numeric provider/source ID is stored in the current schema or required by Situla's player code. The public routes remain `/watch/{imdbId}` and `/tv/{imdbId}`.
- Anime: MAL ID remains the anime key because VidLink's anime endpoint requires a MyAnimeList ID.

Movie watch pages provide an optional Hindi player switch using the path-based IMDb format `https://slast430did.com/play/{imdbId}`; English switches back to VidLink. The setting is remembered on the device and is limited to Movie playback. The Hindi player uses the path-based IMDb route verified from the working direct-play URL. Its available resolution and audio tracks remain provider-controlled; Situla does not force a mute or undocumented quality parameter. The iframe provider is VidLink Pro for English movies, TV and anime. Situla requests Movie and TV playback directly using IMDb title IDs, with no secondary numeric source ID. The current VidLink public documentation still lists numeric TMDB IDs for Movie/TV and does not document IMDb path support; successful playback with `tt...` therefore requires live provider verification. The published customization parameters do not document a way to hide the built-in CC/subtitle control. Situla disables browser Picture-in-Picture permission and leaves the VidLink iframe unsandboxed so the provider can load its player and source frames without sandbox restrictions. The website's parent page cannot reliably inspect or filter requests made inside a cross-origin iframe; complete provider-side ad removal cannot be guaranteed once sandboxing is disabled.

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` and `MONGODB_DB_NAME`.
4. Run `npm install`.
5. Run `npm run dev`. Its `predev` hook runs `npm run seed:tv` first. When the database has fewer than 65 imported TVmaze series, it resolves curated show names to IMDb IDs and upserts complete season/episode metadata, then starts Next.js. If 65 imported records already exist, it skips the import.
6. Open `http://localhost:3000` and check `/api/health`.

To run the TV importer manually:

```sh
npm run seed:tv
```

To refresh the curated TVmaze metadata and episode guides, even when 65 or more imported records already exist:

```sh
SEED_TV_FORCE=true npm run seed:tv
```

The importer requires `MONGODB_URI` and `MONGODB_DB_NAME` in `.env` and internet access to `api.tvmaze.com`. It resolves each curated series to its TVmaze external IMDb ID, requests the full TVmaze episode list, groups episodes into seasons, and stores posters, episode stills, summaries, air dates, episode runtimes, series runtime, genres, status and the provider's numeric rating. The initial import intentionally uses a conservative request pace and can take a while. It skips titles without a verifiable IMDb ID, poster, rating or episode list and requires at least 65 complete series before reporting success.

## Existing database migration

Back up the MongoDB database before migrating. The migration performs these operations:

- Deletes Movie records without a valid IMDb title ID (`tt` followed by 5–12 digits).
- Converts existing Movie and TV artwork paths to stored absolute artwork URLs.
- Changes TV series identity to IMDb IDs, moves cached season/episode data into each TV document, and removes the obsolete per-season cache collection.
- Deletes TV series that do not have a valid IMDb ID, because they cannot participate in the IMDb-only TV catalog.
- Removes legacy TMDB-named fields, old provider IDs, and obsolete crawler history.
- Retains anime records under MAL IDs.

First run the read-only audit to see the exact record counts. It also reports case-insensitive duplicate IMDb IDs and makes no database changes:

```powershell
npm run audit:imdb-only
```

After reviewing the counts and resolving any duplicate IMDb IDs, run the migration once, before deploying the new schema. The migration prints the invalid-ID counts again, deletes invalid Movie and TV documents, converts the valid records, and removes legacy TMDB/provider fields and cache collections:

```powershell
npm run migrate:imdb-only
```

The existing poster files may still be hosted on the old image CDN; this migration stores them as direct URLs but does not re-host the image bytes. To remove that CDN host too, manually replace poster/backdrop URLs with images hosted on your own storage.

## Manual catalog maintenance

Use MongoDB Compass, Atlas Data Explorer, or a controlled database script to insert/update catalog documents.

Movie document minimum fields: `imdbId`, `title`, plus optional `posterUrl`, `releaseYear`, `voteAverage`, and `genres`.

TV document minimum fields: `imdbId`, `title`, and an embedded `seasons` array containing `seasonNumber` and `episodes`. The player uses the IMDb title ID directly.

The public API is read-only for catalog data. There are no write routes or privileged admin endpoints exposed by the application. The TV seed script writes directly to MongoDB during local development only; it is not exposed as a public API route.


## TV metadata attribution and limitations

TV series metadata, posters and episode stills imported by Situla come from the [TVmaze public API](https://www.tvmaze.com/api), which is licensed under CC BY-SA. Situla links back to each TVmaze show page on the series detail screen. The rating value shown for imported series is TVmaze's rating, not an IMDb user rating. The public TVmaze show response does not provide a parental certification field, so Situla leaves `certification` blank rather than inventing a TV rating. The importer filters the curated allowlist and rejects any source record tagged with the Adult genre.

The importer stores metadata and episode-guide information only. It does not download, store, or redistribute copyrighted episode video files. TV playback remains a separate external-provider service; available resolution, audio tracks and stream stability are controlled by that provider and cannot be guaranteed or forced by Situla's parent page.

## API

- `GET /api/health`
- `GET /api/movies?page=1&limit=40`
- `GET /api/movies/discover`
- `GET /api/movies/suggestions?q=inception`
- `GET /api/search?q=the+office` (searches Movies, TV series and Anime together)
- `GET /api/movies/:imdbId`
- `GET /api/tv?page=1&limit=40`
- `GET /api/tv/:imdbId`
- `GET /api/tv/:imdbId/seasons/:seasonNumber`
- `GET /api/anime?page=1&limit=40`
- `GET /api/anime/:malId`


## Browser access

The website is restricted to Brave Browser only. Brave is recognized through its documented `Sec-CH-UA` brand hint when supplied, with a browser-side `navigator.brave.isBrave()` verification fallback. Successful Brave verification is cached in a first-party cookie for up to 400 days.


The native Android app, source project, and Android build workflow have been permanently removed from this repository. Existing Android app builds are not allowed to access the website.
