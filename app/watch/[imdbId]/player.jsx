"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

async function lockLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") await screen.orientation.lock("landscape");
  } catch {}
}

export default function PlayerExperience({ imdbId }) {
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startAt, setStartAt] = useState(0);
  const router = useRouter();
  const lastProgressWrite = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMovie() {
      let requestedVidlinkId = "";
      try {
        requestedVidlinkId = new URLSearchParams(window.location.search).get("vidlinkId") || "";
        const cached = JSON.parse(localStorage.getItem("situla:movie:" + imdbId) || "null");
        if (cached && cached.imdbId === imdbId) setMovie(cached);
      } catch {}

      try {
        const query = requestedVidlinkId ? "?vidlinkId=" + encodeURIComponent(requestedVidlinkId) : "";
        const response = await fetch("/api/movies/" + encodeURIComponent(imdbId) + query, {
          cache: "no-store",
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Movie metadata is unavailable.");
        if (data.item) {
          setMovie((current) => current?.vidlinkId ? { ...data.item, ...current, vidlinkId: current.vidlinkId } : data.item);
        } else {
          throw new Error("Movie metadata was empty.");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setMovie((current) => current?.vidlinkId
            ? current
            : { ...(current || {}), imdbId, playerError: error.message || "Unable to load this movie." });
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
        const watchedValue = Number(details.currentTime);
        const durationValue = Number(details.duration);
        const duration = Number.isFinite(durationValue) && durationValue > 0
          ? durationValue
          : Math.max(0, Number(movie?.runtime) * 60);
        const watched = eventName === "ended" && duration > 0
          ? duration
          : watchedValue;
        if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration <= 0) return;

        const updatedAt = Date.now();
        const historyKey = "movie:" + imdbId;
        const historyEntry = {
          key: historyKey,
          mediaType: "movie",
          mediaId: imdbId,
          imdbId,
          vidlinkId: Number(movie?.vidlinkId) || null,
          title: movie?.title || "Movie",
          posterUrl: movie?.posterUrl || null,
          watched: Math.max(0, watched),
          duration,
          updatedAt
        };
        const currentHistory = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
        const nextHistory = [historyEntry, ...(Array.isArray(currentHistory) ? currentHistory.filter((item) => item.key !== historyKey) : [])].slice(0, 500);
        localStorage.setItem("situla:watch-history:v1", JSON.stringify(nextHistory));

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
    ? "https://vidlink.pro/movie/" + vidlinkId + "?" + playerParams.toString()
    : null;

  return (
    <main className="watch-screen">
      {playerUrl ? (
        <iframe
          key={playerUrl}
          className="watch-frame"
          src={playerUrl}
          title={(movie?.title || "Situla movie") + " player"}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        />
      ) : (
        <div className="player-message">
          <div className="player-message-card">
            <div className="player-message-mark">S</div>
            <h1>{loading ? "Preparing your movie" : "Player unavailable"}</h1>
            <p>{movie?.playerError || (loading ? "Loading saved movie details…" : "This catalog record has no saved VidLink ID. Return to the movie catalog and open it from its card to retry with its stored provider ID.")}</p>
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
