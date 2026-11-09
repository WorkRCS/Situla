# Situla Catalog Content Policy (A–Z)

**Document status:** Editorial and ingestion specification  
**Applies to:** Movies, TV series, seasons/episodes, and anime series  
**Purpose:** Define what may enter the Situla catalog, what must be rejected, which records may be imported automatically, and what requires manual review.

This document is the authoritative catalog rulebook for manual curation and the current seed/import pipeline. A record is eligible only when it passes the rules for its media type **and** every universal safety, identity, metadata, artwork, and duplicate check below. A title being popular or highly rated does not override an exclusion.

---

## A — Adult, age classification, and age-gating

1. Records explicitly marked **adult** by the metadata provider are prohibited from automatic import.
2. Pornographic works, explicit sexual-performance content, hentai, and titles whose primary purpose is sexual stimulation are prohibited.
3. A provider's `adult: false` flag is not proof that a title is suitable for every age. It only means the provider did not classify the record as adult under that field.
4. Preserve the available country certification or audience rating (for example, US film certification or TV content rating). Do not infer a rating when one is missing.
5. A mature certification alone does not make an otherwise eligible mainstream film or show pornographic. It must still pass the non-explicit-content and editorial checks.
6. Never remove, lower, or misrepresent a maturity rating to make a title appear family-friendly.

## B — Broadcast and media format

1. **Movies:** Include feature-length films with a valid release date and a stable IMDb title ID. A short film, clip, trailer, behind-the-scenes video, music video, or bonus feature is not a movie catalog entry under the current movie policy.
2. **TV:** Include episodic TV series with a valid series record, a first-air date, poster, and episode/season metadata where provided.
3. **Anime:** The automatic anime importer accepts only MyAnimeList types `TV` and `ONA`.
4. Anime `OVA`, `Special`, `Movie`, `Music`, and other types are outside the current automatic anime import scope. They require a deliberate policy/code change before being added.
5. A movie must not be entered as a TV series, and a TV season or episode must not be entered as a standalone movie merely to bypass the format rules.

## C — Completeness, credits, certification, and content description

1. Use the provider's canonical title, original title, synopsis, release/air date, artwork, and available rating data.
2. Do not fabricate cast, crew, runtime, season count, episode count, certification, synopsis, language, or release date.
3. Cast and crew fields may be displayed when a trusted source supplies them; they are not mandatory fields for the current seeders.
4. Keep the original synopsis meaning. Light editorial cleanup is allowed; promotional claims, invented plot details, and misleading wording are not.
5. If the certification is available, store it. If it is absent, keep it blank rather than guessing.

## D — Duplicate prevention and identity

1. A movie is uniquely identified by its valid IMDb title ID (`tt` followed by 5–12 digits).
2. A TV series is uniquely identified by its positive numeric TMDB TV ID.
3. An anime series is uniquely identified by its positive numeric MyAnimeList ID (MAL ID).
4. Do not create a second record because the title has alternate spelling, translated title, remaster, poster variant, or punctuation differences.
5. A remake, reboot, sequel, prequel, or separately released title may be a distinct record only when it has its own canonical provider ID and is genuinely a distinct work.
6. Existing IDs must be checked before insert. Duplicate-key errors must be counted as duplicates, not reported as successful inserts.
7. Never merge two distinct works merely because their titles are identical.

## E — Exploitation, abuse, and illegal material

Reject material that is primarily intended to exploit, sexualize, abuse, or endanger a person. Prohibited examples include:
- Sexual content involving minors or any depiction that sexualizes a minor.
- Non-consensual intimate imagery or voyeuristic sexual exploitation.
- Sexual violence presented as pornography or erotic entertainment.
- Content whose primary purpose is recruitment, praise, or operational propaganda for a designated violent extremist organization.
- Material that promotes trafficking, coercive abuse, or real-world exploitation as an objective to imitate.

A fictional mainstream work may depict difficult topics as part of a legitimate narrative. Such depictions require the maturity/content description to be preserved and must not be converted into promotional or instructional material.

## F — Film genre allowlist

The current **automatic movie importer** accepts a movie only when at least one of these TMDB genre IDs is present:
- `878` — Science Fiction
- `9648` — Mystery
- `14` — Fantasy
- `27` — Horror
- `28` — Action
- `12` — Adventure

A movie may have additional secondary genres, but it must have at least one allowlisted genre. Pure Comedy, Romance, Drama, Family, Animation, Documentary, Music, History, War, Western, or Thriller-only entries are outside this import allowlist unless a later approved policy revision expands it.

