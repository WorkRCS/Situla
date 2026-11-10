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
  const hasEpisodeGuide = Array.isArray(series?.seasons) && series.seasons.some((item) => Number(item?.episodeCount) > 0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tv/" + encodeURIComponent(tmdbId), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "TV series not found.");
        const seasons = Array.isArray(payload.item?.seasons) ? payload.item.seasons : [];
        const normalizedSeries = { ...payload.item, seasons };
        setSeries(normalizedSeries);
        let progress = null;
        try {
          const saved = JSON.parse(localStorage.getItem("situla:tv-progress:v1") || "[]");
          progress = Array.isArray(saved) ? saved.find((item) =>
            item && typeof item === "object" && (
              Number(item.tmdbId) === Number(tmdbId) ||
              (normalizedSeries.externalImdbId && String(item.imdbId || "").toLowerCase() === String(normalizedSeries.externalImdbId).toLowerCase())
            )
          ) : null;
        } catch {}
        const resumedSeason = progress && seasons.find((item) => item.seasonNumber === Number(progress.season) && item.episodeCount > 0);
        const first = seasons.find((item) => item.seasonNumber > 0 && item.episodeCount > 0)
          || seasons.find((item) => item.episodeCount > 0);
        if (resumedSeason) {
          setSeasonNumber(String(resumedSeason.seasonNumber));
          setResumeEpisode(String(progress.episode));
        } else if (first) {
          setSeasonNumber(String(first.seasonNumber));
        } else {
          // Static TMDB seed records have totals but do not invent per-season episode guides.
          setSeasonNumber("1");
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
    if (!series || !hasEpisodeGuide) {
      setSeason(null);
      setSeasonLoading(false);
      return;
    }
    if (!seasonNumber) return;
    const controller = new AbortController();
    setSeasonLoading(true);
    fetch("/api/tv/" + encodeURIComponent(tmdbId) + "/seasons/" + encodeURIComponent(seasonNumber), {
      cache: "no-store",
      signal: controller.signal
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Season episodes unavailable.");
      const episodes = Array.isArray(payload.item?.episodes) ? payload.item.episodes : [];
      const normalizedSeason = { ...payload.item, episodes };
      setSeason(normalizedSeason);
      const firstEpisode = episodes[0]?.episodeNumber || 1;
      const resume = episodes.find((item) => item.episodeNumber === Number(resumeEpisode));
      setEpisodeNumber(String(resume?.episodeNumber || firstEpisode));
      if (resume) setResumeEpisode("");
    }).catch((requestError) => {
      if (!controller.signal.aborted) setError(requestError.message);
    }).finally(() => {
      if (!controller.signal.aborted) setSeasonLoading(false);
    });
    return () => controller.abort();
  }, [tmdbId, seasonNumber, series, hasEpisodeGuide]);

  const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
  const selectedEpisode = episodes.find((item) => item.episodeNumber === Number(episodeNumber));

  function playEpisode() {
    const season = Number(seasonNumber);
    const number = Number(episodeNumber);
    if (!Number.isSafeInteger(season) || season < 0 || !Number.isSafeInteger(number) || number < 1) return;
    router.push("/watch/tv/" + encodeURIComponent(tmdbId) + "/" + season + "/" + number);
  }

  return (
    <main className="app-shell min-h-screen series-detail-page tv-detail-page">
      <div className="series-detail-container mx-auto max-w-[1180px] px-4 py-6 md:px-8 md:py-10">
        <button className="watch-control mb-5" onClick={() => router.back()} aria-label="Go back"><i className="bi bi-arrow-left" aria-hidden="true" /></button>
        {loading ? (
          <div className="empty-panel">Loading TV series…</div>
        ) : error && !series ? (
          <div className="empty-panel"><h1 className="font-bold text-white">TV series unavailable</h1><p className="mt-2 text-sm">{error}</p></div>
        ) : series ? (
          <>
          <section className="series-detail-hero">
            {(series.backdropUrl || series.posterUrl) && (
              <img
                src={series.backdropUrl || series.posterUrl}
                alt=""
                aria-hidden="true"
                className="series-detail-hero-image"
                onError={(event) => {
                  if (series.posterUrl && event.currentTarget.src !== series.posterUrl) event.currentTarget.src = series.posterUrl;
                  else event.currentTarget.style.display = "none";
                }}
              />
            )}
            <div className="series-detail-hero-overlay" />
            <div className="series-detail-hero-content">
              <p className="series-detail-eyebrow">TV SERIES · TMDB {series.tmdbId}</p>
              <h1 className="series-detail-title">{series.title}</h1>
              <div className="series-detail-meta">
                {series.releaseYear && <span>{series.releaseYear}</span>}
                {series.voteAverage > 0 && <span>★ {Number(series.voteAverage).toFixed(1)} rating</span>}
                {series.runtime > 0 && <span>{series.runtime} min / episode</span>}
                {series.numberOfSeasons > 0 && <span>{series.numberOfSeasons} seasons</span>}
                {series.numberOfEpisodes > 0 && <span>{series.numberOfEpisodes} episodes</span>}
                {series.certification && <span>{series.certification}</span>}
                {series.network && <span>{series.network}</span>}
                {series.country && <span>{series.country}</span>}
                {series.adult === false && <span className="catalog-policy-pill">Curated Situla catalog</span>}
              </div>
            </div>
          </section>
          <div className="series-detail-layout">
            <aside className="series-detail-sidebar">
              <div className="series-detail-poster">
                {series.posterUrl
                  ? <img src={series.posterUrl} alt={series.title} className="series-detail-poster-image" loading="eager" />
                  : <div className="series-detail-poster-placeholder"><i className="bi bi-image" aria-hidden="true" /><span>Poster unavailable</span></div>}
              </div>
            </aside>
            <section className="series-detail-main">
              <div className="series-detail-genres">{(series.genres || []).map((genre) => <span key={genre} className="genre-chip">{genre}</span>)}</div>
              {Array.isArray(series.creators) && series.creators.length > 0 && <p className="mt-3 text-xs text-[#9297a7]">Created by {series.creators.join(", ")}</p>}
              <p className="series-detail-description">{series.overview || "No description available."}</p>

              <div className="series-detail-panel mt-8 rounded-2xl border border-white/10 bg-[#11131b] p-5">
                <h2 className="font-bold text-white">Choose season and episode</h2>
                {hasEpisodeGuide ? (
                  <>
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
                    {selectedEpisode && (
                      <div className="selected-episode-info mt-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-bold text-white">S{seasonNumber} E{selectedEpisode.episodeNumber} · {selectedEpisode.name}</h3>
                          {selectedEpisode.runtime > 0 && <span className="text-xs text-[#e8b65b]">{selectedEpisode.runtime} min</span>}
                        </div>
                        {selectedEpisode.airDate && <p className="mt-1 text-[10px] text-[#9297a7]">First aired {selectedEpisode.airDate}</p>}
                        <p className="mt-2 text-xs leading-5 text-[#9297a7]">{selectedEpisode.overview || "Episode description unavailable."}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block text-xs text-[#9297a7]">Season number
                        <input className="series-control series-input mt-2" type="number" min="0" max={series.numberOfSeasons || undefined} step="1" value={seasonNumber} onChange={(event) => setSeasonNumber(event.target.value)} />
                      </label>
                      <label className="block text-xs text-[#9297a7]">Episode number
                        <input className="series-control series-input mt-2" type="number" min="1" step="1" value={episodeNumber} onChange={(event) => setEpisodeNumber(event.target.value)} />
                      </label>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[#858b9b]">This static catalogue entry has season and episode totals, but no preloaded episode-by-episode guide. Enter the season and episode number to open it directly in VidLink.</p>
                  </>
                )}
                {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
                <button className="gold-button mt-5" disabled={!seasonNumber || !episodeNumber || seasonLoading || !Number.isSafeInteger(Number(seasonNumber)) || Number(seasonNumber) < 0 || !Number.isSafeInteger(Number(episodeNumber)) || Number(episodeNumber) < 1} onClick={playEpisode}><i className="bi bi-play-fill" aria-hidden="true" /> {resumeEpisode ? "Resume episode" : "Play episode"}</button>
              </div>

              {hasEpisodeGuide && <div className="episode-guide-section mt-7">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black tracking-[.18em] text-[#e8b65b]">EPISODE BY EPISODE</p>
                    <h2 className="mt-1 text-xl font-black text-white">Episode guide</h2>
                  </div>
                  <span className="text-[10px] text-[#9297a7]">{season?.name || "Season " + seasonNumber}</span>
                </div>
                {seasonLoading ? <div className="empty-panel">Loading episode guide…</div> : (
                  <div className="episode-guide-grid">
                    {episodes.map((item) => (
                      <button
                        key={item.episodeNumber}
                        type="button"
                        className={"episode-guide-card" + (Number(episodeNumber) === item.episodeNumber ? " active" : "")}
                        onClick={() => setEpisodeNumber(String(item.episodeNumber))}
                        aria-pressed={Number(episodeNumber) === item.episodeNumber}
                      >
                        {item.stillUrl
                          ? <img src={item.stillUrl} alt="" loading="lazy" />
                          : <div className="episode-guide-placeholder"><i className="bi bi-play-circle" aria-hidden="true" /></div>}
                        <span className="episode-guide-copy">
                          <strong>E{item.episodeNumber} · {item.name || "Episode " + item.episodeNumber}</strong>
                          <small>{[item.airDate, item.runtime ? item.runtime + " min" : ""].filter(Boolean).join(" · ")}</small>
                          <span>{item.overview || "Episode details unavailable."}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>}

              <p className="mt-5 text-[10px] text-[#9297a7]">Series ID: <a href={series.tmdbUrl || ("https://www.themoviedb.org/tv/" + series.tmdbId)} target="_blank" rel="noreferrer" className="text-[#e8b65b] underline underline-offset-4">TMDB {series.tmdbId}</a>{series.externalImdbId && <> · IMDb reference: <a href={"https://www.imdb.com/title/" + series.externalImdbId + "/"} target="_blank" rel="noreferrer" className="text-[#e8b65b] underline underline-offset-4">{series.externalImdbId}</a></>}{series.sourceUrl && <> · Catalogue source: <a href={series.sourceUrl} target="_blank" rel="noreferrer" className="text-[#e8b65b] underline underline-offset-4">{series.metadataSource === "TVmaze" ? "TVmaze" : "TMDB"}</a></>}{series.referenceUrl && <> · Curated reference: <a href={series.referenceUrl} target="_blank" rel="noreferrer" className="text-[#e8b65b] underline underline-offset-4">Open source</a></>}</p>
            </section>
          </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
