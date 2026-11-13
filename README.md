# Situla

Situla is a mobile-first Movie, TV and Anime catalogue built with Next.js and MongoDB. The single `npm run seed` command validates the curated data packs, imports public Cinemeta Movie metadata, matches TVmaze series/episode data, and refreshes public rating, popularity, trend and tag signals from Cinemeta, TVmaze and AniList. It preserves IMDb, TMDB and MAL as the canonical IDs, skips existing catalogue records, and never deletes or replaces saved titles. The complete source/validation rules are documented in [CATALOG_CRAWLING_POLICY.md](CATALOG_CRAWLING_POLICY.md).

## Identifiers and playback

- Movies: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. Playback opens through Situla's canonical Watch Page.
- TV series: numeric TMDB TV ID is the required unique Situla catalog key. The detail route is `/tv/{tmdbId}`, and the Watch Page route is `/watch/tv/{tmdbId}/{season}/{episode}`.
- Anime: MAL ID is the required catalog and playback key. `sub` and `dub` audio preferences are validated; alternate audio selection is supported in the Situla Watch experience.

Playback configuration is managed internally and is not identified in the public interface. Video availability, resolution and audio options depend on the selected title and supported viewing options. Situla does not download or store copyrighted video files.

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI`, `MONGODB_DB_NAME`, and a strong `AUTH_SECRET` of at least 32 bytes. Generate one with the Node.js `crypto.randomBytes(48).toString('base64url')` command shown in `.env.example`; keep the same secret across restarts/deployments. Changing it invalidates keyed tokens and prevents old encrypted IP records from being read.
4. Optional: set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from your Upstash Redis REST credentials to enable the shared server-side catalog cache. Redis is optional; without it, Situla reads directly from MongoDB.
5. Run `npm install`.
6. Run `npm run dev` to start only the local Next.js website at `http://localhost:3000`. It does not run a seed, crawler or migration.
7. Open `http://localhost:3000`. The health endpoint is `/api/health`.

## Production database operations

Production API requests only establish/reuse the MongoDB connection; they do not build indexes during cold starts. Schema indexes are declared in `src/models.js` and should be provisioned once per database before deployment:

```sh
npm run db:indexes
```

For Vercel, run this command from a trusted deployment workstation with the production MongoDB environment configured. Do not run index creation from every serverless instance. For a small VPS or a larger dedicated VPS, the MongoDB client pool defaults to 8 connections per Node.js process and can be tuned with `MONGODB_MAX_POOL_SIZE` (2–100); account for the sum of pools across all processes/instances.

Catalog cache requests use a short Redis timeout and zero SDK retries so a slow Redis service cannot hold an API response for multiple backoff cycles. Redis remains optional; catalog responses can use the process-local cache and stale-if-error fallback when Redis or MongoDB is temporarily unhealthy.

## Native media sharing and announcements

Movie and TV poster cards offer the device-native share sheet. The shared payload contains the title, canonical Situla detail/watch URL, and the poster image file when the browser permits file sharing; otherwise the poster URL is included with the title and link. Movie Watch and TV detail pages provide title, description and poster Open Graph metadata for link previews.

Administrators can create, edit, schedule, draft and delete site-wide announcements from the Admin dashboard. Visitors see published announcements only after their scheduled timestamp. Read receipts are stored per signed-in account, while guests use browser-local read state. An announcement can include either a secure HTTPS media URL (direct images render as images; supported YouTube/Vimeo URLs render in an iframe) or an uploaded JPG, PNG, WebP, GIF or AVIF image up to 4 MB. Uploaded images are stored with the announcement in MongoDB, so no additional storage token is required. Schedule times are saved as ISO timestamps and displayed in each visitor's local time zone.

## Unified catalogue seed

Set `MONGODB_URI` and `MONGODB_DB_NAME` in your local `.env` file. Then run this one command from the repository root:

```sh
npm run seed
```

The runner completes these stages in order:

1. Validates and inserts the locally curated 2020–2026 Movie, TV and Anime records.
2. Discovers and imports complete Movie metadata/artwork from public Cinemeta, keyed by IMDb title ID.
3. Matches TV candidates to public TVmaze records and imports their series, seasons and episode metadata, keyed by the existing TMDB TV ID.
4. Refreshes current public catalogue signals: Movie ratings from Cinemeta, TV ratings/reach from TVmaze, and Anime score/popularity/trending/favourites/tags from AniList GraphQL. Anime continues to use MAL IDs as its catalogue/playback key; AniList IDs are cross-references.

The refresh stores provider signals in MongoDB, and the existing automatic badge logic calculates one visible label (Hot, Popular or Featured). No manual badge editing is needed. The runner uses public endpoints and does not require separate metadata-provider API keys. It respects provider rate limits and retries temporary failures.

**Safe to rerun:** new catalogue records are validated and inserted only when their canonical ID/title is not already present. If a later stage fails, run `npm run seed` again; previously inserted records are skipped. The public market refresh updates only provider-signal fields and fills missing Anime metadata; it does not replace a curated title, description or artwork. Existing catalogue documents are never deleted.

