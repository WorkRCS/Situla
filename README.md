# Situla

Situla is a mobile-first media discovery and streaming website built with Next.js App Router and Tailwind CSS. The Android app is a native WebView wrapper that opens the hosted website directly; there is no PWA installation flow.

## Stack

- Next.js 16 App Router and React
- Tailwind CSS 4
- Hono API handlers mounted under the Next.js /api/* route
- MongoDB Atlas with Mongoose connection reuse and explicit indexes
- Movies keyed by IMDb title ID (tt…)
- TV series keyed by TMDB TV ID, with separate season/episode data
- Anime series keyed by MyAnimeList ID (MAL ID)
- TMDB metadata and artwork for movies/TV; Jikan v4 metadata for anime
- IMDb-compatible VidSrc movie player and VidLink TV/Anime players

## Local setup

1. Install Node.js 22 or newer.
2. Copy .env.example to .env.
3. Add the TMDB API key, MongoDB Atlas URI, database name, admin username, admin password, and a random SESSION_SECRET of at least 32 characters.
4. Run npm install.
5. Run npm run dev.
6. Open http://localhost:3000.
7. Check http://localhost:3000/api/health.

Run npm run build to verify the production Next.js build and npm test for the API/crawler/schema tests.

Never commit .env. The real credentials are not in this repository.

## Web app features

- Responsive navigation for Movies, TV, Anime, Search, My List, and Settings.
- Movie cards retain their posters, backdrops, thumbnails, ratings and saved list.
- TV series pages load seasons and episodes and let the viewer choose the exact episode before playback.
- Anime series pages let the viewer choose an episode and Sub/Dub audio type.
- Saved movies and recently opened movies continue to use IMDb IDs.
- Movie playback uses /watch/{IMDb_ID} and the IMDb-compatible VidSrc movie endpoint.
- TV playback uses /watch/tv/{TMDB_TV_ID}/{season}/{episode} and the VidLink TV endpoint.
- Anime playback uses /watch/anime/{MAL_ID}/{episode}/{subOrDub} and the VidLink Anime endpoint, with fallback enabled.
- TV episode progress is saved locally and resumed through VidLink startAt.
- Fullscreen playback requests landscape orientation where the browser supports the Screen Orientation API.
- The Android package opens the deployed website URL directly inside a native WebView. Fullscreen player requests landscape orientation through Android's WebChromeClient.
- Existing admin dashboard remains available at /index.html.

## Media IDs and player compatibility

Each media type uses the identifier required by its player:

| Media type | Canonical database ID | Player route |
| --- | --- | --- |
| Movie | IMDb title ID, e.g. tt1375666 | VidSrc /embed/movie/{imdbId} |
| TV series | TMDB TV ID, e.g. 1399 | VidLink /tv/{tmdbId}/{season}/{episode} |
| Anime series | MyAnimeList ID, e.g. 5114 | VidLink /anime/{malId}/{episode}/{subOrDub} |

The Movie collection does not store a TMDB numeric ID. TMDB is only used server-side to resolve movie artwork/metadata from an IMDb ID. TV series are a separate collection and retain their TMDB TV ID because VidLink's TV endpoint requires it. Anime series use a separate MAL ID and do not need a TMDB ID.

## Catalog criteria and imports

### Movies

The curated first-run movie list contains 80 IMDb title IDs: the original 20 plus 60 additional candidates. The existing filters remain: English original language, adult titles excluded, a release date and poster required, plus one of Science Fiction, Mystery, Fantasy, Horror, Action or Adventure. Eligible curated entries are approved on first public catalog request when TMDB metadata access is configured.

### TV series

The TV Series model stores series metadata, season summaries, air dates, ratings, genres, and episode totals. Season/episode metadata is fetched from TMDB when a viewer opens a season and cached in MongoDB. Imported series are English-language, non-adult titles with a poster and first-air date, from the existing action/adventure, science-fiction/fantasy, mystery, crime, drama or war/politics genre set, with a minimum rating of 5.5 and 100 votes. New entries enter Pending review.

The Admin → TV series screen is prefilled with 20 curated popular TMDB TV IDs. Review them and press Import TV series IDs. They remain Pending until approved.

### Anime series

Anime metadata is resolved from MyAnimeList IDs through Jikan v4. The Anime Series model stores MAL ID, English/Japanese titles, synopsis, poster, episode count, season, type, genres/themes, score, rank, popularity and rating. The importer accepts TV/ONA titles, excludes Hentai and Ecchi genres, requires a poster and episode count, and filters to a MAL score of at least 6.5 with at least 500 votes. New entries enter Pending review.

The Admin → Anime series screen is prefilled with 12 curated MAL IDs. Press Import MAL IDs, then approve eligible entries. Jikan is an unofficial, read-only MyAnimeList API; imports are throttled to stay under its published request-rate limits.

## API and backend

The Hono API remains in src/app.js and is mounted in Next.js through app/api/[...route]/route.js.

- GET /api/health — service and MongoDB health
- Movie endpoints: GET /api/movies and GET /api/movies/:imdbId
- TV endpoints: GET /api/tv, GET /api/tv/:tmdbId, GET /api/tv/:tmdbId/seasons/:seasonNumber
- Anime endpoints: GET /api/anime and GET /api/anime/:malId
- POST /api/admin/import-ids — import IMDb movie IDs
- POST /api/admin/import-tv-series — import TMDB TV IDs
- POST /api/admin/import-anime-series — import MAL IDs
- GET /api/admin/tv-series and PATCH /api/admin/tv-series/:id/review
- GET /api/admin/anime-series and PATCH /api/admin/anime-series/:id/review
- Existing admin login/session/logout, movie moderation, dashboard and crawl-history routes remain available.

The public movie API never returns a TMDB numeric movie ID or player URL. TV and Anime endpoints return their own player-native identifiers only. The backend does not store player iframe HTML or embed URLs.

## Database models

- Movie — unique IMDb ID; movie metadata/artwork
- TvSeries — unique TMDB TV ID; series metadata and season summaries
- TvSeason — unique series TMDB ID + season number; cached episodes for that season
- AnimeSeries — unique MAL ID; anime metadata from Jikan
- CrawlRun — movie discovery/import audit history

## Vercel deployment

Set the Vercel project framework to Next.js, use the repository root as the Root Directory, and keep the Node.js runtime at 22.x or newer. Add the same environment variable names from .env.example in Vercel Project Settings. The Next.js app and Hono API are deployed together at the same origin. The Android APK opens https://situla.vercel.app/ in a native WebView; the website controls the UI and navigation.

## Security and content boundaries

- TMDB credentials, database credentials and admin secrets stay server-side.
- Admin sessions use signed, HttpOnly, SameSite cookies and same-origin checks.
- MongoDB enforces unique IDs separately in each media collection.
- Do not place credentials in browser JavaScript.
- Use third-party player embeds only where their terms and content rights permit.
- TMDB does not endorse or certify this product. Jikan is not affiliated with MyAnimeList.
