# Situla Android

The Android application is a native WebView shell for the hosted Situla website.

## Build

- Android Gradle Plugin and Gradle configuration are in this directory.
- CI builds a debug APK with `gradle --no-daemon :app:assembleDebug`. The Android workflow uses JDK 21 for the Brave adblock JNI bridge.
- The WebView loads the hosted Situla website configured in `SitulaApp.kt`. The current Android URL is `https://situla-five.vercel.app/`; `SitulaApp.kt`, Gradle fallback, and the adblocker's default first-party host are kept in sync.

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
- The Android WebView uses Brave's `adblock-rust` engine through the third-party Kotlin/JNI bridge [`io.github.mlm-games:adblock:0.1.3`](https://github.com/mlm-games/adblock-rs-kt-wrapper). The engine loads EasyList, EasyPrivacy, uBlock Origin ads/privacy filters, Brave-specific/Android-specific rules, Brave regional first-party rules (including Indian site cosmetics), and Brave Unbreak rules in the background, caches them in app-private storage, and refreshes them every 12 hours. A built-in host-rule fallback remains available offline. The bridge and Brave engine are MPL-2.0; the JNI bridge is community-maintained and is not an official Brave Android SDK.\n- Network filtering runs in WebView request interception for Situla pages and player frames. Cosmetic selectors/scriptlets are applied to the Situla top-level document; the app cannot inspect the DOM inside a cross-origin Hindi/English player iframe. Popup windows are explicitly rejected using WebView multiple-window callbacks and untrusted top-level redirects remain blocked. This is not a full Brave Shields implementation: same-host or in-stream video ads may remain, and aggressive filters can occasionally affect player resources.
- The WireGuard VPN runs in the Android app only. A normal desktop/mobile browser cannot start an operating-system VPN from a website; use a trusted device VPN or a properly provisioned edge network there.
