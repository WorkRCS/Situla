# Situla Android app

Movie-first Android MVP built with Kotlin and Jetpack Compose. The app reads only approved movie metadata from the Situla backend; it does not ship hard-coded movie/demo records.

## Build locally

Open the `android/` folder in Android Studio with JDK 17, Android SDK platform 36, AGP 9.2.1 and Gradle 9.4.1. The GitHub Actions Android workflow also builds the debug APK.

## Configure backend URL

Create or edit `android/local.properties` (do not commit it) and add:

```properties
situlaApiBaseUrl=https://YOUR-VERCEL-PROJECT.vercel.app/
```

Use the real Vercel project origin. For Android Emulator only, `http://10.0.2.2:3000/` reaches a local Node.js backend. The URL is not a secret; TMDB and admin credentials must remain server-side.

## Implemented foundation

- Netflix-inspired Home, branded vector splash/icon, native vector icons, Search, movie detail and local History screens.
- System appearance follows Android dark/light mode. Back navigation returns through player → detail → previous tab → Home; player fullscreen requests landscape and restores the device's normal orientation on exit.
- Movie lists are lazy, image requests are asynchronous, and the player surface expands edge-to-edge while fullscreen.
- TMDB posters load asynchronously and lists use lazy layouts with stable TMDB IDs.
- Retrofit/OkHttp requests have bounded connect/read/call timeouts; admin cookies are kept in memory.
- Room history database is app-private and excluded from backup/device transfer. Indexes support recent history and continue-watching queries.
- History stores resume position separately from cumulative actual playback time; recorder flushes every 15 seconds.
- Admin sign-in and IMDb-ID import form call the backend resolver.
- Media3 player surface and playback-progress recorder are wired to an optional `playbackUrl`; the app requires an authorized HTTPS stream URL for each playable movie. No video URL is generated from an IMDb/TMDB identifier.

## IMDb import test set

The in-app test set contains IMDb title IDs only (no hard-coded movie metadata). The backend resolves IDs through TMDB `/find/{external_id}` and imports only English, non-adult titles with release dates, posters, and one of the configured Action/Adventure/Fantasy/Horror/Mystery/Science Fiction genres. New titles remain pending until an admin approves them.

## VS Code / emulator smoke test (Windows PowerShell)

From the repository root, pull the merged main branch:

```powershell
git checkout main
git pull origin main
```

Add the actual Vercel origin to `android/local.properties` (keep the local SDK path too):

```properties
sdk.dir=C:\\Users\\YOUR_USER\\AppData\\Local\\Android\\Sdk
situlaApiBaseUrl=https://YOUR-VERCEL-PROJECT.vercel.app/
```

Start an existing Android Virtual Device from VS Code's terminal:

```powershell
emulator -list-avds
emulator -avd YOUR_AVD_NAME
adb wait-for-device
```

Install and launch the app (requires Gradle 9.4.1 and JDK 17 on PATH):

```powershell
cd android
gradle --no-daemon :app:installDebug
adb shell monkey -p com.workrcs.situla 1
```

On macOS/Linux, use the same `gradle --no-daemon :app:installDebug` command from `android/` after installing Gradle 9.4.1. The checked-in repository currently includes wrapper properties but not the generated wrapper scripts, so use the installed Gradle command for this first emulator test. Android Studio is not required after Android SDK, platform 36, build-tools 36.0.0 and an AVD are installed.

## Requires real deployment data before activation

- VPN tunnel and four-region failover: actual region, gateway endpoint, peer/public key and client configuration are required. The app deliberately does not claim a connection without them. Android has only one active VpnService per user/profile.
- Brave adblock-rust: must be compiled for target Android ABIs and connected to the chosen network path. This first branch does not yet intercept traffic or claim protection.
- Playback: the existing player's authorized media provider/URL integration is not in this metadata-only backend. No third-party streaming URLs are invented or scraped.
- Real IMDb import: requires TMDB API connectivity and a valid key on the backend. Imported movies start pending and must be approved before public display.

## Performance and privacy

No background crawler, periodic network polling or eager poster downloads. UI lists are lazy, image decoding is asynchronous, and network timeouts are bounded. History stays in app-private storage; uninstalling or clearing app data removes it. Admin passwords are entered at login and are not compiled into the APK or stored in an INI file.