## G — Genre integrity and genre handling

1. Use the genres supplied by the trusted metadata source; do not add genres based on a guess from the title or poster.
2. Preserve all verified genres, not just the genre that made the record eligible.
3. A title with several genres is eligible for the current movie/TV importer when it has at least one allowlisted genre and passes all remaining checks.
4. The current TV allowlist is: Action & Adventure (`10759`), Sci-Fi & Fantasy (`10765`), Mystery (`9648`), Crime (`80`), Drama (`18`), and War & Politics (`10768`).
5. Genre names must remain consistent with the metadata provider; avoid ad hoc category labels that change between records.

## H — Hentai, Ecchi, and explicit anime

1. Anime records with the Hentai genre are prohibited.
2. Anime records with the Ecchi genre are prohibited by the current automatic policy.
3. Reject explicit pornographic anime even if the provider type says `TV` or `ONA`.
4. The Jikan `sfw=true` discovery filter is required, but it is not a substitute for checking the genre and adult-content fields returned in the record.
5. A missing Hentai/Ecchi tag is not permission to ignore an explicit synopsis, rating, or other obvious adult classification.

## I — IDs, metadata source, and source integrity

1. **Movies:** IMDb ID is Situla's canonical catalog identity. TMDB may be used server-side to obtain movie artwork/metadata or resolve the numeric ID needed by the VidLink player, but this does not change the IMDb identity.
2. **TV:** Use the TMDB TV series ID. TV seasons and episodes are associated with that series ID and the season/episode numbers.
3. **Anime:** Use the MyAnimeList ID. Jikan v4 is the read-only metadata interface used by the current anime importer.
4. IDs must be obtained from a trusted source response or verified official metadata page. Never guess IDs.
5. Never use a provider's image or title as evidence that playback is licensed or that a stream is available.
6. Do not store credentials, session tokens, private user data, player embed HTML, or arbitrary remote scripts in a catalog record.

## J — Japanese anime and language handling

1. The anime catalog may contain Japanese-language original titles with English title/localization fields when supplied.
2. Keep Japanese, English, and romanized titles in their corresponding fields; do not put a fan translation into an official-title field.
3. The current anime discovery uses Jikan's SFW TV-type popularity listing and requires a poster, episode count, score, and minimum vote count.
4. Subtitle and dub playback choices are player options. They do not determine whether a title is eligible for the catalog.
5. Anime records are not required to be English-original; the English-original restriction applies to the current Movie and TV seeders, not to Anime.

## K — Kids, family, and safeguarding

1. Never classify a title as children's content solely from animation, colourful artwork, or a young protagonist.
2. Do not add a "Kids" or "Family safe" label unless a trusted rating or verified editorial review supports it.
3. A children's title may be eligible only if it also passes the media-type allowlist and all identity/metadata checks. Under the current movie genre allowlist, a pure Family title is not automatically eligible.
4. Do not expose children to sexually explicit, pornographic, exploitative, or adult-only content through a child/family category.
5. If a title's target audience or rating is uncertain, do not mark it as family-friendly.

## L — Language and localization rules

1. Current Movie imports require `originalLanguage = en`.
2. Current TV imports require `originalLanguage = en`.
3. Original language and localized title are different fields; an English title does not make a non-English original-language record eligible for the current Movie/TV importers.
4. Anime is exempt from the English-original requirement.
5. Preserve the original language code and title fields; do not overwrite them with the interface language.

## M — Metadata minimums

### Movie minimum fields
- Valid IMDb ID.
- Non-empty title.
- English original language.
- `adult = false`.
- Valid release date.
- Poster path.
- At least one approved movie genre.
- Provider detail response that can be mapped into the Situla Movie schema.

Runtime, rating, vote count, backdrop, keywords, and certification should be stored when present; the current movie seeder does not reject a title solely because one of those optional fields is absent.

### TV minimum fields
- Positive numeric TMDB TV ID.
- Non-empty title.
- English original language.
- `adult = false`.
- First-air date.
- Poster path.
- At least one approved TV genre.
- Vote average of at least **5.5**.
- At least **100 votes**.
- Provider detail response that can be mapped into the Situla TV schema.

Season count, episode count, episode stills, backdrops, certification, and keywords should be saved when supplied. Missing season details may be fetched and cached when a user opens the season.

### Anime minimum fields
- Positive numeric MAL ID.
- Type is `TV` or `ONA`.
- SFW discovery result.
- No Hentai or Ecchi genre.
- Poster URL.
- Episode count greater than zero.
- MAL score of at least **6.5**.
- At least **500 scored votes**.
- Provider detail sufficient to populate title, synopsis, type, and other available metadata.

