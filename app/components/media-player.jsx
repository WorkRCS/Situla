"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Maximize, Minimize } from "lucide-react";

async function lockLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") await screen.orientation.lock("landscape");
  } catch {}
}

export default function SeriesMediaPlayer({ kind, tmdbId, malId, season, episode, audio }) {
  const router = useRouter();
  const screenRef = useRef(null);
  const [title, setTitle] = useState(kind === "tv" ? "TV series" : "Anime");
  const [fullscreen, setFullscreen] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const lastWrite = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = kind === "tv" ? "/api/tv/" + encodeURIComponent(tmdbId) : "/api/anime/" + encodeURIComponent(malId);
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload.item) setTitle(payload.item.titleEnglish || payload.item.title);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [kind, tmdbId, malId]);

  useEffect(() => {
    if (kind !== "tv") return;
    try {
      const saved = JSON.parse(localStorage.getItem("situla:tv-progress:v1") || "[]");
      const entry = Array.isArray(saved) ? saved.find((item) =>
        Number(item.tmdbId) === Number(tmdbId) &&
        Number(item.season) === Number(season) &&
        Number(item.episode) === Number(episode)
      ) : null;
      setStartAt(entry && Number.isFinite(Number(entry.watched)) ? Math.max(0, Math.floor(Number(entry.watched))) : 0);
    } catch {
      setStartAt(0);
    }
  }, [kind, tmdbId, season, episode]);

  useEffect(() => {
    if (kind !== "tv") return;
    const onVidLinkMessage = (event) => {
      if (event.origin !== "https://vidlink.pro") return;
      const payload = event.data;
      if (!payload || typeof payload !== "object") return;

      if (payload.type === "MEDIA_DATA" && payload.data && typeof payload.data === "object") {
        try {
          localStorage.setItem("situla:vidlink-media:v1", JSON.stringify(payload.data));
        } catch {}
        return;
      }

      if (payload.type !== "PLAYER_EVENT" || !payload.data || typeof payload.data !== "object") return;
      const data = payload.data;
      if (String(data.mediaType || "") !== "tv") return;
      if (Number(data.mtmdbId) !== Number(tmdbId)) return;
      if (Number(data.season) !== Number(season) || Number(data.episode) !== Number(episode)) return;

      const eventName = String(data.event || "");
      if (eventName === "timeupdate" && Date.now() - lastWrite.current < 5000) return;
      if (eventName === "timeupdate" || eventName === "pause" || eventName === "seeked") lastWrite.current = Date.now();

      try {
        const key = "situla:tv-progress:v1";
        const current = JSON.parse(localStorage.getItem(key) || "[]");
        if (eventName === "ended") {
          localStorage.setItem(key, JSON.stringify((Array.isArray(current) ? current : []).filter((item) =>
            !(Number(item.tmdbId) === Number(tmdbId) && Number(item.season) === Number(season) && Number(item.episode) === Number(episode))
          )));
          return;
        }
        const watched = Number(data.currentTime);
        const duration = Number(data.duration);
        if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration <= 0) return;
        const entry = {
          tmdbId: Number(tmdbId), title, season: Number(season), episode: Number(episode),
          watched: Math.max(0, watched), duration: Math.max(0, duration), updatedAt: Date.now()
        };
        const next = [entry, ...(Array.isArray(current) ? current.filter((item) =>
          !(Number(item.tmdbId) === Number(tmdbId) && Number(item.season) === Number(season) && Number(item.episode) === Number(episode))
        ) : [])].slice(0, 30);
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    };
    window.addEventListener("message", onVidLinkMessage);
    return () => window.removeEventListener("message", onVidLinkMessage);
  }, [kind, tmdbId, season, episode, title]);

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

  const playerParams = new URLSearchParams({
    primaryColor: "e8b65b",
    secondaryColor: "171a23",
    iconColor: "ffffff",
    icons: "default",
    player: "default",
    title: "false",
    poster: "true",
    autoplay: "false"
  });
  if (kind === "tv") playerParams.set("nextbutton", "false");
  if (startAt > 0 && kind === "tv") playerParams.set("startAt", String(startAt));
  if (kind === "anime") playerParams.set("fallback", "true");
  const playerUrl = kind === "tv"
    ? "https://vidlink.pro/tv/" + encodeURIComponent(tmdbId) + "/" + encodeURIComponent(season) + "/" + encodeURIComponent(episode) + "?" + playerParams.toString()
    : "https://vidlink.pro/anime/" + encodeURIComponent(malId) + "/" + encodeURIComponent(episode) + "/" + encodeURIComponent(audio || "sub") + "?" + playerParams.toString();

  return (
    <main ref={screenRef} className="watch-screen" onDoubleClick={toggleFullscreen}>
      <iframe
        key={playerUrl}
        className="watch-frame"
        src={playerUrl}
        title={title + (kind === "tv" ? " · S" + season + " E" + episode : " · Episode " + episode)}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock"
        referrerPolicy="no-referrer"
      />
      <header className="watch-topbar">
        <button type="button" onClick={() => router.back()} className="watch-control" aria-label="Back to series"><ArrowLeft size={20} strokeWidth={1.9} /></button>
        <div className="watch-title">
          <p className="text-[9px] font-extrabold tracking-[.2em] text-[#f0c471]">SITULA · {kind === "tv" ? "TV PLAYER" : "ANIME PLAYER"}</p>
          <h1 className="truncate text-sm font-bold">{title}{kind === "tv" ? " · S" + season + " E" + episode : " · EP " + episode + " · " + (audio || "sub").toUpperCase()}</h1>
        </div>
        <button className="watch-control" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{fullscreen ? <Minimize size={19} strokeWidth={1.9} /> : <Maximize size={19} strokeWidth={1.9} />}</button>
      </header>
    </main>
  );
}
