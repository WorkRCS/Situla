const MAL_ANIME_ID = /^[0-9]{1,10}$/;

/** Validate the MAL identifier, one-based episode and audio track before playback. */
export function normalizeAnimePlayerRoute(malId, episode, audio) {
  const malText = String(malId ?? "").trim();
  const episodeText = String(episode ?? "").trim();
  const audioText = String(audio ?? "").trim().toLowerCase();
  if (!MAL_ANIME_ID.test(malText)) return null;
  const malNumber = Number(malText);
  const episodeNumber = Number(episodeText);
  if (!Number.isSafeInteger(malNumber) || malNumber < 1) return null;
  if (!/^[0-9]+$/.test(episodeText) || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1) return null;
  if (audioText !== "sub" && audioText !== "dub") return null;
  return { malId: malNumber, episode: episodeNumber, audio: audioText };
}
