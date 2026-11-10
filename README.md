# Situla

Situla is a mobile-first movie, TV and anime catalog built as a Next.js website. Catalog content is stored directly in MongoDB and maintained manually. There is no admin dashboard, external metadata crawler, or automatic catalog importer.

## Identifiers and playback

- Movies: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. After the Movie record is found in MongoDB, the player is requested directly at `https://vidlink.pro/movie/{imdbId}`.
- TV series: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. After the TV record is found in MongoDB, each episode is requested directly at `https://vidlink.pro/tv/{imdbId}/{season}/{episode}`.
- No numeric provider/source ID is stored in the current schema or required by Situla's player code. The public routes remain `/watch/{imdbId}` and `/tv/{imdbId}`.
- Anime: MAL ID remains the anime key because VidLink's anime endpoint requires a MyAnimeList ID.

Movie watch pages provide an optional Hindi player switch using the path-based IMDb format `https://slast430did.com/play/{imdbId}`; English switches back to VidLink. The setting is remembered on the device and is limited to Movie playback. The Hindi player uses the path-based IMDb route verified from the working direct-play URL. Its available resolution and audio tracks remain provider-controlled; Situla does not force a mute or undocumented quality parameter. The iframe provider is VidLink Pro for English movies, TV and anime. Situla requests Movie and TV playback directly using IMDb title IDs, with no secondary numeric source ID. The current VidLink public documentation still lists numeric TMDB IDs for Movie/TV and does not document IMDb path support; successful playback with `tt...` therefore requires live provider verification. The published customization parameters do not document a way to hide the built-in CC/subtitle control. Situla disables browser Picture-in-Picture permission and leaves the VidLink iframe unsandboxed so the provider can load its player and source frames without sandbox restrictions. The website's parent page cannot reliably inspect or filter requests made inside a cross-origin iframe; complete provider-side ad removal cannot be guaranteed once sandboxing is disabled.

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` and `MONGODB_DB_NAME`.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open `http://localhost:3000` and check `/api/health`.

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

The public API is read-only for catalog data. There are no write routes or privileged admin endpoints exposed by the application.

## API

- `GET /api/health`
- `GET /api/movies?page=1&limit=40`
- `GET /api/movies/discover`
- `GET /api/movies/suggestions?q=inception`
- `GET /api/movies/:imdbId`
- `GET /api/tv?page=1&limit=40`
- `GET /api/tv/:imdbId`
- `GET /api/tv/:imdbId/seasons/:seasonNumber`
- `GET /api/anime?page=1&limit=40`
- `GET /api/anime/:malId`


## Browser access

The website is restricted to Brave Browser and the existing Situla Android WebView app. Brave is recognized through its documented `Sec-CH-UA` brand hint when supplied, with a browser-side `navigator.brave.isBrave()` verification fallback. Successful Brave verification is cached in a first-party cookie for up to 400 days.

The existing Android wrapper removes the `; wv` user-agent token but keeps Android WebView's `Version/4.0` signature, so the website continues to accept that installed app. This is a compatibility check, not cryptographic app authentication: other Android apps using a matching WebView user-agent can also pass it, and user-agent values can be spoofed. Ordinary Chrome, Safari, Firefox, and other non-Brave browsers are redirected to a browser access page. The access check applies to website pages and API routes.

The native Android source project and its Android build workflow have been removed from this repository. Previously installed copies of the Android app can continue loading the hosted website while they retain the supported WebView user-agent signature.
