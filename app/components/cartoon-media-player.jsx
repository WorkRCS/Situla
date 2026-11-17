"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Baby, AlertTriangle, PlayCircle, Star } from "lucide-react";
import {
  cartoonMoviePlaybackUrl,
  cartoonTvPlaybackUrl,
  normalizeSeriesPlaybackEvent,
  SERIES_PLAYBACK_ORIGIN
} from "../../src/player-urls.js";

function readResume(key) {
  try {
    const entries = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
    const item = Array.isArray(entries) ? entries.find((entry) => entry?.key === key) : null;
    const watched = Number(item?.watched);
    const duration = Number(item?.duration);
    return Number.isFinite(watched) && watched > 0 && (!duration || watched < duration * 0.96)
      ? Math.floor(watched) : 0;
  } catch {
    return 0;
  }
}

function writeHistory(entry) {
  try {
    const current = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
    const list = Array.isArray(current) ? current : [];
    const next = [entry, ...list.filter((item) => item?.key !== entry.key)].slice(0, 500);
    localStorage.setItem("situla:watch-history:v1", JSON.stringify(next));
  } catch {}
}

async function stopSession(sessionId) {
  if (!sessionId) return;
  try {
    await fetch("/api/playback/stop", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });
  } catch {}
}

export default function CartoonMediaPlayer({ type, tmdbId, seasonNumber, episodeNumber }) {
  const iframeRef = useRef(null);
  const sessionRef = useRef("");
  const playingRef = useRef(false);
  const lastWriteRef = useRef(0);
  const [item, setItem] = useState(null);
  const [episode, setEpisode] = useState(null);
  const [iframeUrl, setIframeUrl] = useState("");
  const [startAt, setStartAt] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [playbackReady, setPlaybackReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const isMovie = type === "movie";
  const mediaType = isMovie ? "cartoon_movie" : "cartoon_tv";
  const historyKey = isMovie
    ? "cartoon_movie:" + tmdbId
    : "cartoon_tv:" + tmdbId + ":s" + seasonNumber + ":e" + episodeNumber;

  useEffect(() => {
    const controller = new AbortController();
    async function loadMetadata() {
      setLoading(true);
      setError("");
      setItem(null);
      setEpisode(null);
      setIframeUrl("");
      setPlaybackReady(false);
      try {
        const response = await fetch(
          isMovie
            ? "/api/cartoons/movies/" + encodeURIComponent(tmdbId)
            : "/api/cartoons/series/" + encodeURIComponent(tmdbId),
          { cache: "no-store", credentials: "same-origin", signal: controller.signal }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.item) throw new Error(payload.error || "Approved cartoon title not found.");
        if (controller.signal.aborted) return;
        setItem(payload.item);

        if (isMovie) {
          const resume = readResume(historyKey);
          setStartAt(resume);
          const url = cartoonMoviePlaybackUrl(tmdbId, resume);
          if (!url) throw new Error("This cartoon movie has an invalid playback ID.");
          setIframeUrl(url);
        } else {
          const episodeResponse = await fetch(
            "/api/cartoons/series/" + encodeURIComponent(tmdbId) + "/seasons/" +
            encodeURIComponent(seasonNumber) + "?episode=" + encodeURIComponent(episodeNumber),
            { cache: "no-store", credentials: "same-origin", signal: controller.signal }
          );
          const episodePayload = await episodeResponse.json().catch(() => ({}));
          if (!episodeResponse.ok) throw new Error(episodePayload.error || "This episode is not in the approved episode guide.");
          const selectedEpisode = (Array.isArray(episodePayload.items) ? episodePayload.items : [])
            .find((entry) => Number(entry.episodeNumber) === Number(episodeNumber));
          if (!selectedEpisode) throw new Error("This episode is not in the approved episode guide.");
          setEpisode(selectedEpisode);
          const resume = readResume(historyKey);
          setStartAt(resume);
          const url = cartoonTvPlaybackUrl(tmdbId, seasonNumber, episodeNumber, resume);
          if (!url) throw new Error("This cartoon episode has an invalid playback route.");
          setIframeUrl(url);
        }
        setPlaybackReady(true);
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.message || "Cartoon playback metadata could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadMetadata();
    return () => controller.abort();
  }, [isMovie, tmdbId, seasonNumber, episodeNumber, historyKey]);

  useEffect(() => {
    if (!playbackReady || !iframeUrl) return undefined;
    const controller = new AbortController();
    let createdSession = "";
    async function authorize() {
      try {
        const response = await fetch("/api/playback/start", {
          method: "POST",
          credentials: "same-origin",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isMovie
            ? { mediaType, mediaId: String(tmdbId) }
            : { mediaType, mediaId: String(tmdbId), season: Number(seasonNumber), episode: Number(episodeNumber) })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.sessionId) throw new Error(payload.error || "Watch access could not be verified.");
        if (controller.signal.aborted) {
          void stopSession(payload.sessionId);
          return;
        }
        createdSession = payload.sessionId;
        sessionRef.current = payload.sessionId;
        setSessionId(payload.sessionId);
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.message || "Watch access could not be verified.");
      }
    }
    authorize();
    return () => {
      controller.abort();
      if (createdSession) {
        void stopSession(createdSession);
        if (sessionRef.current === createdSession) sessionRef.current = "";
      }
    };
  }, [playbackReady, iframeUrl, mediaType, isMovie, tmdbId, seasonNumber, episodeNumber]);

  const sendHeartbeat = useCallback(async (isPlaying) => {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    try {
      await fetch("/api/playback/heartbeat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSession, playing: Boolean(isPlaying) })
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (!sessionId) return undefined;
    const timer = window.setInterval(() => { void sendHeartbeat(playingRef.current); }, 15000);
    const onPageHide = () => { void stopSession(sessionId); };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [sessionId, sendHeartbeat]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== SERIES_PLAYBACK_ORIGIN) return;
      const data = normalizeSeriesPlaybackEvent(event.data);
      if (!data) return;
      const eventName = data.event;
      const nextDuration = Number(data.duration);
      const nextTime = Number(data.currentTime);
      if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
      if (Number.isFinite(nextTime) && nextTime >= 0) setCurrentTime(nextTime);
      if (eventName === "play") {
        playingRef.current = true;
        setPlaying(true);
        void sendHeartbeat(true);
      } else if (eventName === "pause") {
        playingRef.current = false;
        setPlaying(false);
        void sendHeartbeat(false);
      } else if (eventName === "ended") {
        playingRef.current = false;
        setPlaying(false);
        void stopSession(sessionRef.current);
        sessionRef.current = "";
        setSessionId("");
      }

      if (["timeupdate", "pause", "ended"].includes(eventName) && Date.now() - lastWriteRef.current > 4000) {
        const actualDuration = Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : duration;
        const actualTime = eventName === "ended" && actualDuration > 0
          ? actualDuration : Number.isFinite(nextTime) && nextTime >= 0 ? nextTime : currentTime;
        if (actualTime >= 0 && actualDuration > 0) {
          lastWriteRef.current = Date.now();
          writeHistory({
            key: historyKey,
            mediaType,
            mediaId: String(tmdbId),
            tmdbId: Number(tmdbId),
            title: item?.title || "Cartoon",
            posterUrl: item?.posterUrl || null,
            season: isMovie ? null : Number(seasonNumber),
            episode: isMovie ? null : Number(episodeNumber),
            watched: actualTime,
            duration: actualDuration,
            updatedAt: Date.now()
          });
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendHeartbeat, historyKey, mediaType, tmdbId, item, isMovie, seasonNumber, episodeNumber, duration, currentTime]);

  const title = item?.title || "Cartoon";
  const detailHref = isMovie ? "/cartoons/movies" : "/cartoons/tv/" + tmdbId;
  const episodeLabel = !isMovie && episode ? " · S" + seasonNumber + " E" + episodeNumber + " — " + episode.name : "";

  if (loading) return <main className="cartoon-player-page"><div className="cartoon-player-state"><span className="inline-loading-spinner" /><p>Checking approved cartoon metadata…</p></div></main>;

  return (
    <main className="cartoon-player-page">
      <div className="cartoon-player-topbar">
        <Link href={detailHref} className="cartoon-back-link"><ArrowLeft size={15} /> {isMovie ? "Cartoon Movies" : "Series & episodes"}</Link>
        <span className="cartoon-player-kids"><Baby size={14} /> SITULA KIDS</span>
      </div>
      {error && (
        <div className="cartoon-player-error" role="alert">
          <AlertTriangle size={18} /><span>{error}</span>
        </div>
      )}
      {item && (
        <header className="cartoon-player-heading">
          <div><h1>{title}{episodeLabel}</h1><p>{item.minimumAge != null ? "Age " + item.minimumAge + "+" : "Age suitability reviewed"}{item.genres?.length ? " · " + item.genres.slice(0, 3).join(" · ") : ""}</p></div>
          {item.voteAverage > 0 && <span className="cartoon-player-rating"><Star size={14} fill="currentColor" /> {Number(item.voteAverage).toFixed(1)}</span>}
        </header>
      )}
      {iframeUrl && sessionId && !error && (
        <section className="cartoon-player-frame-wrap" aria-label="Verified VidBolt cartoon player">
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            title={title + " VidBolt player"}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </section>
      )}
      {playbackReady && !sessionId && !error && <p className="cartoon-player-state">Verifying playback access before opening the player…</p>}
      {item?.overview && <p className="cartoon-player-overview">{item.overview}</p>}
      {!isMovie && episode && <div className="cartoon-player-episode-note">Season {seasonNumber} · Episode {episodeNumber}{episode.airDate ? " · " + episode.airDate : ""}</div>}
      {currentTime > 0 && duration > 0 && (
        <p className="cartoon-player-progress">Continue watching · {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")} / {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}</p>
      )}
    </main>
  );
}
