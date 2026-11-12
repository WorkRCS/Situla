# Situla

Situla is a mobile-first movie, TV and anime catalog built as a Next.js website. Catalog content is stored in MongoDB. The canonical curation, source, metadata validation, artwork and insert-only seed procedure is documented in [CATALOG_CRAWLING_POLICY.md](CATALOG_CRAWLING_POLICY.md). The default `npm run seed:catalog` command is offline: it reads committed data files only, filters to 2020–2026, preserves IMDb/TMDB/MAL identifiers and inserts only records that pass the complete-content and content-safety checks. It does not call Movie, TV or Anime metadata APIs. Provider-backed historical seeders are isolated behind explicitly named `legacy-online` commands and are not used by the default seed.

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

## Static catalogue seed

### Default offline 2020–2026 seed

Run one command after setting `MONGODB_URI` and `MONGODB_DB_NAME`:

```sh
npm run seed:catalog:legacy-online
```

The command reads version-controlled JavaScript data only; it makes no metadata-provider API calls. It imports only records dated 2020 through 2026 that pass the full policy checks, and uses insert-only writes. Movie IDs remain IMDb `tt…`, TV IDs remain numeric TMDB TV IDs, and Anime IDs remain MAL IDs. A green **Popular** tag is derived from each catalogue's own popularity/rank fields, with an explicit `isPopular` override available.

**Current data-pack limitation:** the committed 2020–2026 Movie and TV entries do not currently pass the full synopsis/artwork/credits/episode-guide requirements, so the offline command reports those gaps instead of importing incomplete records. The Anime pack contains a policy-valid subset (the current pack has 198 titles with complete episode still references). This is not yet a complete worldwide 2020–2026 catalogue; more fully curated static Movie and TV records must be added under `data/` before those collections can be completely seeded. The command reports the prepared and rejected counts on every run.

The prior provider-backed seeders remain available only as `npm run seed:movies:legacy-online`, `npm run seed:tv:legacy-online`, and `npm run seed:catalog:legacy-online`. Those commands are intentionally separate and are not called by `seed:catalog`.


Movies and TV retain separate identifiers. Anime has its own **new-only MAL seed**, and TV has a verified **200-new-series seed**:

- Existing Movies: 70 IMDb IDs in data/movie-catalog.js. New Movies: five IMDb-keyed Cinemeta discovery parts in data/movie-additions-01.js through data/movie-additions-05.js, aggregated by data/movie-additions.js; the seed fetches IMDb IDs directly and adds exactly 500 new records after a complete metadata/artwork preflight.
- Existing TV Series: numeric TMDB IDs in data/tv-catalog.js.
- New TV candidates: more than 200 unique TMDB IDs in data/tv-additions.js; the seed accepts exactly 200 only after exact title/year matching, complete synopsis/episode-guide checks, adult-genre filtering and artwork validation.
- Existing/legacy Anime: MAL IDs in data/anime-catalog.js; this list is not re-seeded or updated by the Anime additions command.
- New Anime: 200 MAL-ID matched entries in data/anime-additions-01.js through data/anime-additions-16.js, aggregated by data/anime-additions.js.

The new Anime pack includes individual poster/banner references, synopsis, canonical MAL links, franchise/related-season cards, and numbered season/episode guide entries. The curated pack contains 200 unique new MAL IDs, 2,883 episode guide entries, and 2,881 episode still-image references. A missing episode still is left blank rather than borrowing an image from another episode or title.

### Legacy Anime pack check, artwork audit and seed

From the Situla project folder:

```sh
npm run check:anime
npm run audit:anime
```

The first command validates the static pack, ID/title uniqueness, posters, banners and episode guide coverage. The artwork audit is a **dry run** and reports existing Anime records with no usable poster or banner/backdrop. It does not delete anything. It writes the full checked-title and image URL list to reports/anime-artwork-audit.json for review.

After reviewing the audit report, apply the cleanup:

```sh
npm run audit:anime:apply
npm run seed:anime:legacy-curated
```

The cleanup deletes only Anime documents that have neither a usable poster nor a usable banner/backdrop. A record with at least one valid artwork image is retained. The new-only seed then inserts the curated additions whose MAL ID and title are not already in the collection. It uses insertMany in insert-only mode; it does not update or replace existing Anime records.

### Legacy online Movie additions (five historical discovery parts)

The five discovery files separate popular, IMDb-rated, Drama, Action and Animation catalogues. At seed time the importer reads candidate IMDb IDs from Stremio's public Cinemeta catalogue, requests each title's metadata directly by IMDb ID, and independently validates its poster and landscape background image responses. No TMDb API or TMDb image host is used by the Movie seed.

A Movie is accepted only when it has a unique valid IMDb ID, title and original title, an 80+ character synopsis, a reachable poster and landscape background, release year, runtime, at least one genre, cast and director credits. Adult titles are excluded. Release date, language, production company/country, spoken languages, tagline, trailer and collection details are stored when the provider supplies them; missing optional facts are not fabricated. The whole remaining target is prepared and validated before any new Movie document is inserted. If 500 complete new records are not available, the seed stops before writing them. The insert uses `Movie.insertMany`; it never updates or replaces existing Movie documents. The existing 70 curated IMDb-keyed Movie records remain separate and untouched.

