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

Run `npm install` after pulling updates that change dependencies (including `lucide-react`). Run `npm run build` to verify the production Next.js build and npm test for the API/crawler/schema tests. From the project root, run npm run seed:movies to add 60 new eligible movies, or npm run seed:series to add 50 new popular TV shows and 50 new popular anime titles (in addition to any missing curated starter titles). Use npm run seed:tv or npm run seed:anime to run either catalog independently. Append a target count, for example npm run seed:series -- 40, to request 40 new titles of each type. Each importer prints actual insert counts, skips IDs already in MongoDB, and saves accepted records as it goes.

Never commit .env. The real credentials are not in this repository.

## Web app features

- Responsive navigation for Movies, TV, Anime, Search, My List, and Settings.
- Header search, selectable System/Light/Dark appearance, progressive catalog pagination, and locally stored watch history with per-entry or full-history clearing.
- Full catalog browsing uses page counts from the API; the Load more controls fetch subsequent 40-record pages so catalogs do not stop at the first page.
- See [Catalog Content Policy (A–Z)](docs/CATALOG_CONTENT_POLICY.md) for complete Movie, TV and Anime inclusion, exclusion, safety, metadata, and quality rules.
- Consistent, tree-shakable Lucide React icons (ISC license) across cards, navigation, detail and player controls.
- Movie cards retain their posters, backdrops, thumbnails, ratings and saved list.
- TV series pages load seasons and episodes and let the viewer choose the exact episode before playback.
- Anime series pages let the viewer choose an episode and Sub/Dub audio type.
- Saved movies and recently opened movies continue to use IMDb IDs.
- Movie playback uses /watch/{IMDb_ID} and VidLink's movie endpoint; the server resolves the numeric player ID while keeping IMDb as the catalog identity.
- TV playback uses /watch/tv/{TMDB_TV_ID}/{season}/{episode} and the VidLink TV endpoint.
- Anime playback uses /watch/anime/{MAL_ID}/{episode}/{subOrDub} and the VidLink Anime endpoint, with fallback enabled.
- Movie, TV and Anime playback progress is saved locally as watch history with HH:MM:SS timing; users can remove individual entries or clear all local history from Settings.
- TV episode progress is saved locally and resumed through VidLink startAt.
- Playback uses the provider's native fullscreen controls; Android WebView handles fullscreen orientation through WebChromeClient.
- The Android package opens the deployed website URL directly inside a native WebView. Fullscreen player requests landscape orientation through Android's WebChromeClient.
- VidLink player frames are left unsandboxed for provider compatibility. Situla does not grant the iframe Picture-in-Picture permission, removes its own duplicate fullscreen and external-player controls, and enables VidLink's built-in Next Episode control for TV episodes.
- Existing admin dashboard remains available at /index.html.

## Media IDs and player compatibility

Each media type uses the identifier required by its player:

| Media type | Canonical database ID | Player route |
| --- | --- | --- |
| Movie | IMDb title ID, e.g. tt1375666 | VidLink /movie/{providerMovieId} after server-side ID resolution |
| TV series | TMDB TV ID, e.g. 1399 | VidLink /tv/{tmdbId}/{season}/{episode} |
| Anime series | MyAnimeList ID, e.g. 5114 | VidLink /anime/{malId}/{episode}/{subOrDub} |

The Movie collection remains keyed by IMDb ID and stores an internal VidLink provider ID for playback. VidLink's documented movie endpoint requires a numeric TMDB movie ID; that provider mapping is not used as the public movie identity. TV series retain their TMDB TV ID, and Anime series use MAL IDs. TV series are a separate collection and retain their TMDB TV ID because VidLink's TV endpoint requires it. Anime series use a separate MAL ID and do not need a TMDB ID.

## Catalog criteria and imports

### Movies

The explicit movie seed command discovers popular titles through TMDB and adds 60 new eligible IMDb records by default. The filters require English original language, non-adult titles, a release date and poster, and at least one of Science Fiction, Mystery, Fantasy, Horror, Action or Adventure. Successfully seeded titles are approved. Public GET /api/movies requests only read MongoDB and do not run discovery.

