"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function TvSeriesExperience({ tmdbId }) {
  const router = useRouter();
  const [series, setSeries] = useState(null);
  const [seasonNumber, setSeasonNumber] = useState("");
  const [season, setSeason] = useState(null);
  const [episodeNumber, setEpisodeNumber] = useState("1");
  const [resumeEpisode, setResumeEpisode] = useState("");
  const [loading, setLoading] = useState(true);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tv/" + encodeURIComponent(tmdbId), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "TV series not found.");
        setSeries(payload.item);
        let progress = null;
        try {
          const saved = JSON.parse(localStorage.getItem("situla:tv-progress:v1") || "[]");
          progress = Array.isArray(saved) ? saved.find((item) => Number(item.tmdbId) === Number(tmdbId)) : null;
        } catch {}
        const seasons = payload.item?.seasons || [];
        const resumedSeason = progress && seasons.find((item) => item.seasonNumber === Number(progress.season) && item.episodeCount > 0);
        const first = seasons.find((item) => item.seasonNumber > 0 && item.episodeCount > 0)
          || seasons.find((item) => item.episodeCount > 0);
        if (resumedSeason) {
          setSeasonNumber(String(resumedSeason.seasonNumber));
          setResumeEpisode(String(progress.episode));
        } else if (first) {
          setSeasonNumber(String(first.seasonNumber));
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tmdbId]);

  useEffect(() => {
    if (!seasonNumber) return;
    const controller = new AbortController();
    setSeasonLoading(true);
    fetch("/api/tv/" + encodeURIComponent(tmdbId) + "/seasons/" + encodeURIComponent(seasonNumber), {
      cache: "no-store",
      signal: controller.signal
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Season episodes unavailable.");
      setSeason(payload.item);
      const firstEpisode = payload.item?.episodes?.[0]?.episodeNumber || 1;
      const resume = payload.item?.episodes?.find((item) => item.episodeNumber === Number(resumeEpisode));
      setEpisodeNumber(String(resume?.episodeNumber || firstEpisode));
      if (resume) setResumeEpisode("");
    }).catch((requestError) => {
      if (!controller.signal.aborted) setError(requestError.message);
    }).finally(() => {
      if (!controller.signal.aborted) setSeasonLoading(false);
    });
    return () => controller.abort();
  }, [tmdbId, seasonNumber, resumeEpisode]);

  const episodes = season?.episodes || [];
  const selectedEpisode = episodes.find((item) => item.episodeNumber === Number(episodeNumber));

  function playEpisode() {
    const number = Number(episodeNumber);
    if (!Number.isSafeInteger(number) || number < 1) return;
    router.push("/watch/tv/" + encodeURIComponent(tmdbId) + "/" + encodeURIComponent(seasonNumber) + "/" + number);
  }

  return (
    <main className="app-shell min-h-screen">
      <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-8 md:py-10">
        <button className="watch-control mb-5" onClick={() => router.back()} aria-label="Go back">←</button>
        {loading ? (
          <div className="empty-panel">Loading TV series…</div>
        ) : error && !series ? (
          <div className="empty-panel"><h1 className="font-bold text-white">TV series unavailable</h1><p className="mt-2 text-sm">{error}</p></div>
        ) : series ? (
          <div className="grid gap-6 md:grid-cols-[260px_1fr]">
            <div className="overflow-hidden rounded-2xl bg-[#11131b]">
              {series.posterUrl && <img src={series.posterUrl} alt={series.title} className="w-full object-cover" />}
            </div>
            <section>
              <p className="text-[10px] font-black tracking-[.2em] text-[#f0c471]">TV SERIES · TMDB {series.tmdbId}</p>
              <h1 className="mt-2 text-3xl font-black text-white">{series.title}</h1>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#a4a9b7]">
                {series.releaseYear && <span>{series.releaseYear}</span>}
                {series.voteAverage > 0 && <span>★ {Number(series.voteAverage).toFixed(1)}</span>}
                <span>{series.numberOfSeasons} seasons</span>
                <span>{series.numberOfEpisodes} episodes</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{(series.genres || []).map((genre) => <span key={genre} className="genre-chip">{genre}</span>)}</div>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#b5bac7]">{series.overview || "No description available."}</p>

              <div className="mt-8 rounded-2xl border border-white/10 bg-[#11131b] p-5">
                <h2 className="font-bold text-white">Choose season and episode</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs text-[#9297a7]">Season
                    <select className="series-control mt-2" value={seasonNumber} onChange={(event) => setSeasonNumber(event.target.value)}>
                      {(series.seasons || []).filter((item) => item.episodeCount > 0).map((item) => (
                        <option key={item.seasonNumber} value={item.seasonNumber}>{item.name || "Season " + item.seasonNumber}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-[#9297a7]">Episode
                    <select className="series-control mt-2" value={episodeNumber} onChange={(event) => setEpisodeNumber(event.target.value)} disabled={seasonLoading || !episodes.length}>
                      {episodes.map((item) => <option key={item.episodeNumber} value={item.episodeNumber}>E{item.episodeNumber} · {item.name || "Episode " + item.episodeNumber}</option>)}
                    </select>
                  </label>
                </div>
                {seasonLoading && <p className="mt-3 text-xs text-[#9297a7]">Loading episode list…</p>}
                {selectedEpisode && <p className="mt-3 text-xs leading-5 text-[#858b9b]">{selectedEpisode.overview}</p>}
                {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
                <button className="gold-button mt-5" disabled={!seasonNumber || !episodeNumber || seasonLoading} onClick={playEpisode}>{resumeEpisode ? "▶ Resume episode" : "▶ Play episode"}</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
