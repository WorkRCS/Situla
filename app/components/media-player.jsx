"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeAnimePlayerRoute } from "../../src/anime-player-route.js";
import { normalizeTvPlayerRoute, vidlinkAnimeUrl, vidlinkTvUrl } from "../../src/player-urls.js";

const VIDLINK_ORIGIN = "https://vidlink.pro";

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
      if (event.origin !== VIDLINK_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object" || payload.type !== "PLAYER_EVENT" ||
          !payload.data || typeof payload.data !== "object") return;

      const data = payload.data;
      let eventName;
      let watchedValue;
      let durationValue;
      if (kind === "tv") {
        if (!tvRoute || String(data.mediaType || "").toLowerCase() !== "tv") return;
        if (Number(data.season) !== tvRoute.season || Number(data.episode) !== tvRoute.episode) return;
        eventName = String(data.event || "");
        watchedValue = Number(data.currentTime);
        durationValue = Number(data.duration);
      } else {
        const incomingType = String(data.mediaType || "").toLowerCase();
        if (incomingType && incomingType !== "anime") return;
        const incomingMalId = Number(data.malId ?? data.mal_id ?? data.mediaId ?? data.id);
        if (incomingMalId && incomingMalId !== Number(malId)) return;
        if (Number(data.episode) && Number(data.episode) !== Number(episode)) return;
        eventName = String(data.event || "");
        watchedValue = Number(data.currentTime);
        durationValue = Number(data.duration);
      }

      if (!["play", "pause", "seeked", "ended", "timeupdate"].includes(eventName)) return;
      if (eventName === "timeupdate" && Date.now() - lastWrite.current < 5000) return;
      lastWrite.current = Date.now();

      try {
        if (!Number.isFinite(durationValue) || durationValue <= 0) return;
        const watched = eventName === "ended" ? durationValue : watchedValue;
        if (!Number.isFinite(watched) || watched < 0) return;
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
    if (!nextEpisode || !tvRoute || kind !== "tv") return;
    router.push("/watch/tv/" + encodeURIComponent(tvRoute.tmdbId) + "/" + nextEpisode.season + "/" + nextEpisode.episode);
  }

  function tryAlternateAnimeAudio() {
    if (!animeRoute || kind !== "anime") return;
    const alternate = animeRoute.audio === "sub" ? "dub" : "sub";
    router.push("/watch/anime/" + animeRoute.malId + "/" + animeRoute.episode + "/" + alternate);
  }

  const playerUrl = (() => {
    if (kind === "tv") {
      if (!catalogVerified || !tvRoute) return null;
      return vidlinkTvUrl(tvRoute.tmdbId, tvRoute.season, tvRoute.episode);
    }
    if (!animeRoute) return null;
    return vidlinkAnimeUrl(animeRoute.malId, animeRoute.episode, animeRoute.audio, {
      fallback: true,
      startAt
    });
  })();

  return (
    <main className="watch-screen series-watch-screen">
      {playerUrl ? (
        <iframe
          ref={iframeRef}
          key={playerUrl}
          className="watch-frame series-watch-frame"
          src={playerUrl}
          title={title + (kind === "tv" ? " · S" + tvRoute.season + " E" + tvRoute.episode : " · Episode " + episode)}
          allow="autoplay; encrypted-media; fullscreen"
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
        </div>}
      </header>
    </main>
  );
}
