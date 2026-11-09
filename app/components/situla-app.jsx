"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Home, Search, Bookmark, Settings, Play, Check, Star, ArrowRight,
  Clapperboard, Download, ExternalLink, Sparkles, X, CircleHelp,
  Sun, Moon, Monitor, Trash2
} from "lucide-react";

const ICONS = {
  home: Home, search: Search, saved: Bookmark, settings: Settings, play: Play,
  bookmark: Bookmark, check: Check, star: Star, arrow: ArrowRight,
  film: Clapperboard, download: Download, external: ExternalLink,
  spark: Sparkles, close: X
};

function Icon({ name, size = 19, className }) {
  const LucideIcon = ICONS[name] || CircleHelp;
  return <LucideIcon size={size} strokeWidth={1.9} fill={name === "star" ? "currentColor" : "none"} aria-hidden="true" className={className} />;
}

function formatClock(totalSeconds) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function formatRuntime(minutes) {
  const seconds = Math.max(0, Math.round(Number(minutes) || 0) * 60);
  return seconds ? formatClock(seconds) : "";
}

function MovieCard({ movie, onOpen, onSave, saved }) {
  return (
    <article className="movie-card">
      <button type="button" onClick={() => onOpen(movie)} className="block w-full text-left">
        <div className="movie-poster">
          {movie.posterUrl
            ? <img src={movie.posterUrl} alt={movie.title} loading="lazy" />
            : <div className="poster-fallback"><Icon name="film" size={30} /></div>}
          {movie.voteAverage > 0 && (
            <span className="rating-pill"><Icon name="star" size={11} /> {Number(movie.voteAverage).toFixed(1)}</span>
          )}
        </div>
        <h3 className="mt-2 truncate text-[13px] font-bold text-white">{movie.title}</h3>
        <p className="mt-1 text-[11px] text-[#858b9b]">{movie.releaseYear || "Movie"}{movie.runtime ? " · " + formatRuntime(movie.runtime) : ""}</p>
      </button>
      <button
        type="button"
        onClick={() => onSave(movie)}
        className={"save-button" + (saved ? " saved" : "")}
        aria-label={saved ? "Remove from saved list" : "Save movie"}
      >
        <Icon name={saved ? "check" : "bookmark"} size={15} />
      </button>
    </article>
  );
}


function SeriesCard({ item, kind, onOpen }) {
  const isTv = kind === "tv";
  const title = isTv ? item.title : (item.titleEnglish || item.title);
  const year = item.releaseYear || (item.firstAirDate ? item.firstAirDate.slice(0, 4) : "");
  const rating = isTv ? item.voteAverage : item.score;
  const meta = isTv
    ? (item.numberOfSeasons ? item.numberOfSeasons + " seasons" : "TV series")
    : (item.episodes ? item.episodes + " episodes" : "Anime series");
  return (
    <article className="movie-card">
      <button type="button" onClick={() => onOpen(item)} className="block w-full text-left">
        <div className="movie-poster">
          {item.posterUrl
            ? <img src={item.posterUrl} alt={title} loading="lazy" />
            : <div className="poster-fallback"><Icon name="film" size={30} /></div>}
          {rating > 0 && (
            <span className="rating-pill"><Icon name="star" size={11} /> {Number(rating).toFixed(1)}</span>
          )}
        </div>
        <h3 className="mt-2 truncate text-[13px] font-bold text-white">{title}</h3>
        <p className="mt-1 text-[11px] text-[#858b9b]">{year ? year + " · " : ""}{meta}</p>
      </button>
    </article>
  );
}

function MovieShelf({ title, eyebrow, movies, onOpen, onSave, savedIds }) {
  if (!movies.length) return null;
  return (
    <section className="mt-9">
      <div className="section-heading">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 className={eyebrow ? "mt-1" : ""}>{title}</h2>
        </div>
        <span>{movies.length} TITLES</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3">
        {movies.map((movie) => (
          <MovieCard key={movie.imdbId || movie.id || (String(movie.title || 'movie') + '-' + String(movie.releaseYear || 'unknown') + '-' + movies.indexOf(movie))} movie={movie} onOpen={onOpen} onSave={onSave} saved={savedIds.has(movie.imdbId)} />
        ))}
      </div>
    </section>
  );
}

