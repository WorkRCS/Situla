"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

async function lockLandscape() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") await screen.orientation.lock("landscape");
  } catch {}
}

export default function SeriesMediaPlayer({ kind, tmdbId, malId, season, episode, audio }) {
  const router = useRouter();
  const [title, setTitle] = useState(kind === "tv" ? "TV series" : "Anime");
  const [posterUrl, setPosterUrl] = useState(null);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [startAt, setStartAt] = useState(0);
  const lastWrite = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = kind === "tv" ? "/api/tv/" + encodeURIComponent(tmdbId) : "/api/anime/" + encodeURIComponent(malId);
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload.item) {
          setSeriesInfo(payload.item);
          setTitle(payload.item.titleEnglish || payload.item.title);
          setPosterUrl(payload.item.posterUrl || null);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [kind, tmdbId, malId]);

  useEffect(() => {
    try {
      const key = kind === "tv" ? "situla:tv-progress:v1" : "situla:anime-progress:v1";
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      const entry = Array.isArray(saved) ? saved.find((item) => kind === "tv"
        ? Number(item.tmdbId) === Number(tmdbId) && Number(item.season) === Number(season) && Number(item.episode) === Number(episode)
        : Number(item.malId) === Number(malId) && Number(item.episode) === Number(episode) && item.audio === (audio || "sub")
      ) : null;
      setStartAt(entry && Number.isFinite(Number(entry.watched)) ? Math.max(0, Math.floor(Number(entry.watched))) : 0);
    } catch {
      setStartAt(0);
    }
  }, [kind, tmdbId, malId, season, episode, audio]);

  useEffect(() => {
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
      const incomingType = String(data.mediaType || "").toLowerCase();
      if (incomingType && incomingType !== kind) return;
      if (kind === "tv") {
        if (Number(data.mtmdbId) !== Number(tmdbId)) return;
        if (Number(data.season) !== Number(season) || Number(data.episode) !== Number(episode)) return;
      } else {
        const incomingMalId = Number(data.malId ?? data.mal_id ?? data.mediaId ?? data.id);
        if (incomingMalId && incomingMalId !== Number(malId)) return;
        if (Number(data.episode) && Number(data.episode) !== Number(episode)) return;
      }

      const eventName = String(data.event || "");
      if (eventName === "timeupdate" && Date.now() - lastWrite.current < 5000) return;
      if (["timeupdate", "pause", "seeked", "ended"].includes(eventName)) lastWrite.current = Date.now();

      try {
        const watchedValue = Number(data.currentTime);
        const durationValue = Number(data.duration);
        if (!Number.isFinite(durationValue) || durationValue <= 0) return;
        const watched = eventName === "ended" ? durationValue : watchedValue;
        if (!Number.isFinite(watched) || watched < 0) return;
        const updatedAt = Date.now();
        const mediaKey = kind === "tv"
          ? "tv:" + tmdbId + ":s" + season + ":e" + episode
          : "anime:" + malId + ":e" + episode + ":" + (audio || "sub");
        const historyEntry = {
          key: mediaKey,
          mediaType: kind,
          mediaId: kind === "tv" ? String(tmdbId) : String(malId),
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
            Number(item.tmdbId) === Number(tmdbId) &&
            Number(item.season) === Number(season) &&
            Number(item.episode) === Number(episode);
          if (eventName === "ended") {
            localStorage.setItem(key, JSON.stringify((Array.isArray(current) ? current : []).filter((item) => !matchesEpisode(item))));
            return;
          }
          const entry = {
            tmdbId: Number(tmdbId), title, season: Number(season), episode: Number(episode),
            watched: Math.max(0, watched), duration: durationValue, updatedAt
          };
          localStorage.setItem(key, JSON.stringify([entry, ...(Array.isArray(current) ? current.filter((item) => !matchesEpisode(item)) : [])].slice(0, 30)));
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
    window.addEventListener("message", onVidLinkMessage);
    return () => window.removeEventListener("message", onVidLinkMessage);
  }, [kind, tmdbId, malId, season, episode, audio, title, posterUrl]);

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
  if (kind === "tv") playerParams.set("nextbutton", "true");
  if (startAt > 0 && kind === "tv") playerParams.set("startAt", String(startAt));
  if (kind === "anime") playerParams.set("fallback", "true");
  const playerUrl = kind === "tv"
    ? "https://vidlink.pro/tv/" + encodeURIComponent(tmdbId) + "/" + encodeURIComponent(season) + "/" + encodeURIComponent(episode) + "?" + playerParams.toString()
    : "https://vidlink.pro/anime/" + encodeURIComponent(malId) + "/" + encodeURIComponent(episode) + "/" + encodeURIComponent(audio || "sub") + "?" + playerParams.toString();

  return (
    <main className="watch-screen series-watch-screen">
      <iframe
        key={playerUrl}
        className="watch-frame series-watch-frame"
        src={playerUrl}
        title={title + (kind === "tv" ? " · S" + season + " E" + episode : " · Episode " + episode)}
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
      />
      <header className="watch-topbar series-watch-topbar">
        <button type="button" onClick={() => router.back()} className="watch-control" aria-label="Back to series"><ArrowLeft size={20} strokeWidth={1.9} /></button>
        <div className="watch-title">
          <p className="text-[9px] font-extrabold tracking-[.2em] text-[#f0c471]">SITULA · {kind === "tv" ? "TV PLAYER" : "ANIME PLAYER"}</p>
          <h1 className="truncate text-sm font-bold">{title}{kind === "tv" ? " · S" + season + " E" + episode : " · EP " + episode + " · " + (audio || "sub").toUpperCase()}</h1>
        </div>
      </header>
    </main>
  );
}
