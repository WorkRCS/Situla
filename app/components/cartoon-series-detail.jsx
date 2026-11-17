"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRuntimeDuration } from "../../src/media-time.js";

export default function CartoonSeriesDetail({ tmdbId }) {
  const router = useRouter();
  const [series, setSeries] = useState(null);
  const [kidsMode, setKidsMode] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState("1");
  const [episodeNumber, setEpisodeNumber] = useState("1");
  const [resumeEpisode, setResumeEpisode] = useState(false);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kids-mode", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (response.ok && !controller.signal.aborted) setKidsMode(Boolean(payload.enabled));
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  const seasons = Array.isArray(series?.seasons) ? series.seasons : [];
  const hasEpisodeGuide = seasons.some((item) => Number(item?.episodeCount) > 0);
  const selectedEpisode = episodes.find((item) => Number(item.episodeNumber) === Number(episodeNumber));

  useEffect(() => {
    const controller = new AbortController();
    async function loadSeries() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/cartoons/series/" + encodeURIComponent(tmdbId), {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.item) throw new Error(payload.error || "Cartoon series not found.");
        if (controller.signal.aborted) return;

        const item = payload.item;
        setSeries(item);
        let progress = null;
        try {
          const history = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
          progress = Array.isArray(history)
            ? history.filter((entry) => entry?.mediaType === "cartoon_tv" && Number(entry.tmdbId) === Number(tmdbId))
              .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0]
            : null;
        } catch {}
        const availableSeasons = (Array.isArray(item.seasons) ? item.seasons : [])
          .filter((entry) => Number(entry.episodeCount) > 0);
        const resumedSeason = progress && availableSeasons.find((entry) => Number(entry.seasonNumber) === Number(progress.season));
        const firstSeason = availableSeasons.find((entry) => Number(entry.seasonNumber) > 0) || availableSeasons[0];
        if (resumedSeason && progress) {
          setSeasonNumber(String(resumedSeason.seasonNumber));
          setEpisodeNumber(String(Math.max(1, Number(progress.episode) || 1)));
          setResumeEpisode(true);
        } else {
          setSeasonNumber(String(firstSeason?.seasonNumber ?? 1));
          setEpisodeNumber("1");
          setResumeEpisode(false);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.message || "Cartoon series could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadSeries();
    return () => controller.abort();
  }, [tmdbId]);

  useEffect(() => {
    if (!series || !hasEpisodeGuide || !seasonNumber) {
      setEpisodes([]);
      setSeasonLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    async function loadEpisodes() {
      setSeasonLoading(true);
      setError("");
      try {
        const response = await fetch(
          "/api/cartoons/series/" + encodeURIComponent(tmdbId) + "/seasons/" + encodeURIComponent(seasonNumber),
          { cache: "no-store", credentials: "same-origin", signal: controller.signal }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Episode guide unavailable.");
        if (controller.signal.aborted) return;
        const nextEpisodes = Array.isArray(payload.items) ? payload.items : [];
        setEpisodes(nextEpisodes);
        const resume = nextEpisodes.find((item) => Number(item.episodeNumber) === Number(episodeNumber));
        setEpisodeNumber(String(resume?.episodeNumber || nextEpisodes[0]?.episodeNumber || 1));
        setResumeEpisode(Boolean(resume));
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setEpisodes([]);
          setError(requestError.message || "Episode guide unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) setSeasonLoading(false);
      }
    }
    loadEpisodes();
    return () => controller.abort();
  }, [tmdbId, seasonNumber, series, hasEpisodeGuide]);

  function playEpisode() {
    const season = Number(seasonNumber);
    const episode = Number(episodeNumber);
    if (!hasEpisodeGuide || !Number.isSafeInteger(season) || season < 0 ||
        !Number.isSafeInteger(episode) || episode < 1 ||
        !episodes.some((item) => Number(item.episodeNumber) === episode)) return;
    router.push("/cartoons/watch/tv/" + tmdbId + "/" + season + "/" + episode);
  }

  if (loading) {
    return (
      <main className="app-shell min-h-screen series-detail-page tv-detail-page">
        <div className="series-detail-container mx-auto max-w-[1180px] px-4 py-6 md:px-8 md:py-10">
          <div className="empty-panel">Loading cartoon series…</div>
        </div>
      </main>
    );
  }
  if (error && !series) {
    return (
      <main className="app-shell min-h-screen series-detail-page tv-detail-page">
        <div className="series-detail-container mx-auto max-w-[1180px] px-4 py-6 md:px-8 md:py-10">
          <button className="watch-control mb-5" onClick={() => router.push("/cartoons/tv")} aria-label="Back to Cartoon TV Series">
            <i className="bi bi-arrow-left" aria-hidden="true" />
          </button>
          <div className="empty-panel" role="alert"><h1 className="font-bold text-white">Cartoon series unavailable</h1><p className="mt-2 text-sm">{error}</p></div>
        </div>
      </main>
    );
  }
  if (!series) return null;

  const firstAirYear = String(series.firstAirDate || series.releaseYear || "").slice(0, 4);
  return (
    <main className="app-shell min-h-screen series-detail-page tv-detail-page">
      <div className="series-detail-container mx-auto max-w-[1180px] px-4 py-6 md:px-8 md:py-10">
        <button className="watch-control mb-5" onClick={() => router.push("/cartoons/tv")} aria-label="Back to Cartoon TV Series">
          <i className="bi bi-arrow-left" aria-hidden="true" />
        </button>
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
            <p className="series-detail-eyebrow">{kidsMode ? "SITULA KIDS · CARTOON TV SERIES" : "SITULA · CARTOON TV SERIES"} · TMDB {series.tmdbId}</p>
            <h1 className="series-detail-title">{series.title}</h1>
            <div className="series-detail-meta">
              {firstAirYear && <span>{firstAirYear}</span>}
              {series.voteAverage > 0 && <span>★ {Number(series.voteAverage).toFixed(1)} rating</span>}
              {series.numberOfSeasons > 0 && <span>{series.numberOfSeasons} seasons</span>}
              {series.numberOfEpisodes > 0 && <span>{series.numberOfEpisodes} episodes</span>}
              {series.certification && <span>{series.certification}</span>}
              {series.minimumAge != null && <span>{Number(series.minimumAge)}+</span>}
              {series.status && <span>{series.status}</span>}
              <span className="catalog-policy-pill">Curated Situla catalog</span>
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
            <p className="series-detail-description">{series.overview || "No description available."}</p>

            <div className="series-detail-panel mt-8 rounded-2xl border border-white/10 bg-[#11131b] p-5">
              <h2 className="font-bold text-white">Choose season and episode</h2>
              {hasEpisodeGuide ? (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block text-xs text-[#9297a7]">Season
                      <select className="series-control mt-2" value={seasonNumber} onChange={(event) => {
                        setSeasonNumber(event.target.value);
                        setResumeEpisode(false);
                      }}>
                        {seasons.filter((item) => Number(item.episodeCount) > 0).map((item) => (
                          <option key={item.seasonNumber} value={item.seasonNumber}>{item.name || "Season " + item.seasonNumber}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-[#9297a7]">Episode
                      <select className="series-control mt-2" value={episodeNumber} onChange={(event) => {
                        setEpisodeNumber(event.target.value);
                        setResumeEpisode(false);
                      }} disabled={seasonLoading || !episodes.length}>
                        {episodes.map((item) => <option key={item.episodeNumber} value={item.episodeNumber}>E{item.episodeNumber} · {item.name || "Episode " + item.episodeNumber}</option>)}
                      </select>
                    </label>
                  </div>
                  {seasonLoading && <p className="mt-3 text-xs text-[#9297a7]">Loading episode list…</p>}
                  {selectedEpisode && (
                    <div className="selected-episode-info mt-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold text-white">S{seasonNumber} E{selectedEpisode.episodeNumber} · {selectedEpisode.name}</h3>
                        {selectedEpisode.runtime > 0 && <span className="text-xs text-[#e8b65b]">{formatRuntimeDuration(selectedEpisode.runtime)}</span>}
                      </div>
                      {selectedEpisode.airDate && <p className="mt-1 text-[10px] text-[#9297a7]">First aired {selectedEpisode.airDate}</p>}
                      <p className="mt-2 text-xs leading-5 text-[#9297a7]">{selectedEpisode.overview || "Episode description unavailable."}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="cartoon-empty-state mt-4">
                  <i className="bi bi-info-circle" aria-hidden="true" />
                  <strong>Verified episode guide unavailable</strong>
                  <p>This series has no approved episode records in the database yet. Episode playback will be enabled when verified season and episode data is available.</p>
                </div>
              )}
              {error && <p className="mt-3 text-xs text-rose-300" role="alert">{error}</p>}
              <button
                className="gold-button mt-5"
                disabled={!hasEpisodeGuide || !selectedEpisode || !seasonNumber || !episodeNumber || seasonLoading ||
                  !Number.isSafeInteger(Number(seasonNumber)) || Number(seasonNumber) < 0 ||
                  !Number.isSafeInteger(Number(episodeNumber)) || Number(episodeNumber) < 1}
                onClick={playEpisode}
              >
                <i className="bi bi-play-fill" aria-hidden="true" /> {resumeEpisode ? "Resume episode" : "Play episode"}
              </button>
            </div>

            {hasEpisodeGuide && <div className="episode-guide-section mt-7">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black tracking-[.18em] text-[#e8b65b]">EPISODE BY EPISODE</p>
                  <h2 className="mt-1 text-xl font-black text-white">Episode guide</h2>
                </div>
                <span className="text-[10px] text-[#9297a7]">{episodes.length} episodes</span>
              </div>
              {seasonLoading ? <div className="empty-panel">Loading episode guide…</div> : (
                <div className="episode-guide-grid">
                  {episodes.map((item) => (
                    <button
                      key={item.episodeNumber}
                      type="button"
                      className={"episode-guide-card" + (Number(episodeNumber) === Number(item.episodeNumber) ? " active" : "")}
                      onClick={() => {
                        setEpisodeNumber(String(item.episodeNumber));
                        setResumeEpisode(false);
                      }}
                      aria-pressed={Number(episodeNumber) === Number(item.episodeNumber)}
                    >
                      {item.stillUrl
                        ? <img src={item.stillUrl} alt="" loading="lazy" />
                        : <div className="episode-guide-placeholder"><i className="bi bi-play-circle" aria-hidden="true" /></div>}
                      <span className="episode-guide-copy">
                        <strong>E{item.episodeNumber} · {item.name || "Episode " + item.episodeNumber}</strong>
                        <small>{[item.airDate, item.runtime ? formatRuntimeDuration(item.runtime) : ""].filter(Boolean).join(" · ")}</small>
                        <span>{item.overview || "Episode details unavailable."}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>}

            <p className="mt-5 text-[10px] text-[#9297a7]">Series ID: <a href={series.tmdbUrl || ("https://www.themoviedb.org/tv/" + series.tmdbId)} target="_blank" rel="noreferrer" className="text-[#e8b65b] underline underline-offset-4">TMDB {series.tmdbId}</a>{series.sourceUrl && <> · Catalogue source: <a href={series.sourceUrl} target="_blank" rel="noreferrer" className="text-[#e8b65b] underline underline-offset-4">{series.metadataSource === "TVmaze" ? "TVmaze" : "TMDB"}</a></>}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