Run the static checks and then the seed:

```sh
npm run check:movies
npm run seed:movies:legacy-online
```

The Movie seed requires only `MONGODB_URI` and `MONGODB_DB_NAME` in `.env`. Metadata is fetched from Stremio Cinemeta over public HTTPS; no TMDb token, IMDb API subscription, or metadata API key is required. The GitHub Actions seed workflow also has a `movies` run selection and needs only the two MongoDB secrets for that selection. Situla stores the IMDb title ID as the sole Movie key and links each record to its IMDb title page.

### Legacy online Movie and TV seeders

The Movie command first inserts any missing entries from the original 70-record static Movie pack using insert-only semantics, then adds the 500 complete Cinemeta-verified IMDb-keyed additions. The TV seed separately prepares 200 new TV additions and inserts them in insert-only mode. The Anime seed inserts its 200 curated MAL-ID additions. All three seeds are insert-only and leave existing catalog records untouched. To run the historical provider-backed imports, use the explicit legacy command `npm run seed:catalog:legacy-online`:

```sh
npm run seed:movies:legacy-online
npm run seed:tv:legacy-online
npm run seed:anime:legacy-curated
# or run all three catalog seeds in order:
npm run seed:catalog:legacy-online
```

All seed/audit commands require MongoDB credentials and database network access. `npm run seed:movies` additionally needs outbound HTTPS access to `v3-cinemeta.strem.io` and the Cinemeta artwork hosts. It does not connect to TMDb. `npm run seed:tv` needs outbound HTTPS access to TVmaze and its image hosts. Before writing anything, the TV seed requires an exact normalized title and premiere-year match, a synopsis of at least 80 characters, at least five titled episodes, consistent unique season/episode numbers, a reachable poster and at least 80% reachable episode stills. The entire 200-record TV target is preflighted before its insert begins; if there are not enough valid records, the TV additions seed stops without writing. A separate landscape backdrop is stored only when one is supplied and independently reachable; the poster is never reused as a fake backdrop. Missing or broken episode stills are stored as null, but a series is accepted only when at least 80% of its episode stills are reachable. TVmaze metadata is credited by a source link on the detail page and follows TVmaze's CC BY-SA terms. `npm run dev` never runs a seed or cleanup automatically.


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

- The initial 70 Movie records are curated from a public IMDb Top 250 list. The 500 new Movie additions are discovered and enriched through [Stremio Cinemeta](https://github.com/Stremio/stremio-addons/blob/master/docs/tutorial/using-cinemeta.md), whose public metadata routes accept IMDb title IDs directly. Cinemeta is a third-party Stremio metadata add-on, not IMDb's official API; its public endpoint has no service-level guarantee. Each saved Movie key remains the IMDb ID, and poster/background URLs are validated before insertion.
- TV candidate IDs, premiere dates, posters and season/episode totals use the [Vetustas Archiva TV dataset](https://github.com/0xShady/vetustas-archiva/tree/main/datasets), which is MIT-licensed. The TV seed matches titles and premiere years against [TVmaze](https://www.tvmaze.com/api), then adds the full TVmaze synopsis and available episode-guide metadata with attribution links.
- New Anime candidates are shortlisted from the [Anime Stats Tracker seasonal dataset](https://github.com/zyhe16/anime-stats-tracker), which is MIT-licensed. Exact MAL IDs, title artwork, synopsis, related-season ordering and per-episode still metadata are curated from the [Anime Mapper static records](https://github.com/subhajeetch-fl/anime-mapper), which is MIT-licensed. The poster/banner/still images remain external references and are not re-hosted by Situla.
- Some previously imported TV records retain TVmaze-sourced metadata and episode guides. Their TVmaze source links and existing guide remain intact.
- Poster images are stored as external image URLs; Situla does not re-host those image files.
- In the About section, Situla displays the TMDB notice: “This product uses the TMDB API but is not endorsed or certified by TMDB.”

## API

- `GET /api/health`
- `GET /api/movies?page=1&limit=10`
- `GET /api/movies/discover`
- `GET /api/movies/suggestions?q=inception`
- `GET /api/search?q=the+office` (searches Movies, TV series and Anime together)
- `GET /api/movies/:imdbId`
- `GET /api/tv?page=1&limit=10`
- `GET /api/tv/:tmdbId`
- `GET /api/tv/:tmdbId/seasons/:seasonNumber`
- `GET /api/anime?page=1&limit=10`
- `GET /api/anime/:malId`


## Authentication, membership and watch access

The account backend uses MongoDB-backed users, opaque server sessions, registered devices, guest-IP usage records and server-owned playback leases. Email sign-up and login use the same email/password form: a new email creates a Free account, while an existing account requires its password. Google OAuth is enabled only after the Google Web OAuth credentials below are configured.

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
