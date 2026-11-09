# Situla Android app

Movie-first Android MVP built with Kotlin and Jetpack Compose. The app reads only approved movie metadata from the Situla backend; it does not ship hard-coded movie/demo records.

## Build locally

Open the `android/` folder in Android Studio with JDK 17, Android SDK platform 36, AGP 9.2.1 and Gradle 9.4.1. The GitHub Actions Android workflow also builds the debug APK.\n\n## Configure backend URL

Create or edit `android/local.properties` (do not commit it) and add:

```properties
situlaApiBaseUrl=https://YOUR-VERCEL-PROJECT.vercel.app/
```

Use the real Vercel project origin. For Android Emulator only, `http://10.0.2.2:3000/` reaches a local Node.js backend. The URL is not a secret; TMDB and admin credentials must remain server-side.

## Implemented foundation

- Netflix-inspired dark Home, branded splash/icon, native vector icons, Search and local History screens.
- TMDB posters load asynchronously and lists use lazy layouts with stable TMDB IDs.
- Retrofit/OkHttp requests have bounded connect/read/call timeouts; admin cookies are kept in memory.
- Room history database is app-private and excluded from backup/device transfer. Indexes support recent history and continue-watching queries.
- History stores resume position separately from cumulative actual playback time; recorder flushes every 15 seconds.
- Admin sign-in and IMDb-ID import form call the backend resolver.
- Media3 dependencies are present for the licensed player integration.

## IMDb import test set

The in-app test set contains IMDb title IDs only (no hard-coded movie metadata). The backend resolves IDs through TMDB `/find/{external_id}` and imports only English, non-adult titles with release dates, posters, and one of the configured Action/Adventure/Fantasy/Horror/Mystery/Science Fiction genres. New titles remain pending until an admin approves them.

## Requires real deployment data before activation

- VPN tunnel and four-region failover: actual region, gateway endpoint, peer/public key and client configuration are required. The app deliberately does not claim a connection without them. Android has only one active VpnService per user/profile.
- Brave adblock-rust: must be compiled for target Android ABIs and connected to the chosen network path. This first branch does not yet intercept traffic or claim protection.
- Playback: the existing player's authorized media provider/URL integration is not in this metadata-only backend. No third-party streaming URLs are invented or scraped.
- Real IMDb import: requires TMDB API connectivity and a valid key on the backend. Imported movies start pending and must be approved before public display.

## Performance and privacy

No background crawler, periodic network polling or eager poster downloads. UI lists are lazy, image decoding is asynchronous, and network timeouts are bounded. History stays in app-private storage; uninstalling or clearing app data removes it. Admin passwords are entered at login and are not compiled into the APK or stored in an INI file.
