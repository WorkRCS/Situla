"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeAnimePlayerRoute } from "../../src/anime-player-route.js";
import { normalizeTvPlayerRoute, vidboltTvUrl, vidboltAnimeUrl, normalizeVidBoltPlayerEvent, VIDBOLT_ORIGIN } from "../../src/player-urls.js";

export default function SeriesMediaPlayer({ kind, tmdbId, malId, season, episode, audio }) {
  const router = useRouter();
  const tvRoute = kind === "tv" ? normalizeTvPlayerRoute(tmdbId, season, episode) : null;
  const animeRoute = kind === "anime" ? normalizeAnimePlayerRoute(malId, episode, audio) : null;
  const [title, setTitle] = useState(kind === "tv" ? "TV series" : "Anime");
  const [posterUrl, setPosterUrl] = useState(null);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [catalogVerified, setCatalogVerified] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [startAt, setStartAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef(null);
  const lastWrite = useRef(0);
  const lastPlayerDuration = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    if ((kind === "tv" && !tvRoute) || (kind === "anime" && !animeRoute)) {
      setMetadataError("This episode link is invalid. Return to the series and choose an episode.");
      setLoading(false);
      return () => controller.abort();
    }

    const endpoint = kind === "tv"
      ? "/api/tv/" + encodeURIComponent(tvRoute.tmdbId)
      : "/api/anime/" + encodeURIComponent(animeRoute.malId);

    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.item || typeof payload.item !== "object") {
          throw new Error(payload.error || "Series metadata is unavailable.");
        }

        const preferredTitle = payload.item.titleEnglish || payload.item.title;
        setTitle(typeof preferredTitle === "string" && preferredTitle.trim()
          ? preferredTitle.trim()
          : kind === "tv" ? "TV series" : "Anime");
        setPosterUrl(typeof payload.item.posterUrl === "string" ? payload.item.posterUrl : null);
        if (kind === "tv") {
          setSeriesInfo({
            seasons: Array.isArray(payload.item.seasons) ? payload.item.seasons : [],
            externalImdbId: payload.item.externalImdbId || null
          });
          try {
            const saved = JSON.parse(localStorage.getItem("situla:tv-progress:v1") || "[]");
            const legacyProgress = Array.isArray(saved) ? saved.find((item) =>
              item && String(item.imdbId || "").toLowerCase() === String(payload.item.externalImdbId || "").toLowerCase() &&
              Number(item.season) === Number(season) && Number(item.episode) === Number(episode)
            ) : null;
            if (legacyProgress && Number.isFinite(Number(legacyProgress.watched))) {
              setStartAt(Math.max(0, Math.floor(Number(legacyProgress.watched))));
            }
          } catch {}
        } else {
          setSeriesInfo({
            episodes: Number(payload.item.episodes) || null,
            episodeGuide: Array.isArray(payload.item.episodeGuide) ? payload.item.episodeGuide : []
          });
        }
        setMetadataError("");
        setCatalogVerified(true);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setMetadataError(requestError.message || "Series metadata is unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [kind, tmdbId, malId, season, episode, tvRoute?.tmdbId, animeRoute?.malId, animeRoute?.episode, animeRoute?.audio]);

  useEffect(() => {
    try {
      const key = kind === "tv" ? "situla:tv-progress:v1" : "situla:anime-progress:v1";
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      const entry = Array.isArray(saved) ? saved.find((item) => item && typeof item === "object" && (kind === "tv"
        ? Number(item.tmdbId) === Number(tmdbId) && Number(item.season) === Number(season) && Number(item.episode) === Number(episode)
        : Number(item.malId) === Number(malId) && Number(item.episode) === Number(episode) && item.audio === (audio || "sub")
      )) : null;
      setStartAt(entry && Number.isFinite(Number(entry.watched)) ? Math.max(0, Math.floor(Number(entry.watched))) : 0);
    } catch {
      setStartAt(0);
    }
  }, [kind, tmdbId, malId, season, episode, audio]);

  useEffect(() => {
    const onPlayerMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== VIDBOLT_ORIGIN) return;

      const data = normalizeVidBoltPlayerEvent(event.data);
      if (!data) return;
      const eventName = data.event;
      const watchedValue = data.currentTime;
      let durationValue = data.duration;

      if (Number.isFinite(durationValue) && durationValue > 0) {
        lastPlayerDuration.current = durationValue;
      } else if (eventName === "ended" || eventName === "timeupdate" || eventName === "play" || eventName === "pause") {
        durationValue = lastPlayerDuration.current;
      }

      if (eventName === "ready" || eventName === "durationchange" || eventName === "error") return;
      if (!["play", "pause", "ended", "timeupdate"].includes(eventName)) return;
      if (eventName === "timeupdate" && Date.now() - lastWrite.current < 5000) return;

      try {
        if (!Number.isFinite(durationValue) || durationValue <= 0) return;
        const watched = eventName === "ended" ? durationValue : watchedValue;
        if (!Number.isFinite(watched) || watched < 0) return;
        lastWrite.current = Date.now();
        const updatedAt = Date.now();
        const mediaKey = kind === "tv"
          ? "tv:" + tvRoute.tmdbId + ":s" + tvRoute.season + ":e" + tvRoute.episode
          : "anime:" + malId + ":e" + episode + ":" + (audio || "sub");
        const historyEntry = {
          key: mediaKey,
          mediaType: kind,
          mediaId: kind === "tv" ? String(tvRoute.tmdbId) : String(malId),
          tmdbId: kind === "tv" ? tvRoute.tmdbId : null,
          imdbId: null,
          title,
          posterUrl,
          season: kind === "tv" ? tvRoute.season : null,
          episode: kind === "tv" ? tvRoute.episode : Number(episode),
          audio: kind === "anime" ? (audio || "sub") : null,
          watched: Math.max(0, watched),
          duration: durationValue,
          updatedAt
        };
        const history = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
        const nextHistory = [historyEntry, ...(Array.isArray(history) ? history.filter((item) => item && item.key !== mediaKey) : [])].slice(0, 500);
        localStorage.setItem("situla:watch-history:v1", JSON.stringify(nextHistory));

        if (kind === "tv") {
          const key = "situla:tv-progress:v1";
          const current = JSON.parse(localStorage.getItem(key) || "[]");
          const legacyImdbId = String(seriesInfo?.externalImdbId || "").toLowerCase();
          const matchesEpisode = (item) =>
            (Number(item?.tmdbId) === tvRoute.tmdbId ||
              (legacyImdbId && String(item?.imdbId || "").toLowerCase() === legacyImdbId)) &&
            Number(item?.season) === tvRoute.season &&
            Number(item?.episode) === tvRoute.episode;
          if (eventName === "ended") {
            localStorage.setItem(key, JSON.stringify((Array.isArray(current) ? current : []).filter((item) => !matchesEpisode(item))));
            return;
          }
          const entry = {
            tmdbId: tvRoute.tmdbId,
            title,
            posterUrl,
            season: tvRoute.season,
            episode: tvRoute.episode,
            watched: Math.max(0, watched),
            duration: durationValue,
            updatedAt
          };
          localStorage.setItem(key, JSON.stringify([
            entry,
            ...(Array.isArray(current) ? current.filter((item) => !matchesEpisode(item)) : [])
          ].slice(0, 100)));
        } else {
          const key = "situla:anime-progress:v1";
          const current = JSON.parse(localStorage.getItem(key) || "[]");
          const matchesEpisode = (item) => Number(item?.malId) === Number(malId) &&
            Number(item?.episode) === Number(episode) && item?.audio === (audio || "sub");
          const entry = {
            malId: Number(malId), title, episode: Number(episode), audio: audio || "sub",
            watched: Math.max(0, watched), duration: durationValue, updatedAt
          };
          const next = eventName === "ended"
            ? (Array.isArray(current) ? current.filter((item) => !matchesEpisode(item)) : [])
            : [entry, ...(Array.isArray(current) ? current.filter((item) => !matchesEpisode(item)) : [])].slice(0, 100);
          localStorage.setItem(key, JSON.stringify(next));
          localStorage.setItem("situla:anime-last-episode:v1", JSON.stringify({ malId: Number(malId), episode: Number(episode), audio: audio || "sub" }));
        }
      } catch {}
    };
    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [kind, tmdbId, malId, season, episode, audio, title, posterUrl, tvRoute?.tmdbId, tvRoute?.season, tvRoute?.episode, seriesInfo?.externalImdbId]);

  const tvSeasons = (Array.isArray(seriesInfo?.seasons) ? seriesInfo.seasons : [])
    .filter((item) => item && Number(item.episodeCount) > 0 && Number(item.seasonNumber) > 0)
    .sort((a, b) => Number(a.seasonNumber) - Number(b.seasonNumber));
  const currentSeason = tvRoute
    ? tvSeasons.find((item) => Number(item.seasonNumber) === tvRoute.season)
    : null;
  const nextSeason = tvRoute
    ? tvSeasons.find((item) => Number(item.seasonNumber) > tvRoute.season)
    : null;
  const nextEpisode = kind === "tv" && tvRoute && currentSeason
    ? (tvRoute.episode < Number(currentSeason.episodeCount)
      ? { season: tvRoute.season, episode: tvRoute.episode + 1 }
      : nextSeason ? { season: Number(nextSeason.seasonNumber), episode: 1 } : null)
    : null;

  function playNextEpisode() {
    if (!nextEpisode || !tvRoute || kind !== "tv" || !catalogVerified) return;
    router.push("/watch/tv/" + encodeURIComponent(tvRoute.tmdbId) + "/" + nextEpisode.season + "/" + nextEpisode.episode);
  }

  function playNextSeason() {
    if (!nextSeason || !tvRoute || kind !== "tv" || !catalogVerified) return;
    router.push("/watch/tv/" + encodeURIComponent(tvRoute.tmdbId) + "/" + Number(nextSeason.seasonNumber) + "/1");
  }

  const animeEpisodeGuide = (Array.isArray(seriesInfo?.episodeGuide) ? seriesInfo.episodeGuide : [])
    .filter((item) => Number(item?.episodeNumber) > 0)
    .sort((a, b) => Number(a.seasonNumber) - Number(b.seasonNumber) ||
      Number(a.episodeNumber) - Number(b.episodeNumber));
  const currentAnimeGuideIndex = animeEpisodeGuide.findIndex((item) =>
    Number(item.episodeNumber) === Number(animeRoute?.episode)
  );
  const nextAnimeGuideEntry = currentAnimeGuideIndex >= 0
    ? animeEpisodeGuide[currentAnimeGuideIndex + 1] || null
    : null;
  const nextAnimeEpisode = kind === "anime" && animeRoute
    ? (nextAnimeGuideEntry
      ? Number(nextAnimeGuideEntry.episodeNumber)
      : (!animeEpisodeGuide.length && Number(seriesInfo?.episodes) > animeRoute.episode ? animeRoute.episode + 1 : null))
    : null;

  function playNextAnimeEpisode() {
    if (!animeRoute || kind !== "anime" || !Number.isSafeInteger(nextAnimeEpisode) || nextAnimeEpisode < 1) return;
    try {
      localStorage.setItem("situla:anime-last-episode:v1", JSON.stringify({
        malId: animeRoute.malId,
        episode: nextAnimeEpisode,
        audio: animeRoute.audio
      }));
    } catch {}
    router.push("/watch/anime/" + animeRoute.malId + "/" + nextAnimeEpisode + "/" + animeRoute.audio);
  }

  function tryAlternateAnimeAudio() {
    if (!animeRoute || kind !== "anime") return;
    const alternate = animeRoute.audio === "sub" ? "dub" : "sub";
    router.push("/watch/anime/" + animeRoute.malId + "/" + animeRoute.episode + "/" + alternate);
  }

  const playerUrl = (() => {
    if (kind === "tv") {
      if (!catalogVerified || !tvRoute) return null;
      return vidboltTvUrl(tvRoute.tmdbId, tvRoute.season, tvRoute.episode);
    }
    if (!animeRoute) return null;
    return vidboltAnimeUrl(animeRoute.malId, animeRoute.episode, animeRoute.audio);
  })();

  useEffect(() => {
    lastWrite.current = 0;
    lastPlayerDuration.current = 0;
  }, [kind, tmdbId, malId, season, episode, audio]);

  return (
    <main className="watch-screen series-watch-screen">
      {playerUrl ? (
        <iframe
          id="vidbolt-player"
          ref={iframeRef}
          key={playerUrl}
          className="watch-frame series-watch-frame"
          src={playerUrl}
          title={title + (kind === "tv" ? " · S" + tvRoute.season + " E" + tvRoute.episode : " · Episode " + episode)}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="player-message">
          <div className="player-message-card">
            <div className="player-message-mark">S</div>
            <h1>{loading ? "Preparing playback" : "Playback unavailable"}</h1>
            <p>{metadataError || (kind === "tv"
              ? "This series is not available in the Situla catalog yet."
              : loading ? "Loading saved media details…" : "This episode could not be loaded.")}</p>
            <button type="button" className="gold-button" onClick={() => router.back()}>Back to Situla</button>
          </div>
        </div>
      )}
      <header className="watch-topbar series-watch-topbar">
        <button type="button" onClick={() => router.back()} className="watch-control" aria-label="Back to series"><i className="bi bi-arrow-left" aria-hidden="true" /></button>
        <div className="watch-title">
          <p className="text-[9px] font-extrabold tracking-[.2em] text-[#f0c471]">SITULA · {kind === "tv" ? "TV PLAYER" : "ANIME PLAYER"}</p>
          <h1 className="truncate text-sm font-bold">{title}{kind === "tv" ? " · S" + season + " E" + episode : " · EP " + episode + " · " + (audio || "sub").toUpperCase()}</h1>
        </div>
        {kind === "anime" && <div className="series-player-actions">
          <button type="button" className="series-player-guide" onClick={tryAlternateAnimeAudio} disabled={!animeRoute}>
            Try {audio === "sub" ? "Dub" : "Sub"} instead
          </button>
          <button type="button" className="series-player-next" onClick={playNextAnimeEpisode} disabled={!nextAnimeEpisode}>
            Next episode <i className="bi bi-skip-forward-fill" aria-hidden="true" />
          </button>
        </div>}
        {kind === "tv" && <div className="series-player-actions">
          <button
            type="button"
            className="series-player-guide"
            onClick={() => tvRoute && router.push("/tv/" + encodeURIComponent(tvRoute.tmdbId))}
            disabled={!tvRoute}
          >Episode guide</button>
          <button type="button" className="series-player-next" onClick={playNextEpisode} disabled={!nextEpisode || !catalogVerified}>
            Next episode <i className="bi bi-skip-forward-fill" aria-hidden="true" />
          </button>
          <button type="button" className="series-player-guide" onClick={playNextSeason} disabled={!nextSeason || !catalogVerified}>
            Next season <i className="bi bi-chevron-double-right" aria-hidden="true" />
          </button>
        </div>}
      </header>
    </main>
  );
}
