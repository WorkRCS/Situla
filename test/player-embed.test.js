import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hindiMoviePlayerUrl, vidlinkMovieUrl } from "../src/player-urls.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Hindi movie iframe blocks popups and top-level redirects while retaining playback scripts", async () => {
  const moviePlayer = await read("../app/watch/[imdbId]/player.jsx");
  const seriesPlayer = await read("../app/components/media-player.jsx");

  assert.match(moviePlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.match(moviePlayer, /sandbox=\{playerLanguage === "hi" \? "allow-scripts allow-same-origin allow-forms allow-presentation" : undefined\}/);
  assert.doesNotMatch(moviePlayer, /allow-popups|allow-top-navigation/i);
  assert.match(seriesPlayer, /<iframe[\s\S]*?src=\{playerUrl\}/);
  assert.doesNotMatch(seriesPlayer, /\bsandbox\s*=/i);
});

test("Hindi/English player switch is restricted to the Movie watch page", async () => {
  const moviePlayer = await read("../app/watch/[imdbId]/player.jsx");
  const seriesPlayer = await read("../app/components/media-player.jsx");

  assert.match(moviePlayer, /hindiMoviePlayerUrl/);
  assert.match(moviePlayer, /playerLanguage === "hi"/);
  assert.match(moviePlayer, /Switch to /);
  assert.match(moviePlayer, /situla:movie-player-language:v1/);
  assert.doesNotMatch(seriesPlayer, /slast430did|hindiMoviePlayerUrl/);
});

test("both Movie providers use Situla gold controls without a mute override", () => {
  const english = new URL(vidlinkMovieUrl("tt0133093"));
  const hindi = new URL(hindiMoviePlayerUrl("tt0133093"));

  for (const url of [english, hindi]) {
    assert.equal(url.searchParams.get("primaryColor"), "e8b65b");
    assert.equal(url.searchParams.get("secondaryColor"), "171a23");
    assert.equal(url.searchParams.get("iconColor"), "ffffff");
    assert.equal(url.searchParams.get("autoplay"), "false");
    assert.equal(url.searchParams.get("muted"), null);
    assert.equal(url.searchParams.get("mute"), null);
  }
  assert.equal(english.pathname, "/movie/tt0133093");
  assert.equal(hindi.pathname, "/play/tt0133093");
  assert.equal(hindi.searchParams.get("id"), null);
  assert.equal(hindi.searchParams.get("muted"), null);
  assert.equal(hindi.searchParams.get("mute"), null);
  assert.equal(hindi.searchParams.get("audio"), null);
});
