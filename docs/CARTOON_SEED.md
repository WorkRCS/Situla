# Cartoon catalogue seed

Run `npm run seed:cartoons` from the repository root after configuring only:

```dotenv
MONGODB_URI=...
MONGODB_DB_NAME=situla
```

No TMDb, IMDb, TVmaze, or other metadata API key is required. The generator uses public Cinemeta, TVmaze, Wikidata and StreamX endpoints. It discovers and validates animation/family records, requires a release year of 2000 or later, resolves canonical TMDB IDs, writes generated JSON packs under `data/`, then inserts only new records into `CartoonMovie`, `CartoonSeries` and supporting `CartoonEpisode` rows.

Targets are 200 new Cartoon Movies and 300 new Cartoon TV Series. Series discovery combines TVmaze's animated-show index with Cinemeta's Animation/Family catalogs and uses Cinemeta episode metadata as a fallback when TVmaze has incomplete coverage. Candidate discovery is broad, but the final record gate still requires an Animation genre, a children/family signal or a safe rating, and rejects adult/horror metadata. Series are not discarded solely because a public catalogue omits its episode guide or rating; missing episode counts remain zero/unavailable and no episode rows are fabricated. When source season summaries exist, they are retained. The generator performs a full preflight before any database insert. If public sources cannot supply every validated record, the default behavior inserts all available validated records and reports the shortfall; it never requires the full 200/300 targets before writing. Use `--strict` to restore all-or-nothing preflight behavior. The response cache is saved under `data/.cartoon-seed-cache/`; rerun to reuse completed metadata requests. Use `--refresh` to discard cached responses or `--dry-run` to generate the packs without database writes.

Generated files:
- `data/cartoon-movies.generated.json`
- `data/cartoon-series.generated.json`
- `data/cartoon-episodes.generated.json`

Ratings and provider popularity are copied from public sources. Hot/Popular/Featured are derived from votes, source popularity and release recency; they are not randomly assigned. Hindi original audio and Hindi dub languages are stored separately. TVmaze metadata/source links are retained; its metadata is CC BY-SA. Video files/streams are never downloaded.
The original 1992 Shin-chan TV series and original 1998 Oggy & the Cockroaches series are excluded by the year rule; post-2000 Shin-chan films and later Oggy successor series may qualify. Motu Patlu, Doraemon (2005), Ninja Hattori Returns and Oggy & the Cockroaches: Next Generation have explicit priority matching where their source IDs are available.
