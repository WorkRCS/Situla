"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { vidlinkTvUrl } from "../../src/player-urls.js";

const VIDLINK_ORIGIN = "https://vidlink.pro";

export default function SeriesMediaPlayer({ kind, imdbId, malId, season, episode, audio }) {
  const router = useRouter();
  const [title, setTitle] = useState(kind === "tv" ? "TV series" : "Anime");
  const [posterUrl, setPosterUrl] = useState(null);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [catalogVerified, setCatalogVerified] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef(null);
  const lastWrite = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = kind === "tv" ? "/api/tv/" + encodeURIComponent(imdbId) : "/api/anime/" + encodeURIComponent(malId);
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.item) throw new Error(payload.error || "Series metadata is unavailable.");
        setTitle(payload.item.titleEnglish || payload.item.title);
        setPosterUrl(payload.item.posterUrl || null);
        if (kind === "tv") setSeriesInfo(payload.item);
        setCatalogVerified(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, imdbId, malId]);

  useEffect(() => {
    try {
      const key = kind === "tv" ? "situla:tv-progress:v1" : "situla:anime-progress:v1";
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      const entry = Array.isArray(saved) ? saved.find((item) => kind === "tv"
        ? String(item.imdbId).toLowerCase() === imdbId.toLowerCase() && Number(item.season) === Number(season) && Number(item.episode) === Number(episode)
        : Number(item.malId) === Number(malId) && Number(item.episode) === Number(episode) && item.audio === (audio || "sub")
      ) : null;
      setStartAt(entry && Number.isFinite(Number(entry.watched)) ? Math.max(0, Math.floor(Number(entry.watched))) : 0);
    } catch {
      setStartAt(0);
    }
  }, [kind, imdbId, malId, season, episode, audio]);

  useEffect(() => {
    const onPlayerMessage = (event) => {
      if (event.origin !== VIDLINK_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object" || payload.type !== "PLAYER_EVENT" || !payload.data) return;

      const data = payload.data;
      let eventName;
      let watchedValue;
      let durationValue;
      if (kind === "tv") {
        if (String(data.mediaType || "").toLowerCase() !== "tv") return;
        if (Number(data.season) !== Number(season) || Number(data.episode) !== Number(episode)) return;
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
          ? "tv:" + imdbId + ":s" + season + ":e" + episode
          : "anime:" + malId + ":e" + episode + ":" + (audio || "sub");
        const historyEntry = {
          key: mediaKey,
          mediaType: kind,
          mediaId: kind === "tv" ? imdbId : String(malId),
          imdbId: kind === "tv" ? imdbId : null,
          title,
          posterUrl,
          season: kind === "tv" ? Number(season) : null,
          episode: Number(episode),
          audio: kind === "anime" ? (audio || "sub") : null,
          watched: Math.max(0, watched),
          duration: durationValue,
          updatedAt
        };
        const history = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
        const nextHistory = [historyEntry, ...(Array.isArray(history) ? history.filter((item) => item.key !== mediaKey) : [])].slice(0, 500);
        localStorage.setItem("situla:watch-history:v1", JSON.stringify(nextHistory));

        if (kind === "tv") {
          const key = "situla:tv-progress:v1";
          const current = JSON.parse(localStorage.getItem(key) || "[]");
          const matchesEpisode = (item) =>
            String(item.imdbId).toLowerCase() === imdbId.toLowerCase() &&
            Number(item.season) === Number(season) &&
            Number(item.episode) === Number(episode);
          if (eventName === "ended") {
            localStorage.setItem(key, JSON.stringify((Array.isArray(current) ? current : []).filter((item) => !matchesEpisode(item))));
            return;
          }
          const entry = {
            imdbId, title, posterUrl, season: Number(season), episode: Number(episode),
            watched: Math.max(0, watched), duration: durationValue, updatedAt
          };
          localStorage.setItem(key, JSON.stringify([entry, ...(Array.isArray(current) ? current.filter((item) => !matchesEpisode(item)) : [])].slice(0, 100)));
        } else {
          const key = "situla:anime-progress:v1";
          const current = JSON.parse(localStorage.getItem(key) || "[]");
          const matchesEpisode = (item) => Number(item.malId) === Number(malId) && Number(item.episode) === Number(episode) && item.audio === (audio || "sub");
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
  }, [kind, imdbId, malId, season, episode, audio, title, posterUrl]);

  const tvSeasons = (seriesInfo?.seasons || [])
    .filter((item) => Number(item.episodeCount) > 0 && Number(item.seasonNumber) > 0)
    .sort((a, b) => Number(a.seasonNumber) - Number(b.seasonNumber));
  const currentSeason = tvSeasons.find((item) => Number(item.seasonNumber) === Number(season));
  const nextSeason = tvSeasons.find((item) => Number(item.seasonNumber) > Number(season));
  const nextEpisode = kind === "tv" && currentSeason
    ? (Number(episode) < Number(currentSeason.episodeCount)
      ? { season: Number(season), episode: Number(episode) + 1 }
      : nextSeason ? { season: Number(nextSeason.seasonNumber), episode: 1 } : null)
    : null;

  function playNextEpisode() {
    if (!nextEpisode || kind !== "tv") return;
    router.push("/watch/tv/" + encodeURIComponent(imdbId) + "/" + nextEpisode.season + "/" + nextEpisode.episode);
  }

  const playerUrl = (() => {
    if (kind === "tv") {
      if (!catalogVerified) return null;
      return vidlinkTvUrl(imdbId, season, episode);
    }
    const params = new URLSearchParams({
      primaryColor: "e8b65b",
      secondaryColor: "171a23",
      iconColor: "ffffff",
      icons: "default",
      player: "default",
      title: "false",
      poster: "true",
      autoplay: "false",
      fallback: "true"
    });
    if (startAt > 0) params.set("startAt", String(startAt));
    return VIDLINK_ORIGIN + "/anime/" + encodeURIComponent(malId) + "/" +
      encodeURIComponent(episode) + "/" + encodeURIComponent(audio || "sub") + "?" + params.toString();
  })();

  return (
    <main className="watch-screen series-watch-screen">
      {playerUrl ? (
        <iframe
          ref={iframeRef}
          key={playerUrl}
          className="watch-frame series-watch-frame"
          src={playerUrl}
          title={title + (kind === "tv" ? " · S" + season + " E" + episode : " · Episode " + episode)}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="player-message">
          <div className="player-message-card">
            <div className="player-message-mark">S</div>
            <h1>{loading ? "Preparing playback" : "Playback unavailable"}</h1>
            <p>{kind === "tv" && !loading
              ? "This series is not available in the Situla catalog yet."
              : loading ? "Loading saved media details…" : "This episode could not be loaded."}</p>
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
        {kind === "tv" && <div className="series-player-actions">
          <button type="button" className="series-player-guide" onClick={() => router.push("/tv/" + encodeURIComponent(imdbId))}>Episode guide</button>
          <button type="button" className="series-player-next" onClick={playNextEpisode} disabled={!nextEpisode || !catalogVerified}>
            Next episode <i className="bi bi-skip-forward-fill" aria-hidden="true" />
          </button>
        </div>}
      </header>
    </main>
  );
}
