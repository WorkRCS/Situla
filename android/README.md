# Situla Android app

Kotlin + Jetpack Compose Android client for the Situla movie catalog.

## Integrations now wired into the app

- **VidLink movie player:** movies use the backend's `tmdbId` in `https://vidlink.pro/movie/{tmdbId}`. The app embeds VidLink in a WebView wrapper, blocks pop-up windows and JavaScript alert/confirm dialogs, filters player network requests with Brave adblock-rust, and rejects non-HTTPS or external top-level redirects.
- **Watch progress:** VidLink `PLAYER_EVENT` and `MEDIA_DATA` postMessage events update the local Room history. Saved resume position is passed back with VidLink's `startAt` query parameter. Progress remains local to this device.
- **Brave adblock-rust:** the Rust engine is compiled as an Android JNI library for arm64-v8a, armeabi-v7a and x86_64. EasyList, EasyPrivacy and URLHaus host rules are fetched over HTTPS, cached in no-backup app storage, and refreshed after three days. Network rules filter requests inside the VidLink WebView; popup windows, JavaScript dialogs and external top-level redirects are blocked.
- **WireGuard VPN:** the app embeds the official WireGuard Android tunnel library. Four region slots are available (Malaysia, Singapore, Japan and Germany). Import one provider-issued WireGuard `.conf` profile per region, connect/disconnect manually, optionally auto-connect to a selected region on app launch, and rotate through the four profiles every four hours while Situla stays in the foreground. The app disconnects and stops rotation when the process moves to the background.
- **DNS protection through VPN:** the app replaces the profile DNS line with AdGuard DNS `94.140.14.14` and `94.140.15.15` when connecting. This filters known ad/tracker domains and provides phishing-domain protection when traffic uses the VPN's DNS resolver.

## Important limitations

1. The application code cannot create VPN servers or regional exit IP addresses. You must obtain four real full-tunnel WireGuard profiles from a VPN provider or operate your own WireGuard servers. Without those `.conf` files, the VPN stays disconnected and never shows a fake connected state.
2. The imported profiles must contain an `[Interface]` section, a valid private key, a `[Peer]` section and an endpoint, and route **both** IPv4 and IPv6 using `AllowedIPs = 0.0.0.0/0, ::/0`. The app validates the full-tunnel routes before saving. DNS is replaced with AdGuard DNS by the app.
3. DNS blocking only blocks domains included in the DNS provider's block policy. It cannot reliably remove ads served from the same host as the video, ads stitched into the video stream, every app's private DNS-over-HTTPS traffic, or all clickable overlays. Brave request filtering and pop-up/redirect blocking apply to Situla's VidLink WebView; they are not a system-wide packet inspection firewall.
4. Brave's Rust engine supports cosmetic filters, but this Android build does not inject cosmetic selectors into VidLink's cross-origin iframe. Browser same-origin isolation prevents Situla from safely hiding every inline element inside that remote frame. The current integration focuses on network-request filtering plus popup/redirect blocking; some inline overlays may remain.
5. VidLink is an external playback provider. A valid TMDB ID starts the player, but the provider may not have a playable source for every movie. Availability is not guaranteed by Situla.
6. WireGuard region rotation is a foreground coroutine. The app intentionally disconnects on app background/exit; the next launch auto-connects to the saved region if enabled and the Android VPN permission has been granted.

## Backend configuration

Create or edit `android/local.properties` (do not commit it):

```properties
sdk.dir=C:\\Users\\YOUR_USER\\AppData\\Local\\Android\\Sdk
situlaApiBaseUrl=https://YOUR-VERCEL-PROJECT.vercel.app/
```

The API must return the movie's numeric `tmdbId` and imported movie records must be approved in the backend before they appear in the public catalog. IMDb IDs are resolved by the backend to TMDB IDs; the VidLink movie route requires the TMDB ID.

## Windows PowerShell setup (VS Code terminal)

Run these from the repository root. Install JDK 17 and Gradle 9.4.1 first; verify with `java -version` and `gradle --version`.

```powershell
# Android SDK environment (change path if your SDK is elsewhere)
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin"

# Required Android SDK packages, including the NDK used by Rust
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools" "emulator" "ndk;27.2.12479018" "system-images;android-36;google_apis;x86_64"

$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\27.2.12479018"
$env:ANDROID_NDK_ROOT = $env:ANDROID_NDK_HOME

# Rust compiler + Android Rust targets + cargo-ndk (for Brave adblock-rust)
rustup toolchain install stable
rustup default stable
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo install cargo-ndk --locked

# Create an emulator once (skip if you already have an AVD)
avdmanager create avd -n Situla_API_36 -k "system-images;android-36;google_apis;x86_64" -d pixel_7

# Start emulator
emulator -avd Situla_API_36
adb wait-for-device

# Pull the latest main branch (the changes are committed directly on main)
git checkout main
git pull origin main

# Build and install
cd android
gradle --no-daemon :app:assembleDebug
gradle --no-daemon :app:installDebug

# Launch Situla and inspect runtime logs
adb shell monkey -p com.workrcs.situla 1
adb logcat -s AndroidRuntime System.err
```

The debug APK output is:

`android/app/build/outputs/apk/debug/app-debug.apk`

Android Studio is not required for the command-line build once JDK, Gradle, Android command-line tools, SDK packages, Rust and cargo-ndk are installed. The repository has Gradle wrapper properties but does not include generated `gradlew` scripts or `gradle-wrapper.jar`; use the installed `gradle` command shown above.

## First-run configuration inside Situla

1. Open **Settings → VPN**.
2. Select Malaysia, Singapore, Japan or Germany and import the matching provider-issued `.conf` file. Repeat for all four regions.
3. Grant Android's VPN permission when prompted, then connect. Confirm the WireGuard provider shows a successful handshake/connected tunnel.
4. Enable **Auto-connect on app launch** for the selected region. Enable **Automatic region rotation** after all four profiles are imported and the tunnel is connected.
5. Open **Brave Adblock → Update ad & malware filters**. On first launch the app also tries to download and initialize these lists automatically.
6. Open an approved movie. The player uses the numeric TMDB ID returned by the Situla backend. The player provider must have a source available for that movie.

## Source and license references

- Brave adblock-rust: https://github.com/brave/adblock-rust (MPL-2.0)
- WireGuard for Android tunnel library: https://git.zx2c4.com/wireguard-android/ (Apache-2.0)
- EasyList: https://easylist.to/
- URLHaus: https://urlhaus.abuse.ch/
- AdGuard DNS: https://adguard-dns.io/kb/general/dns-providers/

## Privacy and performance

VPN profiles live in the app's no-backup private directory and are not uploaded to Situla's backend. Watch history is local to the device. Filter lists are cached locally and refreshed on demand/when stale; there is no background crawler or always-on list updater. The Android app disconnects the WireGuard tunnel when the process goes to the background.
