import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hindiMoviePlayerUrl, vidlinkMovieUrl } from '../src/player-urls.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Hindi movie iframe blocks popups and top-level redirects while retaining playback scripts', async () => {
  const moviePlayer = await read('../app/watch/[imdbId]/player.jsx');
  const seriesPlayer = await read('../app/components/media-player.jsx');

  assert.match(moviePlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.match(moviePlayer, /sandbox=\{playerLanguage === "hi" \? "allow-scripts allow-same-origin allow-forms allow-presentation" : undefined\}/);
  assert.doesNotMatch(moviePlayer, /allow-popups|allow-top-navigation/i);
  assert.match(seriesPlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.doesNotMatch(seriesPlayer, /\bsandbox\s*=/i);
});

test('Android player keeps targeted ad filtering but does not restrict media source hosts', async () => {
  const blocker = await read('../android/app/src/main/java/com/workrcs/situla/ui/NetworkAdBlocker.kt');
  const player = await read('../android/app/src/main/java/com/workrcs/situla/ui/VidLinkPlayerScreen.kt');

  assert.match(blocker, /private val blockedDomains = setOf/);
  assert.match(blocker, /fun shouldBlock\(/);
  assert.ok(blocker.includes("org.mlm.adblock.AdblockEngine"));
  assert.ok(blocker.includes("AdblockEngine.create()"));
  assert.ok(blocker.includes("checkNetworkRequest("));
  assert.ok(blocker.includes("cosmeticResources("));
  assert.ok(blocker.includes("https://easylist.to/easylist/easylist.txt"));
  assert.ok(blocker.includes("https://easylist.to/easylist/easyprivacy.txt"));
  assert.ok(blocker.includes("https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-specific.txt"));
  assert.ok(blocker.includes("https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-android-specific.txt"));
  assert.ok(blocker.includes("https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-firstparty-regional.txt"));
  assert.ok(blocker.includes("https://raw.githubusercontent.com/brave/adblock-lists/master/brave-unbreak.txt"));
  assert.ok(blocker.includes("12L * 60L * 60L * 1000L"));
  const gradle = await read('../android/app/build.gradle.kts');
  assert.ok(gradle.includes('configurations.create("braveAdblockAar")'));
  assert.ok(gradle.includes('add(braveAdblockAar.name, "io.github.mlm-games:adblock:0.1.3@aar")'));
  assert.ok(gradle.includes('tasks.register<Copy>("extractBraveAdblockAar")'));
  assert.ok(gradle.includes('include("jni/**/*.so")'));
  assert.ok(gradle.includes("compileSdk = 36"));
  assert.doesNotMatch(gradle, /implementation\(["']io\.github\.mlm-games:adblock/);
  const bridgeSource = await read('../android/app/src/main/java/org/mlm/adblock/AdblockEngine.kt');
  assert.ok(bridgeSource.includes("System.loadLibrary(\"adblock_ffi\")"));
  assert.match(player, /NetworkAdBlocker\.shouldBlock\(uri, sourceUrl, accept, request\.isForMainFrame\)/);
  assert.ok(player.includes("settings.setSupportMultipleWindows(true)"));
  assert.ok(player.includes("override fun onCreateWindow("));
  assert.ok(player.includes("): Boolean = false"));
  assert.doesNotMatch(player, /isTrustedPlayerFrameNavigation/);
  assert.match(player, /return request\.isForMainFrame && !NetworkAdBlocker\.isTrustedTopLevel\(uri\)/);
});

test('Hindi/English player switch is restricted to the Movie watch page', async () => {
  const moviePlayer = await read('../app/watch/[imdbId]/player.jsx');
  const seriesPlayer = await read('../app/components/media-player.jsx');

  assert.match(moviePlayer, /hindiMoviePlayerUrl/);
  assert.match(moviePlayer, /playerLanguage === "hi"/);
  assert.match(moviePlayer, /Switch to /);
  assert.match(moviePlayer, /situla:movie-player-language:v1/);
  assert.doesNotMatch(seriesPlayer, /slast430did|hindiMoviePlayerUrl/);
});

test('Android app and Brave adblock use the new hosted Situla domain', async () => {
  const wrapper = await read('../android/app/src/main/java/com/workrcs/situla/ui/SitulaApp.kt');
  const blocker = await read('../android/app/src/main/java/com/workrcs/situla/ui/NetworkAdBlocker.kt');
  const gradle = await read('../android/app/build.gradle.kts');

  assert.ok(wrapper.includes('https://situla-five.vercel.app/'));
  assert.ok(blocker.includes('situlaWebsiteHost: String = "situla-five.vercel.app"'));
  assert.ok(gradle.includes('"https://situla-five.vercel.app/"'));
  assert.doesNotMatch(wrapper, /https:\/\/situla\.vercel\.app/);
  assert.doesNotMatch(blocker, /situlaWebsiteHost: String = "situla\.vercel\.app"/);
});

test('Android wrapper keeps request filtering and popup blocking while allowing player frames', async () => {
  const blocker = await read('../android/app/src/main/java/com/workrcs/situla/ui/NetworkAdBlocker.kt');
  const wrapper = await read('../android/app/src/main/java/com/workrcs/situla/ui/SitulaApp.kt');

  assert.ok(wrapper.includes('NetworkAdBlocker.shouldBlock(uri, sourceUrl, accept, request.isForMainFrame)'));
  assert.match(wrapper, /if \(request\.isForMainFrame && !NetworkAdBlocker\.isTrustedTopLevel\(uri\)\) return true/);
  assert.doesNotMatch(wrapper, /isTrustedPlayerFrameNavigation/);
  assert.match(wrapper, /onCreateWindow\([\s\S]*?\): Boolean = false/);
  assert.match(blocker, /"doubleclick\.net"/);
});


test('both Movie providers use Situla gold controls without a mute override', () => {
  const english = new URL(vidlinkMovieUrl('tt0133093'));
  const hindi = new URL(hindiMoviePlayerUrl('tt0133093'));

  for (const url of [english, hindi]) {
    assert.equal(url.searchParams.get('primaryColor'), 'e8b65b');
    assert.equal(url.searchParams.get('secondaryColor'), '171a23');
    assert.equal(url.searchParams.get('iconColor'), 'ffffff');
    assert.equal(url.searchParams.get('autoplay'), 'false');
    assert.equal(url.searchParams.get('muted'), null);
    assert.equal(url.searchParams.get('mute'), null);
  }
  assert.equal(english.pathname, '/movie/tt0133093');
  assert.equal(hindi.pathname, '/play/tt0133093');
  assert.equal(hindi.searchParams.get('id'), null);
  assert.equal(hindi.searchParams.get('muted'), null);
  assert.equal(hindi.searchParams.get('mute'), null);
  assert.equal(hindi.searchParams.get('audio'), null);
});

test('Android WireGuard restores full-tunnel routing and AdGuard DNS for imported region profiles', async () => {
  const store = await read('../android/app/src/main/java/com/workrcs/situla/vpn/VpnProfileStore.kt');
  const manager = await read('../android/app/src/main/java/com/workrcs/situla/vpn/WireGuardVpnManager.kt');
  const wrapper = await read('../android/app/src/main/java/com/workrcs/situla/ui/SitulaApp.kt');
  const controls = await read('../android/app/src/main/java/com/workrcs/situla/ui/SitulaVpnControls.kt');

  assert.ok(store.includes('AllowedIPs = 0.0.0.0/0, ::/0'));
  assert.ok(store.includes('DNS = 94.140.14.14, 94.140.15.15'));
  assert.ok(store.includes('fastestMeasured'));
  assert.ok(manager.includes('startAutoRotation'));
  assert.ok(wrapper.includes('VpnService.prepare'));
  assert.ok(wrapper.includes('WireGuardVpnManager.connect'));
  assert.ok(controls.includes('Import WireGuard profile'));
  assert.ok(controls.includes('Auto-connect on app launch'));
});

test('Android app retains popup rejection and the existing targeted request filter', async () => {
  const wrapper = await read('../android/app/src/main/java/com/workrcs/situla/ui/SitulaApp.kt');
  const blocker = await read('../android/app/src/main/java/com/workrcs/situla/ui/NetworkAdBlocker.kt');
  assert.ok(wrapper.includes('NetworkAdBlocker.shouldBlock(uri, sourceUrl, accept, request.isForMainFrame)'));
  assert.ok(wrapper.includes('): Boolean = false'));
  assert.ok(wrapper.includes('javaScriptCanOpenWindowsAutomatically = false'));
  assert.ok(wrapper.includes('setSupportMultipleWindows(true)'));
  assert.ok(blocker.includes('"doubleclick.net"'));
});

test('Android startup isolates optional native/VPN work and recovers crashed WebView renderers', async () => {
  const blocker = await read('../android/app/src/main/java/com/workrcs/situla/ui/NetworkAdBlocker.kt');
  const wrapper = await read('../android/app/src/main/java/com/workrcs/situla/ui/SitulaApp.kt');
  const player = await read('../android/app/src/main/java/com/workrcs/situla/ui/VidLinkPlayerScreen.kt');
  const vpnStore = await read('../android/app/src/main/java/com/workrcs/situla/vpn/VpnProfileStore.kt');

  const initializeBody = blocker.slice(blocker.indexOf('fun initialize('), blocker.indexOf('private fun initializeOnWorker('));
  assert.ok(initializeBody.includes('initializationExecutor.execute'));
  assert.ok(initializeBody.includes('keeping host fallback'));
  assert.ok(initializeBody.indexOf('initializationExecutor.execute') < initializeBody.indexOf('installEngine(appContext, fallbackRules)'));

  assert.ok(wrapper.includes('override fun onRenderProcessGone('));
  assert.ok(wrapper.includes('key(webViewGeneration)'));
  assert.ok(player.includes('override fun onRenderProcessGone('));
  assert.ok(player.includes('key(playerWebViewGeneration)'));

  assert.ok(vpnStore.includes('STARTUP_SAFE_DEFAULTS_KEY'));
  assert.ok(vpnStore.includes('putBoolean("auto_connect_enabled", false)'));
  assert.ok(vpnStore.includes('getBoolean("auto_connect_enabled", false)'));
});
