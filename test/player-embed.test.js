import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('movie, TV and anime player iframes are not sandboxed', async () => {
  const moviePlayer = await read('../app/watch/[imdbId]/player.jsx');
  const seriesPlayer = await read('../app/components/media-player.jsx');

  assert.match(moviePlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.match(seriesPlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.doesNotMatch(moviePlayer, /\bsandbox\s*=/i);
  assert.doesNotMatch(seriesPlayer, /\bsandbox\s*=/i);
});

test('Android player keeps targeted ad filtering but does not restrict media source hosts', async () => {
  const blocker = await read('../android/app/src/main/java/com/workrcs/situla/ui/NetworkAdBlocker.kt');
  const player = await read('../android/app/src/main/java/com/workrcs/situla/ui/VidLinkPlayerScreen.kt');

  assert.match(blocker, /private val blockedDomains = setOf/);
  assert.match(blocker, /fun shouldBlock\(uri: Uri\)/);
  assert.match(player, /NetworkAdBlocker\.shouldBlock\(uri\)/);
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

test('Android wrapper keeps request filtering and popup blocking while allowing player frames', async () => {
  const blocker = await read('../android/app/src/main/java/com/workrcs/situla/ui/NetworkAdBlocker.kt');
  const wrapper = await read('../android/app/src/main/java/com/workrcs/situla/ui/SitulaApp.kt');

  assert.match(wrapper, /NetworkAdBlocker\.shouldBlock\(uri\)/);
  assert.match(wrapper, /if \(request\.isForMainFrame && !NetworkAdBlocker\.isTrustedTopLevel\(uri\)\) return true/);
  assert.doesNotMatch(wrapper, /isTrustedPlayerFrameNavigation/);
  assert.match(wrapper, /onCreateWindow\([\s\S]*?\): Boolean = false/);
  assert.match(blocker, /"doubleclick\.net"/);
});
