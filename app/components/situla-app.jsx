"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    ? [year, item.runtime ? item.runtime + " min / ep" : "TV series"].filter(Boolean).join(" · ")
    : [year, "Anime series"].filter(Boolean).join(" · ");
  const category = (item.genres || []).slice(0, 2).join(" · ");
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
        <p className="mt-1 text-[11px] text-[#858b9b]">{meta}</p>
        {category && <p className="series-card-category">{category}</p>}
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
    <section className="hero-card catalog-spotlight" key={item.imdbId || item.malId}>
      {(item.backdropUrl || item.posterUrl) && <img className="hero-image" src={item.backdropUrl || item.posterUrl} alt="" fetchPriority="high" />}
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
        {movies.map((movie) => (
          <MovieCard key={movie.imdbId || movie.id || (String(movie.title || 'movie') + '-' + String(movie.releaseYear || 'unknown') + '-' + movies.indexOf(movie))} movie={movie} onOpen={onOpen} onSave={onSave} saved={savedIds.has(movie.imdbId)} />
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

  useEffect(() => {
    setCatalogSpotlight(null);
    setCatalogSpotlightItems([]);
  }, [tab]);

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
        const response = await fetch("/api/search?q=" + encodeURIComponent(value), {
          cache: "no-store",
          signal: controller.signal
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
    }, 120);
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
        const isDiscover = tab === "home" && genre === "All";
        const params = new URLSearchParams({ page: "1", limit: "40" });
        if (tab === "search" && query.trim()) params.set("q", query.trim());
        if (tab === "home" && genre !== "All") {
          const selected = categoryShelves.find((item) => item.name === genre);
          if (selected?.genre) params.set("genre", selected.genre);
        }
        const endpoint = tab === "search" ? "/api/search?q=" + encodeURIComponent(query.trim()) : (isDiscover ? "/api/movies/discover" : "/api/movies?" + params.toString());
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
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
        if (tab === "movies") {
          const freshSpotlight = chooseFreshSpotlight(items, "situla:spotlight:movies");
          setCatalogSpotlightItems(items);
          setCatalogSpotlight(freshSpotlight);
        }
        if (isDiscover) {
          const uniqueHeroMovies = [];
          const seenHeroIds = new Set();
          for (const candidate of [payload.featured, ...items]) {
            const id = String(candidate?.imdbId || candidate?.id || "");
            if (!id || seenHeroIds.has(id)) continue;
            seenHeroIds.add(id);
            uniqueHeroMovies.push(candidate);
          }
          const selectedHero = chooseFreshSpotlight(uniqueHeroMovies, "situla:spotlight:home");
          const selectedHeroIndex = uniqueHeroMovies.findIndex((item) => item.imdbId === selectedHero?.imdbId);
          setHeroMovies(uniqueHeroMovies);
          setHeroIndex(Math.max(0, selectedHeroIndex));
          setFeaturedMovie(selectedHero || payload.featured || items[0] || null);
          setCategoryShelves(Array.isArray(payload.categories) ? payload.categories : []);
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
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroMovies.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [tab, heroMovies.length]);

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
          setCatalogSpotlightItems(items);
          setCatalogSpotlight(chooseFreshSpotlight(items, "situla:spotlight:tv"));
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
    const interval = window.setInterval(() => {
      setCatalogSpotlight((current) => {
        const idField = tab === "anime" ? "malId" : "imdbId";
        const currentIndex = catalogSpotlightItems.findIndex((item) => String(item[idField]) === String(current?.[idField]));
        return catalogSpotlightItems[(currentIndex + 1 + catalogSpotlightItems.length) % catalogSpotlightItems.length];
      });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [tab, catalogSpotlightItems]);

  useEffect(() => {
    if (!catalogSpotlight || (tab !== "movies" && tab !== "tv" && tab !== "anime")) return;
    const idField = tab === "anime" ? "malId" : "imdbId";
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
    router.push("/tv/" + encodeURIComponent(series.imdbId));
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
      if (tab === "home" || tab === "movies" || tab === "search") {
        const nextPage = moviesPage + 1;
        const params = new URLSearchParams({ page: String(nextPage), limit: "40" });
        if (tab === "search" && query.trim()) params.set("q", query.trim());
        if (tab === "home" && genre !== "All") {
          const selected = categoryShelves.find((item) => item.name === genre);
          if (selected?.genre) params.set("genre", selected.genre);
        }
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
          const ids = new Set(current.map((item) => item.imdbId));
          return [...current, ...nextItems.filter((item) => !ids.has(item.imdbId))];
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
    try {
      localStorage.setItem("situla:watch-history:v1", JSON.stringify(next));
      if (key.startsWith("movie:")) {
        const imdbId = key.slice(6);
        const progress = JSON.parse(localStorage.getItem("situla:progress:v1") || "[]");
        localStorage.setItem("situla:progress:v1", JSON.stringify(Array.isArray(progress) ? progress.filter((item) => item.imdbId !== imdbId) : []));
      } else if (key.startsWith("tv:")) {
        const [, imdbId, seasonPart, episodePart] = key.split(":");
        const season = Number(seasonPart?.replace(/^s/, ""));
        const episode = Number(episodePart?.replace(/^e/, ""));
        const progress = JSON.parse(localStorage.getItem("situla:tv-progress:v1") || "[]");
        localStorage.setItem("situla:tv-progress:v1", JSON.stringify(Array.isArray(progress) ? progress.filter((item) =>
          !(String(item.imdbId).toLowerCase() === imdbId && Number(item.season) === season && Number(item.episode) === episode)
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
  const hasMoreMovies = moviesPage * 40 < moviesTotal;
  const hasMoreTv = tvPage * 40 < tvTotal;
  const hasMoreAnime = animePage * 40 < animeTotal;
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
            <label className="header-search search-box" aria-label="Search catalog">
              <BootstrapIcon icon="search" size={18} />
              <input value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setSearchOpen(false);
                  router.push("/search" + (query.trim() ? "?q=" + encodeURIComponent(query.trim()) : ""));
                }
                if (event.key === "Escape") setSearchOpen(false);
              }} placeholder="Search movies, TV series & anime…" aria-label="Search all Situla titles" />
              {query && <button type="button" onClick={() => { setQuery(""); setSuggestions([]); setSearchOpen(false); }} aria-label="Clear search"><BootstrapIcon icon="x-lg" size={16} /></button>}
            </label>
            {searchOpen && query.trim().length >= 2 && (
              <div className="suggestion-panel" role="listbox" aria-label="Matching movie titles">
                {suggestionsLoading ? (
                  <div className="suggestion-loading"><span className="suggestion-spinner" /> Finding matching titles…</div>
                ) : suggestions.length ? suggestions.map((item) => (
                  <button key={item.imdbId || item.malId} type="button" className="suggestion-item" onMouseDown={(event) => event.preventDefault()} onClick={() => openSearchResult(item)}>
                    {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" /> : <div className="suggestion-poster"><BootstrapIcon icon="film" size={17} /></div>}
                    <span className="suggestion-title"><strong>{item.titleEnglish || item.title}</strong><small>{String(item.mediaType || "movie").toUpperCase()} · {item.releaseYear || "Release year unknown"}</small></span>
                    <BootstrapIcon icon="play-fill" size={16} />
                  </button>
                )) : <div className="suggestion-empty">No matching movies, TV series or anime found.</div>}
              </div>
            )}
          </div>
        </div>
      </header>

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
            {hasMoreMovies && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more movies"} <BootstrapIcon icon="arrow-right" size={16} /></button></div>}
          </>
        )}


        {tab === "movies" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>EXPLORE THE CATALOG</span><h1 className="mt-1 text-2xl font-black">Movies</h1></div>
            </div>
            {catalogSpotlight && <CatalogSpotlight item={catalogSpotlight} kind="movie" onWatch={openMovie} onSave={toggleSaved} saved={savedIds.has(catalogSpotlight.imdbId)} />}
            {loading ? (
              <SkeletonGrid count={12} />
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">Movie catalog unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : movies.length ? (
              <div className="catalog-grid">
                {movies.map((movie) => <MovieCard key={movie.imdbId} movie={movie} onOpen={openMovie} onSave={toggleSaved} saved={savedIds.has(movie.imdbId)} />)}
              </div>
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
            {loading ? (
              <SkeletonGrid count={12} />
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">TV catalog unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : tvShows.length ? (
              <div className="catalog-grid">
                {tvShows.map((item) => <SeriesCard key={item.imdbId} item={item} kind="tv" onOpen={openTvSeries} />)}
              </div>
            ) : (
              <div className="empty-panel"><Icon name="film" size={30} /><p className="mt-3 font-bold text-white">No TV series published yet</p><p className="mt-2 text-xs">Add curated TV series with IMDb IDs to the database.</p></div>
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
            {loading ? (
              <SkeletonGrid count={12} />
            ) : error ? (
              <div className="empty-panel"><p className="font-bold text-white">Anime catalog unavailable</p><p className="mt-2 text-xs">{error}</p></div>
            ) : animeShows.length ? (
              <div className="catalog-grid">
                {animeShows.map((item) => <SeriesCard key={item.malId} item={item} kind="anime" onOpen={openAnimeSeries} />)}
              </div>
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
                  : <SeriesCard key={item.imdbId || item.malId} item={item} kind={item.mediaType} onOpen={item.mediaType === "tv" ? openTvSeries : openAnimeSeries} />
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
                <p className="mt-2 text-xs leading-5 text-[#9297a7]">Situla uses IMDb IDs for movies and TV, and MAL IDs for anime playback.</p>
                <p className="mt-3 text-[10px] font-bold tracking-[.14em] text-[#73798a]">SITULA · WEB APP</p>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-white/5 py-7 text-center text-[10px] text-[#686e7d]">
          SITULA · DISCOVER MORE · IMDb
        </footer>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
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
