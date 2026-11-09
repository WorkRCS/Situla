"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "back") return <svg {...common}><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></svg>;
  if (name === "expand") return <svg {...common}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>;
  if (name === "external") return <svg {...common}><path d="M14 3h7v7M10 14 21 3" /><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg>;
}

async function lockLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") {
      await screen.orientation.lock("landscape");
    }
  } catch {}
}

export default function PlayerExperience({ tmdbId }) {
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const screenRef = useRef(null);
  const router = useRouter();
  const lastProgressWrite = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMovie() {
      try {
        const response = await fetch("/api/movies/" + encodeURIComponent(tmdbId), {
          cache: "no-store",
          signal: controller.signal
        });
        if (response.ok) {
          const data = await response.json();
          setMovie(data.item || null);
        }
      } catch {}
      finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadMovie();
    return () => controller.abort();
  }, [tmdbId]);

  useEffect(() => {
    const onPlayerMessage = (event) => {
      if (event.origin !== "https://vidlink.pro") return;
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;

      let details = null;
      if (payload.type === "MEDIA_DATA" && payload.data && typeof payload.data === "object") {
        details = payload.data;
      } else if (payload.type === "PLAYER_EVENT" && payload.data && typeof payload.data === "object") {
        details = payload.data;
        if (details.event === "timeupdate" && Date.now() - lastProgressWrite.current < 5000) return;
        if (details.event === "timeupdate") lastProgressWrite.current = Date.now();
      }
      if (!details) return;

      const id = Number(details.tmdbId || details.mtmdbId || details.id || tmdbId);
      if (!Number.isSafeInteger(id) || id <= 0) return;
      const watched = Number(details.progress?.watched ?? details.currentTime ?? 0);
      const duration = Number(details.progress?.duration ?? details.duration ?? 0);
      if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration <= 0) return;

      try {
        const key = "situla:progress:v1";
        const current = JSON.parse(localStorage.getItem(key) || "[]");
        const posterPath = details.poster_path || details.posterPath;
        const posterUrl = movie?.posterUrl || (posterPath ? "https://image.tmdb.org/t/p/w342" + posterPath : null);
        const entry = {
          tmdbId: id,
          title: movie?.title || details.title || "Movie",
          posterUrl,
          backdropUrl: movie?.backdropUrl || null,
          releaseYear: movie?.releaseYear || null,
          voteAverage: movie?.voteAverage || 0,
          genres: movie?.genres || [],
          runtime: movie?.runtime || null,
          watched: Math.max(0, watched),
          duration: Math.max(0, duration),
          updatedAt: Date.now()
        };
        const next = [entry, ...(Array.isArray(current) ? current.filter((item) => item.tmdbId !== id) : [])].slice(0, 20);
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    };

    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [movie, tmdbId]);

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
        else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
        await lockLandscape();
      }
    } catch {}
  }, []);

  const playerUrl = "https://vidlink.pro/movie/" + encodeURIComponent(tmdbId);

  return (
    <main ref={screenRef} className="watch-screen" onDoubleClick={toggleFullscreen}>
      <iframe
        className="watch-frame"
        src={playerUrl}
        title={(movie?.title || "Situla movie") + " player"}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <header className="watch-topbar">
        <button type="button" onClick={() => {
          if (window.history.length > 1) router.back();
          else router.replace("/");
        }} className="watch-control" aria-label="Back to Situla"><Icon name="back" /></button>
        <div className="watch-title">
          <p className="text-[9px] font-extrabold tracking-[.2em] text-[#f0c471]">SITULA PLAYER</p>
          <h1 className="truncate text-sm font-bold">{movie?.title || (loading ? "Loading movie…" : "Now Playing")}</h1>
        </div>
        <button className="watch-control" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
          <Icon name="expand" />
        </button>
      </header>
      <a
        className="absolute bottom-4 right-4 z-[4] inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/65 px-3 py-2 text-[11px] font-bold text-white/80 backdrop-blur-md"
        href={playerUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open player page <Icon name="external" size={14} />
      </a>
    </main>
  );
}
