"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function Icon({ name, size = 19 }) {
  const props = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round",
    strokeLinejoin: "round", "aria-hidden": true
  };
  switch (name) {
    case "home": return <svg {...props}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>;
    case "search": return <svg {...props}><circle cx="10.8" cy="10.8" r="7.2" /><path d="m16.2 16.2 4.3 4.3" /></svg>;
    case "saved": return <svg {...props}><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4z" /></svg>;
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.7Z" transform="translate(-1 -1) scale(1.08)" /></svg>;
    case "play": return <svg {...props}><path d="M8 5.5a1 1 0 0 1 1.5-.86l9.4 5.5a2.1 2.1 0 0 1 0 3.62l-9.4 5.5A1 1 0 0 1 8 18.4z" fill="currentColor" stroke="none" /></svg>;
    case "bookmark": return <svg {...props}><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4z" /></svg>;
    case "check": return <svg {...props}><path d="m5 12 4 4L19 6" /></svg>;
    case "star": return <svg {...props}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor" stroke="none" /></svg>;
    case "arrow": return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "film": return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4" /></svg>;
    case "download": return <svg {...props}><path d="M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2" /></svg>;
    case "external": return <svg {...props}><path d="M14 3h7v7M10 14 21 3" /><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" /></svg>;
    case "spark": return <svg {...props}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>;
    case "close": return <svg {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    default: return <svg {...props}><circle cx="12" cy="12" r="9" /></svg>;
  }
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
        <p className="mt-1 text-[11px] text-[#858b9b]">{movie.releaseYear || "Movie"}{movie.runtime ? " · " + movie.runtime + " min" : ""}</p>
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
          <MovieCard key={movie.imdbId} movie={movie} onOpen={onOpen} onSave={onSave} saved={savedIds.has(movie.imdbId)} />
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

  useEffect(() => {
    try {
      setSavedMovies(JSON.parse(localStorage.getItem("situla:saved:v1") || "[]"));
      setRecentMovies(JSON.parse(localStorage.getItem("situla:recent:v1") || "[]"));
      const progress = JSON.parse(localStorage.getItem("situla:progress:v1") || "[]");
      setProgressMovies(Array.isArray(progress) ? progress.filter((item) => item.duration > 0 && item.watched / item.duration < 0.95) : []);
    } catch {
      setSavedMovies([]);
      setRecentMovies([]);
      setProgressMovies([]);
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
        if (tab === "tv") setTvShows(items);
        else setAnimeShows(items);
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
    setRecentMovies((current) => [movie, ...current.filter((item) => item.imdbId !== movie.imdbId)].slice(0, 12));
    router.push("/watch/" + encodeURIComponent(movie.imdbId));
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

  const featured = movies[0];

  return (
    <main className="app-shell">
      <header className="app-header safe-top">
        <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3 md:px-8">
          <div className="brand-mark" aria-hidden="true">S</div>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-black tracking-[.18em] text-white">SITULA</p>
            <p className="text-[9px] font-bold tracking-[.19em] text-[#828898]">MOVIES · DISCOVER MORE</p>
          </div>
          <button
            type="button"
            onClick={() => { setTab("search"); setQuery(""); }}
            className="watch-control !h-10 !w-10 !bg-[#171a23]"
            aria-label="Open search"
          >
            <Icon name="search" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] px-4 pt-5 md:px-8 md:pt-8">
        <div className="mb-5">
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
        </div>

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
            <MovieShelf title={genre === "All" ? "Popular on Situla" : genre + " movies"} eyebrow="CURATED FOR YOU" movies={filteredMovies} onOpen={openMovie} onSave={toggleSaved} savedIds={savedIds} />
            {loading && movies.length > 0 && <p className="mt-5 text-center text-xs text-[#858b9b]">Refreshing catalog…</p>}
            {error && movies.length === 0 && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
          </>
        )}


        {tab === "tv" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>WATCH BY SEASON & EPISODE</span><h1 className="mt-1 text-2xl font-black">TV series</h1></div>
              <span>{tvShows.length} SHOWS</span>
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
          </section>
        )}

        {tab === "anime" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>MYANIMELIST · SUB & DUB</span><h1 className="mt-1 text-2xl font-black">Anime series</h1></div>
              <span>{animeShows.length} SERIES</span>
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
          </section>
        )}

        {tab === "search" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>FIND YOUR NEXT MOVIE</span><h1 className="mt-1 text-2xl font-black">Search</h1></div>
              <span>{movies.length} RESULTS</span>
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
              <a href="/index.html" className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#11131b] p-5 transition hover:bg-[#181b25]">
                <div><h2 className="font-bold">Admin console</h2><p className="mt-1 text-xs text-[#9297a7]">Manage the catalog and import movie IDs.</p></div><Icon name="external" />
              </a>
              <div className="rounded-2xl border border-white/10 bg-[#11131b] p-5">
                <h2 className="font-bold">About Situla</h2>
                <p className="mt-2 text-xs leading-5 text-[#9297a7]">Movie information is served by the Situla catalog API. Playback opens the IMDb-compatible player using each movie’s IMDb ID.</p>
                <p className="mt-3 text-[10px] font-bold tracking-[.14em] text-[#73798a]">SITULA · WEB APP</p>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-white/5 py-7 text-center text-[10px] text-[#686e7d]">
          SITULA · DISCOVER MORE · IMDb IDs · movie metadata via TMDB
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
