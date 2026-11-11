const finiteWholeNumber = (value, minimum = 0) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
};

const resumeTime = (item) => {
  const duration = Math.max(0, Math.floor(Number(item?.duration) || 0));
  const watched = Math.max(0, Math.floor(Number(item?.watched) || 0));
  // A completed item should replay from the beginning rather than opening at its end.
  return duration > 0 && watched >= duration ? 0 : watched;
};

export function createHistoryResumeTarget(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const mediaType = String(item.mediaType || "").toLowerCase();
  const key = String(item.key || "");
  const watched = resumeTime(item);
  const duration = Math.max(0, Math.floor(Number(item.duration) || 0));
  const updatedAt = Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : 0;
  const common = {
    title: String(item.title || "Untitled"),
    posterUrl: typeof item.posterUrl === "string" ? item.posterUrl : null,
    watched,
    duration,
    updatedAt
  };

  if (mediaType === "movie" || key.startsWith("movie:")) {
    const imdbId = String(item.imdbId || item.mediaId || key.slice(6)).trim().toLowerCase();
    if (!/^tt\d{5,12}$/.test(imdbId)) return null;
    return {
      href: "/watch/" + encodeURIComponent(imdbId),
      storageKey: "situla:progress:v1",
      limit: 20,
      progressEntry: { ...common, imdbId },
      matches: (candidate) => String(candidate?.imdbId || "").toLowerCase() === imdbId
    };
  }

  if (mediaType === "tv" || key.startsWith("tv:")) {
    const keyParts = key.split(":");
    const tmdbId = finiteWholeNumber(item.tmdbId || item.mediaId || keyParts[1], 1);
    const season = finiteWholeNumber(item.season ?? keyParts[2]?.replace(/^s/, ""), 0);
    const episode = finiteWholeNumber(item.episode ?? keyParts[3]?.replace(/^e/, ""), 1);
    if (!tmdbId || season === null || episode === null) return null;
    return {
      href: "/watch/tv/" + tmdbId + "/" + season + "/" + episode,
      storageKey: "situla:tv-progress:v1",
      limit: 100,
      progressEntry: { ...common, tmdbId, season, episode },
      matches: (candidate) => Number(candidate?.tmdbId) === tmdbId &&
        Number(candidate?.season) === season && Number(candidate?.episode) === episode
    };
  }

  if (mediaType === "anime" || key.startsWith("anime:")) {
    const keyParts = key.split(":");
    const malId = finiteWholeNumber(item.malId || item.mediaId || keyParts[1], 1);
    const episode = finiteWholeNumber(item.episode ?? keyParts[2]?.replace(/^e/, ""), 1);
    const audio = String(item.audio || keyParts[3] || "sub").toLowerCase();
    if (!malId || episode === null || !["sub", "dub"].includes(audio)) return null;
    return {
      href: "/watch/anime/" + malId + "/" + episode + "/" + audio,
      storageKey: "situla:anime-progress:v1",
      limit: 100,
      progressEntry: { ...common, malId, episode, audio },
      matches: (candidate) => Number(candidate?.malId) === malId &&
        Number(candidate?.episode) === episode && String(candidate?.audio || "sub") === audio
    };
  }

  return null;
}
