# Situla Catalog Crawling, Curation & Seeding Policy

> **Purpose for future AI assistants:** Read this file before changing Movie, TV-series, or Anime catalog data, crawler/curation scripts, seed scripts, API pagination, or catalog rendering. This is the source-of-truth operating procedure for extending Situla without changing canonical IDs, damaging existing records, or inserting incomplete metadata.

## 1. The operating model: AI curation first, seed second

Situla does **not** run an uncontrolled crawler on every website visit. The workflow has two distinct stages:

1. **Research and curation (AI-assisted, offline from the production website).** When asked to add N movies, N TV series, or N Anime, the assistant researches candidate IDs and metadata from the providers documented below. It checks exact title/year/ID matches, artwork, episode data, source attribution, duplicates, and content safety. It writes the verified candidates into version-controlled files under `data/`, split into numbered parts where appropriate.
2. **Validation and database seed (user-run).** The repository's check/seed scripts validate those files and fetch any provider details that the implementation is designed to fetch at seed time. The user runs a terminal seed command. The script inserts the records into MongoDB. The website reads the MongoDB records through its read-only API and renders the posters, backgrounds, titles, descriptions, metadata, seasons, and episode guides.

The assistant must never describe this as “the seed script crawls the whole internet.” It does not. Research/ID discovery is an explicit curation task; the seed script only contacts the named providers and processes the checked data files.

### Which stage currently obtains each catalog's data?

| Catalog | AI/manual research and committed data | What the seed fetches live | Required user secrets |
|---|---|---|---|
| Movies | Five Cinemeta catalog definitions in `data/movie-additions-01.js` … `05.js` | Candidate catalog pages and full metadata by IMDb ID from Cinemeta; poster/background response checks | `MONGODB_URI`, `MONGODB_DB_NAME` |
| TV series | Candidate IDs, titles, premiere dates, poster references and source links in `data/tv-additions.js` | Matching show record and embedded season/episode data from TVmaze; poster and episode-still checks | `MONGODB_URI`, `MONGODB_DB_NAME` |
| Anime | Fully curated MAL-ID entries and metadata/artwork/episode-guide snapshots in `data/anime-additions-01.js` … `16.js` | No metadata-provider crawl; validates the committed pack and inserts it | `MONGODB_URI`, `MONGODB_DB_NAME` |

**No normal Movie, TV, or Anime seed needs an IMDb API subscription or a TMDb API token.** The only normal runtime credentials are the two MongoDB settings. The optional `TMDB_API_KEY` / `TMDB_API_READ_ACCESS_TOKEN` belongs only to the legacy TV-ID migration utility (`npm run migrate:tv-tmdb`), not the standard catalog seed commands.

## 2. Canonical identifiers — never change these casually

| Catalog | Canonical Situla key | Format | Other provider IDs |
|---|---|---|---|
| Movie | `imdbId` | IMDb title ID such as `tt0133093` | Cinemeta is queried using that IMDb ID. Do not create/use a TMDb movie ID as the Movie key. |
| TV series | `tmdbId` | Positive numeric TMDb TV ID | `sourceId` is the matched TVmaze show ID; `externalImdbId` is an optional cross-reference only. |
| Anime | `malId` | Positive numeric MyAnimeList ID | AniList, TVDB, and Anime Mapper references are metadata/artwork references, not the Anime key. |

- Normalize Movie IMDb IDs to lowercase and validate with `^tt\\d{5,12}$`.
- Never use a title, slug, provider's incidental row number, or image URL as a database key.
- Do not switch TV from `tmdbId` or Anime from `malId` without a separately planned migration, backup, route/API update, and tests.
- Never put a TV `externalImdbId` into `tmdbId`, or a TMDb ID into an IMDb field.

## 3. Provider registry and exact usage

### 3.1 Movies — Stremio Cinemeta, with IMDb IDs as keys

