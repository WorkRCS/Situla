# Situla Android

The Android application is a native WebView shell for the hosted Situla website.

## Build

- Android Gradle Plugin and Gradle configuration are in this directory.
- CI builds a debug APK with `gradle --no-daemon :app:assembleDebug`.
- The WebView loads the hosted Situla website configured in `SitulaApp.kt`.

## Catalog IDs and playback

- Movie and TV catalog records use IMDb title IDs (`tt...`).
- Movie and TV playback opens VidLink Pro directly with the IMDb title ID; no numeric player source ID is stored or queried.
- Anime uses a MyAnimeList ID with the VidLink anime endpoint.
- No Admin API, metadata importer, or crawler is used by the Android client.

## Local watch history

Room watch history uses IMDb ID as its primary key. The Room 1-to-2 migration clears old local history entries, because numeric provider IDs cannot be reliably converted to IMDb IDs offline.

## Network filtering

The WebView uses the app's curated request blocker to filter common advertising and tracking hosts. It is best-effort filtering and does not guarantee that all ads, redirects, or media-hosted promotions can be blocked.
