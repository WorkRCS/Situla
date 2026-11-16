"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Baby, CalendarDays, PlayCircle, Star } from "lucide-react";

export default function CartoonSeriesDetail({ tmdbId }) {
  const [series, setSeries] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [seasonNumber, setSeasonNumber] = useState(null);
  const [loading, setLoading] = useState(true);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadSeries() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/cartoons/series/" + encodeURIComponent(tmdbId), {
          cache: "no-store", credentials: "same-origin", signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.item) throw new Error(payload.error || "Cartoon series not found.");
        if (controller.signal.aborted) return;
        setSeries(payload.item);
        const seasons = Array.isArray(payload.item.seasons) ? payload.item.seasons : [];
        const firstSeason = seasons.find((season) => Number(season.seasonNumber) > 0) || seasons[0];
        setSeasonNumber(firstSeason ? Number(firstSeason.seasonNumber) : null);
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
    if (seasonNumber == null || !series) {
      setEpisodes([]);
      return undefined;
    }
    const controller = new AbortController();
    async function loadEpisodes() {
      setEpisodeLoading(true);
      try {
        const response = await fetch(
          "/api/cartoons/series/" + encodeURIComponent(tmdbId) + "/seasons/" + encodeURIComponent(seasonNumber),
          { cache: "no-store", credentials: "same-origin", signal: controller.signal }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Episode guide unavailable.");
        if (!controller.signal.aborted) setEpisodes(Array.isArray(payload.items) ? payload.items : []);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setEpisodes([]);
          setError(requestError.message || "Episode guide unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) setEpisodeLoading(false);
      }
    }
    loadEpisodes();
    return () => controller.abort();
  }, [tmdbId, seasonNumber, series]);

  if (loading) return <main className="cartoon-detail-state"><span className="inline-loading-spinner" /><p>Loading series details…</p></main>;
  if (error && !series) return <main className="cartoon-detail-state"><Baby size={30} /><h1>Series unavailable</h1><p>{error}</p><Link href="/cartoons/tv">Back to Cartoons</Link></main>;
  if (!series) return null;

  const seasons = Array.isArray(series.seasons) ? series.seasons : [];
  const firstAirYear = String(series.firstAirDate || "").slice(0, 4);
  return (
    <main className="cartoon-series-detail">
      <Link href="/cartoons/tv" className="cartoon-back-link"><ArrowLeft size={15} /> All cartoon series</Link>
      <section className="cartoon-series-hero">
        {series.backdropUrl || series.posterUrl ? (
          <img src={series.backdropUrl || series.posterUrl} alt="" />
        ) : <div className="cartoon-series-placeholder"><Baby size={34} /></div>}
        <div className="cartoon-series-hero-copy">
          <span className="cartoon-page-kicker"><Baby size={14} /> APPROVED CARTOON SERIES</span>
          <h1>{series.title}</h1>
          <div className="cartoon-series-meta">
            {firstAirYear && <span><CalendarDays size={13} /> {firstAirYear}</span>}
            {series.voteAverage > 0 && <span><Star size={13} fill="currentColor" /> {Number(series.voteAverage).toFixed(1)}</span>}
            {series.minimumAge != null && <span>{series.minimumAge}+</span>}
            {series.numberOfSeasons > 0 && <span>{series.numberOfSeasons} seasons</span>}
            {series.numberOfEpisodes > 0 && <span>{series.numberOfEpisodes} episodes</span>}
          </div>
          <p>{series.overview || "Explore this approved animated series."}</p>
          {series.genres?.length > 0 && <div className="cartoon-detail-tags">{series.genres.map((genre) => <span key={genre}>{genre}</span>)}</div>}
        </div>
      </section>
      <section className="cartoon-episode-section">
        <div className="section-heading cartoon-catalog-title">
          <div><span>SEASON & EPISODE GUIDE</span><h2>Choose an episode</h2></div>
          {seasons.length > 0 && (
            <label className="cartoon-season-select">
              <span>Season</span>
              <select value={seasonNumber ?? ""} onChange={(event) => setSeasonNumber(Number(event.target.value))}>
                {seasons.map((season) => <option key={season.seasonNumber} value={season.seasonNumber}>{season.name || "Season " + season.seasonNumber}</option>)}
              </select>
            </label>
          )}
        </div>
        {episodeLoading ? <p className="cartoon-guide-message">Loading episodes…</p> : episodes.length ? (
          <div className="cartoon-episode-grid">
            {episodes.map((episode) => (
              <Link
                key={episode.episodeNumber}
                href={"/cartoons/watch/tv/" + tmdbId + "/" + episode.seasonNumber + "/" + episode.episodeNumber}
                className="cartoon-episode-card"
              >
                <span className="cartoon-episode-still">
                  {episode.stillUrl ? <img src={episode.stillUrl} alt="" loading="lazy" /> : <PlayCircle size={22} />}
                  <b>{episode.episodeNumber}</b>
                </span>
                <span className="cartoon-episode-copy">
                  <strong>{episode.name}</strong>
                  <small>{episode.airDate || "Release date unavailable"}{episode.runtime ? " · " + episode.runtime + " min" : ""}</small>
                  {episode.overview && <em>{episode.overview}</em>}
                </span>
                <PlayCircle className="cartoon-episode-play" size={20} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="cartoon-empty-state">
            <PlayCircle size={28} />
            <h3>Episode guide not available yet</h3>
            <p>This season's verified episode metadata has not been included in the offline seed file, so unverified episode links are not shown.</p>
          </div>
        )}
      </section>
    </main>
  );
}