**Primary metadata provider:** [Stremio Cinemeta](https://github.com/Stremio/stremio-addons/blob/master/docs/tutorial/using-cinemeta.md), the Stremio metadata add-on. It is not the IMDb official API and is not TMDb.

- Default endpoint: `https://v3-cinemeta.strem.io`
- Optional endpoint override: `CINEMETA_API_BASE` (only when the code explicitly supports it).
- Candidate catalog route: `/catalog/movie/{catalogId}.json`
- Candidate pagination: Stremio catalog extra parameters are in one path segment, e.g. `/catalog/movie/top/skip=100.json` or `/catalog/movie/top/genre=Drama&skip=100.json`. Do not put each extra parameter in a separate path segment.
- Detail route: `/meta/movie/{imdbId}.json`
- Discovery parts currently used:
  - `movie-additions-01.js`: `top` — popular/general catalog.
  - `movie-additions-02.js`: `imdbRating` — IMDb-rating catalog.
  - `movie-additions-03.js`: `top` filtered by Drama.
  - `movie-additions-04.js`: `top` filtered by Action.
  - `movie-additions-05.js`: `top` filtered by Animation.
- Artwork provider/fallback: [MetaHub image endpoint](https://images.metahub.space), using `/poster/medium/{imdbId}/img` and `/background/medium/{imdbId}/img`, plus artwork returned by Cinemeta.
- The seeder verifies the poster and landscape background URL by trying an HTTP HEAD request and, where needed, a small ranged GET. A valid HTTPS URL alone is not proof that an image is reachable.
- No TMDb API request, TMDb token, or IMDb official API key is used by this Movie seeder.

**Movie minimum acceptance gate for every new record:**

- Unique, valid IMDb ID not already in MongoDB or another part.
- Correct title and original title (use the supplied original title; fallback to title only when provider does not distinguish them).
- Synopsis/overview of at least 80 meaningful characters.
- Reachable portrait poster **and** separate reachable landscape backdrop.
- Valid release year, positive runtime, and at least one genre.
- At least one credited cast member and one director.
- Explicit adult material and disallowed adult genres rejected.
- IMDb source link and `metadataSource: "Cinemeta API"`.
- Never invent a tagline, trailer, certificate, budget, revenue, company, country, language, collection, or cast credit. Those fields are stored only when the provider supplies trustworthy data.

**The 500 additions are a target, not permission to weaken validation.** If fewer than 500 fully valid new records can be found, the seeder must stop before beginning its insert and report what was missing. Do not fill the gap with duplicates, guessed metadata, broken artwork, or unrelated IDs.


### 3.1.1 Manually curated Movie pack (offline)

- `data/movie-curated-2020-2026.js` contains 38 manually curated 2020–2026 Movie records with IMDb IDs, title/original title, original synopsis text, release dates, runtime, genres, cast and director credits, canonical IMDb source links, and distinct keyless Metahub poster/backdrop URLs.
- The factual candidate set (IMDb IDs, release dates, director, runtime, and genre leads) was cross-checked against [Vetustas Archiva's movies dataset](https://github.com/0xShady/vetustas-archiva/tree/main/datasets), whose dataset license is **CC BY-SA 4.0**. Preserve this attribution and ShareAlike notice when adapting those factual rows. Descriptions and selected credits were independently curated; they are not copied plot text.
- This is a researched first batch, not a complete global filmography. It does not claim to include every film released worldwide in the date range. Additional verified rows must be added to the same part-file format before global coverage can be claimed.


### 3.2.1 Manually curated TV mini-series pack (offline)

- `data/tv-curated-2020-2026.js` currently contains four validated static limited-series records: *Mare of Easttown* (TMDB `115004`, IMDb `tt10155688`, TVmaze `40546`), *The Queen's Gambit* (TMDB `87739`, IMDb `tt10048342`, TVmaze `41428`), *Baby Reindeer* (TMDB `241259`, IMDb `tt13649112`, TVmaze `52426`), and *Unorthodox* (TMDB `99581`, IMDb `tt9815454`, TVmaze `41072`). Each has a complete per-season guide (7, 7, 7 and 4 episodes), synopsis, canonical TMDB/IMDb references, a portrait poster, separate landscape backdrop and unique episode thumbnail URLs.
- TVmaze show/episode facts and adapted descriptions are licensed under **CC BY-SA 4.0**. Credit and link to the matching [TVmaze show page](https://www.tvmaze.com/shows/40546/mare-of-easttown), [The Queen's Gambit](https://www.tvmaze.com/shows/41428/the-queens-gambit), and [Baby Reindeer](https://www.tvmaze.com/shows/52426/baby-reindeer), [Unorthodox](https://www.tvmaze.com/shows/41072/unorthodox), and preserve CC BY-SA attribution/share-alike for the adapted metadata. Stills/posters are external hotlinks from TVmaze, Netflix or TheTVDB; they are not downloaded or rehosted. Landscape backdrops are separately selected from Netflix/Apple TV assets.
- These are three manually verified complete series, not a complete global 2020–2026 television catalogue. Add additional titles only when their canonical TMDB ID, exact title/year match, description, poster/backdrop and complete per-episode still guide can be verified.

### 3.2 TV series — Vetustas Archiva candidates + TVmaze detail/episode API

**Candidate ID/title/year source:** [Vetustas Archiva TV dataset](https://github.com/0xShady/vetustas-archiva/tree/main/datasets) (CC BY-SA 4.0 dataset; retain attribution and ShareAlike notice for adapted rows).

- Candidate file: `data/tv-additions.js`.
- Canonical Situla key: `tmdbId`.
- Candidate data includes title, premiere date, initial season/episode totals, poster reference, genres, network/country/creators where researched, and a reference/source URL.
- The candidate poster may be a static image URL on the TMDb image host. That does **not** mean the TV seed calls the TMDb API.
- Candidate references must be retained so future assistants can re-check exact title/year identity.

**Live metadata provider:** [TVmaze public REST API](https://www.tvmaze.com/api). No API key is required by the current seeder.

- Search/match: `/singlesearch/shows?q={title}&embed=episodes`, then `/search/shows?q={title}` when necessary.
- Exact detail/episode retrieval: `/shows/{tvmazeShowId}?embed=episodes`.
- The seeder requires an exact normalized title match **and** a matching premiere year. A similar title, remake, regional version, or different premiere year is not accepted.
- Season and episode guide data is built from the TVmaze embedded episode list, not copied blindly from the candidate's advertised totals.
- `numberOfSeasons` is calculated from regular seasons (season 0 specials are separate); `numberOfEpisodes` is calculated from the saved season/episode guide.
- Episode titles and season/episode numbers are required. Duplicate or non-contiguous episode numbering is rejected.
- At least five episodes and at least 80% reachable episode still images are required by the current validator.
- A series synopsis must be at least 80 characters; a valid poster and premiere date are mandatory.

**Artwork and backdrop rule:**

- Prefer the matched TVmaze poster when available, otherwise use the already curated candidate poster if it independently validates.
- Episode stills come from the matched TVmaze episode records.
- A portrait poster must never be reused as a landscape backdrop.
- **Current limitation:** `TVSeries.backdropUrl` is optional in the present schema/validator. The current `data/tv-additions.js` candidate pack has no separate `backdropUrl` values. Do not claim that this current TV batch has complete banners. If a future request requires a banner for every series, the assistant must research a separate landscape artwork source, add a specific `backdropUrl` per candidate, validate it, and tighten the validator to reject missing/broken backdrops before seeding. Do not invent or stretch a poster to fake a banner.

**TV attribution/licensing:**

- The TVmaze API is licensed under [CC BY-SA](https://www.tvmaze.com/api). Preserve a clickable TVmaze source link in the app and comply with its attribution and ShareAlike conditions.
- Preserve Vetustas Archiva attribution and the dataset's CC BY-SA 4.0 terms. The code in its separate `scripts/` directory is MIT-licensed; do not confuse that code license with the data license.
- Do not remove attribution fields when changing DTOs, schemas, seeders, or detail pages.

### 3.3 Anime — MyAnimeList IDs with committed Anime Mapper snapshots

**Canonical key:** MAL ID (`malId`), with canonical page `https://myanimelist.net/anime/{malId}`.

**Current candidate and metadata sources:**

- Seasonal shortlist/candidate source: [Anime Stats Tracker](https://github.com/zyhe16/anime-stats-tracker) (MIT-licensed, as documented in the repository README).
- Matched static metadata, franchise relations, season ordering, and episode records: [Anime Mapper](https://github.com/subhajeetch-fl/anime-mapper) static data snapshots (MIT-licensed, as documented in the repository README).
- The curated data is split among `data/anime-additions-01.js` … `data/anime-additions-16.js` and aggregated by `data/anime-additions.js`.
- Artwork references in the current snapshots include MyAnimeList CDN posters, AniList CDN banners/related-title posters, and TVDB episode stills (for example `cdn.myanimelist.net`, `s4.anilist.co`, and `artworks.thetvdb.com`). Keep each URL attached to the title/episode that it actually describes.
- These are committed snapshots; `npm run seed:anime` does not call Jikan, MAL, AniList, TVDB, or Anime Mapper at runtime.
- Jikan is **not** currently wired into the Anime seed. Do not add a Jikan dependency or assume it is active without updating this policy, code, and tests.

**Anime minimum acceptance gate for future additions:**

- Unique positive MAL ID, not present in existing Anime records or another part.
- Japanese/original title and English title when the source provides them; never translate or fabricate a title.
- Synopsis of at least 80 meaningful characters.
- A reachable portrait poster, poster fallback, landscape banner and backdrop reference. Banner must be a real landscape image, not a stretched poster.
- Release year/airing date, episode total, format/type, status, season and rating metadata whenever the matching source supplies them.
- Genre, theme, studio, and producer arrays must be grounded in the matching title's records.
- Related/franchise cards must carry the correct MAL IDs and relation type.
- Episode guide must preserve season number, episode number, title, air date, runtime, Japanese title where available, and a matching episode still. Do not borrow a still from another episode or series.
- Current static check requires at least five episode entries and at least 80% episode still coverage. For a future “complete episode guide” request, require exact agreement between the verified source episode count and stored guide count; if a source has no complete guide, label the guide as partial or do not accept the record for a full-guide batch.
- Adult/explicit entries must be excluded from general-audience catalogs.

The Anime seed currently expects exactly 200 curated additions in its pack, verifies the committed records, inserts only new MAL IDs/titles, and never updates existing Anime documents.

## 4. Required data quality: no invented or mismatched metadata

For all three catalogs:

1. **Correct identity first.** Verify canonical ID, title, language/edition, and release/premiere year. For remakes, reboots, sequels, alternate cuts, and regional versions, verify the exact record.
2. **Descriptions must be real.** Do not replace a missing synopsis with a generic sentence, plot guessed from the title, or copied description from another work.
3. **Artwork must belong to that exact work.** Validate HTTPS and image response. Keep portrait posters and landscape backgrounds separate. Episode stills must match the exact episode.
4. **Counts must be calculated, not guessed.** TV season/episode totals come from the saved episode guide. Anime episode-guide count must be reconciled to its source when the user asks for a complete guide. Movie runtime/date/year come from the matched movie metadata.
5. **Do not fabricate optional metadata.** Store empty/null only for fields the current schema marks optional. If the user explicitly requires a field (for example, every series must have a banner), promote it to a required validation gate and collect enough candidates to replace rejects.
6. **Reject adult/unsafe catalog entries** for the general catalog, including adult-marked records and adult/erotica/porn/hentai genre labels. Do not evade provider flags.
7. **Keep provenance.** Store `sourceUrl`, `referenceUrl`, `metadataSource`, and source IDs where the current model supports them. Keep license/attribution notes in README and on the user-facing detail page where required.
8. **No copyrighted video scraping or downloads.** Situla stores metadata and external artwork references only. Playback remains handled by the existing player provider; seeders must not fetch, store, proxy, or redistribute movie/episode video files or stream URLs.

## 5. Future complete-content standard requested for Situla additions

The catalog owner has explicitly asked that future additions be complete rather than merely renderable. Apply this stricter standard to **every new batch researched after this policy update**, even where a legacy seeder still has a looser threshold:

- **Movies:** every accepted record must have its own verified portrait poster, verified landscape backdrop, title/original title, real synopsis, release year/date where supplied, runtime, genre, cast and director. The Movie validator already enforces the current core gates.
- **TV series:** every accepted new series must have a verified portrait poster **and a separate verified landscape backdrop**. The current legacy 200-addition TV pack has no independent `backdropUrl` candidates and the current TV validator permits a missing backdrop; that legacy behavior is not permission to omit banners from future batches. Before adding more TV series, research a real title-matched landscape image for every candidate, store it in the candidate part, and update `validateTvSeriesRecord` and tests to reject a missing or broken backdrop.
- **TV episodes:** use the complete source episode listing, preserve every season and episode number/title, and reconcile `numberOfSeasons` and `numberOfEpisodes` against that saved guide. For a batch advertised as complete, every episode must have its own reachable still image (100% coverage); do not count the existing 80% legacy threshold as a complete episode pack.
- **Anime:** every accepted new title must have a separate portrait poster, poster fallback, landscape banner and backdrop, plus a complete verified episode guide for its actual format. Reconcile the saved guide length with the provider's complete episode/season listing. For a batch advertised as complete, every episode must have its own matching reachable still image (100% coverage), not merely the current legacy 80% check.
- For every catalog, the full target batch must pass all of these checks before the insert starts. If a source cannot provide the required field, search a second compatible source with a matching ID/title/year or reject the candidate. Do not fill fields with guessed text, repeated posters, unrelated stills, fake banners, or placeholder episode names.
- Update the seeder validator and automated tests **before** writing the new data pack. A policy statement without a matching validator is not enforcement.

**Legacy-data note:** the currently committed TV additions may legitimately have no landscape backdrop and may have up to 20% missing episode stills; the current Anime static check also uses an 80% still-coverage threshold. They must not be described as meeting this new future “complete-content” standard until separately enriched and audited. Existing records must never be silently overwritten during that enrichment; use an explicit, reviewed, separately scoped insert-safe migration/enrichment task.

---

## 5. Part files, uniqueness, and batch targets

- Store discovery/candidate data in `data/`, not inline in UI components or database route handlers.
- Split large catalogs into numbered files (for example `movie-additions-01.js`, `anime-additions-16.js`) and aggregate them in one index module.
- Keep part keys, labels, source URLs, source IDs and target counts explicit.
- Deduplicate by canonical ID first; also use normalized title + year as a safety check where appropriate.
- Read existing MongoDB records before selecting new IDs. Never silently replace legacy IDs or records.
- Preflight the whole requested batch before insert. If the accepted count is below target, report rejects and stop instead of inserting a knowingly incomplete batch.
- Use insert-only operations (`insertMany` or carefully constrained `$setOnInsert`) for additions. No `updateOne`, replacement, or cleanup of existing catalog records during a new-additions seed.
- Re-running a seed must be safe: already present IDs/titles are skipped and only missing additions are inserted. A unique database index remains the final duplicate guard.
- If a database write is interrupted after a partial insert, re-run the same insert-only seed after examining the log; it must fill only the remaining IDs.

## 6. Commands and environment

From the repository root:

```sh
npm install
npm run check:movies
npm run check:tv
npm run check:anime
npm test
npm run build
```

Seed one catalog:

```sh
npm run seed:movies
npm run seed:tv
npm run seed:anime
```

Seed all three catalogs (the `seed:catalog` alias is defined in `package.json`):

```sh
npm run seed:catalog
```

Required `.env` values for every seed:

```dotenv
MONGODB_URI=...
MONGODB_DB_NAME=situla
```

- Do not put real credentials in Git, policy files, screenshots, chat messages, or committed `.env.example`.
- GitHub Actions uses repository secrets `MONGODB_URI` and `MONGODB_DB_NAME`.
- The normal Movie seed has no TMDb/IMDb/Cinemeta API key requirement.
- The normal TVmaze public API call has no API key requirement.
- The committed Anime pack has no provider API key requirement.
- `TMDB_API_KEY` / `TMDB_API_READ_ACCESS_TOKEN` are only for the legacy `migrate:tv-tmdb` migration if that migration is deliberately run.

## 7. User-interface contract after seeding

A successful seed is only useful if the catalog can render and paginate correctly.

- Movie feeds use IMDb IDs; TV feeds use numeric TMDb IDs; Anime feeds use MAL IDs.
- A refresh/new page load should request a new random first batch for Movies, TV and Anime. The client remembers up to 120 recently shown canonical IDs per catalog and passes them as exclusions to the next refresh so the same batch is not immediately repeated.
- “Load more” must request another batch while excluding every ID already displayed. It must not reuse the wrong key field (for example, TV must deduplicate by `tmdbId`, never `imdbId`).
- The API must return a correct total count and a deterministic pagination contract. Random pagination should use an exclusion list rather than sampling a fresh `page * limit` array and skipping into it; that old approach can repeat or omit titles between requests.
- Search results must combine Movies, TV series and Anime in a mixed/interleaved order, not three separate category blocks. Selecting a result must route using the correct catalog key.
- Search entry should open an accessible dialog/window containing mixed results, with keyboard Escape/Enter behavior, an outside-click close action, and a visible full-search path.
- Use lazy image loading and async image decoding for catalog poster thumbnails. Avoid eager-loading every image in a large grid.
- Keep API requests bounded by a timeout, abort stale requests when a page/query changes, and show loading/error states. Prevent concurrent duplicate “Load more” requests.
- Keep initial batches and cards bounded for mobile/low-memory devices. Use off-screen rendering deferral where supported, avoid expensive blur/animation/filter effects, and honor `prefers-reduced-motion`.
- Do not claim the site is “lag free” without testing representative low-end hardware and slow-network profiles. Use measured performance (load time, long tasks, request count, image bytes, and interaction latency) to make performance claims.

## 8. Future AI task checklist

When the user later says “add 100 movies”, “add 50 TV series”, or “add 80 Anime”:

1. Read this policy and the matching current seed/check scripts first.
2. Confirm current primary key and the actual target/part-file layout from code; do not rely on memory alone.
3. Inspect current records and existing IDs to avoid collisions.
4. Research more candidates than the requested target so validation rejects do not shrink the final batch.
5. Match records against the named provider using exact ID/title/year rules.
6. Fill every required metadata and artwork field from the correct source. Do not invent missing values or reuse unrelated images.
7. Save source and license attribution, split data into numbered parts, and update the aggregator/target only when appropriate.
8. Update mapping/validation tests for the new provider shape and any new fields. Keep insert-only behavior.
9. Run the catalog check, full test suite, and production build.
10. Report the number prepared, rejected, inserted, and remaining. Never say “seeded” until the user-run command or actual database operation confirms it.

## 9. Upstream technical references

- [Stremio Cinemeta usage guide](https://github.com/Stremio/stremio-addons/blob/master/docs/tutorial/using-cinemeta.md)
- [Stremio add-on protocol](https://stremio.github.io/stremio-addon-sdk/protocol.html)
- [Stremio catalog pagination and Cinemeta metadata lookup](https://stremio.github.io/stremio-addon-sdk/advanced.html)
- [TVmaze API and CC BY-SA license](https://www.tvmaze.com/api)
- [Vetustas Archiva TV candidates](https://github.com/0xShady/vetustas-archiva/tree/main/datasets)
- [Anime Stats Tracker](https://github.com/zyhe16/anime-stats-tracker)
- [Anime Mapper static records](https://github.com/subhajeetch-fl/anime-mapper)

---

**Non-negotiable rule:** Never weaken a validation rule just to hit a requested count. Find more correctly matched records, or explain why the requested fully complete batch is not yet available.

## 10. Default seed is offline and release-window bounded

The default commands are `npm run seed:catalog`, `npm run seed:movies`, `npm run seed:tv`, and `npm run seed:anime`. They run `scripts/seed-catalog.js`, read only committed `data/*.js` files, and never call Cinemeta, TVmaze, TMDB, Jikan, MAL, AniList, IMDb or another metadata API. They restrict eligible records to release/airing years **2020–2026 inclusive**.

The offline seed preserves the canonical keys from section 2:
- Movie: valid IMDb `imdbId` matching `tt…`.
- TV: positive numeric TMDB TV `tmdbId`.
- Anime: positive numeric MAL `malId`.

Before connecting to MongoDB, it validates the complete local candidates. Movie requires a real synopsis, separate HTTPS poster/backdrop, year/date, runtime, genres, cast and director. TV requires synopsis, separate HTTPS poster/backdrop and a reconciled full season/episode guide with a matching still for every episode. Anime requires synopsis, poster/fallback, banner/backdrop, year, exact episode-guide count and a matching still for every episode. Adult genres and explicit adult records are rejected. A normalized title/year check is also applied in addition to canonical-ID deduplication. Database writes are insert-only; existing records are never updated.

The seed writes only locally committed records that pass these checks. It reports missing/rejected Movie, TV and Anime candidates rather than lowering the quality threshold or fabricating metadata. **The current committed 2020–2026 data is not complete:** the existing Movie and TV entries do not pass the complete-content checks; the Anime additions pack has 198 records that meet the strict 100%-episode-still rule. Therefore, a successful invocation is an offline partial import until complete static Movie and TV packs are curated. Do not describe this repository as containing every worldwide 2020–2026 release.

The old provider-backed Movie and TV seeders are available only through explicit `legacy-online` package scripts. They are not called by any default seed command. The legacy Anime seed remains available as `seed:anime:legacy-curated` for its historical 80%-still pack, but it is also not the default path.