## N — Non-consensual, hateful, and harmful content

1. Prohibit pornographic/non-consensual sexual material and exploitative imagery.
2. Do not promote hateful dehumanization, targeted harassment, or calls for violence as Situla editorial content.
3. A mainstream fictional work or documentary may discuss discrimination, violence, terrorism, war, or abuse in a critical, historical, or narrative context; preserve context and age rating rather than endorsing the conduct.
4. Do not use plot summaries, tags, or featured artwork that glorify real-world abuse or encourage imitation.

## O — Official release and publication status

1. The current Movie importer requires a release date. It does not currently require that the date be in the past, so future-dated records must be clearly treated as upcoming rather than already released.
2. The current TV importer requires a first-air date and excludes records with null first-air dates.
3. Anime records must have valid provider identity, poster, and positive episode count. An announced title with no episodes is not eligible for the current automatic import.
4. Do not label an unreleased, cancelled, or announced project as currently streaming.
5. Preserve provider status such as Returning Series, Ended, Cancelled, or Upcoming when available.

## P — Posters, backdrops, and image quality

1. Movie and TV automatic imports require a valid poster path.
2. Anime automatic imports require a valid poster URL.
3. Use official provider artwork URLs returned by the metadata source; do not make up image URLs.
4. Reject missing, broken, blank, placeholder, unrelated, or misleading artwork when manually reviewing a record.
5. Backdrop, season poster, episode still, and trailer are optional metadata unless a future policy makes them mandatory.
6. Do not replace a title's poster with unrelated fan art or an image of another title.

## Q — Quality, popularity, and minimum signal

1. Current Movie automatic import is popularity-sorted and uses the approved genre/date/poster/language/adult/IMDb checks. It currently has **no minimum movie vote count or score threshold**.
2. Current TV automatic import requires vote average ≥ 5.5 and vote count ≥ 100.
3. Current Anime automatic import requires score ≥ 6.5 and scored-by count ≥ 500.
4. Popularity is a discovery ordering signal, not proof of quality, safety, legality, or suitability.
5. Do not fabricate a rating or boost vote counts. Keep rating scale and source consistent.

## R — Rating and review rules

1. Store source ratings as provided (for example, TMDB vote average or MAL score).
2. A TMDB vote average of 5.5 and a MAL score of 6.5 are separate scales/source rules; never compare them as if they were identical.
3. Vote count thresholds are minimum evidence thresholds, not guarantees of editorial quality.
4. Preserve country-specific certification when available and display it accurately.
5. Pending manual imports must remain pending until an authorized reviewer approves them. The popular seeders may auto-approve only when their explicit eligibility checks pass.
6. Rejected records must not appear in public catalog endpoints.

## S — Sexual content, SFW rules, and synopsis screening

Prohibited:
- Pornography or explicit sexual acts intended for arousal.
- Hentai and Ecchi anime under the current policy.
- Sexual content involving minors or the sexualization of minors.
- Sexual exploitation, non-consensual intimate imagery, voyeuristic sexual material, or trafficking content.

A mainstream non-pornographic title may discuss relationships, sexuality, assault, or abuse as part of a serious narrative. Such a title is not automatically prohibited solely because the subject is mentioned; its content rating and narrative context must remain clear. Escalate uncertain cases for manual review.

## T — TV series eligibility

A TV record is automatically eligible only when it passes every TV minimum in Section M and has at least one of these TMDB genres:
- Action & Adventure (`10759`)
- Sci-Fi & Fantasy (`10765`)
- Mystery (`9648`)
- Crime (`80`)
- Drama (`18`)
- War & Politics (`10768`)

The automatic TV seeder excludes adult records, non-English original-language records, records without a first-air date, records without a poster, records below 5.5 average rating, and records with fewer than 100 votes. A TV record that does not pass all conditions is not inserted by the popular TV seeder.

## U — Unverified, incomplete, and unsupported records

Reject or hold for review:
- Missing, malformed, or conflicting canonical IDs.
- Missing required poster, release/air date, or minimum metadata for that media type.
- Empty or meaningless titles and placeholder synopses.
- Duplicate entries or records that point to the wrong title.
- Data whose provider response cannot be mapped safely.
- Unsupported formats or anime types outside the current `TV`/`ONA` allowlist.

Never turn an API failure, timeout, or missing response into a successful import count.

## V — Violence, horror, self-harm, and dangerous acts

