# Situla

Situla is a mobile-first movie discovery and streaming web app built with Next.js App Router and Tailwind CSS. It is installable as a Progressive Web App and uses the Situla API for approved movie metadata.

## Stack

- Next.js 16 App Router and React
- Tailwind CSS 4
- Hono API handlers mounted under the Next.js `/api/*` route
- MongoDB Atlas with Mongoose connection reuse and explicit indexes
- TMDB API for movie metadata
- VidLink player page opened from the movie's TMDB ID

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env`.
3. Add the TMDB API key, MongoDB Atlas URI, database name, admin username, admin password, and a random SESSION_SECRET of at least 32 characters.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open http://localhost:3000.
7. Check http://localhost:3000/api/health.

Run `npm run build` to verify the production Next.js build and `npm test` for the API/crawler tests.

Never commit `.env`. The real credentials are not in this repository.

## Web app features

- Responsive, mobile-first movie catalog with Home, Search, My List, and Settings navigation.
- Search and movie metadata are loaded from the public Situla API.
- Saved movies and recently opened titles are stored locally in the browser.
- Movie playback opens at `/watch/{TMDB_ID}`; the web app constructs `https://vidlink.pro/movie/{TMDB_ID}` directly from the catalog ID.
- Fullscreen playback requests landscape orientation where the browser and installed PWA support the Screen Orientation API.
- PWA manifest, install prompt, app icon, and a small offline shell cache.
- Existing admin dashboard remains available at `/index.html`.

## API and backend

The Hono API remains in `src/app.js` and is mounted in Next.js through `app/api/[...route]/route.js`. This keeps the API paths and existing authentication/database logic in one place.

- GET /api/health — service and MongoDB health
- POST /api/admin/login — admin sign-in with an HttpOnly session cookie
- GET /api/admin/session — session check
- POST /api/admin/logout — sign out
- GET /api/admin/dashboard — catalog counts and recent crawl activity
- GET /api/admin/tmdb-status — verify TMDB outbound HTTPS access and API-key validity (admin only)
- POST /api/admin/crawl — manually import a bounded TMDB discovery batch
- POST /api/admin/import-ids — resolve IMDb or TMDB movie IDs; records enter moderation as pending
- GET /api/admin/movies — paginated admin catalog and filters
- PATCH /api/admin/movies/:id/review — approve, reject, or return a record to pending
- GET /api/admin/crawl-runs — crawl history
- GET /api/movies — public approved catalog
- GET /api/movies/:tmdbId — public approved movie details

The public API returns metadata and TMDB IDs only. The browser builds the VidLink URL; provider/player URLs and iframe markup are never returned by the backend.

## Vercel deployment

Set the Vercel project framework to Next.js (auto-detected when the root package is deployed), use the repository root as the Root Directory, and keep the Node.js runtime at 22.x or newer. Add the same environment variable names from `.env.example` in Vercel Project Settings. The Next.js app and Hono API are deployed together at the same origin.

## Security and content boundaries

- TMDB credentials, database credentials and admin secrets stay server-side.
- Admin sessions use signed, HttpOnly, SameSite cookies and same-origin checks.
- MongoDB indexes protect TMDB ID uniqueness and common catalog filters.
- Do not place credentials in browser JavaScript.
- The app embeds the provider page only in its player view; use provider content only where embedding and distribution are authorized.
- Follow TMDB attribution and API terms. This product uses the TMDB API but is not endorsed or certified by TMDB.