The current committed data includes 38 manually curated Movie records, 8 manually curated TV limited-series records and 201 curated Anime additions, alongside the provider-discovery packs. These are quality-checked batches, not a claim that every worldwide release has been indexed.

### Provider and badge signals

- **Movies:** Cinemeta metadata and IMDb-keyed public rating/vote fields.
- **TV:** TVmaze rating and provider reach, with exact title/year matching for series metadata.
- **Anime:** AniList GraphQL resolves the AniList cross-reference and refreshes average score, list popularity, trending, favourites and non-adult/non-spoiler tags; MAL remains the primary catalogue ID.
- **Hot / Popular / Featured:** computed automatically from stored public-provider signals plus Situla playback momentum. Poster cards do not make per-title metadata requests.

A scheduled GitHub Actions job also refreshes public signals daily when the repository secret `MONGODB_URI` is configured. Its database name comes from `MONGODB_DB_NAME` (defaults to `situla`).

### Checks and artwork audit

```sh
npm run check:movies
npm run check:tv
npm run check:anime
npm test
npm run build
npm run audit:anime
```

The Anime artwork audit is a dry run by default. It reports existing Anime records with no usable poster or banner/backdrop and writes its review output to `reports/anime-artwork-audit.json`. Applying the separate historical cleanup remains explicit via `npm run audit:anime:apply`.

### Required environment

Keep the existing `MONGODB_URI` and `MONGODB_DB_NAME` values. Generate a unique server secret and set it as `AUTH_SECRET`:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

For Google Sign-in, create a Google Cloud OAuth client of type **Web application** and configure the authorized redirect URI to exactly:

```
https://YOUR_PRODUCTION_HOST/api/auth/google/callback
```

Set the resulting `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the same full URL in `GOOGLE_REDIRECT_URI`. Administrator authority is stored only in the MongoDB `User.role` field; it is not granted by an environment email allowlist. Never commit a real `.env` file or paste its secrets into source control.

### Server-owned access limits

- Guest: 1 hour of watch allowance, then a 2-hour cooldown. Guest usage is keyed by an HMAC of the trusted client IP; the raw IP is not stored.
- Free: 3 hours of watch allowance, then a 1-hour cooldown; one registered device.
- Premium Monthly: 5 hours, then a 40-minute cooldown.
- Premium 6 Months: 10 hours, then a 20-minute cooldown.
- Premium Yearly: unlimited watch time with no periodic cooldown.
- Premium accounts can register up to 3 devices; their allowance is shared across devices.
- Active Premium accounts receive a private date-prioritized Movies, TV and Anime feed using the current calendar year and the previous nine years. Newer releases appear first; older records are used only when the recent window cannot fill a requested page.
- Catalogue feed responses are capped at 10 records per request for every access tier.

The server validates the media route before issuing a playback session. The iframe is mounted only after that authorization succeeds. Player messages and 15-second heartbeats are used to account for playback time on the server. Because playback uses a third-party iframe, the events it reports are not cryptographic proof of actual playback; this is server-enforced session accounting, not tamper-proof DRM.

Premium membership can be manually activated or downgraded through the administrator-only `PATCH /api/admin/users/:userId/membership` endpoint. Administrator access is determined only by the signed-in user's MongoDB `role: "admin"`. Assign the first administrator from the project folder with `npm run admin:set-role -- member@example.com admin`; this script requires the existing MongoDB environment variables and updates the user record directly. Payment checkout is intentionally not connected; no payment gateway, payment secret or checkout route is configured.

Useful endpoints:
- `POST /api/auth/email`, `GET /api/auth/google`, `GET /api/auth/google/callback`
- `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/auth/devices`, `DELETE /api/auth/devices/:deviceId`
- `GET /api/access/status`
- `POST /api/playback/start`, `POST /api/playback/heartbeat`, `POST /api/playback/stop`

## Browser access

The website is restricted to Brave Browser only. Brave is recognized through its documented `Sec-CH-UA` brand hint when supplied, with a browser-side `navigator.brave.isBrave()` verification fallback. Successful Brave verification is cached in a first-party cookie for up to 400 days.

The native Android app, source project, and Android build workflow have been permanently removed from this repository. Existing Android app builds are not allowed to access the website.


## Admin management and activity telemetry

Accounts with `User.role === "admin"` can open `/admin`. The admin dashboard exposes guest and registered-user counts, paginated guest/user/payment records, email search, member device/browser details, Premium grants/removals, and timed account suspensions. Admin APIs re-check the database role on every request and apply same-origin checks to state changes.

Activity telemetry starts when the site is visited. It records visit timestamps, foreground/active-time estimates, browser/OS/device user-agent details, and an encrypted IP value for administrative abuse/security review. Raw IP values are decrypted only for admin detail views; IP view actions are audited. Activity session records have a rolling 180-day retention period. Historical guest identities created before telemetry was enabled contain only keyed IP hashes, so their original IP addresses cannot be reconstructed. Active/idle time is an approximate foreground-page measurement, not proof of a person's attention.

Manual Premium assignments are membership grants, not sales. The Admin Sales tab reads transaction records only; online checkout and verified payment-provider callbacks are not currently connected, so paid/failed sales remain empty until a payment integration is implemented.