const NAV_ITEMS = [
  { id: "home", label: "Movies", icon: "home" },
  { id: "tv", label: "TV", icon: "film" },
  { id: "anime", label: "Anime", icon: "play" },
  { id: "search", label: "Search", icon: "search" },
  { id: "saved", label: "My List", icon: "saved" },
  { id: "settings", label: "Settings", icon: "settings" }
];

export default function SitulaApp() {
  const router = useRouter();
  const [tab, setTab] = useState("home");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [movies, setMovies] = useState([]);
  const [tvShows, setTvShows] = useState([]);
  const [animeShows, setAnimeShows] = useState([]);
  const [savedMovies, setSavedMovies] = useState([]);
  const [recentMovies, setRecentMovies] = useState([]);
  const [progressMovies, setProgressMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [watchHistory, setWatchHistory] = useState([]);
  const [themeMode, setThemeMode] = useState("system");
  const [themeReady, setThemeReady] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [moviesPage, setMoviesPage] = useState(1);
  const [moviesTotal, setMoviesTotal] = useState(0);
  const [tvPage, setTvPage] = useState(1);
  const [tvTotal, setTvTotal] = useState(0);
  const [animePage, setAnimePage] = useState(1);
  const [animeTotal, setAnimeTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    try {
      const hasValidImdbId = (item) => /^tt\d{5,12}$/i.test(String(item?.imdbId || ""));
      const saved = JSON.parse(localStorage.getItem("situla:saved:v1") || "[]");
      const recent = JSON.parse(localStorage.getItem("situla:recent:v1") || "[]");
      const progress = JSON.parse(localStorage.getItem("situla:progress:v1") || "[]");
      const history = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
      setSavedMovies(Array.isArray(saved) ? saved.filter(hasValidImdbId) : []);
      setRecentMovies(Array.isArray(recent) ? recent.filter(hasValidImdbId) : []);
      setProgressMovies(Array.isArray(progress) ? progress.filter((item) =>
        hasValidImdbId(item) && Number(item.duration) > 0 && Number(item.watched) / Number(item.duration) < 0.95
      ) : []);
      setWatchHistory(Array.isArray(history) ? history.filter((item) => item && typeof item.key === "string").slice(0, 500) : []);
    } catch {
      setSavedMovies([]);
      setRecentMovies([]);
      setProgressMovies([]);
      setWatchHistory([]);
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try { localStorage.setItem("situla:saved:v1", JSON.stringify(savedMovies.slice(0, 100))); } catch {}
  }, [savedMovies, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    try { localStorage.setItem("situla:recent:v1", JSON.stringify(recentMovies.slice(0, 12))); } catch {}
  }, [recentMovies, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    try { localStorage.setItem("situla:watch-history:v1", JSON.stringify(watchHistory.slice(0, 500))); } catch {}
  }, [watchHistory, storageReady]);

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("situla:theme:v1");
      if (savedMode === "dark" || savedMode === "light" || savedMode === "system") setThemeMode(savedMode);
    } catch {}
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode;
      root.dataset.theme = resolved;
      root.dataset.themeMode = themeMode;
      root.style.colorScheme = resolved;
    };
    apply();
    try { localStorage.setItem("situla:theme:v1", themeMode); } catch {}
    if (themeMode !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themeMode, themeReady]);

  useEffect(() => {
    if (tab !== "settings" || !storageReady) return;
    try {
      const history = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
      setWatchHistory(Array.isArray(history) ? history.filter((item) => item && typeof item.key === "string").slice(0, 500) : []);
    } catch { setWatchHistory([]); }
  }, [tab, storageReady]);

  useEffect(() => {
    if (tab !== "home" && tab !== "search") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: "1", limit: "40" });
        if (tab === "search" && query.trim()) params.set("q", query.trim());
        const response = await fetch("/api/movies?" + params.toString(), {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Movie catalog is not available.");
        setMovies(Array.isArray(payload.items) ? payload.items : []);
        setMoviesPage(Number(payload.pagination?.page) || 1);
        setMoviesTotal(Number(payload.pagination?.total) || 0);
        setError("");
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError.message || "Could not load movies. Please try again.");
          setMovies([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, tab === "search" && query.trim() ? 300 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tab]);


  useEffect(() => {
    if (tab !== "tv" && tab !== "anime") return;
    const controller = new AbortController();
    const endpoint = tab === "tv" ? "/api/tv?page=1&limit=40" : "/api/anime?page=1&limit=40";
    async function loadSeries() {
      setLoading(true);
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Series catalog is not available.");
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (tab === "tv") {
          setTvShows(items);
          setTvPage(Number(payload.pagination?.page) || 1);
          setTvTotal(Number(payload.pagination?.total) || items.length);
        } else {
          setAnimeShows(items);
          setAnimePage(Number(payload.pagination?.page) || 1);
          setAnimeTotal(Number(payload.pagination?.total) || items.length);
        }
        setError("");
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError.message || "Could not load the series catalog.");
          if (tab === "tv") setTvShows([]);
          else setAnimeShows([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadSeries();
    return () => controller.abort();
  }, [tab]);

  const allGenres = useMemo(() => {
    const values = new Set();
    movies.forEach((movie) => (movie.genres || []).forEach((value) => values.add(value)));
    return ["All", ...Array.from(values).slice(0, 9)];
  }, [movies]);

  const savedIds = useMemo(() => new Set(savedMovies.map((movie) => movie.imdbId)), [savedMovies]);
  const filteredMovies = useMemo(() => {
    if (genre === "All") return movies;
    return movies.filter((movie) => (movie.genres || []).includes(genre));
  }, [movies, genre]);

  function openMovie(movie) {
    const imdbId = String(movie?.imdbId || "").toLowerCase();
    if (!/^tt\d{5,12}$/.test(imdbId)) {
      setError("This saved movie has no valid IMDb ID. Refresh the catalog and open it again.");
      return;
    }
    const normalized = { ...movie, imdbId };
    setRecentMovies((current) => [normalized, ...current.filter((item) => item.imdbId !== imdbId)].slice(0, 12));
    router.push("/watch/" + encodeURIComponent(imdbId));
  }

  function openTvSeries(series) {
    router.push("/tv/" + encodeURIComponent(series.tmdbId));
  }

  function openAnimeSeries(series) {
    router.push("/anime/" + encodeURIComponent(series.malId));
  }

  function toggleSaved(movie) {
    setSavedMovies((current) => current.some((item) => item.imdbId === movie.imdbId)
      ? current.filter((item) => item.imdbId !== movie.imdbId)
      : [movie, ...current].slice(0, 100));
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      if (tab === "home" || tab === "search") {
        const nextPage = moviesPage + 1;
        const params = new URLSearchParams({ page: String(nextPage), limit: "40" });
        if (tab === "search" && query.trim()) params.set("q", query.trim());
        const response = await fetch("/api/movies?" + params.toString(), { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to load more movies.");
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setMovies((current) => {
          const ids = new Set(current.map((item) => item.imdbId));
          return [...current, ...nextItems.filter((item) => !ids.has(item.imdbId))];
        });
        setMoviesPage(Number(payload.pagination?.page) || nextPage);
        setMoviesTotal(Number(payload.pagination?.total) || moviesTotal);
      } else if (tab === "tv") {
        const nextPage = tvPage + 1;
        const response = await fetch("/api/tv?page=" + nextPage + "&limit=40", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to load more TV series.");
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setTvShows((current) => {
          const ids = new Set(current.map((item) => item.tmdbId));
          return [...current, ...nextItems.filter((item) => !ids.has(item.tmdbId))];
        });
        setTvPage(Number(payload.pagination?.page) || nextPage);
        setTvTotal(Number(payload.pagination?.total) || tvTotal);
      } else if (tab === "anime") {
        const nextPage = animePage + 1;
        const response = await fetch("/api/anime?page=" + nextPage + "&limit=40", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to load more anime.");
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setAnimeShows((current) => {
          const ids = new Set(current.map((item) => item.malId));
          return [...current, ...nextItems.filter((item) => !ids.has(item.malId))];
        });
        setAnimePage(Number(payload.pagination?.page) || nextPage);
        setAnimeTotal(Number(payload.pagination?.total) || animeTotal);
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to load the next catalog page.");
    } finally {
      setLoadingMore(false);
    }
  }

  function removeHistoryItem(key) {
    const next = watchHistory.filter((item) => item.key !== key);
    setWatchHistory(next);
    try { localStorage.setItem("situla:watch-history:v1", JSON.stringify(next)); } catch {}
  }

  function clearWatchHistory() {
    const keys = [
      "situla:watch-history:v1", "situla:progress:v1", "situla:recent:v1",
      "situla:tv-progress:v1", "situla:anime-progress:v1", "situla:anime-last-episode:v1"
    ];
    try { keys.forEach((key) => localStorage.removeItem(key)); } catch {}
    setWatchHistory([]);
    setProgressMovies([]);
    setRecentMovies([]);
  }

  const sortedHistory = [...watchHistory].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const hasMoreMovies = moviesPage * 40 < moviesTotal;
  const hasMoreTv = tvPage * 40 < tvTotal;
  const hasMoreAnime = animePage * 40 < animeTotal;
  const featured = movies[0];

  return (
    <main className="app-shell">
      <header className="app-header safe-top">
        <div className="header-inner mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3 md:px-8">
          <div className="brand-mark" aria-hidden="true">S</div>
          <div className="brand-copy min-w-0">
            <p className="text-[17px] font-black tracking-[.18em]">SITULA</p>
            <p className="text-[9px] font-bold tracking-[.19em]">MOVIES · DISCOVER MORE</p>
          </div>
          <label className="header-search search-box" aria-label="Search catalog">
            <Search size={18} strokeWidth={1.9} aria-hidden="true" />
            <input value={query} onFocus={() => setTab("search")} onChange={(event) => { setTab("search"); setQuery(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") setTab("search"); }} placeholder="Search movies, TV, anime…" aria-label="Search movies, TV and anime" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={16} /></button>}
          </label>
          <div className="theme-switcher">
            <button type="button" className="theme-trigger watch-control" onClick={() => setThemeMenuOpen((open) => !open)} aria-label="Choose appearance" aria-expanded={themeMenuOpen} title="Appearance">
              {themeMode === "dark" ? <Moon size={19} /> : themeMode === "light" ? <Sun size={19} /> : <Monitor size={19} />}
            </button>
            {themeMenuOpen && <div className="theme-menu" role="group" aria-label="Choose theme">
              <button type="button" className={themeMode === "system" ? "selected" : ""} onClick={() => { setThemeMode("system"); setThemeMenuOpen(false); }}><Monitor size={16} /> System</button>
              <button type="button" className={themeMode === "light" ? "selected" : ""} onClick={() => { setThemeMode("light"); setThemeMenuOpen(false); }}><Sun size={16} /> Light</button>
              <button type="button" className={themeMode === "dark" ? "selected" : ""} onClick={() => { setThemeMode("dark"); setThemeMenuOpen(false); }}><Moon size={16} /> Dark</button>
            </div>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] px-4 pt-5 md:px-8 md:pt-8">
        {(tab === "home" || tab === "search") && <div className="mb-5">
          <label className="search-box">
            <Icon name="search" size={19} />
            <input
              value={query}
              onFocus={() => setTab("search")}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") setTab("search"); }}
              placeholder="Search movies, actors, genres…"
              aria-label="Search movies"
            />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" size={16} /></button>}
          </label>
        </div>}

        {tab === "home" && (
          <>
            {featured ? (
              <section className="hero-card">
                {featured.backdropUrl && <img className="hero-image" src={featured.backdropUrl} alt="" fetchPriority="high" />}
                <div className="relative z-10 flex min-h-[430px] max-w-[660px] flex-col justify-end p-6 pb-7 md:min-h-[510px] md:p-10">
                  <div className="mb-3 flex items-center gap-2 text-[10px] font-black tracking-[.22em] text-[#f0c471]">
                    <Icon name="spark" size={14} /> FEATURED ON SITULA
                  </div>
                  <h1 className="max-w-[560px] text-4xl font-black leading-[1.03] tracking-[-.05em] text-white md:text-6xl">{featured.title}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-white/75">
                    {featured.releaseYear && <span>{featured.releaseYear}</span>}
                    {featured.voteAverage > 0 && <span className="flex items-center gap-1 text-[#f1c978]"><Icon name="star" size={13} /> {Number(featured.voteAverage).toFixed(1)}</span>}
                    {featured.runtime > 0 && <span>{featured.runtime} min</span>}
                    {featured.genres?.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
                  </div>
                  <p className="mt-4 line-clamp-3 max-w-[520px] text-sm leading-6 text-white/70">{featured.overview || "Discover this movie on Situla."}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button className="gold-button" onClick={() => openMovie(featured)}><Icon name="play" size={17} /> Play now</button>
                    <button className="ghost-button" onClick={() => toggleSaved(featured)}>
                      <Icon name={savedIds.has(featured.imdbId) ? "check" : "bookmark"} size={16} />
                      {savedIds.has(featured.imdbId) ? "In my list" : "My list"}
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <div className="empty-panel">
                <Icon name="film" size={32} />
                <p className="mt-3 font-bold text-white">{loading ? "Loading your movie catalog…" : "Your catalog is getting ready"}</p>
                <p className="mt-2 text-xs">{error || "Approved titles from the Situla API will appear here."}</p>
              </div>
            )}

            {allGenres.length > 1 && (
              <div className="mt-7 flex gap-2 overflow-x-auto pb-1">
                {allGenres.map((item) => (
                  <button key={item} onClick={() => setGenre(item)} className={"genre-chip" + (genre === item ? " active" : "")}>{item}</button>
                ))}
              </div>
            )}

            {progressMovies.length > 0 && (
              <MovieShelf title="Continue watching" eyebrow="RESUME YOUR MOVIE" movies={progressMovies} onOpen={openMovie} onSave={toggleSaved} savedIds={savedIds} />
            )}
            {recentMovies.length > 0 && (
              <MovieShelf title="Recently opened" eyebrow="YOUR ACTIVITY" movies={recentMovies} onOpen={openMovie} onSave={toggleSaved} savedIds={savedIds} />
            )}
            <MovieShelf title={genre === "All" ? "Picked for you" : genre + " movies"} eyebrow="RANDOMIZED DISCOVERY" movies={filteredMovies} onOpen={openMovie} onSave={toggleSaved} savedIds={savedIds} />
            {loading && movies.length > 0 && <p className="mt-5 text-center text-xs text-[#858b9b]">Refreshing catalog…</p>}
            {error && movies.length === 0 && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
            {hasMoreMovies && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more movies"} <ArrowRight size={16} /></button></div>}
            {moviesTotal > 0 && <p className="mt-3 text-center text-xs text-[#858b9b]">Showing {movies.length} of {moviesTotal} movies</p>}
          </>
        )}


        {tab === "tv" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>WATCH BY SEASON & EPISODE</span><h1 className="mt-1 text-2xl font-black">TV series</h1></div>
              <span>{tvShows.length} / {tvTotal || tvShows.length} SHOWS</span>
            </div>
            {loading ? (
              <div className="empty-panel"><div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-[#e8b65b]" /><p className="mt-3 text-sm">Loading TV series…</p></div>
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">TV catalog unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : tvShows.length ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
                {tvShows.map((item) => <SeriesCard key={item.tmdbId} item={item} kind="tv" onOpen={openTvSeries} />)}
              </div>
            ) : (
              <div className="empty-panel"><Icon name="film" size={30} /><p className="mt-3 font-bold text-white">No TV series published yet</p><p className="mt-2 text-xs">Import TV TMDB IDs in Admin, then approve the series.</p></div>
            )}
            {hasMoreTv && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more TV series"} <ArrowRight size={16} /></button></div>}
          </section>
        )}

        {tab === "anime" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>MYANIMELIST · SUB & DUB</span><h1 className="mt-1 text-2xl font-black">Anime series</h1></div>
              <span>{animeShows.length} / {animeTotal || animeShows.length} SERIES</span>
            </div>
            {loading ? (
              <div className="empty-panel"><div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-[#e8b65b]" /><p className="mt-3 text-sm">Loading anime…</p></div>
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">Anime catalog unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : animeShows.length ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
                {animeShows.map((item) => <SeriesCard key={item.malId} item={item} kind="anime" onOpen={openAnimeSeries} />)}
              </div>
            ) : (
              <div className="empty-panel"><Icon name="film" size={30} /><p className="mt-3 font-bold text-white">No anime published yet</p><p className="mt-2 text-xs">Import MAL IDs in Admin, then approve the anime series.</p></div>
            )}
            {hasMoreAnime && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more anime"} <ArrowRight size={16} /></button></div>}
          </section>
        )}

        {tab === "search" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>FIND YOUR NEXT MOVIE</span><h1 className="mt-1 text-2xl font-black">Search</h1></div>
              <span>{movies.length} / {moviesTotal || movies.length} RESULTS</span>
            </div>
            {loading ? (
              <div className="empty-panel"><div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-[#e8b65b]" /><p className="mt-3 text-sm">Searching the catalog…</p></div>
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">Search unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : movies.length ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
                {movies.map((movie) => <MovieCard key={movie.imdbId} movie={movie} onOpen={openMovie} onSave={toggleSaved} saved={savedIds.has(movie.imdbId)} />)}
              </div>
            ) : (
              <div className="empty-panel"><Icon name="search" size={30} /><p className="mt-3 font-bold text-white">{query.trim() ? "No movies found" : "Search the catalog"}</p><p className="mt-2 text-xs">{query.trim() ? "Try another title or a shorter search." : "Type a movie title, keyword or year above."}</p></div>
            )}
            {hasMoreMovies && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more results"} <ArrowRight size={16} /></button></div>}
          </section>
        )}

        {tab === "saved" && (
          <section className="pb-8">
            <div className="section-heading"><div><span>YOUR COLLECTION</span><h1 className="mt-1 text-2xl font-black">My List</h1></div><span>{savedMovies.length} SAVED</span></div>
            {savedMovies.length ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
                {savedMovies.map((movie) => <MovieCard key={movie.imdbId} movie={movie} onOpen={openMovie} onSave={toggleSaved} saved={savedIds.has(movie.imdbId)} />)}
              </div>
            ) : (
              <div className="empty-panel"><Icon name="saved" size={30} /><p className="mt-3 font-bold text-white">Your list is empty</p><p className="mt-2 text-xs">Tap the bookmark on any movie to save it here.</p><button className="gold-button mt-5" onClick={() => setTab("home")}>Explore movies <Icon name="arrow" size={15} /></button></div>
            )}
          </section>
        )}

        {tab === "settings" && (
          <section className="max-w-2xl pb-8">
            <div className="section-heading"><div><span>YOUR APP</span><h1 className="mt-1 text-2xl font-black">Settings</h1></div></div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-[#11131b] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 className="font-bold">Watch history</h2><p className="mt-1 text-xs text-[#9297a7]">Saved only on this device · {sortedHistory.length} entries</p></div>
                  {sortedHistory.length > 0 && <button type="button" className="history-clear" onClick={clearWatchHistory}><Trash2 size={15} /> Clear all</button>}
                </div>
                {sortedHistory.length ? (
                  <div className="mt-4 space-y-2">
                    {sortedHistory.map((item) => (
                      <div key={item.key} className="history-row">
                        {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" /> : <div className="history-poster"><Clapperboard size={18} /></div>}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{item.title || "Untitled"}</p>
                          <p className="mt-1 text-xs text-[#9297a7]">{String(item.mediaType || "media").toUpperCase()}{item.season ? " · S" + item.season + " E" + item.episode : item.episode ? " · EP " + item.episode : ""}</p>
                          <p className="mt-1 text-xs text-[#9297a7]">{formatClock(item.watched)} / {formatClock(item.duration)}</p>
                        </div>
                        <button type="button" className="history-remove" onClick={() => removeHistoryItem(item.key)} aria-label={"Remove " + (item.title || "item") + " from watch history"}><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-[#9297a7]">Nothing watched yet. Playback progress will appear here.</p>}
              </div>
              <a href="/index.html" className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#11131b] p-5 transition hover:bg-[#181b25]">
                <div><h2 className="font-bold">Admin console</h2><p className="mt-1 text-xs text-[#9297a7]">Manage the catalog and import movie IDs.</p></div><Icon name="external" />
              </a>
              <div className="rounded-2xl border border-white/10 bg-[#11131b] p-5">
                <h2 className="font-bold">About Situla</h2>
                <p className="mt-2 text-xs leading-5 text-[#9297a7]">Situla uses IMDb title IDs for movie identity and VidLink for movie, TV and anime playback.</p>
                <p className="mt-3 text-[10px] font-bold tracking-[.14em] text-[#73798a]">SITULA · WEB APP</p>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-white/5 py-7 text-center text-[10px] text-[#686e7d]">
          SITULA · DISCOVER MORE · IMDb · VIDLINK
        </footer>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={"nav-button" + (tab === item.id ? " active" : "")}
            aria-current={tab === item.id ? "page" : undefined}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