### TV series

The TV Series model stores series metadata, season summaries, air dates, ratings, genres, and episode totals. Season/episode metadata is fetched from TMDB when a viewer opens a season and cached in MongoDB. Discovery filters to English-language, non-adult shows with a poster and first-air date, from the action/adventure, science-fiction/fantasy, mystery, crime, drama or war/politics genre set, with a minimum rating of 5.5 and 100 votes. The explicit seeder imports the 20 curated starter IDs when missing and discovers 50 additional popular eligible shows by default. Seeded titles that pass the filters are automatically approved; manual Admin imports enter Pending review. Public GET /api/tv requests only read the database.

### Anime series

Anime metadata is resolved from MyAnimeList IDs through Jikan v4. The Anime Series model stores MAL ID, English/Japanese titles, synopsis, poster, episode count, season, type, genres/themes, score, rank, popularity and rating. Popular discovery selects SFW TV anime, excludes Hentai and Ecchi genres, requires a poster and episode count, and filters to a MAL score of at least 6.5 with at least 500 votes. The explicit seeder imports the 12 curated starter IDs when missing and discovers 50 additional popular anime by default. Seeded titles that pass the filters are automatically approved; manual Admin imports enter Pending review. Public GET /api/anime requests only read the database. Jikan is an unofficial, read-only MyAnimeList API; imports are throttled to stay under its published request-rate limits.

### Import troubleshooting

- If the TV seed reports `Unable to reach TMDB`, the machine running Node.js cannot establish outbound HTTPS access to `api.themoviedb.org:443`. Check DNS, firewall, VPN/proxy and antivirus HTTPS inspection, then retry `npm run seed:tv`. The anime importer uses Jikan separately and can be run with `npm run seed:anime`.
- Catalog GET requests do not seed data. Run the explicit seed command once after configuring `.env`.
- A React hydration warning that lists injected attributes such as `bis_skin_checked`, `bis_register` or `__processed_...` is typically caused by a browser extension mutating the page before React hydrates. Verify in a private/incognito window with extensions disabled; do not hide the warning with broad hydration suppression.

## API and backend

The Hono API remains in src/app.js and is mounted in Next.js through app/api/[...route]/route.js.

- GET /api/health — service and MongoDB health
- Movie endpoints: GET /api/movies and GET /api/movies/:imdbId
- TV endpoints: GET /api/tv, GET /api/tv/:tmdbId, GET /api/tv/:tmdbId/seasons/:seasonNumber
- Anime endpoints: GET /api/anime and GET /api/anime/:malId
- POST /api/admin/seed-top-movies — add 60 new popular eligible movie records
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
- VidLink's documented iframe examples do not use the HTML `sandbox` attribute. Situla therefore leaves the cross-origin VidLink frame unsandboxed so the provider player can initialize; adding sandbox restrictions can stop its verification/player flow. The iframe is not granted the `picture-in-picture` capability.
- The Android WebView blocks known ad/tracker request domains, rejects popup windows, blocks user-gesture subframe navigation to non-VidLink domains; Android WebView's built-in Safe Browsing remains at its platform default (enabled on supported devices). Normal desktop/mobile browsers cannot reliably inspect or cancel arbitrary navigation inside a cross-origin VidLink iframe, so browser-only ad blocking remains best-effort. VidLink's documented customization parameters do not include a captions/CC-off option; Situla cannot remove a control from the provider's cross-origin player UI.
- Playback streams are fetched directly by the user's browser from VidLink and its media providers. The Situla server API does not proxy video streams. A server-side TMDB/Jikan API proxy would not bypass ISP restrictions on the browser's direct VidLink/media requests.
- Do not deploy a public or automatically rotating VPN/proxy exit service from the website. Any outbound proxy must be a private, operator-managed service with explicit hosting, privacy, access-control, capacity, and provider-policy review.
- Use third-party player embeds only where their terms and content rights permit.
- TMDB does not endorse or certify this product. Jikan is not affiliated with MyAnimeList.
