"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { Button } from "./ui/button.jsx";
import { Card, CardContent, CardHeader } from "./ui/card.jsx";
import { Badge } from "./ui/badge.jsx";
import { Progress } from "./ui/progress.jsx";
const BOOTSTRAP_ICONS = {
  home: "house-door-fill",
  search: "search",
  saved: "bookmark",
  settings: "gear",
  play: "play-fill",
  bookmark: "bookmark",
  check: "check-lg",
  star: "star-fill",
  arrow: "arrow-right",
  film: "film",
  tv: "tv-fill",
  download: "download",
  external: "box-arrow-up-right",
  spark: "stars",
  close: "x-lg"
};

function BootstrapIcon({ icon, size = 19, className, ...props }) {
  return <i className={("bi bi-" + icon + (className ? " " + className : "")).trim()} style={{ fontSize: size }} aria-hidden="true" {...props} />;
}

function Icon({ name, size = 19, className }) {
  return <BootstrapIcon icon={BOOTSTRAP_ICONS[name] || "question-circle"} size={size} className={className} />;
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

function chooseFreshSpotlight(items, storageKey, idField = "imdbId") {
  const validItems = (Array.isArray(items) ? items : []).filter((item) => item && item[idField]);
  if (!validItems.length) return null;
  let previousId = "";
  try { previousId = localStorage.getItem(storageKey) || ""; } catch {}
  const freshItems = validItems.filter((item) => String(item[idField]) !== previousId);
  const pool = freshItems.length ? freshItems : validItems;
  const selected = pool[Math.floor(Math.random() * pool.length)] || validItems[0];
  try { localStorage.setItem(storageKey, String(selected[idField])); } catch {}
  return selected;
}

const RECENT_CATALOG_ID_LIMIT = 120;

function readRecentCatalogIds(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(saved)) return [];
    return [...new Set(saved.map((id) => String(id).trim()).filter(Boolean))].slice(-RECENT_CATALOG_ID_LIMIT);
  } catch {
    return [];
  }
}

function rememberRecentCatalogIds(storageKey, ids) {
  const nextIds = [...new Set([...readRecentCatalogIds(storageKey), ...(Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim()).filter(Boolean)])].slice(-RECENT_CATALOG_ID_LIMIT);
  try { localStorage.setItem(storageKey, JSON.stringify(nextIds)); } catch {}
}


function MoviePosterImage({ movie }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [movie.imdbId, movie.posterUrl]);
  return movie.posterUrl && !failed ? (
    <img
      src={movie.posterUrl}
      alt={movie.title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="poster-fallback"><Icon name="film" size={30} /></div>
  );
}

