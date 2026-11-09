# Situla catalog data policy

Situla's public catalog is maintained manually in MongoDB. There is no admin dashboard, metadata crawler, or automatic metadata importer.

## Identity keys

| Catalog type | Required unique key | Player identity |
| --- | --- | --- |
| Movie | IMDb title ID (`tt...`) | Same IMDb title ID |
| TV series | IMDb title ID (`tt...`) | Same IMDb title ID plus season and episode |
| Anime | MAL numeric ID | Same MAL ID plus episode and Sub/Dub |

Every Movie and TV record must contain a valid IMDb title ID matching `^tt\d{5,12}$`. Documents without a valid ID are excluded from the catalog and removed by the one-time IMDb migration. Duplicate IMDb IDs must be resolved before migration.

## Manual MongoDB fields

Movies use `imdbId`, `title`, optional `originalTitle`, `overview`, `posterUrl`, `backdropUrl`, `releaseDate`, `releaseYear`, `runtime`, `voteAverage`, `voteCount`, `popularity`, `genres`, `keywords`, and `certification`.

TV series use `imdbId`, `title`, the corresponding direct metadata/artwork URL fields, and an embedded `seasons` array. Each season holds `seasonNumber`, summary fields, and an embedded `episodes` array with `episodeNumber`, title, air date, runtime, and direct still-image URL.

Anime remains keyed by MAL ID because its current player integration requires that identifier. Anime records do not use TMDB.

## Playback notes

Movie and TV playback uses an IMDb-compatible VidSrc iframe URL. Anime playback uses VidLink with MAL ID. Player availability depends on the provider and is not guaranteed by the catalog.

A parent page cannot arbitrarily amplify audio inside a cross-origin iframe. The embedded player's own volume control and the device's output volume remain the available controls.

## Data quality

- Use valid, lowercase IMDb IDs for movies and TV.
- Keep one document per IMDb ID in each collection.
- Store absolute poster/backdrop/still URLs, not provider-specific image paths.
- Keep season and episode numbers numeric and positive (except season zero specials).
- Maintain genre names as strings, such as `Action`, `Comedy`, or `Science Fiction`.
- Keep ratings on a 0–10 scale and record their source consistently in the curated data.
- Do not store iframe HTML or player URLs in catalog documents.
