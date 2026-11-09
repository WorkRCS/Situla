"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const VIDLINK_ORIGIN = "https://vidlink.pro";

export default function PlayerExperience({ imdbId }) {
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startAt, setStartAt] = useState(0);
  const router = useRouter();
  const iframeRef = useRef(null);
  const lastProgressWrite = useRef(0);

  useEffect(() => {
    // Keep the browser address canonical: IMDb route only, no legacy provider query.
    const canonicalPath = "/watch/" + encodeURIComponent(imdbId);
    if (window.location.pathname + window.location.search !== canonicalPath) {
      window.history.replaceState(window.history.state, "", canonicalPath);
    }
  }, [imdbId]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMovie() {
      try {
        const cached = JSON.parse(localStorage.getItem("situla:movie:" + imdbId) || "null");
        if (cached && cached.imdbId === imdbId) setMovie(cached);
      } catch {}

      try {
        const response = await fetch("/api/movies/" + encodeURIComponent(imdbId), {
          cache: "no-store",
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Movie metadata is unavailable.");
        if (!data.item) throw new Error("Movie metadata was empty.");
        setMovie(data.item);
      } catch (error) {
        if (!controller.signal.aborted) {
          setMovie((current) => current
            ? { ...current, playerError: error.message || "Unable to load this movie." }
            : { imdbId, playerError: error.message || "Unable to load this movie." });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadMovie();
    return () => controller.abort();
  }, [imdbId]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("situla:progress:v1") || "[]");
      const entry = Array.isArray(saved) ? saved.find((item) => item.imdbId === imdbId) : null;
      setStartAt(entry && Number.isFinite(Number(entry.watched)) ? Math.max(0, Math.floor(Number(entry.watched))) : 0);
    } catch {
      setStartAt(0);
    }
  }, [imdbId]);

  useEffect(() => {
    const onPlayerMessage = (event) => {
      if (event.origin !== VIDLINK_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object" || payload.type !== "PLAYER_EVENT" || !payload.data) return;
      const data = payload.data;
      if (String(data.mediaType || "").toLowerCase() !== "movie") return;
      if (Number(data.mtmdbId) !== Number(movie?.vidlinkId)) return;

      const eventName = String(data.event || "");
      if (!["play", "pause", "seeked", "ended", "timeupdate"].includes(eventName)) return;
      if (eventName === "timeupdate" && Date.now() - lastProgressWrite.current < 5000) return;
      lastProgressWrite.current = Date.now();

      try {
        const watchedValue = Number(data.currentTime);
        const duration = Number(data.duration);
        if (!Number.isFinite(duration) || duration <= 0) return;
        const watched = eventName === "ended" ? duration : watchedValue;
        if (!Number.isFinite(watched) || watched < 0) return;

        const updatedAt = Date.now();
        const historyKey = "movie:" + imdbId;
        const historyEntry = {
          key: historyKey,
          mediaType: "movie",
          mediaId: imdbId,
          imdbId,
          title: movie?.title || "Movie",
          posterUrl: movie?.posterUrl || null,
          watched: Math.max(0, watched),
          duration,
          updatedAt
        };
        const currentHistory = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
        const nextHistory = [historyEntry, ...(Array.isArray(currentHistory) ? currentHistory.filter((item) => item.key !== historyKey) : [])].slice(0, 500);
        localStorage.setItem("situla:watch-history:v1", JSON.stringify(nextHistory));

        const key = "situla:progress:v1";
        const current = JSON.parse(localStorage.getItem(key) || "[]");
        if (eventName === "ended") {
          localStorage.setItem(key, JSON.stringify((Array.isArray(current) ? current : []).filter((item) => item.imdbId !== imdbId)));
          return;
        }
        const entry = {
          imdbId,
          title: movie?.title || "Movie",
          posterUrl: movie?.posterUrl || null,
          backdropUrl: movie?.backdropUrl || null,
          releaseYear: movie?.releaseYear || null,
          voteAverage: movie?.voteAverage || 0,
          genres: movie?.genres || [],
          runtime: movie?.runtime || null,
          watched: Math.max(0, watched),
          duration,
          updatedAt
        };
        const next = [entry, ...(Array.isArray(current) ? current.filter((item) => item.imdbId !== imdbId) : [])].slice(0, 20);
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    };
    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [movie, imdbId]);

  const vidlinkId = Number(movie?.vidlinkId);
  const playerParams = new URLSearchParams({
    primaryColor: "e8b65b",
    secondaryColor: "171a23",
    iconColor: "ffffff",
    icons: "default",
    player: "default",
    title: "false",
    poster: "true",
    autoplay: "false",
    nextbutton: "false"
  });
  if (startAt > 0) playerParams.set("startAt", String(startAt));
  const playerUrl = Number.isSafeInteger(vidlinkId) && vidlinkId > 0
    ? VIDLINK_ORIGIN + "/movie/" + vidlinkId + "?" + playerParams.toString()
    : null;

  return (
    <main className="watch-screen">
      {playerUrl ? (
        <iframe
          ref={iframeRef}
          key={playerUrl}
          className="watch-frame"
          src={playerUrl}
          title={(movie?.title || "Situla movie") + " player"}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
        />
      ) : (
        <div className="player-message">
          <div className="player-message-card">
            <div className="player-message-mark">S</div>
            <h1>{loading ? "Preparing your movie" : "Playback unavailable"}</h1>
            <p>{movie?.playerError || (loading
              ? "Loading saved movie details…"
              : "This IMDb title has no saved VidLink provider mapping yet. Add its numeric provider mapping to the database to enable playback.")}</p>
            <button type="button" className="gold-button" onClick={() => router.back()}>Back to Situla</button>
          </div>
        </div>
      )}
      <header className="watch-topbar">
        <button type="button" onClick={() => {
          if (window.history.length > 1) router.back();
          else router.replace("/");
        }} className="watch-control" aria-label="Back to Situla"><ArrowLeft size={20} strokeWidth={1.9} /></button>
        <div className="watch-title">
          <p className="text-[9px] font-extrabold tracking-[.2em] text-[#f0c471]">SITULA PLAYER · IMDb</p>
          <h1 className="truncate text-sm font-bold">{movie?.title || (loading ? "Loading movie…" : "Now Playing")}</h1>
        </div>
      </header>
    </main>
  );
}