function MovieCard({ movie, onOpen, onSave, saved }) {
  return (
    <article className="movie-card">
      <button type="button" onClick={() => onOpen(movie)} className="block w-full text-left">
        <div className="movie-poster">
          <MoviePosterImage movie={movie} />
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

function SeriesPosterImage({ item, title }) {
  const sources = [...new Set([item.posterUrl, item.posterFallbackUrl].filter((value) =>
    typeof value === "string" && /^https:\/\//.test(value)
  ))];
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [item.malId, item.tmdbId, item.posterUrl, item.posterFallbackUrl]);

  const source = sources[sourceIndex];
  return source ? (
    <img
      src={source}
      alt={title}
      loading="lazy"
      decoding="async"
      onError={() => setSourceIndex((current) => current + 1)}
    />
  ) : (
    <div className="poster-fallback"><Icon name="film" size={30} /></div>
  );
}


function SeriesCard({ item, kind, onOpen }) {
  const isTv = kind === "tv";
  const title = isTv ? item.title : (item.titleEnglish || item.title);
  const year = item.releaseYear || (item.firstAirDate ? item.firstAirDate.slice(0, 4) : "");
  const rating = isTv ? item.voteAverage : item.score;
  const meta = isTv
    ? [year, item.runtime ? item.runtime + " min / ep" : "TV series", item.numberOfSeasons ? item.numberOfSeasons + " seasons" : "", item.numberOfEpisodes ? item.numberOfEpisodes + " eps" : ""].filter(Boolean).join(" · ")
    : [year, item.episodes ? item.episodes + " episodes" : "Anime series"].filter(Boolean).join(" · ");
  const category = (item.genres || []).slice(0, 2).join(" · ");
  const synopsis = isTv ? item.overview : item.synopsis;
  return (
    <article className={"movie-card series-card series-card-" + kind}>
      <button type="button" onClick={() => onOpen(item)} className="block w-full text-left">
        <div className="movie-poster">
          <SeriesPosterImage item={item} title={title} />
          {rating > 0 && (
            <span className="rating-pill"><Icon name="star" size={11} /> {Number(rating).toFixed(1)}</span>
          )}
        </div>
        <h3 className="mt-2 truncate text-[13px] font-bold text-white">{title}</h3>
        <p className="series-card-meta">{meta}</p>
        {category && <p className="series-card-category">{category}</p>}
        {synopsis && <p className="series-card-description">{synopsis}</p>}
      </button>
    </article>
  );
}

function CatalogSpotlight({ item, kind, onWatch, onSave, saved }) {
  if (!item) return null;
  const isTv = kind === "tv";
  const isAnime = kind === "anime";
  const title = isAnime ? (item.titleEnglish || item.title) : item.title;
  const year = item.releaseYear || item.firstAirDate?.slice(0, 4) || item.airedFrom?.slice(0, 4) || "";
  const rating = isAnime ? item.score : item.voteAverage;
  const genres = Array.isArray(item.genres) ? item.genres.slice(0, 2) : [];
  const kicker = isTv ? "A SERIES TO GET LOST IN" : isAnime ? "ANOTHER WORLD AWAITS" : "FEATURED MOVIE";
  return (
    <section className="hero-card catalog-spotlight" key={item.tmdbId || item.imdbId || item.malId}>
      {(item.backdropUrl || item.posterUrl) && <img className="hero-image" src={item.backdropUrl || item.posterUrl} alt="" fetchPriority="high" onError={(event) => {
        if (item.posterUrl && event.currentTarget.src !== item.posterUrl) {
          event.currentTarget.src = item.posterUrl;
        } else if (isAnime && item.posterFallbackUrl && event.currentTarget.src !== item.posterFallbackUrl) {
          event.currentTarget.src = item.posterFallbackUrl;
        } else {
          event.currentTarget.style.display = "none";
        }
      }} />}
      <div className="hero-content">
        <div className="hero-eyebrow"><span className="hero-live-dot" /> {kicker}</div>
        <p className="hero-kicker">Picked for your next watch</p>
        <h2 className="hero-title">{title}</h2>
        <div className="hero-meta">
          {year && <Badge variant="outline">{year}</Badge>}
          {rating > 0 && <span className="hero-rating"><Icon name="star" size={13} /> {Number(rating).toFixed(1)}</span>}
          {genres.map((genre) => <Badge key={genre} variant="outline">{genre}</Badge>)}
        </div>
        <p className="hero-description">{item.overview || item.synopsis || "Discover this title on Situla."}</p>
        <div className="hero-actions">
          <Button variant="gold" onClick={() => onWatch(item)}><Icon name="play" size={17} /> {isTv || isAnime ? "Explore series" : "Watch now"}</Button>
          {!isTv && !isAnime && <Button variant="ghost" onClick={() => onSave(item)}>
            <Icon name={saved ? "check" : "bookmark"} size={16} /> {saved ? "In my list" : "Add to my list"}
          </Button>}
        </div>
        <span className="catalog-spotlight-note">FRESH PICK · CHANGES WHEN YOU REFRESH</span>
      </div>
    </section>
  );
}

function MovieShelf({ title, eyebrow, movies, onOpen, onSave, savedIds }) {
  const rowRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  if (!movies.length) return null;

  function onPointerDown(event) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startScroll: rowRef.current?.scrollLeft || 0,
      moved: false,
      suppressClick: false
    };
  }

  function onPointerMove(event) {
    if (!dragRef.current.active || !rowRef.current) return;
    const distance = event.clientX - dragRef.current.startX;
    if (Math.abs(distance) > 8) dragRef.current.moved = true;
    if (dragRef.current.moved) rowRef.current.scrollLeft = dragRef.current.startScroll - distance;
  }

  function onPointerUp() {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    dragRef.current.suppressClick = dragRef.current.moved;
  }

  function onClickCapture(event) {
    if (!dragRef.current.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current.suppressClick = false;
    dragRef.current.moved = false;
  }

  return (
    <section className="netflix-shelf">
      <div className="section-heading shelf-heading">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 className={eyebrow ? "mt-1" : ""}>{title}</h2>
        </div>
      </div>
      <div
        ref={rowRef}
        className="media-row flex gap-4 overflow-x-auto pb-3"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        {movies.map((movie, index) => (
          <MovieCard key={movie.imdbId || movie.id || (String(movie.title || 'movie') + '-' + String(movie.releaseYear || 'unknown') + '-' + index)} movie={movie} onOpen={onOpen} onSave={onSave} saved={savedIds.has(movie.imdbId)} />
        ))}
      </div>
    </section>
  );
}

function SkeletonCard() {
  return <div className="skeleton-card" aria-hidden="true"><div className="skeleton-poster" /><div className="skeleton-line wide" /><div className="skeleton-line short" /></div>;
}

function SkeletonShelf({ title = "Loading titles…" }) {
  return (
    <section className="netflix-shelf skeleton-shelf" aria-label={title}>
      <div className="section-heading shelf-heading"><h2>{title}</h2></div>
      <div className="media-row flex gap-4 overflow-hidden">{Array.from({ length: 7 }, (_, index) => <SkeletonCard key={index} />)}</div>
    </section>
  );
}

function SkeletonGrid({ count = 12 }) {
  return <div className="skeleton-grid">{Array.from({ length: count }, (_, index) => <SkeletonCard key={index} />)}</div>;
}

const NAV_ITEMS = [
  { id: "home", href: "/", label: "Home", icon: "home" },
  { id: "movies", href: "/movies", label: "Movies", icon: "film" },
  { id: "tv", href: "/tv", label: "TV", icon: "tv" },
  { id: "anime", href: "/anime", label: "Anime", icon: "play" },
  { id: "search", href: "/search", label: "Search", icon: "search" },
  { id: "saved", href: "/saved", label: "Saved", icon: "saved" },
  { id: "settings", href: "/settings", label: "Settings", icon: "settings" }
];

