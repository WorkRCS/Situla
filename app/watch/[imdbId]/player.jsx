"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { hindiMoviePlayerUrl, vidlinkMovieUrl } from "../../../src/player-urls.js";
import { attachFullscreenLandscapeLock } from "../../../src/player-fullscreen.js";

const VIDLINK_ORIGIN = "https://vidlink.pro";
const HINDI_PLAYER_ORIGIN = "https://slast430did.com";

export default function PlayerExperience({ imdbId }) {
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalogVerified, setCatalogVerified] = useState(false);
  const [playerLanguage, setPlayerLanguage] = useState("en");
  const [languageReady, setLanguageReady] = useState(false);
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
    try {
      const savedLanguage = localStorage.getItem("situla:movie-player-language:v1");
      if (savedLanguage === "hi") setPlayerLanguage("hi");
    } catch {}
    setLanguageReady(true);
  }, []);

  function togglePlayerLanguage() {
    const nextLanguage = playerLanguage === "hi" ? "en" : "hi";
    setPlayerLanguage(nextLanguage);
    try {
      localStorage.setItem("situla:movie-player-language:v1", nextLanguage);
    } catch {}
  }

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
        setCatalogVerified(true);
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
      if ((event.origin !== VIDLINK_ORIGIN && event.origin !== HINDI_PLAYER_ORIGIN) || event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object" || payload.type !== "PLAYER_EVENT" || !payload.data) return;
      const data = payload.data;
      if (String(data.mediaType || "").toLowerCase() !== "movie") return;
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

  const playerUrl = catalogVerified && languageReady
    ? playerLanguage === "hi" ? hindiMoviePlayerUrl(imdbId, startAt) : vidlinkMovieUrl(imdbId, startAt)
    : null;

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    return attachFullscreenLandscapeLock(frame);
  }, [playerUrl]);

  return (
    <main className="watch-screen">
      {playerUrl ? (
        <iframe
          ref={iframeRef}
          key={playerLanguage + ":" + playerUrl}
          className="watch-frame"
          src={playerUrl}
          title={(movie?.title || "Situla movie") + (playerLanguage === "hi" ? " Hindi player" : " English player")}
          sandbox={playerLanguage === "hi" ? "allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock" : undefined}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="player-message">
          <div className="player-message-card">
            <div className="player-message-mark">S</div>
            <h1>{loading ? "Preparing your movie" : "Playback unavailable"}</h1>
            <p>{movie?.playerError || (loading
              ? "Loading saved movie details…"
              : "This title is not available in the Situla catalog yet.")}</p>
            <button type="button" className="gold-button" onClick={() => router.back()}>Back to Situla</button>
          </div>
        </div>
      )}
      <header className="watch-topbar">
        <button type="button" onClick={() => {
          if (window.history.length > 1) router.back();
          else router.replace("/");
        }} className="watch-control" aria-label="Back to Situla"><i className="bi bi-arrow-left" aria-hidden="true" /></button>
        <div className="watch-title">
          <p className="text-[9px] font-extrabold tracking-[.2em] text-[#f0c471]">SITULA PLAYER · IMDb</p>
          <h1 className="truncate text-sm font-bold">{movie?.title || (loading ? "Loading movie…" : "Now Playing")}</h1>
        </div>
        <button
          type="button"
          className="watch-language-switch"
          onClick={togglePlayerLanguage}
          disabled={!catalogVerified || !languageReady}
          aria-label={"Switch to " + (playerLanguage === "hi" ? "English" : "Hindi") + " player"}
          title={"Switch to " + (playerLanguage === "hi" ? "English" : "Hindi") + " player"}
        >
          <i className="bi bi-translate" aria-hidden="true" />
          <span>{playerLanguage === "hi" ? "English" : "Hindi"}</span>
          <i className="bi bi-chevron-down" aria-hidden="true" />
        </button>
      </header>
    </main>
  );
}
