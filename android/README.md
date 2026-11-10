# Situla Android

The Android application is a native WebView shell for the hosted Situla website.

## Build

- Android Gradle Plugin and Gradle configuration are in this directory.
- CI builds a debug APK with `gradle --no-daemon :app:assembleDebug`. The Android workflow uses JDK 17; the Brave JNI bridge Kotlin sources are compiled by the app's own Kotlin plugin.
- The Gradle Wrapper is checked in completely (`gradlew`, `gradlew.bat`, and the Gradle 9.8.2 wrapper JAR). It downloads the exact Gradle 9.8.2 binary ZIP from the Aliyun public mirror because some networks cannot reach the upstream Gradle download host. The ZIP is verified against Gradle's independently published SHA-256 checksum before use. Downloads use a two-minute timeout and three retries.
- If the Gradle download still reports `ConnectException` or `Connection timed out`, this is generally a machine/network/proxy connection issue rather than an invalid version string. Check that HTTPS access to `downloads.gradle.org` is allowed. If your network requires a proxy, configure it in your user-level Gradle properties file (`%USERPROFILE%\.gradle\gradle.properties` on Windows), not in this repository. Example (replace the host and port with values supplied by your network administrator):

  ```properties
  systemProp.https.proxyHost=proxy.example.com
  systemProp.https.proxyPort=8080
  systemProp.http.proxyHost=proxy.example.com
  systemProp.http.proxyPort=8080
  ```

  Do not commit proxy credentials or personal proxy settings to Git. You can also use Android Studio's **Settings → Appearance & Behavior → System Settings → HTTP Proxy** when the IDE itself needs a proxy.
- The WebView loads the hosted Situla website configured in `SitulaApp.kt`. The current Android URL is `https://situla-five.vercel.app/`; `SitulaApp.kt`, Gradle fallback, and the adblocker's default first-party host are kept in sync. The Brave filter engine starts with built-in fallback rules before the page is loaded, then loads EasyList, EasyPrivacy, uBlock Origin ads/privacy filters, Brave-specific/Android-specific rules, Brave regional first-party rules (including Indian site cosmetics), and Brave Unbreak rules, refreshing them every 12 hours.

## Catalog IDs and playback

- Movie and TV catalog records use IMDb title IDs (`tt...`).
- Movie and TV playback opens VidLink Pro directly with the IMDb title ID; no numeric player source ID is stored or queried.
- Anime uses a MyAnimeList ID with the VidLink anime endpoint.
- No Admin API, metadata importer, or crawler is used by the Android client.

## Local watch history

Room watch history uses IMDb ID as its primary key. The Room 1-to-2 migration clears old local history entries, because numeric provider IDs cannot be reliably converted to IMDb IDs offline.

## Network routing and filtering

- The Android client includes the open-source WireGuard tunnel library. Six local region profile slots are supported: Singapore, Malaysia, Japan, Germany, Netherlands and Poland.
- When auto-connect is enabled, app launch selects the available region with the lowest previously measured HTTPS route latency. On a first connection, it falls back to the selected region (Singapore by default), then the first imported region.
- With two or more provisioned profiles, optional five-hour region rotation is supported. Latency is checked over the active tunnel every 30 seconds.
- Imported profiles are stored only in the app's private no-backup directory. Situla normalizes each profile to full-tunnel routing (IPv4 + IPv6) and AdGuard DNS. The VPN requires a real provider-issued WireGuard .conf profile for each region. No public VPN gateway, account, or server key is bundled or invented by this repository.
- The Android WebView uses Brave's `adblock-rust` engine through the community-maintained [Kotlin/JNI bridge](https://github.com/mlm-games/adblock-rs-kt-wrapper) (MPL-2.0). Its two Kotlin wrapper source files are vendored under `app/src/main/java/org/mlm/adblock/`; the `0.1.3` AAR is resolved only as a raw archive to extract its prebuilt JNI `.so` files and `resources.json`. This avoids the upstream AAR's `minCompileSdk 37` metadata requirement while keeping Situla on compile SDK 36. See `third_party/NOTICE.md` and the accompanying MPL-2.0 license copies.
- Network filtering runs in WebView request interception for Situla pages and player frames. Cosmetic selectors/scriptlets are applied to the Situla top-level document; the app cannot inspect the DOM inside a cross-origin Hindi/English player iframe. Popup windows are explicitly rejected using WebView multiple-window callbacks and untrusted top-level redirects remain blocked. This is not a full Brave Shields implementation: same-host or in-stream video ads may remain, and aggressive filters can occasionally affect player resources.
- The WireGuard VPN runs in the Android app only. A normal desktop/mobile browser cannot start an operating-system VPN from a website; use a trusted device VPN or a properly provisioned edge network there.