export default function SitulaApp({ view = "home", initialQuery = "" }) {
  const router = useRouter();
  const tab = view;
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [genre, setGenre] = useState("All");
  const [movies, setMovies] = useState([]);
  const [featuredMovie, setFeaturedMovie] = useState(null);
  const [heroMovies, setHeroMovies] = useState([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [catalogSpotlight, setCatalogSpotlight] = useState(null);
  const [catalogSpotlightItems, setCatalogSpotlightItems] = useState([]);
  const [categoryShelves, setCategoryShelves] = useState([]);
  const [tvShows, setTvShows] = useState([]);
  const [animeShows, setAnimeShows] = useState([]);
  const [savedMovies, setSavedMovies] = useState([]);
  const [recentMovies, setRecentMovies] = useState([]);
  const [progressMovies, setProgressMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [watchHistory, setWatchHistory] = useState([]);
  const [moviesPage, setMoviesPage] = useState(1);
  const [moviesTotal, setMoviesTotal] = useState(0);
  const [tvPage, setTvPage] = useState(1);
  const [tvTotal, setTvTotal] = useState(0);
  const [animePage, setAnimePage] = useState(1);
  const [animeTotal, setAnimeTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreLock = useRef(false);

  useEffect(() => {
    setCatalogSpotlight(null);
    setCatalogSpotlightItems([]);
  }, [tab]);

  useEffect(() => {
    if (!searchOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [searchOpen]);

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
    try {
      if (recentMovies.length) localStorage.setItem("situla:recent:v1", JSON.stringify(recentMovies.slice(0, 12)));
      else localStorage.removeItem("situla:recent:v1");
    } catch {}
  }, [recentMovies, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      if (watchHistory.length) localStorage.setItem("situla:watch-history:v1", JSON.stringify(watchHistory.slice(0, 500)));
      else localStorage.removeItem("situla:watch-history:v1");
    } catch {}
  }, [watchHistory, storageReady]);

  useEffect(() => {
    if (tab !== "settings" || !storageReady) return;
    try {
      const history = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
      setWatchHistory(Array.isArray(history) ? history.filter((item) => item && typeof item.key === "string").slice(0, 500) : []);
    } catch { setWatchHistory([]); }
  }, [tab, storageReady]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
        const response = await fetch("/api/search?q=" + encodeURIComponent(value), {
          cache: "no-store",
          signal
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && !controller.signal.aborted) {
          setSuggestions(Array.isArray(payload.items) ? payload.items : []);
        }
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (tab !== "home" && tab !== "movies" && tab !== "search") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const isDiscover = (tab === "home" && genre === "All") || tab === "movies";
        const params = new URLSearchParams({ page: "1", limit: "40" });
        if (tab === "search" && query.trim()) params.set("q", query.trim());
        if (tab === "home" && genre !== "All") {
          const selected = categoryShelves.find((item) => item.name === genre);
          if (selected?.genre) params.set("genre", selected.genre);
        }
        const recentKey = tab === "movies" ? "situla:recent-catalog:movies" : "situla:recent-catalog:home";
        const recentIds = isDiscover ? readRecentCatalogIds(recentKey) : [];
        const discoverQuery = recentIds.length ? "?exclude=" + encodeURIComponent(recentIds.join(",")) : "";
        const endpoint = tab === "search" ? "/api/search?q=" + encodeURIComponent(query.trim()) : (isDiscover ? "/api/movies/discover" + discoverQuery : "/api/movies?" + params.toString());
        const requestSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
        const response = await fetch(endpoint, { cache: "no-store", signal: requestSignal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Movie catalog is not available.");
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (tab === "search") {
          setSearchResults(items);
          setMovies([]);
          setMoviesPage(1);
          setMoviesTotal(items.length);
          setError("");
          return;
        }
        setSearchResults([]);
        setMovies(items);
        if (isDiscover) {
          rememberRecentCatalogIds(recentKey, [payload.featured?.imdbId, ...items.map((item) => item.imdbId)]);
          const uniqueHeroMovies = [];
          const seenHeroIds = new Set();
          for (const candidate of [payload.featured, ...items]) {
            const id = String(candidate?.imdbId || candidate?.id || "");
            if (!id || seenHeroIds.has(id)) continue;
            seenHeroIds.add(id);
            uniqueHeroMovies.push(candidate);
          }
          setCategoryShelves(Array.isArray(payload.categories) ? payload.categories : []);
          if (tab === "movies") {
            const freshSpotlight = chooseFreshSpotlight(uniqueHeroMovies, "situla:spotlight:movies");
            setCatalogSpotlightItems(uniqueHeroMovies);
            setCatalogSpotlight(freshSpotlight || payload.featured || items[0] || null);
          } else {
            const selectedHero = chooseFreshSpotlight(uniqueHeroMovies, "situla:spotlight:home");
            const selectedHeroIndex = uniqueHeroMovies.findIndex((item) => item.imdbId === selectedHero?.imdbId);
            setHeroMovies(uniqueHeroMovies);
            setHeroIndex(Math.max(0, selectedHeroIndex));
            setFeaturedMovie(selectedHero || payload.featured || items[0] || null);
          }
        } else if (tab === "home" && !featuredMovie && items.length) {
          setFeaturedMovie(items[0]);
        }
        setMoviesPage(Number(payload.pagination?.page) || 1);
        setMoviesTotal(Number(payload.pagination?.total) || 0);
        setError("");
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError.message || "Could not load movies. Please try again.");
          setMovies([]);
          if (tab === "home" && !featuredMovie) setFeaturedMovie(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, tab === "search" && query.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tab, genre]);


  useEffect(() => {
    if (tab !== "home") return;
    const activeHero = heroMovies[heroIndex];
    if (activeHero?.imdbId) {
      try { localStorage.setItem("situla:spotlight:home", activeHero.imdbId); } catch {}
    }
  }, [tab, heroMovies, heroIndex]);

  useEffect(() => {
    if (tab !== "home" || heroMovies.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setHeroIndex((current) => (current + 1) % heroMovies.length);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [tab, heroMovies.length]);

  useEffect(() => {
    if (tab !== "tv" && tab !== "anime") return;
    const controller = new AbortController();
    const recentKey = tab === "tv" ? "situla:recent-catalog:tv" : "situla:recent-catalog:anime";
    const recentIds = readRecentCatalogIds(recentKey);
    const excludeQuery = recentIds.length ? "&exclude=" + encodeURIComponent(recentIds.join(",")) : "";
    const endpoint = tab === "tv"
      ? "/api/tv?page=1&limit=40&random=true" + excludeQuery
      : "/api/anime?page=1&limit=40&random=true" + excludeQuery;
    async function loadSeries() {
      setLoading(true);
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
        const response = await fetch(endpoint, { cache: "no-store", signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Series catalog is not available.");
        const items = Array.isArray(payload.items) ? payload.items : [];
        rememberRecentCatalogIds(recentKey, items.map((item) => tab === "tv" ? item.tmdbId : item.malId));
        if (tab === "tv") {
          setTvShows(items);
          setCatalogSpotlightItems(items);
          setCatalogSpotlight(chooseFreshSpotlight(items, "situla:spotlight:tv", "tmdbId"));
          setTvPage(Number(payload.pagination?.page) || 1);
          setTvTotal(Number(payload.pagination?.total) || items.length);
        } else {
          setAnimeShows(items);
          setCatalogSpotlightItems(items);
          setCatalogSpotlight(chooseFreshSpotlight(items, "situla:spotlight:anime", "malId"));
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

  useEffect(() => {
    if (tab !== "movies" && tab !== "tv" && tab !== "anime") return;
    if (catalogSpotlightItems.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setCatalogSpotlight((current) => {
        const idField = tab === "anime" ? "malId" : tab === "tv" ? "tmdbId" : "imdbId";
        const currentIndex = catalogSpotlightItems.findIndex((item) => String(item[idField]) === String(current?.[idField]));
        return catalogSpotlightItems[(currentIndex + 1 + catalogSpotlightItems.length) % catalogSpotlightItems.length];
      });
    }, 10000);
    return () => window.clearInterval(interval);
  }, [tab, catalogSpotlightItems]);

  useEffect(() => {
    if (!catalogSpotlight || (tab !== "movies" && tab !== "tv" && tab !== "anime")) return;
    const idField = tab === "anime" ? "malId" : tab === "tv" ? "tmdbId" : "imdbId";
    const id = catalogSpotlight[idField];
    if (!id) return;
    try { localStorage.setItem("situla:spotlight:" + tab, String(id)); } catch {}
  }, [tab, catalogSpotlight]);

  const allGenres = useMemo(() => ["All", ...categoryShelves.map((item) => item.name)], [categoryShelves]);

  const savedIds = useMemo(() => new Set(savedMovies.map((movie) => movie.imdbId)), [savedMovies]);
  const filteredMovies = movies;

  function openMovie(movie) {
    const imdbId = String(movie?.imdbId || "").toLowerCase();
    if (!/^tt\d{5,12}$/.test(imdbId)) {
      setError("This saved movie has no valid IMDb ID. Refresh the catalog and open it again.");
      return;
    }
    const normalized = { ...movie, imdbId };
    try { localStorage.setItem("situla:movie:" + imdbId, JSON.stringify(normalized)); } catch {}
    setRecentMovies((current) => [normalized, ...current.filter((item) => item.imdbId !== imdbId)].slice(0, 12));
    setSearchOpen(false);
    router.push("/watch/" + encodeURIComponent(imdbId));
  }

  function openSearchResult(item) {
    setSearchOpen(false);
    if (item.mediaType === "tv") return openTvSeries(item);
    if (item.mediaType === "anime") return openAnimeSeries(item);
    return openMovie(item);
  }

  function openTvSeries(series) {
    const tmdbId = Number(series?.tmdbId);
    if (!Number.isSafeInteger(tmdbId) || tmdbId < 1) {
      setError("This TV series has no valid TMDB ID. Refresh the catalog and open it again.");
      return;
    }
    router.push("/tv/" + tmdbId);
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
    if (loadMoreLock.current) return;
    loadMoreLock.current = true;
    setLoadingMore(true);
    try {
      if (tab === "home" || tab === "movies" || tab === "search") {
        const nextPage = moviesPage + 1;
        const params = new URLSearchParams({ page: String(nextPage), limit: "40" });
        if (tab === "search" && query.trim()) params.set("q", query.trim());
        if (tab === "home" && genre !== "All") {
          const selected = categoryShelves.find((item) => item.name === genre);
          if (selected?.genre) params.set("genre", selected.genre);
        }
        if (tab !== "search") {
          params.set("random", "true");
          params.set("exclude", movies.map((item) => item.imdbId).filter(Boolean).join(","));
        }
        const response = await fetch("/api/movies?" + params.toString(), {
          cache: "no-store",
          signal: AbortSignal.timeout(20000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to load more movies.");
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        if (tab !== "search") {
          const recentKey = tab === "movies" ? "situla:recent-catalog:movies" : "situla:recent-catalog:home";
          rememberRecentCatalogIds(recentKey, nextItems.map((item) => item.imdbId));
        }
        setMovies((current) => {
          const ids = new Set(current.map((item) => String(item.imdbId || "").toLowerCase()));
          return [...current, ...nextItems.filter((item) => {
            const id = String(item.imdbId || "").toLowerCase();
            if (!id || ids.has(id)) return false;
            ids.add(id);
            return true;
          })];
        });
        setMoviesPage(Number(payload.pagination?.page) || nextPage);
        setMoviesTotal(Number(payload.pagination?.total) || moviesTotal);
        setError("");
      } else if (tab === "tv") {
        const nextPage = tvPage + 1;
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "40",
          random: "true",
          exclude: tvShows.map((item) => item.tmdbId).filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0).join(",")
        });
        const response = await fetch("/api/tv?" + params.toString(), {
          cache: "no-store",
          signal: AbortSignal.timeout(20000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to load more TV series.");
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        rememberRecentCatalogIds("situla:recent-catalog:tv", nextItems.map((item) => item.tmdbId));
        setTvShows((current) => {
          const ids = new Set(current.map((item) => Number(item.tmdbId)).filter((id) => Number.isSafeInteger(id)));
          return [...current, ...nextItems.filter((item) => {
            const id = Number(item.tmdbId);
            if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) return false;
            ids.add(id);
            return true;
          })];
        });
        setTvPage(Number(payload.pagination?.page) || nextPage);
        setTvTotal(Number(payload.pagination?.total) || tvTotal);
        setError("");
      } else if (tab === "anime") {
        const nextPage = animePage + 1;
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "40",
          random: "true",
          exclude: animeShows.map((item) => item.malId).filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0).join(",")
        });
        const response = await fetch("/api/anime?" + params.toString(), {
          cache: "no-store",
          signal: AbortSignal.timeout(20000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to load more anime.");
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        rememberRecentCatalogIds("situla:recent-catalog:anime", nextItems.map((item) => item.malId));
        setAnimeShows((current) => {
          const ids = new Set(current.map((item) => Number(item.malId)).filter((id) => Number.isSafeInteger(id)));
          return [...current, ...nextItems.filter((item) => {
            const id = Number(item.malId);
            if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) return false;
            ids.add(id);
            return true;
          })];
        });
        setAnimePage(Number(payload.pagination?.page) || nextPage);
        setAnimeTotal(Number(payload.pagination?.total) || animeTotal);
        setError("");
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to load the next catalog page.");
    } finally {
      loadMoreLock.current = false;
      setLoadingMore(false);
    }
  }

  function removeHistoryItem(key) {
    const next = watchHistory.filter((item) => item.key !== key);
    setWatchHistory(next);
    try {
      localStorage.setItem("situla:watch-history:v1", JSON.stringify(next));
      if (key.startsWith("movie:")) {
        const imdbId = key.slice(6);
        const progress = JSON.parse(localStorage.getItem("situla:progress:v1") || "[]");
        localStorage.setItem("situla:progress:v1", JSON.stringify(Array.isArray(progress) ? progress.filter((item) => item.imdbId !== imdbId) : []));
      } else if (key.startsWith("tv:")) {
        const [, tvId, seasonPart, episodePart] = key.split(":");
        const season = Number(seasonPart?.replace(/^s/, ""));
        const episode = Number(episodePart?.replace(/^e/, ""));
        const progress = JSON.parse(localStorage.getItem("situla:tv-progress:v1") || "[]");
        const numericTmdbId = /^[0-9]+$/.test(tvId) ? Number(tvId) : null;
        localStorage.setItem("situla:tv-progress:v1", JSON.stringify(Array.isArray(progress) ? progress.filter((item) =>
          !(numericTmdbId
            ? Number(item.tmdbId) === numericTmdbId
            : String(item.imdbId || "").toLowerCase() === tvId) ||
          Number(item.season) !== season || Number(item.episode) !== episode
        ) : []));
      } else if (key.startsWith("anime:")) {
        const [, malId, episodePart, audio] = key.split(":");
        const episode = Number(episodePart?.replace(/^e/, ""));
        const progress = JSON.parse(localStorage.getItem("situla:anime-progress:v1") || "[]");
        localStorage.setItem("situla:anime-progress:v1", JSON.stringify(Array.isArray(progress) ? progress.filter((item) =>
          !(Number(item.malId) === Number(malId) && Number(item.episode) === episode && item.audio === audio)
        ) : []));
      }
    } catch {}
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
  const hasMoreMovies = movies.length < moviesTotal;
  const hasMoreTv = tvShows.length < tvTotal;
  const hasMoreAnime = animeShows.length < animeTotal;
  const featured = heroMovies.length ? heroMovies[heroIndex % heroMovies.length] : (featuredMovie || movies[0]);

  return (
    <main className="app-shell">
      <header className="app-header safe-top">
        <div className="header-inner container-fluid mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 md:px-8">
          <Link href="/" className="brand-lockup" aria-label="Situla home">
            <img src="/icon.svg" alt="" className="brand-logo" width="40" height="40" />
            <span className="brand-copy min-w-0">
              <strong>SITULA</strong>
              <small>{({
                home: "DISCOVER MOVIES",
                movies: "MOVIE COLLECTION",
                tv: "TV SERIES",
                anime: "ANIME COLLECTION",
                search: "SEARCH MOVIES",
                saved: "YOUR COLLECTION",
                settings: "APP SETTINGS"
              })[tab] || "DISCOVER MOVIES"}</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {NAV_ITEMS.filter((item) => item.id !== "search").map((item) => (
              <Link key={item.id} href={item.href} className={"desktop-nav-link" + (tab === item.id ? " active" : "")} aria-current={tab === item.id ? "page" : undefined}>
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="header-search-wrap">
            <button
              type="button"
              className="header-search search-box header-search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Search movies, TV series and anime"
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
            >
              <BootstrapIcon icon="search" size={18} />
              <span className="header-search-label">Search movies, TV & anime</span>
            </button>
          </div>

              </section>
            </div>
          )}
        </div>
      </header>

      {searchOpen && typeof document !== "undefined" && createPortal(
        <div
          className="search-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <section className="search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-dialog-title">
            <div className="search-dialog-heading">
              <div>
                <span>ALL SITULA CATALOGS</span>
                <h2 id="search-dialog-title">Search movies, TV & anime</h2>
              </div>
              <button type="button" className="search-dialog-close" onClick={() => setSearchOpen(false)} aria-label="Close search">
                <BootstrapIcon icon="x-lg" size={19} />
              </button>
            </div>
            <label className="search-dialog-input">
              <BootstrapIcon icon="search" size={18} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                  if (event.key === "Enter" && query.trim().length >= 2) {
                    setSearchOpen(false);
                    router.push("/search?q=" + encodeURIComponent(query.trim()));
                  }
                }}
                placeholder="Type a title, person or IMDb/MAL ID…"
                aria-label="Search all media types"
              />
              {query && (
                <button type="button" onClick={() => { setQuery(""); setSuggestions([]); }} aria-label="Clear search">
                  <BootstrapIcon icon="x-lg" size={16} />
                </button>
              )}
            </label>
            {query.trim().length < 2 ? (
              <div className="suggestion-empty">Type at least two characters to search across Movies, TV series and Anime.</div>
            ) : suggestionsLoading ? (
              <div className="suggestion-loading"><span className="suggestion-spinner" /> Finding matching titles…</div>
            ) : suggestions.length ? (
              <>
                <div className="search-results-caption">Mixed results · Movies · TV series · Anime</div>
                <div className="search-results-list" role="listbox" aria-label="Mixed search results">
                  {suggestions.map((item) => {
                    const identity = item.mediaType === "tv" ? item.tmdbId : item.mediaType === "anime" ? item.malId : item.imdbId;
                    return (
                      <button
                        key={item.mediaType + ":" + identity}
                        type="button"
                        className="suggestion-item"
                        role="option"
                        aria-selected="false"
                        onClick={() => openSearchResult(item)}
                      >
                        {item.posterUrl
                          ? <img src={item.posterUrl} alt="" loading="lazy" decoding="async" />
                          : <div className="suggestion-poster"><BootstrapIcon icon="film" size={17} /></div>}
                        <span className="suggestion-title">
                          <strong>{item.titleEnglish || item.title}</strong>
                          <small>{String(item.mediaType || "movie").toUpperCase()} · {item.releaseYear || item.firstAirDate?.slice(0, 4) || item.airedFrom?.slice(0, 4) || "Release year unknown"}</small>
                        </span>
                        <BootstrapIcon icon="play-fill" size={16} />
                      </button>
                    );
                  })}
                </div>
                <div className="search-dialog-footer">
                  <span>{suggestions.length} mixed catalog matches</span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setSearchOpen(false);
                      router.push("/search?q=" + encodeURIComponent(query.trim()));
                    }}
                  >
                    View full search page
                  </button>
                </div>
              </>
            ) : (
              <div className="suggestion-empty">No matching movies, TV series or anime found.</div>
            )}
          </section>
        </div>,
        document.body
      )}

      <div className={tab === "home" ? "home-page-layout" : "mx-auto max-w-[1600px] px-4 pt-5 md:px-8 md:pt-8"}>


        {tab === "home" && (
          <>
            {featured ? (
              <section className="hero-card" key={featured.imdbId || featured.id}>
                {(featured.backdropUrl || featured.posterUrl) && <img className="hero-image" src={featured.backdropUrl || featured.posterUrl} alt="" fetchPriority="high" />}
                <div className="hero-content">
                  <div className="hero-eyebrow"><span className="hero-live-dot" /> THE SITULA SPOTLIGHT</div>
                  <p className="hero-kicker">A story worth staying in for</p>
                  <h1 className="hero-title">{featured.title}</h1>
                  <div className="hero-meta">
                    {featured.releaseYear && <span>{featured.releaseYear}</span>}
                    {featured.voteAverage > 0 && <span className="hero-rating"><Icon name="star" size={13} /> {Number(featured.voteAverage).toFixed(1)}</span>}
                    {featured.runtime > 0 && <span>{formatRuntime(featured.runtime)}</span>}
                    {featured.genres?.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
                  </div>
                  <p className="hero-description">{featured.overview || "Discover a new favourite on Situla."}</p>
                  <div className="hero-actions">
                    <button className="gold-button" onClick={() => openMovie(featured)}><Icon name="play" size={17} /> Watch now</button>
                    <button className="ghost-button" onClick={() => toggleSaved(featured)}>
                      <Icon name={savedIds.has(featured.imdbId) ? "check" : "bookmark"} size={16} />
                      {savedIds.has(featured.imdbId) ? "In my list" : "Add to my list"}
                    </button>
                  </div>
                  {heroMovies.length > 1 && <div className="hero-carousel-footer">
                    <span className="hero-carousel-label">EXPLORE THE SPOTLIGHT</span>
                    <div className="hero-carousel-controls">
                      <button type="button" className="hero-arrow" aria-label="Previous featured movie" onClick={() => setHeroIndex((current) => (current - 1 + heroMovies.length) % heroMovies.length)}><BootstrapIcon icon="arrow-left" size={16} /></button>
                      <span className="hero-progress-track" aria-hidden="true"><span className="hero-progress-fill" key={featured.imdbId || featured.id} /></span>
                      <button type="button" className="hero-arrow" aria-label="Next featured movie" onClick={() => setHeroIndex((current) => (current + 1) % heroMovies.length)}><BootstrapIcon icon="arrow-right" size={16} /></button>
                    </div>
                  </div>}
                </div>
              </section>
            ) : loading ? (
              <>
                <div className="hero-skeleton"><div className="skeleton-hero-copy"><div className="skeleton-line short" /><div className="skeleton-line hero-title" /><div className="skeleton-line wide" /><div className="skeleton-line medium" /><div className="skeleton-hero-button" /></div></div>
                <SkeletonShelf title="Trending now" />
                <SkeletonShelf title="Popular on Situla" />
              </>
            ) : (
              <div className="empty-panel"><Icon name="film" size={32} /><p className="mt-3 font-bold text-white">Your catalog is getting ready</p><p className="mt-2 text-xs">{error || "Approved titles from the Situla API will appear here."}</p></div>
            )}

            <section className="home-discovery" aria-label="Explore Situla">
              <div className="home-section-intro">
                <div>
                  <span>ONE PLACE. MANY WORLDS.</span>
                  <h2>Find your next favourite</h2>
                </div>
                <p>Pick a path and let the story begin.</p>
              </div>
              <div className="home-discovery-grid">
                <Link href="/movies" className="discovery-card discovery-movies">
                  <span className="discovery-symbol"><Icon name="film" size={25} /></span>
                  <span className="discovery-copy"><strong>Movies</strong><small>Big-screen stories, anytime</small></span>
                  <BootstrapIcon icon="arrow-up-right" size={19} />
                </Link>
                <Link href="/tv" className="discovery-card discovery-tv">
                  <span className="discovery-symbol"><Icon name="tv" size={25} /></span>
                  <span className="discovery-copy"><strong>TV series</strong><small>Stories that keep unfolding</small></span>
                  <BootstrapIcon icon="arrow-up-right" size={19} />
                </Link>
                <Link href="/anime" className="discovery-card discovery-anime">
                  <span className="discovery-symbol"><Icon name="play" size={25} /></span>
                  <span className="discovery-copy"><strong>Anime</strong><small>Step into another world</small></span>
                  <BootstrapIcon icon="arrow-up-right" size={19} />
                </Link>
              </div>
            </section>

            {heroMovies.length > 1 && (
              <section className="spotlight-strip" aria-label="Choose a featured movie">
                <div className="spotlight-strip-heading">
                  <span>NOW IN THE SPOTLIGHT</span>
                  <p>More stories to discover</p>
                </div>
                <div className="spotlight-strip-track">
                  {heroMovies.slice(0, 6).map((movie, index) => (
                    <button
                      key={movie.imdbId || movie.id}
                      type="button"
                      className={"spotlight-chip" + (index === heroIndex ? " active" : "")}
                      onClick={() => setHeroIndex(index)}
                      aria-pressed={index === heroIndex}
                    >
                      <span className="spotlight-chip-art">
                        {movie.posterUrl
                          ? <img src={movie.posterUrl} alt="" loading="lazy" />
                          : <Icon name="film" size={17} />}
                      </span>
                      <span className="spotlight-chip-title">{movie.title}</span>
                    </button>
                  ))}
                </div>
              </section>
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
            {genre === "All" ? (
              <>
                <MovieShelf title="Popular on Situla" eyebrow="CURATED FOR YOU" movies={movies} onOpen={openMovie} onSave={toggleSaved} savedIds={savedIds} />
                {categoryShelves.map((category) => (
                  <MovieShelf key={category.key} title={category.name} eyebrow="BROWSE BY GENRE" movies={category.items} onOpen={openMovie} onSave={toggleSaved} savedIds={savedIds} />
                ))}
              </>
            ) : (
              <MovieShelf title={genre + " movies"} eyebrow="DATABASE GENRE RESULTS" movies={filteredMovies} onOpen={openMovie} onSave={toggleSaved} savedIds={savedIds} />
            )}
            {loading && movies.length > 0 && <p className="mt-5 text-center text-xs text-[#858b9b]">Refreshing catalog…</p>}
            {error && movies.length === 0 && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
            {error && movies.length > 0 && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
            {error && movies.length > 0 && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
            {hasMoreMovies && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more movies"} <BootstrapIcon icon="arrow-right" size={16} /></button></div>}
          </>
        )}


        {tab === "movies" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>EXPLORE THE CATALOG</span><h1 className="mt-1 text-2xl font-black">Movies</h1></div>
            </div>
            {catalogSpotlight && <CatalogSpotlight item={catalogSpotlight} kind="movie" onWatch={openMovie} onSave={toggleSaved} saved={savedIds.has(catalogSpotlight.imdbId)} />}
            {loading && !movies.length ? (
              <SkeletonGrid count={12} />
            ) : movies.length ? (
              <>
                <div className="catalog-grid">
                  {movies.map((movie) => <MovieCard key={movie.imdbId} movie={movie} onOpen={openMovie} onSave={toggleSaved} saved={savedIds.has(movie.imdbId)} />)}
                </div>
                {loading && <p className="mt-5 text-center text-xs text-[#858b9b]">Refreshing movies…</p>}
                {error && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
              </>
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">Movie catalog unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : (
              <div className="empty-panel"><Icon name="film" size={30} /><p className="mt-3 font-bold text-white">No movies published yet</p><p className="mt-2 text-xs">Movies in the Situla catalog will appear here.</p></div>
            )}
            {hasMoreMovies && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more movies"} <BootstrapIcon icon="arrow-right" size={16} /></button></div>}
          </section>
        )}

        {tab === "tv" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>WATCH BY SEASON & EPISODE</span><h1 className="mt-1 text-2xl font-black">TV series</h1></div>
            </div>
            {catalogSpotlight && <CatalogSpotlight item={catalogSpotlight} kind="tv" onWatch={openTvSeries} />}
            {loading && !tvShows.length ? (
              <SkeletonGrid count={12} />
            ) : tvShows.length ? (
              <>
                <div className="catalog-grid">
                  {tvShows.map((item) => <SeriesCard key={item.tmdbId} item={item} kind="tv" onOpen={openTvSeries} />)}
                </div>
                {loading && <p className="mt-5 text-center text-xs text-[#858b9b]">Refreshing TV series…</p>}
                {error && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
              </>
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">TV catalog unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : (
              <div className="empty-panel"><Icon name="film" size={30} /><p className="mt-3 font-bold text-white">No TV series published yet</p><p className="mt-2 text-xs">Add curated TV series with TMDB IDs to the database.</p></div>
            )}
            {hasMoreTv && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more TV series"} <BootstrapIcon icon="arrow-right" size={16} /></button></div>}
          </section>
        )}

        {tab === "anime" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>MYANIMELIST · SUB & DUB</span><h1 className="mt-1 text-2xl font-black">Anime series</h1></div>
            </div>
            {catalogSpotlight && <CatalogSpotlight item={catalogSpotlight} kind="anime" onWatch={openAnimeSeries} />}
            {loading && !animeShows.length ? (
              <SkeletonGrid count={12} />
            ) : animeShows.length ? (
              <>
                <div className="catalog-grid">
                  {animeShows.map((item) => <SeriesCard key={item.malId} item={item} kind="anime" onOpen={openAnimeSeries} />)}
                </div>
                {loading && <p className="mt-5 text-center text-xs text-[#858b9b]">Refreshing Anime…</p>}
                {error && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
              </>
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">Anime catalog unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : (
              <div className="empty-panel"><Icon name="film" size={30} /><p className="mt-3 font-bold text-white">No anime published yet</p><p className="mt-2 text-xs">Add curated anime records to the database.</p></div>
            )}
            {hasMoreAnime && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more anime"} <BootstrapIcon icon="arrow-right" size={16} /></button></div>}
          </section>
        )}

        {tab === "search" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>FIND YOUR NEXT WATCH</span><h1 className="mt-1 text-2xl font-black">Search</h1></div>
            </div>
            {loading ? (
              <SkeletonGrid count={12} />
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">Search unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : searchResults.length ? (
              <div className="catalog-grid">
                {searchResults.map((item) => item.mediaType === "movie"
                  ? <MovieCard key={item.imdbId} movie={item} onOpen={openMovie} onSave={toggleSaved} saved={savedIds.has(item.imdbId)} />
                  : <SeriesCard key={item.mediaType === "tv" ? item.tmdbId : item.malId} item={item} kind={item.mediaType} onOpen={item.mediaType === "tv" ? openTvSeries : openAnimeSeries} />
                )}
              </div>
            ) : (
              <div className="empty-panel"><Icon name="search" size={30} /><p className="mt-3 font-bold text-white">{query.trim() ? "No matching titles found" : "Search the full catalog"}</p><p className="mt-2 text-xs">{query.trim() ? "Try another title or a shorter search." : "Search movies, TV series and anime together."}</p></div>
            )}
          </section>
        )}

        {tab === "saved" && (
          <section className="pb-8">
            <div className="section-heading"><div><span>YOUR COLLECTION</span><h1 className="mt-1 text-2xl font-black">My List</h1></div></div>
            {savedMovies.length ? (
              <div className="catalog-grid">
                {savedMovies.map((movie) => <MovieCard key={movie.imdbId} movie={movie} onOpen={openMovie} onSave={toggleSaved} saved={savedIds.has(movie.imdbId)} />)}
              </div>
            ) : (
              <div className="empty-panel"><Icon name="saved" size={30} /><p className="mt-3 font-bold text-white">Your list is empty</p><p className="mt-2 text-xs">Tap the bookmark on any movie to save it here.</p><button className="gold-button mt-5" onClick={() => router.push("/movies")}>Explore movies <Icon name="arrow" size={15} /></button></div>
            )}
          </section>
        )}

        {tab === "settings" && (
          <section className="max-w-2xl pb-8">
            <div className="section-heading"><div><span>YOUR APP</span><h1 className="mt-1 text-2xl font-black">Settings</h1></div></div>
            <div className="space-y-3">
              <Card className="history-card">
                <Disclosure defaultOpen>
                  {({ open }) => (
                    <>
                      <CardHeader className="history-card-header">
                        <div>
                          <h2 className="font-bold">Watch history</h2>
                          <p className="mt-1 text-xs text-[#9297a7]">Saved only on this device</p>
                        </div>
                        <div className="history-heading-actions">
                          {sortedHistory.length > 0 && <Button type="button" variant="subtle" size="sm" className="history-clear" onClick={clearWatchHistory}><BootstrapIcon icon="trash3" size={15} /> Clear all</Button>}
                          <DisclosureButton className="history-collapse" aria-label={open ? "Collapse watch history" : "Expand watch history"}>
                            <BootstrapIcon icon={open ? "chevron-up" : "chevron-down"} size={16} />
                          </DisclosureButton>
                        </div>
                      </CardHeader>
                      <DisclosurePanel>
                        {sortedHistory.length ? (
                          <CardContent className="history-list">
                            {sortedHistory.map((item) => {
                              const duration = Math.max(0, Number(item.duration) || 0);
                              const watched = Math.min(duration || Number(item.watched) || 0, Math.max(0, Number(item.watched) || 0));
                              const progress = duration > 0 ? Math.max(0, Math.min(100, (watched / duration) * 100)) : 0;
                              return (
                                <article key={item.key} className="history-row">
                                  {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" /> : <div className="history-poster"><BootstrapIcon icon="film" size={18} /></div>}
                                  <div className="history-item-copy">
                                    <p className="truncate text-sm font-semibold">{item.title || "Untitled"}</p>
                                    <p className="mt-1 text-xs text-[#9297a7]">{String(item.mediaType || "media").toUpperCase()}{item.season ? " · S" + item.season + " E" + item.episode : item.episode ? " · EP " + item.episode : ""}</p>
                                    <Progress value={progress} ariaLabel={"Watched progress for " + (item.title || "this title")} className="history-progress" />
                                    <div className="history-time-labels"><span>{formatClock(watched)} watched</span><span>{formatClock(duration)} total</span></div>
                                  </div>
                                  <Button type="button" variant="icon" size="icon" className="history-remove" onClick={() => removeHistoryItem(item.key)} aria-label={"Remove " + (item.title || "item") + " from watch history"}><BootstrapIcon icon="x-lg" size={15} /></Button>
                                </article>
                              );
                            })}
                          </CardContent>
                        ) : <p className="history-empty">Nothing watched yet. Playback progress will appear here.</p>}
                      </DisclosurePanel>
                    </>
                  )}
                </Disclosure>
              </Card>
              <div className="rounded-2xl border border-white/10 bg-[#11131b] p-5">
                <h2 className="font-bold">About Situla</h2>
                <p className="mt-2 text-xs leading-5 text-[#9297a7]">Situla uses IMDb IDs for movies, TMDB IDs for TV series, and MAL IDs for anime playback.</p>
                <p className="mt-3 text-[10px] leading-5 text-[#73798a]">This product uses the <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer" className="text-[#e8b65b] underline underline-offset-4">TMDB API</a> but is not endorsed or certified by TMDB.</p>
                <p className="mt-3 text-[10px] font-bold tracking-[.14em] text-[#73798a]">SITULA · WEB APP</p>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-white/5 py-7 text-center text-[10px] text-[#686e7d]">
          SITULA · DISCOVER MORE
        </footer>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => item.id === "search" ? (
          <button
            key={item.id}
            type="button"
            className="nav-button"
            onClick={() => setSearchOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </button>
        ) : (
          <Link
            key={item.id}
            href={item.href}
            className={"nav-button" + (tab === item.id ? " active" : "")}
            aria-current={tab === item.id ? "page" : undefined}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
