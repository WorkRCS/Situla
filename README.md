# Situla

Situla is a movie metadata catalog with a password-protected admin dashboard. This first milestone delivers the Node.js backend, TMDB manual crawler, and browser-based dashboard. The Android client is a later phase, after local backend testing passes.

## Stack

- Node.js 22+
- Hono web framework (same application runs locally and on Vercel)
- MongoDB Atlas with Mongoose connection reuse and explicit indexes
- TMDB API for movie metadata
- Static HTML, Bootstrap 5, Bootstrap Icons and vanilla JavaScript

## Local setup

1. Install Node.js 22 or newer.
2. Copy .env.example to .env.
3. Add your TMDB API key, MongoDB Atlas URI, database name, admin username, admin password, and a random SESSION_SECRET of at least 32 characters.
4. Run npm install.
5. Run npm run dev.
6. Open http://localhost:3000.
7. Check http://localhost:3000/api/health.

Never commit .env. The real credentials are not in this repository.

## Admin workflow

1. Sign in with ADMIN_USERNAME and ADMIN_PASSWORD from .env.
2. Open TMDB crawler.
3. Choose the release-year range, start page, and pages per run.
4. Click Run manual crawl. There are no automatic crawl jobs.
5. Review the discovered, newly imported, updated, and adult-flag counts.
6. New records start as pending.
7. Approve or reject records in Movie catalog. Only approved, English-language, non-adult records are returned by the public movie API.

The crawler uses TMDB Discover and Movie Details endpoints. It does not scrape third-party streaming websites or fetch video files. Adult-flag filtering is not a guarantee that metadata is free of every sensitive theme. Admin review is required for nudity, violence, war, political or other editorial exclusions.

## API endpoints

- GET /api/health — service and MongoDB health
- POST /api/admin/login — admin sign-in with an HttpOnly session cookie
- GET /api/admin/session — session check
- POST /api/admin/logout — sign out
- GET /api/admin/dashboard — catalog counts and recent crawl activity
- POST /api/admin/crawl — manually import a bounded TMDB batch
- GET /api/admin/movies — paginated admin catalog and filters
- PATCH /api/admin/movies/:id/review — approve, reject, or return a record to pending
- GET /api/admin/crawl-runs — crawl history
- GET /api/movies — public approved catalog for the later Android client
- GET /api/movies/:tmdbId — public approved movie details

## Vercel

The root index.js exports the Hono app for Vercel's Node.js runtime. The public directory contains static dashboard assets. Add the same environment variable names from .env.example in Vercel Project Settings. Place the Vercel Function near the MongoDB Atlas region where possible. Configure Vercel Firewall rate limits for the admin login endpoint in production; the in-process login throttle is only a best-effort local safeguard in a serverless environment.

## Security and content boundaries

- TMDB credentials, database credentials and admin secrets stay server-side.
- Admin sessions use signed, HttpOnly, SameSite cookies and same-origin checks.
- MongoDB indexes protect TMDB ID uniqueness and common catalog filters.
- Do not place credentials in Android builds or browser JavaScript.
- This backend stores metadata only. Add only playback media or provider URLs for which you have distribution and embedding rights in a later, separately reviewed integration.
- Follow TMDB attribution and API terms. This product uses the TMDB API but is not endorsed or certified by TMDB.
