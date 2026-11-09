# Situla

Situla is a mobile-first movie discovery and streaming website built with Next.js App Router and Tailwind CSS. The Android app is a native WebView wrapper that opens the hosted website directly; there is no PWA installation flow.

## Stack

- Next.js 16 App Router and React
- Tailwind CSS 4
- Hono API handlers mounted under the Next.js /api/* route
- MongoDB Atlas with Mongoose connection reuse and explicit indexes
- IMDb title IDs (tt…) as the only stored and public movie identifiers
- TMDB API for server-side metadata and poster/backdrop lookup
- IMDb-compatible VidSrc player with playback progress and resume

## Local setup

1. Install Node.js 22 or newer.
2. Copy .env.example to .env.
3. Add the TMDB API key, MongoDB Atlas URI, database name, admin username, admin password, and a random SESSION_SECRET of at least 32 characters.
4. Run npm install.
5. Run npm run dev.
6. Open http://localhost:3000.
7. Check http://localhost:3000/api/health.

Run npm run build to verify the production Next.js build and npm test for the API/crawler tests.

Never commit .env. The real credentials are not in this repository.

## Web app features

- Responsive, mobile-first movie catalog with Home, Search, My List, and Settings navigation.
- Search and movie metadata are loaded from the public Situla API.
- Saved movies and recently opened titles are keyed by IMDb ID and stored locally in the browser.
- Movie playback opens at /watch/{IMDb_ID} and embeds the IMDb-compatible VidSrc movie player.
- Player events update local watch progress; the saved position is passed back through startAt when playback resumes.
- Fullscreen playback requests landscape orientation where the browser supports the Screen Orientation API.
- The Android package opens the deployed website URL directly inside a native WebView. Fullscreen player requests landscape orientation through Android's WebChromeClient.
- Existing admin dashboard remains available at /index.html.

## Catalog selection and seeding

The existing discovery filters are retained: English original language, adult titles excluded, a release date and poster required, and at least one of Science Fiction, Mystery, Fantasy, Horror, Action, or Adventure. Discovery results are ordered by popularity.

The curated first-run list contains 80 IMDb title IDs: the original 20 plus 60 additional candidates. On the first public catalog request after deployment, the backend resolves any missing IDs against TMDB metadata in batches of 20, applies the same language/adult/date/poster/genre filters, and approves only eligible curated records. Invalid, unmatched, or ineligible candidates are skipped. This requires TMDB_API_KEY to be configured.

## API and backend

The Hono API remains in src/app.js and is mounted in Next.js through app/api/[...route]/route.js.

- GET /api/health — service and MongoDB health
- POST /api/admin/login — admin sign-in with an HttpOnly session cookie
- GET /api/admin/session — session check
- POST /api/admin/logout — sign out
- GET /api/admin/dashboard — catalog counts and recent crawl activity
- GET /api/admin/tmdb-status — verify TMDB metadata API access (admin only)
- POST /api/admin/crawl — manually import a bounded TMDB discovery batch, stored by IMDb ID
- POST /api/admin/import-ids — import IMDb title IDs; records enter moderation as pending
- GET /api/admin/movies — paginated admin catalog and filters
- PATCH /api/admin/movies/:id/review — approve, reject, or return a record to pending
- GET /api/admin/crawl-runs — crawl history
- GET /api/movies — public approved catalog
- GET /api/movies/:imdbId — public approved movie details by IMDb ID

The movie schema and public API do not store or expose TMDB numeric IDs. TMDB is used server-side only to find artwork and metadata from an IMDb title ID. The browser builds the IMDb-based player URL; player/embed URLs are never returned by the metadata API.

On first database access after deploy, the migration drops the obsolete numeric TMDB unique index, fills missing IMDb IDs for legacy records when the metadata API key is available, and removes the old numeric ID fields. Unresolvable legacy entries are marked rejected.

## Vercel deployment

Set the Vercel project framework to Next.js (auto-detected when the root package is deployed), use the repository root as the Root Directory, and keep the Node.js runtime at 22.x or newer. Add the same environment variable names from .env.example in Vercel Project Settings. The Next.js app and Hono API are deployed together at the same origin. The Android APK simply opens https://situla.vercel.app/ in a native WebView; the website controls the UI and navigation.

## Security and content boundaries

- TMDB credentials, database credentials and admin secrets stay server-side.
- Admin sessions use signed, HttpOnly, SameSite cookies and same-origin checks.
- MongoDB enforces a unique IMDb title ID for each movie.
- Do not place credentials in browser JavaScript.
- Use external player content only where embedding and distribution are authorized.
- This product uses TMDB metadata but is not endorsed or certified by TMDB.
