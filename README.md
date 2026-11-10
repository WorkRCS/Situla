# Situla

Situla is a mobile-first movie, TV and anime catalog built as a Next.js website. Catalog content is stored in MongoDB. The existing 70 IMDb-keyed Movie records remain curated locally; a separate five-part Cinemeta discovery seed adds 500 new, fully validated Movie records using IMDb IDs as the only Movie catalog keys. Anime additions are committed in part files. TV candidates are committed locally; the explicit TV seed verifies descriptions, seasons, episodes and artwork against TVmaze before writing to MongoDB.

## Identifiers and playback

- Movies: IMDb title ID (`tt...`) is the required unique Situla route and catalog key. Playback uses `https://vidlink.pro/movie/{imdbId}`.
- TV series: numeric TMDB TV ID is the required unique Situla catalog key. Playback uses `https://vidlink.pro/tv/{tmdbId}/{season}/{episode}`. The detail route is `/tv/{tmdbId}`, and the player route is `/watch/tv/{tmdbId}/{season}/{episode}`.
- Anime: MAL ID is the required catalog and playback key. Playback uses `https://vidlink.pro/anime/{malId}/{episode}/{subOrDub}?fallback=true`. `sub` and `dub` are validated; the player can switch to the alternate audio.
- Movie, TV and Anime VidLink embeds share Situla's warm-gold player theme (`primaryColor=e8b65b`, `secondaryColor=171a23`). The optional Hindi Movie player uses the IMDb path format `https://slast430did.com/play/{imdbId}` with the same Situla theme.

The provider controls stream availability, resolution and audio tracks. Situla does not download or store copyrighted video files.

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` and `MONGODB_DB_NAME`.
4. Run `npm install`.
5. Run `npm run dev` to start only the local Next.js website at `http://localhost:3000`. It does not run a seed, crawler or migration.
6. Open `http://localhost:3000`. The health endpoint is `/api/health`.

## Static catalogue seed

Movies and TV retain separate identifiers. Anime has its own **new-only MAL seed**, and TV has a verified **200-new-series seed**:

- Existing Movies: 70 IMDb IDs in data/movie-catalog.js. New Movies: five IMDb-keyed Cinemeta discovery parts in data/movie-additions-01.js through data/movie-additions-05.js, aggregated by data/movie-additions.js; the seed fetches IMDb IDs directly and adds exactly 500 new records after a complete metadata/artwork preflight.
- Existing TV Series: numeric TMDB IDs in data/tv-catalog.js.
- New TV candidates: more than 200 unique TMDB IDs in data/tv-additions.js; the seed accepts exactly 200 only after exact title/year matching, complete synopsis/episode-guide checks, adult-genre filtering and artwork validation.
- Existing/legacy Anime: MAL IDs in data/anime-catalog.js; this list is not re-seeded or updated by the Anime additions command.
- New Anime: 200 MAL-ID matched entries in data/anime-additions-01.js through data/anime-additions-16.js, aggregated by data/anime-additions.js.

The new Anime pack includes individual poster/banner references, synopsis, canonical MAL links, franchise/related-season cards, and numbered season/episode guide entries. The curated pack contains 200 unique new MAL IDs, 2,883 episode guide entries, and 2,881 episode still-image references. A missing episode still is left blank rather than borrowing an image from another episode or title.

### Anime check, artwork audit and new-only seed

From the Situla project folder:

```sh
npm run check:anime
npm run audit:anime
```

The first command validates the static pack, ID/title uniqueness, posters, banners and episode guide coverage. The artwork audit is a **dry run** and reports existing Anime records with no usable poster or banner/backdrop. It does not delete anything. It writes the full checked-title and image URL list to reports/anime-artwork-audit.json for review.

After reviewing the audit report, apply the cleanup:

```sh
npm run audit:anime:apply
npm run seed:anime
```

The cleanup deletes only Anime documents that have neither a usable poster nor a usable banner/backdrop. A record with at least one valid artwork image is retained. The new-only seed then inserts the curated additions whose MAL ID and title are not already in the collection. It uses insertMany in insert-only mode; it does not update or replace existing Anime records.

### Verified Movie additions (five parts; 500 new titles)

The five discovery files separate popular, IMDb-rated, Drama, Action and Animation catalogues. At seed time the importer reads candidate IMDb IDs from Stremio's public Cinemeta catalogue, requests each title's metadata directly by IMDb ID, and independently validates its poster and landscape background image responses. No TMDb API or TMDb image host is used by the Movie seed.

A Movie is accepted only when it has a unique valid IMDb ID, title and original title, an 80+ character synopsis, a reachable poster and landscape background, release year, runtime, at least one genre, cast and director credits. Adult titles are excluded. Release date, language, production company/country, spoken languages, tagline, trailer and collection details are stored when the provider supplies them; missing optional facts are not fabricated. The whole remaining target is prepared and validated before any new Movie document is inserted. If 500 complete new records are not available, the seed stops before writing them. The insert uses `Movie.insertMany`; it never updates or replaces existing Movie documents. The existing 70 curated IMDb-keyed Movie records remain separate and untouched.

Run the static checks and then the seed:

```sh
npm run check:movies
npm run seed:movies
```

The Movie seed requires only `MONGODB_URI` and `MONGODB_DB_NAME` in `.env`. Metadata is fetched from Stremio Cinemeta over public HTTPS; no TMDb token, IMDb API subscription, or metadata API key is required. The GitHub Actions seed workflow also has a `movies` run selection and needs only the two MongoDB secrets for that selection. Situla stores the IMDb title ID as the sole Movie key and links each record to its IMDb title page.

### Movie and TV seeds

The Movie command first inserts any missing entries from the original 70-record static Movie pack using insert-only semantics, then adds the 500 complete Cinemeta-verified IMDb-keyed additions. The TV seed separately prepares 200 new TV additions and inserts them in insert-only mode. Like the Anime additions seed, the new TV seed never updates existing TV documents; the previous 70 static TV records are left untouched. Neither seed alters Anime:

```sh
npm run seed:movies
npm run seed:tv
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
- `GET /api/movies?page=1&limit=40`
- `GET /api/movies/discover`
- `GET /api/movies/suggestions?q=inception`
- `GET /api/search?q=the+office` (searches Movies, TV series and Anime together)
- `GET /api/movies/:imdbId`
- `GET /api/tv?page=1&limit=40`
- `GET /api/tv/:tmdbId`
- `GET /api/tv/:tmdbId/seasons/:seasonNumber`
- `GET /api/anime?page=1&limit=40`
- `GET /api/anime/:malId`

## Browser access

The website is restricted to Brave Browser only. Brave is recognized through its documented `Sec-CH-UA` brand hint when supplied, with a browser-side `navigator.brave.isBrave()` verification fallback. Successful Brave verification is cached in a first-party cookie for up to 400 days.

The native Android app, source project, and Android build workflow have been permanently removed from this repository. Existing Android app builds are not allowed to access the website.
