"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeAnimePlayerRoute } from "../../src/anime-player-route.js";
import { normalizeTvPlayerRoute, vidboltTvUrl, vidboltAnimeUrl, normalizeVidBoltPlayerEvent, VIDBOLT_ORIGIN } from "../../src/player-urls.js";
import { attachFullscreenLandscapeLock } from "../../src/player-fullscreen.js";

export default function SeriesMediaPlayer({ kind, tmdbId, malId, season, episode, audio }) {
  const router = useRouter();
  const tvRoute = kind === "tv" ? normalizeTvPlayerRoute(tmdbId, season, episode) : null;
  const animeRoute = kind === "anime" ? normalizeAnimePlayerRoute(malId, episode, audio) : null;
  const [title, setTitle] = useState(kind === "tv" ? "TV series" : "Anime");
  const [posterUrl, setPosterUrl] = useState(null);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [catalogVerified, setCatalogVerified] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [startAt, setStartAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [episodePickerOpen, setEpisodePickerOpen] = useState(false);
  const [episodePickerSeason, setEpisodePickerSeason] = useState(tvRoute?.season ?? 1);
  const [seasonEpisodes, setSeasonEpisodes] = useState([]);
  const [seasonEpisodesLoading, setSeasonEpisodesLoading] = useState(false);
  const episodePickerRef = useRef(null);
  const iframeRef = useRef(null);
  const lastWrite = useRef(0);
  const lastPlayerDuration = useRef(0);

  useEffect(() => {
    setEpisodePickerSeason(tvRoute?.season ?? 1);
    setEpisodePickerOpen(false);
  }, [tvRoute?.season, kind]);

  useEffect(() => {
    if (!episodePickerOpen || kind !== "tv" || !tvRoute) return;
    const controller = new AbortController();
    setSeasonEpisodes([]);
    setSeasonEpisodesLoading(true);
    fetch("/api/tv/" + encodeURIComponent(tvRoute.tmdbId) + "/seasons/" + encodeURIComponent(episodePickerSeason), {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Episode list is unavailable.");
        setSeasonEpisodes(Array.isArray(payload.item?.episodes) ? payload.item.episodes : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSeasonEpisodes([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSeasonEpisodesLoading(false);
      });
    return () => controller.abort();
  }, [episodePickerOpen, kind, tvRoute?.tmdbId, episodePickerSeason]);

  useEffect(() => {
    if (!episodePickerOpen) return;
    const closeOnOutsideClick = (event) => {
      if (!episodePickerRef.current?.contains(event.target)) setEpisodePickerOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setEpisodePickerOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [episodePickerOpen]);

  useEffect(() => {
    const controller = new AbortController();
    if ((kind === "tv" && !tvRoute) || (kind === "anime" && !animeRoute)) {
      setMetadataError("This episode link is invalid. Return to the series and choose an episode.");
      setLoading(false);
      return () => controller.abort();
    }

    const endpoint = kind === "tv"
      ? "/api/tv/" + encodeURIComponent(tvRoute.tmdbId)
      : "/api/anime/" + encodeURIComponent(animeRoute.malId);

    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.item || typeof payload.item !== "object") {
          throw new Error(payload.error || "Series metadata is unavailable.");
        }

        const preferredTitle = payload.item.titleEnglish || payload.item.title;
        setTitle(typeof preferredTitle === "string" && preferredTitle.trim()
          ? preferredTitle.trim()
          : kind === "tv" ? "TV series" : "Anime");
        setPosterUrl(typeof payload.item.posterUrl === "string" ? payload.item.posterUrl : null);
        if (kind === "tv") {
          setSeriesInfo({
            seasons: Array.isArray(payload.item.seasons) ? payload.item.seasons : [],
            externalImdbId: payload.item.externalImdbId || null
          });
          try {
            const saved = JSON.parse(localStorage.getItem("situla:tv-progress:v1") || "[]");
            const legacyProgress = Array.isArray(saved) ? saved.find((item) =>
              item && String(item.imdbId || "").toLowerCase() === String(payload.item.externalImdbId || "").toLowerCase() &&
              Number(item.season) === Number(season) && Number(item.episode) === Number(episode)
            ) : null;
            if (legacyProgress && Number.isFinite(Number(legacyProgress.watched))) {
              setStartAt(Math.max(0, Math.floor(Number(legacyProgress.watched))));
            }
          } catch {}
        } else {
          setSeriesInfo({
            episodes: Number(payload.item.episodes) || null,
            episodeGuide: Array.isArray(payload.item.episodeGuide) ? payload.item.episodeGuide : []
          });
        }
        setMetadataError("");
        setCatalogVerified(true);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setMetadataError(requestError.message || "Series metadata is unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [kind, tmdbId, malId, season, episode, tvRoute?.tmdbId, animeRoute?.malId, animeRoute?.episode, animeRoute?.audio]);

  useEffect(() => {
    try {
      const key = kind === "tv" ? "situla:tv-progress:v1" : "situla:anime-progress:v1";
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      const entry = Array.isArray(saved) ? saved.find((item) => item && typeof item === "object" && (kind === "tv"
        ? Number(item.tmdbId) === Number(tmdbId) && Number(item.season) === Number(season) && Number(item.episode) === Number(episode)
        : Number(item.malId) === Number(malId) && Number(item.episode) === Number(episode) && item.audio === (audio || "sub")
      )) : null;
      setStartAt(entry && Number.isFinite(Number(entry.watched)) ? Math.max(0, Math.floor(Number(entry.watched))) : 0);
    } catch {
      setStartAt(0);
    }
  }, [kind, tmdbId, malId, season, episode, audio]);

  useEffect(() => {
    const onPlayerMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== VIDBOLT_ORIGIN) return;

      const data = normalizeVidBoltPlayerEvent(event.data);
      if (!data) return;
      const eventName = data.event;
      const watchedValue = data.currentTime;
      let durationValue = data.duration;

      if (Number.isFinite(durationValue) && durationValue > 0) {
        lastPlayerDuration.current = durationValue;
      } else if (eventName === "ended" || eventName === "timeupdate" || eventName === "play" || eventName === "pause") {
        durationValue = lastPlayerDuration.current;
      }

      if (eventName === "ready" || eventName === "durationchange" || eventName === "error") return;
      if (!["play", "pause", "ended", "timeupdate"].includes(eventName)) return;
      if (eventName === "timeupdate" && Date.now() - lastWrite.current < 5000) return;

      try {
        if (!Number.isFinite(durationValue) || durationValue <= 0) return;
        const watched = eventName === "ended" ? durationValue : watchedValue;
        if (!Number.isFinite(watched) || watched < 0) return;
        lastWrite.current = Date.now();
        const updatedAt = Date.now();
        const mediaKey = kind === "tv"
          ? "tv:" + tvRoute.tmdbId + ":s" + tvRoute.season + ":e" + tvRoute.episode
          : "anime:" + malId + ":e" + episode + ":" + (audio || "sub");
        const historyEntry = {
          key: mediaKey,
          mediaType: kind,
          mediaId: kind === "tv" ? String(tvRoute.tmdbId) : String(malId),
          tmdbId: kind === "tv" ? tvRoute.tmdbId : null,
          imdbId: null,
          title,
          posterUrl,
          season: kind === "tv" ? tvRoute.season : null,
          episode: kind === "tv" ? tvRoute.episode : Number(episode),
          audio: kind === "anime" ? (audio || "sub") : null,
          watched: Math.max(0, watched),
          duration: durationValue,
          updatedAt
        };
        const history = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
        const nextHistory = [historyEntry, ...(Array.isArray(history) ? history.filter((item) => item && item.key !== mediaKey) : [])].slice(0, 500);
        localStorage.setItem("situla:watch-history:v1", JSON.stringify(nextHistory));

        if (kind === "tv") {
          const key = "situla:tv-progress:v1";
          const current = JSON.parse(localStorage.getItem(key) || "[]");
          const legacyImdbId = String(seriesInfo?.externalImdbId || "").toLowerCase();
          const matchesEpisode = (item) =>
            (Number(item?.tmdbId) === tvRoute.tmdbId ||
              (legacyImdbId && String(item?.imdbId || "").toLowerCase() === legacyImdbId)) &&
            Number(item?.season) === tvRoute.season &&
            Number(item?.episode) === tvRoute.episode;
          if (eventName === "ended") {
            localStorage.setItem(key, JSON.stringify((Array.isArray(current) ? current : []).filter((item) => !matchesEpisode(item))));
            return;
          }
          const entry = {
            tmdbId: tvRoute.tmdbId,
            title,
            posterUrl,
            season: tvRoute.season,
            episode: tvRoute.episode,
            watched: Math.max(0, watched),
            duration: durationValue,
            updatedAt
          };
          localStorage.setItem(key, JSON.stringify([
            entry,
            ...(Array.isArray(current) ? current.filter((item) => !matchesEpisode(item)) : [])
          ].slice(0, 100)));
        } else {
          const key = "situla:anime-progress:v1";
          const current = JSON.parse(localStorage.getItem(key) || "[]");
          const matchesEpisode = (item) => Number(item?.malId) === Number(malId) &&
            Number(item?.episode) === Number(episode) && item?.audio === (audio || "sub");
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
    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [kind, tmdbId, malId, season, episode, audio, title, posterUrl, tvRoute?.tmdbId, tvRoute?.season, tvRoute?.episode, seriesInfo?.externalImdbId]);

  const tvSeasons = (Array.isArray(seriesInfo?.seasons) ? seriesInfo.seasons : [])
    .filter((item) => item && Number(item.episodeCount) > 0 && Number(item.seasonNumber) > 0)
    .sort((a, b) => Number(a.seasonNumber) - Number(b.seasonNumber));
  const currentSeason = tvRoute
    ? tvSeasons.find((item) => Number(item.seasonNumber) === tvRoute.season)
    : null;
  const nextSeason = tvRoute
    ? tvSeasons.find((item) => Number(item.seasonNumber) > tvRoute.season)
    : null;
  function playNextSeason() {
    if (!nextSeason || !tvRoute || kind !== "tv" || !catalogVerified) return;
    router.push("/watch/tv/" + encodeURIComponent(tvRoute.tmdbId) + "/" + Number(nextSeason.seasonNumber) + "/1");
  }

  const animeEpisodeGuide = (Array.isArray(seriesInfo?.episodeGuide) ? seriesInfo.episodeGuide : [])
    .filter((item) => Number(item?.episodeNumber) > 0)
    .sort((a, b) => Number(a.seasonNumber) - Number(b.seasonNumber) ||
      Number(a.episodeNumber) - Number(b.episodeNumber));
  const tvPickerSeason = tvSeasons.find((item) => Number(item.seasonNumber) === Number(episodePickerSeason));
  const tvFallbackEpisodeCount = Math.min(300, Math.max(0, Number(tvPickerSeason?.episodeCount) || 0));
  const tvEpisodeOptions = seasonEpisodes.length
    ? seasonEpisodes
    : Array.from({ length: tvFallbackEpisodeCount }, (_, index) => ({
      episodeNumber: index + 1,
      name: "Episode " + (index + 1),
      stillUrl: null,
      airDate: null
    }));
  const animeEpisodeOptions = animeEpisodeGuide.length
    ? animeEpisodeGuide
    : Array.from({ length: Math.min(300, Math.max(0, Number(seriesInfo?.episodes) || 0)) }, (_, index) => ({
      episodeNumber: index + 1,
      seasonNumber: 1,
      title: "Episode " + (index + 1),
      imageUrl: null
    }));

  function selectPickerEpisode(episodeNumber, seasonNumber = episodePickerSeason) {
    const selectedEpisode = Number(episodeNumber);
    if (!Number.isSafeInteger(selectedEpisode) || selectedEpisode < 1) return;
    setEpisodePickerOpen(false);
    if (kind === "tv" && tvRoute) {
      const selectedSeason = Number(seasonNumber);
      if (!Number.isSafeInteger(selectedSeason) || selectedSeason < 0) return;
      if (selectedSeason === tvRoute.season && selectedEpisode === tvRoute.episode) return;
      router.push("/watch/tv/" + encodeURIComponent(tvRoute.tmdbId) + "/" + selectedSeason + "/" + selectedEpisode);
      return;
    }
    if (kind === "anime" && animeRoute) {
      if (selectedEpisode === animeRoute.episode) return;
      try {
        localStorage.setItem("situla:anime-last-episode:v1", JSON.stringify({
          malId: animeRoute.malId,
          episode: selectedEpisode,
          audio: animeRoute.audio
        }));
      } catch {}
      router.push("/watch/anime/" + animeRoute.malId + "/" + selectedEpisode + "/" + animeRoute.audio);
    }
  }

  function tryAlternateAnimeAudio() {
    if (!animeRoute || kind !== "anime") return;
    const alternate = animeRoute.audio === "sub" ? "dub" : "sub";
    router.push("/watch/anime/" + animeRoute.malId + "/" + animeRoute.episode + "/" + alternate);
  }

  const playerUrl = (() => {
    if (kind === "tv") {
      if (!catalogVerified || !tvRoute) return null;
      return vidboltTvUrl(tvRoute.tmdbId, tvRoute.season, tvRoute.episode, startAt);
    }
    if (!animeRoute) return null;
    return vidboltAnimeUrl(animeRoute.malId, animeRoute.episode, animeRoute.audio, startAt);
  })();

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    return attachFullscreenLandscapeLock(frame);
  }, [playerUrl]);

  useEffect(() => {
    lastWrite.current = 0;
    lastPlayerDuration.current = 0;
  }, [kind, tmdbId, malId, season, episode, audio]);

  function goBackFromPlayer() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    if (kind === "tv" && tvRoute) {
      router.replace("/tv/" + encodeURIComponent(tvRoute.tmdbId));
      return;
    }
    if (kind === "anime" && animeRoute) {
      router.replace("/anime/" + encodeURIComponent(animeRoute.malId));
      return;
    }
    router.replace("/");
  }

  return (
    <main className="watch-screen series-watch-screen">
      {playerUrl ? (
        <iframe
          id="vidbolt-player"
          ref={iframeRef}
          key={playerUrl}
          className="watch-frame series-watch-frame"
          src={playerUrl}
          title={title + (kind === "tv" ? " · S" + tvRoute.season + " E" + tvRoute.episode : " · Episode " + episode)}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="player-message">
          <div className="player-message-card">
            <div className="player-message-mark">S</div>
            <h1>{loading ? "Preparing playback" : "Playback unavailable"}</h1>
            <p>{metadataError || (kind === "tv"
              ? "This series is not available in the Situla catalog yet."
              : loading ? "Loading saved media details…" : "This episode could not be loaded.")}</p>
            <button type="button" className="gold-button" onClick={() => router.back()}>Back to Situla</button>
          </div>
        </div>
      )}
      <header className="watch-topbar series-watch-topbar">
        <button type="button" onClick={goBackFromPlayer} className="watch-control" aria-label="Back to series"><i className="bi bi-arrow-left" aria-hidden="true" /></button>
        <div className="watch-title">
          <p className="text-[9px] font-extrabold tracking-[.2em] text-[#f0c471]">SITULA · {kind === "tv" ? "TV PLAYER" : "ANIME PLAYER"}</p>
          <h1 className="truncate text-sm font-bold">{title}{kind === "tv" ? " · S" + season + " E" + episode : " · EP " + episode + " · " + (audio || "sub").toUpperCase()}</h1>
        </div>
        {kind === "anime" && <div className="series-player-actions">
          <button type="button" className="series-player-guide" onClick={tryAlternateAnimeAudio} disabled={!animeRoute}>
            Try {audio === "sub" ? "Dub" : "Sub"} instead
          </button>
          <div className={"episode-picker" + (episodePickerOpen ? " is-open" : "")} ref={episodePickerRef}>
            <button
              type="button"
              className="series-player-next"
              onClick={() => setEpisodePickerOpen((open) => !open)}
              aria-expanded={episodePickerOpen}
              aria-haspopup="true"
              aria-label="Open episode picker"
            >
              <i className="bi bi-skip-forward-fill" aria-hidden="true" /> Next Episode
              <i className="bi bi-chevron-down" aria-hidden="true" />
            </button>
            <div className="episode-picker-menu">
              <div className="episode-picker-heading">
                <span><strong>Choose an episode</strong><small>{title}</small></span>
                <button type="button" className="episode-picker-close" onClick={() => setEpisodePickerOpen(false)} aria-label="Close episode picker"><i className="bi bi-x-lg" aria-hidden="true" /></button>
              </div>
              <p className="episode-picker-caption">{animeEpisodeOptions.length} available episodes · {String(animeRoute?.audio || "sub").toUpperCase()}</p>
              <div className="episode-picker-list">
                {animeEpisodeOptions.map((item, index) => {
                  const number = Number(item.episodeNumber);
                  const isCurrent = number === Number(animeRoute?.episode);
                  return (
                    <button
                      key={String(item.seasonNumber || 1) + ":" + number + ":" + index}
                      type="button"
                      className={"episode-picker-option" + (isCurrent ? " is-current" : "")}
                      onClick={() => selectPickerEpisode(number)}
                      aria-current={isCurrent ? "true" : undefined}
                    >
                      {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="episode-picker-number">{String(number).padStart(2, "0")}</span>}
                      <span className="episode-picker-option-copy">
                        <strong>{item.title || "Episode " + number}</strong>
                        <small>Episode {number}{item.seasonNumber ? " · Season " + item.seasonNumber : ""}</small>
                      </span>
                      {isCurrent && <i className="bi bi-play-fill episode-picker-current" aria-label="Currently playing" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>}
        {kind === "tv" && <div className="series-player-actions">
          <button
            type="button"
            className="series-player-guide"
            onClick={() => tvRoute && router.push("/tv/" + encodeURIComponent(tvRoute.tmdbId))}
            disabled={!tvRoute}
          >Episode guide</button>
          <div className={"episode-picker" + (episodePickerOpen ? " is-open" : "")} ref={episodePickerRef}>
            <button
              type="button"
              className="series-player-next"
              onClick={() => setEpisodePickerOpen((open) => !open)}
              aria-expanded={episodePickerOpen}
              aria-haspopup="true"
              aria-label="Open episode picker"
              disabled={!catalogVerified || !tvSeasons.length}
            >
              <i className="bi bi-skip-forward-fill" aria-hidden="true" /> Next Episode
              <i className="bi bi-chevron-down" aria-hidden="true" />
            </button>
            <div className="episode-picker-menu">
              <div className="episode-picker-heading">
                <span><strong>Choose an episode</strong><small>{title}</small></span>
                <button type="button" className="episode-picker-close" onClick={() => setEpisodePickerOpen(false)} aria-label="Close episode picker"><i className="bi bi-x-lg" aria-hidden="true" /></button>
              </div>
              <label className="episode-picker-season">
                <span>Season</span>
                <select value={episodePickerSeason} onChange={(event) => setEpisodePickerSeason(Number(event.target.value))}>
                  {tvSeasons.map((item) => <option key={item.seasonNumber} value={item.seasonNumber}>{item.name || "Season " + item.seasonNumber}</option>)}
                </select>
              </label>
              <p className="episode-picker-caption">{tvEpisodeOptions.length} episodes in this season</p>
              {seasonEpisodesLoading ? (
                <div className="episode-picker-empty">Loading episode list…</div>
              ) : (
                <div className="episode-picker-list">
                  {tvEpisodeOptions.map((item) => {
                    const number = Number(item.episodeNumber);
                    const isCurrent = Number(episodePickerSeason) === Number(tvRoute?.season) && number === Number(tvRoute?.episode);
                    return (
                      <button
                        key={String(episodePickerSeason) + ":" + number}
                        type="button"
                        className={"episode-picker-option" + (isCurrent ? " is-current" : "")}
                        onClick={() => selectPickerEpisode(number, episodePickerSeason)}
                        aria-current={isCurrent ? "true" : undefined}
                      >
                        {item.stillUrl ? <img src={item.stillUrl} alt="" loading="lazy" /> : <span className="episode-picker-number">{String(number).padStart(2, "0")}</span>}
                        <span className="episode-picker-option-copy">
                          <strong>{item.name || "Episode " + number}</strong>
                          <small>Episode {number}{item.airDate ? " · " + item.airDate : ""}</small>
                        </span>
                        {isCurrent && <i className="bi bi-play-fill episode-picker-current" aria-label="Currently playing" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {!seasonEpisodesLoading && !tvEpisodeOptions.length && <div className="episode-picker-empty">No episode details are available for this season.</div>}
            </div>
          </div>
          <button type="button" className="series-player-guide" onClick={playNextSeason} disabled={!nextSeason || !catalogVerified}>
            Next season <i className="bi bi-chevron-double-right" aria-hidden="true" />
          </button>
        </div>}
      </header>
    </main>
  );
}
