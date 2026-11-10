# Situla catalogue content policy

Situla's catalogue is maintained as committed static seed data and stored in MongoDB. The regular seed commands do not run metadata crawlers or contact IMDb, TMDB, TVmaze or MAL.

## Identity keys

| Catalogue type | Required unique key | Player identity |
| --- | --- | --- |
| Movie | IMDb title ID (`tt...`) | IMDb title ID |
| TV series | Numeric TMDB TV ID | TMDB TV ID plus season and episode |
| Anime | Numeric MyAnimeList ID | MAL ID plus episode and Sub/Dub |

Movies must contain a valid IMDb ID matching `^tt\d{5,12}$`. TV series must contain a positive numeric `tmdbId`. Anime must contain a positive numeric `malId`. Each collection uses its own unique identity key.

## Static seed data

The curated seed lists live in `data/movie-catalog.js`, `data/tv-catalog.js`, and `data/anime-catalog.js`.

- Movies: IMDb Top 250 shortlist additions with title, poster URL, year, runtime, IMDb rating and genres.
- TV: TMDB-keyed TV additions with title, poster URL, first-air date, genres, and overall season/episode totals.
- Anime: MAL-keyed TV Anime additions with title, poster URL, episode count, rating, rank and basic metadata.

Run `npm run seed:catalog` to bulk-upsert all three lists, or `npm run seed:movies`, `npm run seed:tv`, and `npm run seed:anime` to run one catalogue. Upserts use `$setOnInsert`, so existing documents with the same primary ID are preserved. The seed scripts require only `MONGODB_URI` and `MONGODB_DB_NAME`; they do not call external metadata services.

Static TV entries include aggregate season and episode counts but do not invent individual episode names or season breakdowns. When a verified guide is present in a TV record, Situla keeps the existing dropdown and guide. When no guide is present, the series detail page accepts a season and episode number directly for VidLink playback. Add season and episode details only when verified.

## Playback notes

- Movie: VidLink `/movie/{imdbId}`.
- TV: VidLink `/tv/{tmdbId}/{season}/{episode}`.
- Anime: VidLink `/anime/{malId}/{episode}/{subOrDub}?fallback=true`.

Movie, TV and Anime players use the same Situla warm-gold embed settings. The external provider controls whether a particular stream, episode, resolution or audio track is available. Situla does not download or store copyrighted video files.

## Data quality and policy

- Keep valid, unique IDs and absolute poster URLs.
- Keep ratings between 0 and 10, with their provenance clear in the source file.
- Keep TV season and episode numbers numeric; include individual episode data only when verified.
- Use `adult: false` for curated static TV entries and do not add Adult, Erotica, Pornographic or Hentai genres.
- Keep Anime types to TV or ONA for the current Anime-series catalogue.
- Do not store iframe HTML or player URLs in catalogue documents.

## Sources

The static additions are derived from public catalogue datasets: [IMDb Top 250 JSON shortlist](https://github.com/sharmadhiraj/free-json-datasets/blob/master/docs/sports-entertainment/imdb_top_movies.json), [Vetustas Archiva TV dataset](https://github.com/0xShady/vetustas-archiva/tree/main/datasets) (MIT-licensed), and [Anime Stats Tracker seasonal dataset](https://github.com/zyhe16/anime-stats-tracker) (MIT-licensed). Situla stores catalogue metadata and external poster URLs; the seed process itself makes no requests to these sources.
