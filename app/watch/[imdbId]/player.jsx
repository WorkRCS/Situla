"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Maximize, Minimize } from "lucide-react";

async function lockLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") await screen.orientation.lock("landscape");
  } catch {}
}

export default function PlayerExperience({ imdbId }) {
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const screenRef = useRef(null);
  const router = useRouter();
  const lastProgressWrite = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMovie() {
      try {
        const response = await fetch("/api/movies/" + encodeURIComponent(imdbId), {
          cache: "no-store",
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Movie metadata is unavailable.");
        setMovie(data.item || null);
      } catch (error) {
        if (!controller.signal.aborted) setMovie({ playerError: error.message || "Unable to load this movie." });
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
      if (event.origin !== "https://vidlink.pro") return;
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;

      if (payload.type === "MEDIA_DATA" && payload.data && typeof payload.data === "object") {
        try { localStorage.setItem("situla:vidlink-media:v1", JSON.stringify(payload.data)); } catch {}
        return;
      }

      if (payload.type !== "PLAYER_EVENT" || !payload.data || typeof payload.data !== "object") return;
      const details = payload.data;
      if (details.mediaType !== "movie" || Number(details.mtmdbId) !== Number(movie?.vidlinkId)) return;

      const eventName = String(details.event || "");
      if (eventName === "timeupdate" && Date.now() - lastProgressWrite.current < 5000) return;
      if (["timeupdate", "pause", "seeked"].includes(eventName)) lastProgressWrite.current = Date.now();

      const key = "situla:progress:v1";
      try {
        const current = JSON.parse(localStorage.getItem(key) || "[]");
        if (eventName === "ended") {
          localStorage.setItem(key, JSON.stringify((Array.isArray(current) ? current : []).filter((item) => item.imdbId !== imdbId)));
          return;
        }
        const watched = Number(details.currentTime);
        const duration = Number(details.duration);
        if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration <= 0) return;
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
          duration: Math.max(0, duration),
          updatedAt: Date.now()
        };
        const next = [entry, ...(Array.isArray(current) ? current.filter((item) => item.imdbId !== imdbId) : [])].slice(0, 20);
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    };
    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [movie, imdbId]);

  useEffect(() => {
    const onFullscreenChange = async () => {
      const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      setFullscreen(active);
      if (active) await lockLandscape();
      else {
        try { screen.orientation?.unlock?.(); } catch {}
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      try { screen.orientation?.unlock?.(); } catch {}
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const target = screenRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else {
        if (target.requestFullscreen) await target.requestFullscreen();
        else if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen();
        await lockLandscape();
      }
    } catch {}
  }, []);

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
    ? "https://vidlink.pro/movie/" + vidlinkId + "?" + playerParams.toString()
    : null;

  return (
    <main ref={screenRef} className="watch-screen" onDoubleClick={toggleFullscreen}>
      {playerUrl ? (
        <iframe
          key={playerUrl}
          className="watch-frame"
          src={playerUrl}
          title={(movie?.title || "Situla movie") + " player"}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="player-message">
          <div className="player-message-card">
            <div className="player-message-mark">S</div>
            <h1>{loading ? "Preparing your movie" : "Player unavailable"}</h1>
            <p>{movie?.playerError || (loading ? "Loading verified movie details…" : "VidLink needs a matching movie ID before playback can start.")}</p>
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
        <button className="watch-control" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
          {fullscreen ? <Minimize size={19} strokeWidth={1.9} /> : <Maximize size={19} strokeWidth={1.9} />}
        </button>
      </header>
    </main>
  );
}
