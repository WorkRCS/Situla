"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AnimeSeriesExperience({ malId }) {
  const router = useRouter();
  const [anime, setAnime] = useState(null);
  const [episode, setEpisode] = useState("1");
  const [audio, setAudio] = useState("sub");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/anime/" + encodeURIComponent(malId), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Anime series not found.");
        setAnime(payload.item);
        try {
          const last = JSON.parse(localStorage.getItem("situla:anime-last-episode:v1") || "{}");
          if (Number(last.malId) === Number(malId)) {
            if (Number.isSafeInteger(Number(last.episode)) && Number(last.episode) > 0) setEpisode(String(last.episode));
            if (last.audio === "sub" || last.audio === "dub") setAudio(last.audio);
          }
        } catch {}
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [malId]);

  function playAnime() {
    const number = Number(episode);
    if (!Number.isSafeInteger(number) || number < 1 || (anime?.episodes && number > anime.episodes)) return;
    try { localStorage.setItem("situla:anime-last-episode:v1", JSON.stringify({ malId: Number(malId), episode: number, audio })); } catch {}
    router.push("/watch/anime/" + encodeURIComponent(malId) + "/" + number + "/" + audio);
  }

  return (
    <main className="app-shell min-h-screen">
      <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-10">
        <button className="watch-control mb-5" onClick={() => router.back()} aria-label="Go back">←</button>
        {loading ? (
          <div className="empty-panel">Loading anime…</div>
        ) : error ? (
          <div className="empty-panel"><h1 className="font-bold text-white">Anime unavailable</h1><p className="mt-2 text-sm">{error}</p></div>
        ) : anime ? (
          <div className="grid gap-6 md:grid-cols-[260px_1fr]">
            <div className="overflow-hidden rounded-2xl bg-[#11131b]">
              {anime.posterUrl && <img src={anime.posterUrl} alt={anime.title} className="w-full object-cover" />}
            </div>
            <section>
              <p className="text-[10px] font-black tracking-[.2em] text-[#f0c471]">ANIME SERIES · MAL {anime.malId}</p>
              <h1 className="mt-2 text-3xl font-black text-white">{anime.titleEnglish || anime.title}</h1>
              {anime.titleJapanese && <p className="mt-1 text-sm text-[#9297a7]">{anime.titleJapanese}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#a4a9b7]">
                {anime.releaseYear && <span>{anime.releaseYear}</span>}
                {anime.score > 0 && <span>★ {Number(anime.score).toFixed(2)} MAL</span>}
                <span>{anime.episodes || "?"} episodes</span>
                {anime.season && <span>{anime.season}</span>}
                <span>{anime.status}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{(anime.genres || []).map((genre) => <span key={genre} className="genre-chip">{genre}</span>)}</div>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#b5bac7]">{anime.synopsis || "No synopsis available."}</p>

              <div className="mt-8 rounded-2xl border border-white/10 bg-[#11131b] p-5">
                <h2 className="font-bold text-white">Choose episode and audio</h2>
                <label className="mt-4 block text-xs text-[#9297a7]">Episode
                  <input className="series-control series-input mt-2" type="number" min="1" max={anime.episodes || 9999} value={episode} onChange={(event) => setEpisode(event.target.value)} />
                </label>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" className={audio === "sub" ? "gold-button" : "ghost-button"} onClick={() => setAudio("sub")}>Japanese · Sub</button>
                  <button type="button" className={audio === "dub" ? "gold-button" : "ghost-button"} onClick={() => setAudio("dub")}>English · Dub</button>
                </div>
                <p className="mt-3 text-xs leading-5 text-[#858b9b]">VidLink uses this MyAnimeList ID and falls back to the other audio type if the selected version is unavailable.</p>
                <button className="gold-button mt-5" disabled={!episode || Number(episode) < 1 || (anime.episodes && Number(episode) > anime.episodes)} onClick={playAnime}>▶ Play anime</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