1. Mainstream action, adventure, fantasy, science-fiction, mystery, and horror are allowed genres for movies when all other movie rules pass.
2. Fictional violence or horror is not, by itself, an automatic rejection under the current genre allowlist.
3. Preserve maturity certification and source content advisories when supplied.
4. Reject promotional descriptions that encourage real-world violence, self-harm, dangerous stunts, weapon use, or criminal acts.
5. Do not provide instructional tags or summaries that turn fictional harmful acts into real-world how-to guidance.
6. Graphic or disturbing material with unclear classification should be held for manual review.

## W — Wrong, misleading, or manipulated information

Reject records with:
- A poster, synopsis, release date, language, rating, or ID belonging to another work.
- Deliberately inflated ratings, vote counts, or popularity claims.
- A synopsis copied from an unrelated title or invented by the importer.
- A false "official", "licensed", "available now", "dubbed", or "subtitled" assertion.
- A title artificially split into multiple duplicate records.

Correct metadata only from a trusted source and keep a review note for manual corrections.

## X — X-rated, explicit, and extreme adult classifications

1. X-rated, NC-17, pornographic, sexually explicit adult works, and equivalent explicit adult content are not eligible for the catalog.
2. A provider's adult flag, certification, synopsis, genres, and manually reviewed artwork should be considered together.
3. Do not confuse an R/TV-MA mainstream narrative rating with pornographic content. Keep the actual certification, but reject explicit adult material.
4. A title with unclear or conflicting adult classification must be held for review rather than silently approved.

## Y — Year, date, and chronology

1. Movie release dates must be valid provider dates. The current movie API allows a year filter from 1870 through the current year.
2. TV first-air dates must be valid for automatic TV seeding; null first-air dates are excluded.
3. Derive `releaseYear` from the provider date/year field. Do not invent a year from the title.
4. Preserve original release/air date and do not substitute a re-release date unless the provider's record identifies that as the canonical date.
5. Distinguish a release year from a season air year and from the date the record was imported.

## Z — Zero-tolerance and final acceptance checklist

A title must be rejected, or held from public approval, if any of the following applies:
- Pornography, explicit sexual performance content, Hentai, or Ecchi anime.
- Sexual exploitation, any sexualization of minors, or non-consensual sexual imagery.
- Adult-flagged records.
- Invalid, missing, guessed, or mismatched canonical IDs.
- Duplicate canonical IDs.
- Missing mandatory artwork/date/metadata for that media type.
- Failure to satisfy its media-type genre/type/rating/vote thresholds.
- Misleading synopsis/artwork/rating, fabricated details, or manipulated popularity.
- Unsafe or unsupported media format.
- Import/network/database failure presented as an insertion.

### Final automatic eligibility matrix

| Rule | Movies | TV series | Anime series |
|---|---|---|---|
| Canonical ID | IMDb `tt...` | Numeric TMDB TV ID | Numeric MAL ID |
| Original language | English only | English only | Any supported language |
| Adult flag | Must be false | Must be false | SFW result; no explicit adult content |
| Type | Feature film | Episodic TV series | `TV` or `ONA` |
| Genre rule | At least one: 878, 9648, 14, 27, 28, 12 | At least one: 10759, 10765, 9648, 80, 18, 10768 | Hentai and Ecchi prohibited |
| Minimum score | None currently | 5.5 / 10 | 6.5 / 10 |
| Minimum votes | None currently | 100 | 500 scored votes |
| Release/air date | Required | First-air date required | Provider date retained when available |
| Poster | Required | Required | Required |
| Runtime/episodes | Runtime optional | Season and episode metadata retained | Episode count > 0 |
| Duplicate rule | Unique IMDb ID | Unique TMDB TV ID | Unique MAL ID |

### Importer behavior and counts

- Movie seeder default: **60 new eligible movies**.
- TV seeder default: **50 new eligible TV series**.
- Anime seeder default: **50 new eligible anime series**.
- Existing canonical IDs are skipped and counted as duplicates.
- Only successful database writes count as imported.
- Failed detail requests and failed database writes must be reported as failures.
- Public catalog endpoints read approved records only; importing and public browsing are separate actions.
- Pagination must use the API's `pagination.total` and `pagination.totalPages`, not assume the first 40 results are the entire catalog.
- All approved items must remain addressable by their canonical ID so a paginated catalog does not hide records beyond the first page.

---

**Review rule:** When a record falls between "allowed" and "prohibited", do not auto-approve it. Leave it pending for an authorized human reviewer and record the reason.
