# Situla Android app

Kotlin + Jetpack Compose Android client for the Situla movie catalog.

## Integrations now wired into the app

- **VidLink movie player:** movies use the backend's `tmdbId` in `https://vidlink.pro/movie/{tmdbId}`. The app embeds VidLink in a WebView wrapper, blocks pop-up windows and JavaScript alert/confirm dialogs, filters player network requests with Brave adblock-rust, and rejects non-HTTPS or external top-level redirects.
- **Watch progress:** VidLink `PLAYER_EVENT` and `MEDIA_DATA` postMessage events update the local Room history. Saved resume position is passed back with VidLink's `startAt` query parameter. Progress remains local to this device.
- **Brave adblock-rust:** the Rust engine is compiled as an Android JNI library. The default Windows Emulator Debug build compiles x86_64 only; a physical-device build can select ARM ABIs with a Gradle property. EasyList, EasyPrivacy and URLHaus host rules are fetched over HTTPS, cached in no-backup app storage, and refreshed after three days. Network rules filter requests inside the VidLink WebView; popup windows, JavaScript dialogs and external top-level redirects are blocked.
- **WireGuard VPN:** the app embeds the official WireGuard Android tunnel library. Six region slots are available (Singapore, Malaysia, Japan, Germany, Netherlands and Poland). Singapore is the default auto-connect region; if no Singapore profile is provisioned, the app falls back to the first available region. Five-hour rotation works across any two or more provisioned region profiles. For each provider profile, Situla automatically writes `AllowedIPs = 0.0.0.0/0, ::/0` and AdGuard DNS; nobody has to edit IP-routing lines by hand. The app disconnects and stops rotation when the process moves to the background.
- **DNS protection through VPN:** the app replaces the profile DNS line with AdGuard DNS `94.140.14.14` and `94.140.15.15` when connecting. This filters known ad/tracker domains and provides phishing-domain protection when traffic uses the VPN's DNS resolver.

## Important limitations

1. The application cannot invent real VPN exit servers or public IP addresses. Four actual region gateways must exist and be provisioned by a VPN provider or by Situla's own VPN control plane. In this current build, a provider-issued profile is still imported once per region. Automatic per-user profile provisioning from a backend is not yet active because no VPN provider/control-plane API or four gateway credentials have been supplied. The app correctly remains disconnected rather than showing a fake status.
2. Imported profiles must contain a valid `[Interface]` key/address and one `[Peer]` endpoint/public key. Situla automatically inserts or replaces the peer's `AllowedIPs` with `0.0.0.0/0, ::/0` and sets AdGuard DNS. The app does not create the VPN server's peer, client key allocation or exit IP; those must be provisioned by the provider/control plane.
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

## Android Studio setup (Windows Terminal tab inside Android Studio)

Run these commands in Android Studio's built-in Terminal tab (PowerShell). Android Studio's Gradle daemon stays enabled for incremental builds. Install JDK 17 and Gradle 9.4.1 first; verify with `java -version` and `gradle --version`.

```powershell
# Android SDK environment (change path if your SDK is elsewhere)
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin"

# Required Android SDK packages, including the NDK used by Rust
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools" "emulator" "ndk;27.2.12479018" "system-images;android-36;google_apis;x86_64"

$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\27.2.12479018"
$env:ANDROID_NDK_ROOT = $env:ANDROID_NDK_HOME

# Rust compiler + emulator target + cargo-ndk (Brave adblock-rust)
rustup toolchain install stable
rustup default stable
rustup target add x86_64-linux-android
cargo install cargo-ndk --locked

# To build for physical ARM phones as well, install these extra targets:
# rustup target add aarch64-linux-android armv7-linux-androideabi

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
gradle :app:assembleDebug
gradle :app:installDebug

# Launch Situla and inspect runtime logs
adb shell monkey -p com.workrcs.situla 1
adb logcat -s AndroidRuntime System.err
```

The debug APK output is:

`android/app/build/outputs/apk/debug/app-debug.apk`

Use Android Studio's normal Run button after syncing Gradle; the commands above are only for diagnostics. The default Debug build compiles only the x86_64 Rust library used by the standard Windows Emulator, which avoids compiling unused ARM variants on every first emulator build. For a physical ARM device, build with `-PsitulaAndroidAbis=arm64-v8a,armeabi-v7a,x86_64`. The repository has Gradle wrapper properties but does not include generated `gradlew` scripts or `gradle-wrapper.jar`; use the installed `gradle` command shown above.

## First-run configuration inside Situla

1. Open **Settings → VPN**.
2. Select Singapore, Malaysia, Japan, Germany, Netherlands or Poland and provision the matching region profile. Repeat for each region you intend to use.
3. Grant Android's VPN permission when prompted, then connect. Confirm the WireGuard provider shows a successful handshake/connected tunnel.
4. Singapore is the default auto-connect region. Automatic rotation becomes available when at least two working region profiles are provisioned and the tunnel is connected.
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
