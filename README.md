# Situla

Situla is a mobile-first movie, TV and anime catalog with a Next.js web app and a native Android WebView wrapper. Catalog content is stored directly in MongoDB and maintained manually. There is no admin dashboard, external metadata crawler, or automatic catalog importer.

## Identifiers and playback

- Movies: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. Playback uses VidLink.
- TV series: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. Season and episode metadata is embedded in the TV document; playback uses VidLink.
- VidLink's official embed documentation currently requires a numeric TMDB provider key for movie/TV playback. Situla stores that value internally as `vidlinkId`; it is not a route key and is never added to the browser address bar. The public Situla URL remains `/watch/{imdbId}` and `/tv/{imdbId}`.
- Anime: MAL ID remains the anime key because VidLink's anime endpoint requires a MyAnimeList ID.

The iframe provider is VidLink Pro for movies, TV and anime. Its published customization parameters do not document a way to hide the built-in CC/subtitle control. Situla disables browser Picture-in-Picture permission, and sandboxes the player iframe to block popup windows and top-level navigation. Android additionally denies user-triggered iframe navigation to non-player hosts and filters a curated ad/tracker host list. A cross-origin embed may still navigate within its own frame, so absolute provider-side ad removal cannot be guaranteed by the parent site.

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
- Removes legacy TMDB-named fields and obsolete crawler history while retaining the required numeric VidLink mapping as `vidlinkId`.
- Retains anime records under MAL IDs.

First run the read-only audit to see the exact record counts. It also reports case-insensitive duplicate IMDb IDs and makes no database changes:

```powershell
npm run audit:imdb-only
```

After reviewing the counts and resolving any duplicate IMDb IDs, run the migration once, before deploying the new schema. The migration prints the invalid-ID counts again, deletes invalid Movie and TV documents, converts the valid records, and removes the old TMDB-named fields and cache collections while retaining VidLink mappings:

```powershell
npm run migrate:imdb-only
```

The existing poster files may still be hosted on the old TMDB image CDN; this migration stores them as direct URLs but does not re-host the image bytes. To remove that CDN host too, manually replace poster/backdrop URLs with images hosted on your own storage. If an earlier migration already removed both `tmdbId` and `vidlinkId`, the audit will report missing provider mappings; those numeric VidLink mappings must be restored manually before the affected Movie/TV titles can play.

## Manual catalog maintenance

Use MongoDB Compass, Atlas Data Explorer, or a controlled database script to insert/update catalog documents.

Movie document minimum fields: `imdbId`, `title`, and `vidlinkId` (the numeric provider mapping required by VidLink), plus optional `posterUrl`, `releaseYear`, `voteAverage`, and `genres`.

TV document minimum fields: `imdbId`, `title`, `vidlinkId`, and an embedded `seasons` array containing `seasonNumber` and `episodes`. `vidlinkId` is never part of the Situla browser route; it is used only to construct the provider iframe URL.

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

## Android

The Android package opens the hosted site inside a native WebView. Fullscreen requests are handled by Android's WebChromeClient. The app keeps its curated network blocker; it does not claim full browser-level audio amplification or full Brave Shields parity.
