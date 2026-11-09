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
      if (event.origin !== "https://vidsrc.sh") return;
      const payload = event.data;
      if (!payload || payload.type !== "PLAYER_EVENT" || !payload.data || typeof payload.data !== "object") return;

      const details = payload.data;
      const eventImdbId = String(details.player_info?.imdb || imdbId).toLowerCase();
      if (eventImdbId !== imdbId) return;

      const status = String(details.player_status || "");
      if (status === "playing" && Date.now() - lastProgressWrite.current < 5000) return;
      if (status === "playing") lastProgressWrite.current = Date.now();

      if (status === "completed") {
        try {
          const key = "situla:progress:v1";
          const current = JSON.parse(localStorage.getItem(key) || "[]");
          localStorage.setItem(key, JSON.stringify((Array.isArray(current) ? current : []).filter((item) => item.imdbId !== imdbId)));
        } catch {}
        return;
      }

      const watched = Number(details.player_progress);
      const duration = Number(details.player_duration);
      if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration <= 0) return;

      try {
        const key = "situla:progress:v1";
        const current = JSON.parse(localStorage.getItem(key) || "[]");
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
        else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
        await lockLandscape();
      }
    } catch {}
  }, []);

  const playerUrl = "https://vidsrc.sh/embed/movie/" + encodeURIComponent(imdbId) +
    (startAt > 0 ? "?startAt=" + encodeURIComponent(String(startAt)) : "");

  return (
    <main ref={screenRef} className="watch-screen" onDoubleClick={toggleFullscreen}>
      <iframe
        key={playerUrl}
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
