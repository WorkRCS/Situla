"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { mixHomeSpotlight, toHomeSpotlight } from "../../src/home-discovery.js";
import Link from "next/link";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { Button } from "./ui/button.jsx";
import { Card, CardContent, CardHeader } from "./ui/card.jsx";
import { Badge } from "./ui/badge.jsx";
import { Progress } from "./ui/progress.jsx";
import AnnouncementCenter from "./announcement-center.jsx";
import { createHistoryResumeTarget } from "../../src/watch-history.js";
import { optimizeTmdbImageUrl } from "../../src/media-image.js";
import { normalizeSavedMediaList, savedMediaKey, savedMediaType, toggleSavedMedia } from "../../src/saved-media.js";
import { ArrowUpRight, BadgeCheck, LogOut, Search, ShieldCheck, UserRound, Share2 } from "lucide-react";
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

function formatHistoryDate(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "Recently watched";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
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
      src={optimizeTmdbImageUrl(movie.posterUrl, "w185")}
      alt={movie.title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="poster-fallback"><Icon name="film" size={30} /></div>
  );
}

function movieCardHref(movie) {
  const imdbId = String(movie?.imdbId || "").toLowerCase();
  return /^tt\d{5,12}$/.test(imdbId) ? "/watch/" + encodeURIComponent(imdbId) : null;
}

function seriesCardHref(item, kind) {
  if (kind === "tv") {
    const tmdbId = Number(item?.tmdbId);
    return Number.isSafeInteger(tmdbId) && tmdbId > 0 ? "/tv/" + tmdbId : null;
  }
  const malId = String(item?.malId || "").trim();
  return /^\d+$/.test(malId) ? "/anime/" + encodeURIComponent(malId) : null;
}

const FALLBACK_CATALOG_BADGE = Object.freeze({ key: "featured", label: "Featured" });
function resolveCatalogBadge(badge) {
  return badge && ["hot", "popular", "featured"].includes(badge.key)
    ? badge
    : FALLBACK_CATALOG_BADGE;
}

const SHARE_POSTER_CACHE_LIMIT = 8;
const SHARE_POSTER_MAX_BYTES = 8 * 1024 * 1024;
const sharePosterBlobs = new Map();
const sharePosterRequests = new Map();

async function prepareSharePosterBlob(posterUrl) {
  const key = String(posterUrl || "");
  if (!key) throw new Error("Poster unavailable.");
  if (sharePosterBlobs.has(key)) {
    const cached = sharePosterBlobs.get(key);
    sharePosterBlobs.delete(key);
    sharePosterBlobs.set(key, cached);
    return cached;
  }
  if (sharePosterRequests.has(key)) return sharePosterRequests.get(key);

  const request = (async () => {
    const response = await fetch("/api/share-poster?url=" + encodeURIComponent(key), {
      cache: "force-cache",
      credentials: "same-origin",
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error("Poster could not be prepared for sharing.");
    const blob = await response.blob();
    const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
    if (!supportedTypes.has(blob.type) || !blob.size || blob.size > SHARE_POSTER_MAX_BYTES) {
      throw new Error("The poster is not a supported share image.");
    }
    return blob;
  })();

  sharePosterRequests.set(key, request);
  try {
    const blob = await request;
    sharePosterBlobs.set(key, blob);
    while (sharePosterBlobs.size > SHARE_POSTER_CACHE_LIMIT) {
      const oldestKey = sharePosterBlobs.keys().next().value;
      if (oldestKey === undefined) break;
      sharePosterBlobs.delete(oldestKey);
    }
    return blob;
  } finally {
    sharePosterRequests.delete(key);
  }
}

function createSharePosterFile(title, blob) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif"
  };
  const slug = String(title || "situla-poster")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .toLowerCase() || "situla-poster";
  return new File([blob], slug + "." + extensions[blob.type], {
    type: blob.type,
    lastModified: Date.now()
  });
}

/**
 * Called only when the poster Blob is already prepared. navigator.share() is
 * invoked synchronously before this function returns, preserving user activation.
 * The share payload contains the image file, title, and canonical content URL;
 * the source poster URL is never included as share text.
 */
function shareMediaCard({ title, href, posterUrl }) {
  const blob = sharePosterBlobs.get(String(posterUrl || ""));
  if (!blob || typeof navigator.share !== "function" ||
      typeof navigator.canShare !== "function" || typeof File !== "function") {
    return null;
  }

  const url = new URL(href, window.location.origin).toString();
  const file = createSharePosterFile(title, blob);
  const data = { files: [file], title, text: title, url };
  try {
    if (!navigator.canShare(data)) return null;
    return navigator.share(data).then(() => "Shared");
  } catch {
    return null;
  }
}

async function copyContentUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    return "Image sharing unavailable; content link copied";
  } catch {
    return "Image sharing is not supported on this device";
  }
}

const MovieCard = memo(function MovieCard({ movie, onOpen, onSave, saved, navigating = false, onPreload }) {
  const [shareFeedback, setShareFeedback] = useState("");
  const [sharePreparing, setSharePreparing] = useState(false);
  const posterUrl = movie.posterUrl;
  const catalogBadge = resolveCatalogBadge(movie.catalogBadge);
  const href = movieCardHref(movie);

  function handleOpen(event) {
    if (navigating) {
      event.preventDefault();
      return;
    }
    onOpen?.(movie, { navigate: false });
  }

  function prepareSharePoster() {
    if (posterUrl) void prepareSharePosterBlob(posterUrl).catch(() => {});
  }

  async function handleShare(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!href || sharePreparing) return;
    const title = movie.title || "Movie";
    const url = new URL(href, window.location.origin).toString();

    if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || typeof File !== "function") {
      setShareFeedback(await copyContentUrl(url));
      return;
    }

    if (!sharePosterBlobs.has(String(posterUrl || ""))) {
      if (!posterUrl) {
        setShareFeedback("Poster unavailable for sharing");
        return;
      }
      setSharePreparing(true);
      setShareFeedback("Preparing poster…");
      try {
        await prepareSharePosterBlob(posterUrl);
        setShareFeedback("Poster ready — tap Share again");
      } catch {
        setShareFeedback("Poster unavailable for sharing");
      } finally {
        setSharePreparing(false);
      }
      return;
    }

    try {
      const shareTask = shareMediaCard({ title, href, posterUrl });
      if (!shareTask) {
        setShareFeedback(await copyContentUrl(url));
        return;
      }
      await shareTask;
      setShareFeedback("Shared");
    } catch (shareError) {
      if (shareError?.name === "AbortError") return;
      setShareFeedback("Poster ready — tap Share again");
    }
  }

  const cardContent = (
    <>
      <div className="movie-poster">
        <MoviePosterImage movie={movie} />
        <span className={"catalog-badge catalog-badge-" + catalogBadge.key} role="status" aria-label={catalogBadge.label + " title"}>
          {catalogBadge.label}
        </span>
        {movie.voteAverage > 0 && (
          <span className="rating-pill"><Icon name="star" size={11} /> {Number(movie.voteAverage).toFixed(1)}</span>
        )}
        {navigating && <span className="media-loading-overlay" role="status" aria-label="Opening movie"><span className="inline-loading-spinner" /></span>}
      </div>
      <h3 className="mt-2 truncate text-[13px] font-bold text-white">{movie.title}</h3>
      <p className="mt-1 text-[11px] text-[#858b9b]">{movie.releaseYear || "Movie"}{movie.runtime ? " · " + formatRuntime(movie.runtime) : ""}</p>
    </>
  );

  return (
    <article className="movie-card">
      {href ? (
        <Link
          href={href}
          prefetch={false}
          onClick={handleOpen}
          onMouseEnter={() => onPreload?.(movie)}
          className="media-open-button media-open-link block w-full text-left no-underline"
          aria-busy={navigating}
        >
          {cardContent}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          onMouseEnter={() => onPreload?.(movie)}
          className="media-open-button block w-full text-left"
          disabled={navigating}
          aria-busy={navigating}
        >
          {cardContent}
        </button>
      )}
      <button
        type="button"
        onClick={() => onSave(movie)}
        className={"save-button" + (saved ? " saved" : "")}
        aria-label={saved ? "Remove from saved list" : "Save movie"}
      >
        <Icon name={saved ? "check" : "bookmark"} size={15} />
      </button>
      {href && <button
        type="button"
        className="share-button"
        onClick={handleShare}
        onPointerEnter={prepareSharePoster}
        onFocus={prepareSharePoster}
        disabled={sharePreparing}
        aria-busy={sharePreparing}
        aria-label={"Share " + (movie.title || "movie")}
        title="Share poster and movie link"
      >
        <Share2 size={15} />
      </button>}
      {href && shareFeedback && <span className="share-feedback" role="status">{shareFeedback}</span>}
    </article>
  );
});

function SeriesPosterImage({ item, title }) {
  const sources = [...new Set([item.posterUrl, item.posterFallbackUrl]
    .filter((value) => typeof value === "string" && /^https:\/\//.test(value))
    .map((value) => optimizeTmdbImageUrl(value, "w185")))];
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


function seriesNavigationKey(item, kind) {
  return kind === "tv" ? "tv:" + String(item?.tmdbId || "") : "anime:" + String(item?.malId || "");
}

function movieNavigationKey(movie) {
  return "movie:" + String(movie?.imdbId || "").toLowerCase();
}

const SeriesCard = memo(function SeriesCard({ item, kind, onOpen, onSave, saved = false, navigating = false, onPreload }) {
  const [shareFeedback, setShareFeedback] = useState("");
  const [sharePreparing, setSharePreparing] = useState(false);
  const isTv = kind === "tv";
  const isAnime = kind === "anime";
  const catalogBadge = resolveCatalogBadge(item.catalogBadge);
  const title = isTv ? item.title : (item.titleEnglish || item.title);
  const year = item.releaseYear || (item.firstAirDate ? item.firstAirDate.slice(0, 4) : "");
  const rating = isTv ? item.voteAverage : item.score;
  const meta = isTv
    ? [year, item.runtime ? item.runtime + " min / ep" : "TV series", item.numberOfSeasons ? item.numberOfSeasons + " seasons" : "", item.numberOfEpisodes ? item.numberOfEpisodes + " eps" : ""].filter(Boolean).join(" · ")
    : [year, item.episodes ? item.episodes + " episodes" : "Anime series"].filter(Boolean).join(" · ");
  const category = (item.genres || []).slice(0, 2).join(" · ");
  const posterUrl = item.posterUrl || item.posterFallbackUrl;
  const href = seriesCardHref(item, kind);

  function handleOpen(event) {
    if (navigating) {
      event.preventDefault();
      return;
    }
    onOpen?.(item, kind, { navigate: false });
  }

  function handleSave(event) {
    event.preventDefault();
    event.stopPropagation();
    onSave?.(item, kind);
  }

  function prepareSharePoster() {
    if (posterUrl) void prepareSharePosterBlob(posterUrl).catch(() => {});
  }

  async function handleShare(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!href || (!isTv && !isAnime) || sharePreparing) return;
    const shareTitle = title || (isTv ? "TV series" : "Anime");
    const url = new URL(href, window.location.origin).toString();

    if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || typeof File !== "function") {
      setShareFeedback(await copyContentUrl(url));
      return;
    }

    if (!sharePosterBlobs.has(String(posterUrl || ""))) {
      if (!posterUrl) {
        setShareFeedback("Poster unavailable for sharing");
        return;
      }
      setSharePreparing(true);
      setShareFeedback("Preparing poster…");
      try {
        await prepareSharePosterBlob(posterUrl);
        setShareFeedback("Poster ready — tap Share again");
      } catch {
        setShareFeedback("Poster unavailable for sharing");
      } finally {
        setSharePreparing(false);
      }
      return;
    }

    try {
      const shareTask = shareMediaCard({ title: shareTitle, href, posterUrl });
      if (!shareTask) {
        setShareFeedback(await copyContentUrl(url));
        return;
      }
      await shareTask;
      setShareFeedback("Shared");
    } catch (shareError) {
      if (shareError?.name === "AbortError") return;
      setShareFeedback("Poster ready — tap Share again");
    }
  }

  const cardContent = (
    <>
      <div className="movie-poster">
        <SeriesPosterImage item={item} title={title} />
        <span className={"catalog-badge catalog-badge-" + catalogBadge.key} role="status" aria-label={catalogBadge.label + " title"}>
          {catalogBadge.label}
        </span>
        {rating > 0 && (
          <span className="rating-pill"><Icon name="star" size={11} /> {Number(rating).toFixed(1)}</span>
        )}
        {navigating && <span className="media-loading-overlay" role="status" aria-label={"Opening " + (isTv ? "TV series" : "anime")}><span className="inline-loading-spinner" /></span>}
      </div>
      <h3 className="mt-2 truncate text-[13px] font-bold text-white">{title}</h3>
      <p className="series-card-meta">{meta}</p>
      {category && <p className="series-card-category">{category}</p>}
    </>
  );

  return (
    <article className={"movie-card series-card series-card-" + kind}>
      {href ? (
        <Link
          href={href}
          prefetch={false}
          onClick={handleOpen}
          onMouseEnter={() => onPreload?.(item, kind)}
          className="media-open-button media-open-link block w-full text-left no-underline"
          aria-busy={navigating}
        >
          {cardContent}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          onMouseEnter={() => onPreload?.(item, kind)}
          className="media-open-button block w-full text-left"
          disabled={navigating}
          aria-busy={navigating}
        >
          {cardContent}
        </button>
      )}
      {(isTv || isAnime) && href && <>
        <button
          type="button"
          className={"save-button" + (saved ? " saved" : "")}
          onClick={handleSave}
          aria-label={saved ? "Remove from saved list" : "Save " + (isTv ? "TV series" : "anime")}
          aria-pressed={saved}
          title={saved ? "Remove from My List" : "Save to My List"}
        >
          <Icon name={saved ? "check" : "bookmark"} size={15} />
        </button>
        <button
          type="button"
          className="share-button"
          onClick={handleShare}
          onPointerEnter={prepareSharePoster}
          onFocus={prepareSharePoster}
          disabled={sharePreparing}
          aria-busy={sharePreparing}
          aria-label={"Share " + (title || (isTv ? "TV series" : "anime"))}
          title={"Share poster and " + (isTv ? "TV series" : "Anime") + " link"}
        >
          <Share2 size={15} />
        </button>
        {shareFeedback && <span className="share-feedback" role="status">{shareFeedback}</span>}
      </>}
    </article>
  );
});

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
      {(item.backdropUrl || item.posterUrl) && <img className="hero-image" src={optimizeTmdbImageUrl(item.backdropUrl || item.posterUrl, item.backdropUrl ? "w780" : "w342")} alt="" fetchPriority="high" onError={(event) => {
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

function SeriesShelf({ title, eyebrow, items, kind, onOpen, onSave, savedIds, pendingNavigation = "", onPreload }) {
  if (!items.length) return null;
  return (
    <section className="netflix-shelf home-series-shelf">
      <div className="section-heading shelf-heading">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 className={eyebrow ? "mt-1" : ""}>{title}</h2>
        </div>
        <Link href={kind === "tv" ? "/tv" : "/anime"} className="shelf-browse-link">
          Explore all <BootstrapIcon icon="arrow-up-right" size={14} />
        </Link>
      </div>
      <div className="media-row flex gap-4 overflow-x-auto pb-3">
        {items.slice(0, 10).map((item) => (
          <SeriesCard
            key={kind === "tv" ? item.tmdbId : item.malId}
            item={item}
            kind={kind}
            onOpen={onOpen}
            onSave={onSave}
            saved={savedIds?.has(savedMediaKey(item, kind)) || false}
            onPreload={onPreload}
            navigating={pendingNavigation === seriesNavigationKey(item, kind)}
          />
        ))}
      </div>
    </section>
  );
}

function MixedSeriesShelf({ title, eyebrow, items, onOpen, onSave, savedIds, pendingNavigation = "", onPreload }) {
  if (!items.length) return null;
  return (
    <section className="netflix-shelf home-series-shelf">
      <div className="section-heading shelf-heading">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 className={eyebrow ? "mt-1" : ""}>{title}</h2>
        </div>
        <div className="shelf-browse-links">
          <Link href="/tv" className="shelf-browse-link">TV <BootstrapIcon icon="arrow-up-right" size={13} /></Link>
          <Link href="/anime" className="shelf-browse-link">Anime <BootstrapIcon icon="arrow-up-right" size={13} /></Link>
        </div>
      </div>
      <div className="media-row flex gap-4 overflow-x-auto pb-3">
        {items.slice(0, 10).map((item) => {
          const kind = item.homeMediaKind;
          return (
            <SeriesCard
              key={seriesNavigationKey(item, kind)}
              item={item}
              kind={kind}
              onOpen={onOpen}
              onSave={onSave}
              saved={savedIds?.has(savedMediaKey(item, kind)) || false}
              onPreload={onPreload}
              navigating={pendingNavigation === seriesNavigationKey(item, kind)}
            />
          );
        })}
      </div>
    </section>
  );
}

function MovieShelf({ title, eyebrow, movies, onOpen, onSave, savedIds, pendingNavigation = "", onPreload }) {
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
          <MovieCard
            key={movie.imdbId || movie.id || (String(movie.title || "movie") + "-" + String(movie.releaseYear || "unknown") + "-" + index)}
            movie={movie}
            onOpen={onOpen}
            onSave={onSave}
            saved={savedIds.has(savedMediaKey(movie, "movie"))}
            navigating={pendingNavigation === movieNavigationKey(movie)}
            onPreload={onPreload}
          />
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
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchType, setSearchType] = useState("all");
  const [searchYear, setSearchYear] = useState("all");
  const [searchError, setSearchError] = useState("");
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountUser, setAccountUser] = useState(null);
  const demoSignedIn = Boolean(accountUser);
  const [genre, setGenre] = useState("All");
  const [movies, setMovies] = useState([]);
  const [featuredMovie, setFeaturedMovie] = useState(null);
  const [heroMovies, setHeroMovies] = useState([]);
  const [homeTvShows, setHomeTvShows] = useState([]);
  const [homeAnimeShows, setHomeAnimeShows] = useState([]);
  const [homeSeriesReady, setHomeSeriesReady] = useState(false);
  const [heroPaused, setHeroPaused] = useState(false);
  const [pendingHomeNavigation, setPendingHomeNavigation] = useState("");
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
    setPendingHomeNavigation("");
  }, [tab]);

  useEffect(() => {
    let active = true;
    async function syncServerAccount() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (active) setAccountUser(response.ok && payload.user ? payload.user : null);
      } catch {
        if (active) setAccountUser(null);
      }
    }
    syncServerAccount();
    window.addEventListener("focus", syncServerAccount);
    window.addEventListener("situla:auth-change", syncServerAccount);
    return () => {
      active = false;
      window.removeEventListener("focus", syncServerAccount);
      window.removeEventListener("situla:auth-change", syncServerAccount);
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    setAccountOpen(false);
  }, [searchOpen]);

  useEffect(() => {
    try {
      const hasValidImdbId = (item) => /^tt\d{5,12}$/i.test(String(item?.imdbId || ""));
      const saved = JSON.parse(localStorage.getItem("situla:saved:v1") || "[]");
      const recent = JSON.parse(localStorage.getItem("situla:recent:v1") || "[]");
      const progress = JSON.parse(localStorage.getItem("situla:progress:v1") || "[]");
      const history = JSON.parse(localStorage.getItem("situla:watch-history:v1") || "[]");
      setSavedMovies(normalizeSavedMediaList(saved));
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
    if (!searchOpen) return;
    const value = searchInput.trim();
    if (value.length > 0 && value.length < 3) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setSearchError("");
      setSearchHasMore(false);
      setSearchPage(1);
      return;
    }
    const hasFilters = searchType !== "all" || searchYear !== "all";
    if (!value && !hasFilters) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setSearchError("");
      setSearchHasMore(false);
      setSearchPage(1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      setSearchError("");
      const params = new URLSearchParams({ page: "1", limit: "20", type: searchType });
      if (value.length >= 3) params.set("q", value);
      if (searchYear !== "all") params.set("year", searchYear);
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]);
        const response = await fetch("/api/search?" + params.toString(), { cache: "no-store", signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Search is temporarily unavailable. Please retry.");
        if (!controller.signal.aborted) {
          setSuggestions(Array.isArray(payload.items) ? payload.items : []);
          setSearchHasMore(payload.hasMore === true);
          setSearchPage(Number(payload.page) || 1);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchError("Search could not load right now. Check your connection and try again.");
          setSearchHasMore(false);
        }
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, value.length >= 3 ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchInput, searchOpen, searchType, searchYear]);

  useEffect(() => {
    if (tab !== "home" && tab !== "movies" && tab !== "search") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const isDiscover = (tab === "home" && genre === "All") || tab === "movies";
        const params = new URLSearchParams({ page: "1", limit: "10" });
        if (tab === "search" && query.trim()) params.set("q", query.trim());
        if (tab === "home" && genre !== "All") {
          const selected = categoryShelves.find((item) => item.name === genre);
          if (selected?.genre) params.set("genre", selected.genre);
        }
        const recentKey = tab === "movies" ? "situla:recent-catalog:movies" : "situla:recent-catalog:home";
        const recentIds = isDiscover ? readRecentCatalogIds(recentKey) : [];
        const discoverQuery = recentIds.length ? "?exclude=" + encodeURIComponent(recentIds.join(",")) : "";
        const endpoint = tab === "search" ? "/api/search?q=" + encodeURIComponent(query.trim()) : (isDiscover ? "/api/movies/discover" + discoverQuery : "/api/movies?" + params.toString());
        const requestSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
        let response = await fetch(endpoint, { cache: "no-store", signal: requestSignal });
        let payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Movie catalog is not available.");
        let items = Array.isArray(payload.items) ? payload.items : [];
        if (isDiscover && !items.length && (recentIds.length > 0 || Number(payload.pagination?.total) > 0)) {
          // Retry from the beginning if a stored recently-seen list exhausted
          // a small catalog, or if discovery returned a stale/partial empty page.
          response = await fetch("/api/movies?page=1&limit=10", { cache: "no-store", signal: requestSignal });
          const fallback = await response.json().catch(() => ({}));
          if (response.ok && Array.isArray(fallback.items) && fallback.items.length) {
            payload = fallback;
            items = fallback.items;
          } else if (!response.ok) {
            throw new Error(fallback.error || "Movie catalog is not available.");
          }
        }
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
            const homeMoviePicks = uniqueHeroMovies
              .map((item) => toHomeSpotlight(item, "movie"))
              .filter(Boolean);
            setHeroMovies(homeMoviePicks);
            setFeaturedMovie(homeMoviePicks[0] || null);
          }
        } else if (tab === "home" && !featuredMovie && items.length) {
          setFeaturedMovie(items[0]);
        }
        setMoviesPage(Number(payload.pagination?.page) || 1);
        setMoviesTotal(Number(payload.pagination?.total) || 0);
        setError("");
      } catch {
        if (!controller.signal.aborted) {
          // Keep previously rendered posters available during a weak connection or API recovery.
          if (!movies.length && !featuredMovie) setError("Connection is slow. Your catalog will refresh when the connection recovers.");
          else setError("");
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
    if (tab !== "home") {
      setHomeSeriesReady(false);
      return;
    }
    const controller = new AbortController();
    setHomeSeriesReady(false);

    async function loadSeries(endpoint) {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Series picks are unavailable.");
      return Array.isArray(payload.items) ? payload.items : [];
    }

    Promise.allSettled([
      loadSeries("/api/tv?page=1&limit=10"),
      loadSeries("/api/anime?page=1&limit=10")
    ]).then(([tvResult, animeResult]) => {
      if (controller.signal.aborted) return;
      if (tvResult.status === "fulfilled") setHomeTvShows(tvResult.value);
      if (animeResult.status === "fulfilled") setHomeAnimeShows(animeResult.value);
      const bothFailed = tvResult.status === "rejected" && animeResult.status === "rejected";
      if (bothFailed && !homeTvShows.length && !homeAnimeShows.length) {
        setError("Connection is slow. Continue exploring while series picks retry.");
      } else if (!bothFailed) {
        setError("");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setHomeSeriesReady(true);
    });

    return () => controller.abort();
  }, [tab]);

  const homeHeroItems = useMemo(
    () => mixHomeSpotlight({
      movies: heroMovies,
      tv: homeTvShows.map((item) => toHomeSpotlight(item, "tv")).filter(Boolean),
      anime: homeAnimeShows.map((item) => toHomeSpotlight(item, "anime")).filter(Boolean)
    }),
    [heroMovies, homeTvShows, homeAnimeShows]
  );

  const homeSeriesMix = useMemo(() => [
    ...homeTvShows.map((item) => ({ ...item, homeMediaKind: "tv" })),
    ...homeAnimeShows.map((item) => ({ ...item, homeMediaKind: "anime" }))
  ], [homeTvShows, homeAnimeShows]);

  const popularSeriesItems = useMemo(() => [...homeSeriesMix]
    .sort((a, b) => Number(b.homeMediaKind === "tv" ? b.voteCount : b.scoredBy) - Number(a.homeMediaKind === "tv" ? a.voteCount : a.scoredBy))
    .slice(0, 20), [homeSeriesMix]);

  const favoriteSeriesItems = useMemo(() => [...homeSeriesMix]
    .sort((a, b) => {
      const aScore = Number(a.homeMediaKind === "tv" ? a.voteAverage : a.score) || 0;
      const bScore = Number(b.homeMediaKind === "tv" ? b.voteAverage : b.score) || 0;
      const aVotes = Number(a.homeMediaKind === "tv" ? a.voteCount : a.scoredBy) || 0;
      const bVotes = Number(b.homeMediaKind === "tv" ? b.voteCount : b.scoredBy) || 0;
      return bScore - aScore || bVotes - aVotes;
    })
    .slice(0, 20), [homeSeriesMix]);

  const premiumCatalog = accountUser?.planId === "premium";
  const topTvShows = useMemo(() => premiumCatalog
    ? homeTvShows.slice(0, 20)
    : [...homeTvShows]
      .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0))
      .slice(0, 20), [homeTvShows, premiumCatalog]);

  const topAnimeShows = useMemo(() => premiumCatalog
    ? homeAnimeShows.slice(0, 20)
    : [...homeAnimeShows]
      .sort((a, b) => Number(a.rank || Number.MAX_SAFE_INTEGER) - Number(b.rank || Number.MAX_SAFE_INTEGER) || Number(b.score || 0) - Number(a.score || 0))
      .slice(0, 20), [homeAnimeShows, premiumCatalog]);

  useEffect(() => {
    if (tab !== "home" || !homeSeriesReady || !homeHeroItems.length) return;
    const selectedHero = chooseFreshSpotlight(homeHeroItems, "situla:spotlight:home", "heroId");
    const selectedIndex = homeHeroItems.findIndex((item) => item.heroId === selectedHero?.heroId);
    if (selectedIndex >= 0) setHeroIndex(selectedIndex);
  }, [tab, homeSeriesReady, homeHeroItems]);

  useEffect(() => {
    if (tab !== "home") return;
    const activeHero = homeHeroItems[heroIndex];
    if (activeHero?.heroId) {
      try { localStorage.setItem("situla:spotlight:home", activeHero.heroId); } catch {}
    }
  }, [tab, homeHeroItems, heroIndex]);

  useEffect(() => {
    if (tab !== "home" || !homeSeriesReady || homeHeroItems.length < 2 || heroPaused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setHeroIndex((current) => (current + 1) % homeHeroItems.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [tab, homeSeriesReady, homeHeroItems.length, heroPaused]);

  useEffect(() => {
    if (tab !== "tv" && tab !== "anime") return;
    const controller = new AbortController();
    const recentKey = tab === "tv" ? "situla:recent-catalog:tv" : "situla:recent-catalog:anime";
    const recentIds = readRecentCatalogIds(recentKey);
    const excludeQuery = recentIds.length ? "&exclude=" + encodeURIComponent(recentIds.join(",")) : "";
    const endpoint = tab === "tv"
      ? "/api/tv?page=1&limit=10&random=true" + excludeQuery
      : "/api/anime?page=1&limit=10&random=true" + excludeQuery;
    async function loadSeries() {
      setLoading(true);
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
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
      } catch {
        if (!controller.signal.aborted) {
          const hasExistingItems = tab === "tv" ? tvShows.length > 0 : animeShows.length > 0;
          setError(hasExistingItems
            ? ""
            : "Connection is slow. The catalog will retry when your connection improves.");
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

  const savedIds = useMemo(() => new Set(savedMovies.map((item) => savedMediaKey(item))), [savedMovies]);
  const filteredMovies = movies;

  const prefetchHomeMovie = useCallback((movie) => {
    const imdbId = String(movie?.imdbId || "").toLowerCase();
    if (/^tt\d{5,12}$/.test(imdbId)) router.prefetch("/watch/" + encodeURIComponent(imdbId));
  }, [router]);

  const prefetchHomeSeries = useCallback((series, kind) => {
    if (kind === "tv") {
      const tmdbId = Number(series?.tmdbId);
      if (Number.isSafeInteger(tmdbId) && tmdbId > 0) router.prefetch("/tv/" + tmdbId);
      return;
    }
    if (/^\d+$/.test(String(series?.malId || ""))) router.prefetch("/anime/" + encodeURIComponent(series.malId));
  }, [router]);

  const prefetchHomeSpotlight = useCallback((item) => {
    if (item?.mediaType === "tv") return prefetchHomeSeries(item, "tv");
    if (item?.mediaType === "anime") return prefetchHomeSeries(item, "anime");
    return prefetchHomeMovie(item);
  }, [prefetchHomeMovie, prefetchHomeSeries]);

  const openMovie = useCallback((movie, { navigate = true } = {}) => {
    const imdbId = String(movie?.imdbId || "").toLowerCase();
    if (!/^tt\d{5,12}$/.test(imdbId)) {
      setError("This saved movie has no valid IMDb ID. Refresh the catalog and open it again.");
      return;
    }
    const normalized = { ...movie, imdbId };
    try { localStorage.setItem("situla:movie:" + imdbId, JSON.stringify(normalized)); } catch {}
    setRecentMovies((current) => [normalized, ...current.filter((item) => item.imdbId !== imdbId)].slice(0, 12));
    setSearchOpen(false);
    if (navigate) router.push("/watch/" + encodeURIComponent(imdbId));
  }, [router]);

  async function loadMoreSearch() {
    if (searchLoadingMore || !searchHasMore) return;
    const nextPage = searchPage + 1;
    const value = searchInput.trim();
    const params = new URLSearchParams({ page: String(nextPage), limit: "20", type: searchType });
    if (value.length >= 3) params.set("q", value);
    if (searchYear !== "all") params.set("year", searchYear);
    setSearchLoadingMore(true);
    setSearchError("");
    try {
      const response = await fetch("/api/search?" + params.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "More search results are unavailable.");
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setSuggestions((current) => {
        const ids = new Set(current.map((item) => item.mediaType + ":" + String(
          item.mediaType === "tv" ? item.tmdbId : item.mediaType === "anime" ? item.malId : item.imdbId
        )));
        return [...current, ...nextItems.filter((item) => {
          const id = item.mediaType + ":" + String(
            item.mediaType === "tv" ? item.tmdbId : item.mediaType === "anime" ? item.malId : item.imdbId
          );
          if (ids.has(id)) return false;
          ids.add(id);
          return true;
        })];
      });
      setSearchPage(Number(payload.page) || nextPage);
      setSearchHasMore(payload.hasMore === true);
    } catch {
      setSearchError("More results could not load. Your current results are still available.");
    } finally {
      setSearchLoadingMore(false);
    }
  }

  function openSearchResult(item) {
    setSearchOpen(false);
    if (item.mediaType === "tv") return openTvSeries(item);
    if (item.mediaType === "anime") return openAnimeSeries(item);
    return openMovie(item);
  }

  const openTvSeries = useCallback((series, { navigate = true } = {}) => {
    const tmdbId = Number(series?.tmdbId);
    if (!Number.isSafeInteger(tmdbId) || tmdbId < 1) {
      setError("This TV series has no valid TMDB ID. Refresh the catalog and open it again.");
      return;
    }
    if (navigate) router.push("/tv/" + tmdbId);
  }, [router]);

  const openAnimeSeries = useCallback((series, { navigate = true } = {}) => {
    const malId = String(series?.malId || "").trim();
    if (!/^\d+$/.test(malId)) {
      setError("This anime has no valid MyAnimeList ID. Refresh the catalog and open it again.");
      return;
    }
    if (navigate) router.push("/anime/" + encodeURIComponent(malId));
  }, [router]);

  const toggleSaved = useCallback((item, kind) => {
    setSavedMovies((current) => toggleSavedMedia(current, item, kind));
  }, []);
  const openHomeSpotlight = useCallback((item) => {
    if (item?.mediaType === "tv") {
      setPendingHomeNavigation("tv:" + String(item.tmdbId));
      return openTvSeries(item);
    }
    if (item?.mediaType === "anime") {
      setPendingHomeNavigation("anime:" + String(item.malId));
      return openAnimeSeries(item);
    }
    setPendingHomeNavigation(movieNavigationKey(item));
    return openMovie(item);
  }, [openTvSeries, openAnimeSeries, openMovie]);

  const openHomeMovie = useCallback((movie, options) => {
    setPendingHomeNavigation(movieNavigationKey(movie));
    return openMovie(movie, options);
  }, [openMovie]);

  const openHomeSeries = useCallback((series, kind, options) => {
    setPendingHomeNavigation(seriesNavigationKey(series, kind));
    return kind === "tv" ? openTvSeries(series, options) : openAnimeSeries(series, options);
  }, [openTvSeries, openAnimeSeries]);

  const openHomeTvSeries = useCallback((item, _kind, options) => openHomeSeries(item, "tv", options), [openHomeSeries]);
  const openHomeAnimeSeries = useCallback((item, _kind, options) => openHomeSeries(item, "anime", options), [openHomeSeries]);


  async function loadMore() {
    if (loadMoreLock.current) return;
    loadMoreLock.current = true;
    setLoadingMore(true);
    try {
      if (tab === "home" || tab === "movies" || tab === "search") {
        const nextPage = moviesPage + 1;
        const params = new URLSearchParams({ page: String(nextPage), limit: "10" });
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
          signal: AbortSignal.timeout(30_000)
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
          limit: "10",
          random: "true",
          exclude: tvShows.map((item) => item.tmdbId).filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0).join(",")
        });
        const response = await fetch("/api/tv?" + params.toString(), {
          cache: "no-store",
          signal: AbortSignal.timeout(30_000)
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
          limit: "10",
          random: "true",
          exclude: animeShows.map((item) => item.malId).filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0).join(",")
        });
        const response = await fetch("/api/anime?" + params.toString(), {
          cache: "no-store",
          signal: AbortSignal.timeout(30_000)
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
    } catch {
      const hasExistingItems = tab === "tv" ? tvShows.length > 0
        : tab === "anime" ? animeShows.length > 0
          : tab === "search" ? searchResults.length > 0
            : movies.length > 0;
      setError(hasExistingItems
        ? ""
        : "Connection is slow. Your current catalog remains available; try loading more again shortly.");
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

  function resumeHistoryItem(item) {
    const target = createHistoryResumeTarget(item);
    if (!target) return;

    try {
      const saved = JSON.parse(localStorage.getItem(target.storageKey) || "[]");
      const current = Array.isArray(saved) ? saved : [];
      localStorage.setItem(target.storageKey, JSON.stringify([
        target.progressEntry,
        ...current.filter((entry) => !target.matches(entry))
      ].slice(0, target.limit)));
    } catch {}

    router.push(target.href);
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
  const hasMoreMovies = movies.length > 0 && movies.length < moviesTotal;
  const hasMoreTv = tvShows.length < tvTotal;
  const hasMoreAnime = animeShows.length < animeTotal;
  const featured = homeSeriesReady ? (homeHeroItems[heroIndex % Math.max(1, homeHeroItems.length)] || featuredMovie) : null;

  useEffect(() => {
    if (tab === "home" && featured) prefetchHomeSpotlight(featured);
  }, [tab, featured?.heroId]);

  return (
    <main className="app-shell">
      <header className="app-header safe-top">
        <div className="header-inner mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 md:px-8">
          <Link href="/" className="brand-lockup" aria-label="Situla home">
            <img src="/icon.svg" alt="" className="brand-logo" width="40" height="40" />
            <span className="brand-copy min-w-0">
              <strong>SITULA</strong>
              <small>{({
                home: "DISCOVER STORIES",
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
          <div className="header-actions">
            <div className="header-search-wrap">
              <button
                type="button"
                className="header-search search-box header-search-trigger"
                onClick={() => setSearchOpen(true)}
                aria-label="Search movies, TV series and anime"
                aria-haspopup="dialog"
                aria-expanded={searchOpen}
              >
                <Search size={18} strokeWidth={2} aria-hidden="true" />
                <span className="header-search-label">Search movies, TV & anime</span>
              </button>
            </div>            <div className="header-account-wrap">
              <button
                type="button"
                className="header-avatar-trigger"
                onClick={() => setAccountOpen((open) => !open)}
                aria-label="Open user account menu"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <span className="header-avatar-initials">{accountUser?.initials || 'S'}</span>
                {demoSignedIn && <span className="header-avatar-online" aria-hidden="true" />}
              </button>
              {accountOpen && (
                <div className="header-account-popover" role="menu" aria-label="User account">
                  <div className="header-popover-identity">
                    <span className="header-popover-avatar">{accountUser?.initials || 'S'}</span>
                    <span>
                      <strong>{demoSignedIn ? accountUser?.name || 'Welcome to Situla' : "Welcome to Situla"}</strong>
                      <small>{demoSignedIn ? accountUser?.email || 'Sign in to access your account' : "Sign in to access your account"}</small>
                    </span>
                    {demoSignedIn && accountUser?.planId === "premium" && <BadgeCheck size={16} aria-label="Verified Premium member" />}
                  </div>
                  <div className="header-popover-divider" />
                  {demoSignedIn ? (
                    <>
                      <button type="button" className="header-popover-action" role="menuitem" onClick={() => { setAccountOpen(false); router.push("/profile"); }}>
                        <UserRound size={16} /> <span>Visit profile</span> <ArrowUpRight size={14} />
                      </button>
                      {accountUser?.role === "admin" && (
                        <button type="button" className="header-popover-action" role="menuitem" onClick={() => { setAccountOpen(false); router.push("/admin"); }}>
                          <ShieldCheck size={16} /> <span>Admin dashboard</span> <ArrowUpRight size={14} />
                        </button>
                      )}
                      <button type="button" className="header-popover-action is-danger" role="menuitem" onClick={async () => {
                        await fetch("/api/auth/logout", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "same-origin",
                          body: "{}"
                        }).catch(() => null);
                        setAccountUser(null);
                        setAccountOpen(false);
                        window.dispatchEvent(new Event("situla:auth-change"));
                        router.push("/login");
                      }}>
                        <LogOut size={16} /> <span>Log out</span>
                      </button>
                    </>
                  ) : (
                    <button type="button" className="header-popover-action" role="menuitem" onClick={() => { setAccountOpen(false); router.push("/login"); }}>
                      <LogOut size={16} /> <span>Sign in</span> <ArrowUpRight size={14} />
                    </button>
                  )}
                  <p className="header-popover-demo-note">{demoSignedIn ? "Server-verified account session" : "Guest access · Sign in for a personal account"}</p>
                </div>
              )}
            </div>
            <AnnouncementCenter onOpen={() => setAccountOpen(false)} />

          </div>
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
                <span>SMART CATALOG SEARCH</span>
                <h2 id="search-dialog-title">Find your next watch</h2>
                <p>Movies, TV series and Anime · sorted by release date</p>
              </div>
              <button type="button" className="search-dialog-close" onClick={() => setSearchOpen(false)} aria-label="Close search">
                <BootstrapIcon icon="x-lg" size={19} />
              </button>
            </div>
            <label className="search-dialog-input">
              <BootstrapIcon icon="search" size={18} />
              <input
                autoFocus
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                }}
                placeholder="Search & Title"
                aria-label="Search catalogue by title"
              />
              {searchInput && (
                <button type="button" onClick={() => { setSearchInput(""); setSuggestions([]); setSearchError(""); }} aria-label="Clear search">
                  <BootstrapIcon icon="x-lg" size={16} />
                </button>
              )}
            </label>
            <div className="search-filter-row">
              <div className="search-type-filters" role="group" aria-label="Filter by media type">
                {[
                  { value: "all", label: "All" },
                  { value: "movie", label: "Movies" },
                  { value: "tv", label: "TV series" },
                  { value: "anime", label: "Anime" }
                ].map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={"search-type-button" + (searchType === filter.value ? " active" : "")}
                    aria-pressed={searchType === filter.value}
                    onClick={() => setSearchType(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <label className="search-year-filter">
                <span>Release year</span>
                <select value={searchYear} onChange={(event) => setSearchYear(event.target.value)} aria-label="Filter by release year">
                  <option value="all">All years</option>
                  {Array.from({ length: Math.max(0, new Date().getFullYear() - 1869) }, (_, index) => new Date().getFullYear() - index)
                    .map((year) => <option key={year} value={String(year)}>{year}</option>)}
                </select>
              </label>
            </div>

            {searchInput.trim().length > 0 && searchInput.trim().length < 3 ? (
              <div className="suggestion-empty">Enter at least 3 characters to start smart search.</div>
            ) : !searchInput.trim() && searchType === "all" && searchYear === "all" ? (
              <div className="suggestion-empty">Type 3 or more characters, or choose a catalog or release year to browse the newest titles.</div>
            ) : suggestionsLoading ? (
              <div className="suggestion-loading"><span className="suggestion-spinner" /> Searching the catalog…</div>
            ) : searchError && !suggestions.length ? (
              <div className="suggestion-empty" role="alert">{searchError}</div>
            ) : suggestions.length ? (
              <>
                <div className="search-results-caption">
                  {suggestions.length} results shown · {searchType === "all" ? "All catalogs" : searchType === "tv" ? "TV series" : searchType === "anime" ? "Anime" : "Movies"}
                  {searchYear !== "all" ? " · " + searchYear : ""}
                  {searchInput.trim().length >= 3 ? " · Smart relevance + newest first" : " · Newest first"}
                </div>
                <div className="search-results-list" role="listbox" aria-label="Search results">
                  {suggestions.map((item) => {
                    const identity = item.mediaType === "tv" ? item.tmdbId : item.mediaType === "anime" ? item.malId : item.imdbId;
                    const date = item.releaseDate || item.firstAirDate || item.airedFrom || (item.releaseYear ? String(item.releaseYear) : "Release date unavailable");
                    return (
                      <button
                        key={item.mediaType + ":" + identity}
                        type="button"
                        className="suggestion-item"
                        role="option"
                        aria-selected="false"
                        onClick={() => openSearchResult(item)}
                      >
                        {item.posterUrl || item.posterFallbackUrl
                          ? <img src={optimizeTmdbImageUrl(item.posterUrl || item.posterFallbackUrl, "w92")} alt="" loading="lazy" decoding="async" />
                          : <div className="suggestion-poster"><BootstrapIcon icon="film" size={17} /></div>}
                        <span className="suggestion-title">
                          <strong>{item.titleEnglish || item.title}</strong>
                          <small>{String(item.mediaType || "movie").toUpperCase()} · {date}</small>
                        </span>
                        <BootstrapIcon icon="play-fill" size={16} />
                      </button>
                    );
                  })}
                </div>
                {searchError && <div className="search-inline-error" role="status">{searchError}</div>}
                <div className="search-dialog-footer">
                  <span>{searchHasMore ? "More matches available" : "End of matching results"}</span>
                  {searchHasMore && (
                    <button type="button" className="ghost-button" onClick={loadMoreSearch} disabled={searchLoadingMore}>
                      {searchLoadingMore ? "Loading…" : "Load more"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="suggestion-empty">No matching titles found for these filters.</div>
            )}
          </section>
        </div>,
        document.body
      )}

      <div className={tab === "home" ? "home-page-layout" : "catalog-page-layout mx-auto max-w-[1600px] px-4 pt-5 md:px-8 md:pt-8 " + (tab === "tv" ? "tv-catalog-page" : tab === "anime" ? "anime-catalog-page" : "")}>


        {tab === "home" && (
          <>
            {featured ? (
              <section
                className="hero-card"
                key={featured.heroId || featured.imdbId || featured.id}
                onMouseEnter={() => setHeroPaused(true)}
                onMouseLeave={() => setHeroPaused(false)}
                onFocusCapture={() => setHeroPaused(true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setHeroPaused(false);
                }}
                aria-label={featured.heroMediaLabel + " spotlight"}
              >
                {(featured.heroImage || featured.backdropUrl || featured.bannerUrl || featured.posterUrl) && (
                  <img
                    className="hero-image"
                    src={featured.heroImage || featured.backdropUrl || featured.bannerUrl || featured.posterUrl}
                    alt=""
                    fetchPriority="high"
                    decoding="async"
                    onError={(event) => {
                      const fallback = featured.heroPoster || featured.posterUrl || featured.posterFallbackUrl;
                      if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                      else event.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <button
                  type="button"
                  className="hero-art-link"
                  aria-label={"Explore " + featured.heroTitle}
                  aria-busy={pendingHomeNavigation === (featured.mediaType === "movie" ? "movie:" + featured.imdbId : featured.mediaType + ":" + String(featured.mediaType === "tv" ? featured.tmdbId : featured.malId))}
                  disabled={Boolean(pendingHomeNavigation)}
                  onClick={() => openHomeSpotlight(featured)}
                />
                {pendingHomeNavigation && pendingHomeNavigation === (featured.mediaType === "movie" ? "movie:" + featured.imdbId : featured.mediaType + ":" + String(featured.mediaType === "tv" ? featured.tmdbId : featured.malId)) && (
                  <span className="hero-route-loading" role="status"><span className="inline-loading-spinner" /> Opening {featured.heroMediaLabel.toLowerCase()}…</span>
                )}
                <div className="hero-content">
                  <div className="hero-eyebrow"><span className="hero-live-dot" /> SITULA SPOTLIGHT · {featured.heroMediaLabel}</div>
                  <p className="hero-kicker">
                    {featured.mediaType === "movie" ? "A film for your next movie night" : featured.mediaType === "tv" ? "A series to settle into" : "A new world to discover"}
                  </p>
                  <h1 className="hero-title">{featured.heroTitle}</h1>
                  <div className="hero-meta">
                    {featured.heroYear && <span>{featured.heroYear}</span>}
                    {featured.heroRating > 0 && <span className="hero-rating"><Icon name="star" size={13} /> {Number(featured.heroRating).toFixed(1)}</span>}
                    {featured.heroRuntime > 0 && <span>{formatRuntime(featured.heroRuntime)}</span>}
                    {featured.heroEpisodes > 0 && <span>{featured.heroEpisodes} episodes</span>}
                    {featured.heroGenres?.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
                  </div>
                  <p className="hero-description">{featured.heroOverview || "Discover a new favourite on Situla."}</p>
                  <div className="hero-actions">
                    <button
                      className="gold-button"
                      onClick={() => openHomeSpotlight(featured)}
                      disabled={Boolean(pendingHomeNavigation)}
                      aria-busy={Boolean(pendingHomeNavigation)}
                    >
                      {pendingHomeNavigation ? <span className="inline-loading-spinner" /> : <Icon name="play" size={17} />}
                      {pendingHomeNavigation ? "Opening…" : featured.mediaType === "movie" ? "Watch now" : featured.mediaType === "tv" ? "Explore TV series" : "Explore anime"}
                    </button>
                    {featured.mediaType === "movie" && (
                      <button className="ghost-button" onClick={() => toggleSaved(featured)}>
                        <Icon name={savedIds.has(savedMediaKey(featured, "movie")) ? "check" : "bookmark"} size={16} />
                        {savedIds.has(savedMediaKey(featured, "movie")) ? "In my list" : "Add to my list"}
                      </button>
                    )}
                  </div>
                  {homeHeroItems.length > 1 && (
                    <div className="hero-carousel-footer">
                      <span className="hero-carousel-label">DISCOVER ANOTHER STORY</span>
                      <div className="hero-carousel-controls">
                        <button type="button" className="hero-arrow" aria-label="Previous featured title" onClick={() => setHeroIndex((current) => (current - 1 + homeHeroItems.length) % homeHeroItems.length)}><BootstrapIcon icon="arrow-left" size={16} /></button>
                        <span className="hero-progress-track" aria-hidden="true"><span className="hero-progress-fill" key={featured.heroId} style={{ animationPlayState: heroPaused ? "paused" : "running" }} /></span>
                        <button type="button" className="hero-arrow" aria-label="Next featured title" onClick={() => setHeroIndex((current) => (current + 1) % homeHeroItems.length)}><BootstrapIcon icon="arrow-right" size={16} /></button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : loading || !homeSeriesReady ? (
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
                <Link href="/movies" className="discovery-card discovery-movies" onClick={() => setPendingHomeNavigation("route:movies")} aria-busy={pendingHomeNavigation === "route:movies"}>
                  <span className="discovery-symbol"><Icon name="film" size={25} /></span>
                  <span className="discovery-copy"><strong>Movies</strong><small>Big-screen stories, anytime</small></span>
                  {pendingHomeNavigation === "route:movies" ? <span className="inline-loading-spinner" /> : <BootstrapIcon icon="arrow-up-right" size={19} />}
                </Link>
                <Link href="/tv" className="discovery-card discovery-tv" onClick={() => setPendingHomeNavigation("route:tv")} aria-busy={pendingHomeNavigation === "route:tv"}>
                  <span className="discovery-symbol"><Icon name="tv" size={25} /></span>
                  <span className="discovery-copy"><strong>TV series</strong><small>Stories that keep unfolding</small></span>
                  {pendingHomeNavigation === "route:tv" ? <span className="inline-loading-spinner" /> : <BootstrapIcon icon="arrow-up-right" size={19} />}
                </Link>
                <Link href="/anime" className="discovery-card discovery-anime" onClick={() => setPendingHomeNavigation("route:anime")} aria-busy={pendingHomeNavigation === "route:anime"}>
                  <span className="discovery-symbol"><Icon name="play" size={25} /></span>
                  <span className="discovery-copy"><strong>Anime</strong><small>Step into another world</small></span>
                  {pendingHomeNavigation === "route:anime" ? <span className="inline-loading-spinner" /> : <BootstrapIcon icon="arrow-up-right" size={19} />}
                </Link>
              </div>
            </section>

            {homeHeroItems.length > 1 && (
              <section className="spotlight-strip" aria-label="Choose a featured title">
                <div className="spotlight-strip-heading">
                  <span>NOW IN THE SPOTLIGHT</span>
                  <p>More stories to discover</p>
                </div>
                <div className="spotlight-strip-track">
                  {homeHeroItems.slice(0, 8).map((item, index) => (
                    <button
                      key={item.heroId}
                      type="button"
                      className={"spotlight-chip" + (index === heroIndex ? " active" : "")}
                      onClick={() => setHeroIndex(index)}
                      aria-pressed={index === heroIndex}
                      aria-label={"Show " + item.heroTitle + ", " + item.heroMediaLabel}
                    >
                      <span className="spotlight-chip-art">
                        {item.heroPoster
                          ? <img src={optimizeTmdbImageUrl(item.heroPoster, "w92")} alt="" loading="lazy" decoding="async" />
                          : <Icon name={item.mediaType === "tv" ? "tv" : item.mediaType === "anime" ? "play" : "film"} size={17} />}
                      </span>
                      <span className="spotlight-chip-title">{item.heroTitle}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {!homeSeriesReady ? (
              <>
                <SkeletonShelf title="Popular series" />
                <SkeletonShelf title="Favorite series" />
                <SkeletonShelf title="Top TV series" />
                <SkeletonShelf title="Top anime series" />
              </>
            ) : (
              <>
                <MixedSeriesShelf title="Popular series" eyebrow="MOST DISCOVERED" items={popularSeriesItems} onOpen={openHomeSeries} onSave={toggleSaved} savedIds={savedIds} pendingNavigation={pendingHomeNavigation} onPreload={prefetchHomeSeries} />
                <MixedSeriesShelf title="Favorite series" eyebrow="TOP-RATED PICKS" items={favoriteSeriesItems} onOpen={openHomeSeries} onSave={toggleSaved} savedIds={savedIds} pendingNavigation={pendingHomeNavigation} onPreload={prefetchHomeSeries} />
                <SeriesShelf title={premiumCatalog ? "Latest TV series" : "Top TV series"} eyebrow={premiumCatalog ? "NEWEST BY FIRST AIR DATE" : "POPULAR TELEVISION"} items={topTvShows} kind="tv" onOpen={openHomeTvSeries} onSave={toggleSaved} savedIds={savedIds} pendingNavigation={pendingHomeNavigation} onPreload={prefetchHomeSeries} />
                <SeriesShelf title={premiumCatalog ? "Latest anime series" : "Top anime series"} eyebrow={premiumCatalog ? "NEWEST BY AIR DATE" : "TOP-RANKED ANIME"} items={topAnimeShows} kind="anime" onOpen={openHomeAnimeSeries} onSave={toggleSaved} savedIds={savedIds} pendingNavigation={pendingHomeNavigation} onPreload={prefetchHomeSeries} />
              </>
            )}

            {allGenres.length > 1 && (
              <div className="mt-7 flex gap-2 overflow-x-auto pb-1">
                {allGenres.map((item) => (
                  <button key={item} onClick={() => setGenre(item)} className={"genre-chip" + (genre === item ? " active" : "")}>{item}</button>
                ))}
              </div>
            )}

            {genre === "All" ? (
              <>
                <MovieShelf title="Movies to discover" eyebrow="FRESH PICKS FROM THE CATALOG" movies={movies} onOpen={openHomeMovie} onSave={toggleSaved} savedIds={savedIds} pendingNavigation={pendingHomeNavigation} onPreload={prefetchHomeMovie} />
                {categoryShelves.map((category) => (
                  <MovieShelf key={category.key} title={category.name} eyebrow="EXPLORE BY GENRE" movies={category.items} onOpen={openHomeMovie} onSave={toggleSaved} savedIds={savedIds} pendingNavigation={pendingHomeNavigation} onPreload={prefetchHomeMovie} />
                ))}
              </>
            ) : (
              <MovieShelf title={genre + " movies"} eyebrow="DATABASE GENRE RESULTS" movies={filteredMovies} onOpen={openMovie} onSave={toggleSaved} savedIds={savedIds} />
            )}
            {loading && movies.length > 0 && <p className="mt-5 text-center text-xs text-[#858b9b]">Refreshing catalog…</p>}
            {error && movies.length === 0 && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
            {error && movies.length > 0 && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
            {hasMoreMovies && !loading && <div className="mt-7 flex justify-center"><button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more movies"} <BootstrapIcon icon="arrow-right" size={16} /></button></div>}
          </>
        )}


        {tab === "movies" && (
          <section className="pb-8">
            <div className="section-heading">
              <div><span>EXPLORE THE CATALOG</span><h1 className="mt-1 text-2xl font-black">Movies</h1></div>
            </div>
            {catalogSpotlight && <CatalogSpotlight item={catalogSpotlight} kind="movie" onWatch={openMovie} onSave={toggleSaved} saved={savedIds.has(savedMediaKey(catalogSpotlight, "movie"))} />}
            {loading && !movies.length ? (
              <SkeletonGrid count={12} />
            ) : movies.length ? (
              <>
                <div className="catalog-grid">
                  {movies.map((movie) => <MovieCard key={movie.imdbId} movie={movie} onOpen={openMovie} onSave={toggleSaved} saved={savedIds.has(savedMediaKey(movie, "movie"))} />)}
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
                  {tvShows.map((item) => <SeriesCard key={item.tmdbId} item={item} kind="tv" onOpen={openTvSeries} onSave={toggleSaved} saved={savedIds.has(savedMediaKey(item, "tv"))} />)}
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
                  {animeShows.map((item) => <SeriesCard key={item.malId} item={item} kind="anime" onOpen={openAnimeSeries} onSave={toggleSaved} saved={savedIds.has(savedMediaKey(item, "anime"))} />)}
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
                  ? <MovieCard key={item.imdbId} movie={item} onOpen={openMovie} onSave={toggleSaved} saved={savedIds.has(savedMediaKey(item, "movie"))} />
                  : <SeriesCard key={item.mediaType === "tv" ? item.tmdbId : item.malId} item={item} kind={item.mediaType} onOpen={item.mediaType === "tv" ? openTvSeries : openAnimeSeries} onSave={toggleSaved} saved={savedIds.has(savedMediaKey(item, item.mediaType))} />
                )}
              </div>
            ) : (
              <div className="empty-panel"><Icon name="search" size={30} /><p className="mt-3 font-bold text-white">{query.trim().length >= 3 ? "No matching titles found" : "Search the full catalog"}</p><p className="mt-2 text-xs">{query.trim().length > 0 && query.trim().length < 3 ? "Enter at least 3 characters to search." : query.trim() ? "Try another title or a different spelling." : "Search movies, TV series and anime together."}</p></div>
            )}
          </section>
        )}

        {tab === "saved" && (
          <section className="pb-8">
            <div className="section-heading"><div><span>YOUR COLLECTION</span><h1 className="mt-1 text-2xl font-black">My List</h1></div></div>
            {savedMovies.length ? (
              <div className="catalog-grid">
                {savedMovies.map((item) => {
                  const kind = savedMediaType(item);
                  const key = savedMediaKey(item);
                  return kind === "movie"
                    ? <MovieCard key={key} movie={item} onOpen={openMovie} onSave={toggleSaved} saved={savedIds.has(key)} />
                    : <SeriesCard key={key} item={item} kind={kind} onOpen={kind === "tv" ? openTvSeries : openAnimeSeries} onSave={toggleSaved} saved={savedIds.has(key)} />;
                })}
              </div>
            ) : (
              <div className="empty-panel"><Icon name="saved" size={30} /><p className="mt-3 font-bold text-white">Your list is empty</p><p className="mt-2 text-xs">Tap the bookmark on any movie, TV series, or anime to save it here.</p><button className="gold-button mt-5" onClick={() => router.push("/movies")}>Explore movies <Icon name="arrow" size={15} /></button></div>
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
                              const mediaType = String(item.mediaType || "movie").toLowerCase();
                              const typeLabel = mediaType === "tv" ? "TV SERIES" : mediaType === "anime" ? "ANIME" : "MOVIE";
                              const duration = Math.max(0, Number(item.duration) || 0);
                              const watched = Math.min(duration || Number(item.watched) || 0, Math.max(0, Number(item.watched) || 0));
                              const remaining = Math.max(0, duration - watched);
                              const progress = duration > 0 ? Math.max(0, Math.min(100, (watched / duration) * 100)) : 0;
                              const episodeLabel = mediaType === "tv"
                                ? "Season " + String(Number(item.season) || 0).padStart(2, "0") + " · Episode " + item.episode
                                : mediaType === "anime"
                                  ? "Episode " + item.episode + " · " + String(item.audio || "sub").toUpperCase()
                                  : "Feature film";
                              return (
                                <article key={item.key} className="history-row">
                                  <button
                                    type="button"
                                    className="history-resume"
                                    onClick={() => resumeHistoryItem(item)}
                                    aria-label={"Continue watching " + (item.title || "this title") + " from " + formatClock(watched)}
                                  >
                                    <span className="history-thumb">
                                      {item.posterUrl ? <img src={optimizeTmdbImageUrl(item.posterUrl, "w92")} alt="" loading="lazy" /> : <span className="history-poster"><BootstrapIcon icon="film" size={20} /></span>}
                                      <span className="history-type-chip">{typeLabel}</span>
                                    </span>
                                    <span className="history-item-copy">
                                      <span className="history-item-heading">
                                        <span className="history-title">{item.title || "Untitled"}</span>
                                        <span className="history-updated">{formatHistoryDate(item.updatedAt)}</span>
                                      </span>
                                      <span className="history-meta">{episodeLabel}</span>
                                      <span className="history-progress-heading">
                                        <span>WATCHED PROGRESS</span>
                                        <strong>{duration > 0 ? Math.round(progress) + "%" : "—"}</strong>
                                      </span>
                                      <Progress value={progress} ariaLabel={"Watched progress for " + (item.title || "this title")} className="history-progress" indicatorClassName="history-progress-indicator" />
                                      <span className="history-time-labels">
                                        <span><strong>{formatClock(watched)}</strong> watched</span>
                                        <span><strong>{formatClock(duration)}</strong> total</span>
                                      </span>
                                      <span className="history-resume-action"><BootstrapIcon icon="play-fill" size={11} /> Continue watching <span>·</span> {duration > 0 ? formatClock(remaining) + " left" : "Progress unavailable"}</span>
                                    </span>
                                  </button>
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
              <div className="about-situla-card rounded-2xl border border-white/10 bg-[#11131b] p-5">
                <h2 className="font-bold">About Situla</h2>
                <p className="mt-2 text-xs leading-5 text-[#9297a7]">Movie IDs: IMDb · TV Series IDs: TMDB · Anime IDs: MyAnimeList (MAL).</p>
                <div className="about-provider-list">
                  <span>Identifier providers</span>
                  <a href="https://www.imdb.com/" target="_blank" rel="noreferrer">IMDb</a>
                  <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a>
                  <a href="https://myanimelist.net/" target="_blank" rel="noreferrer">MyAnimeList</a>
                </div>
                <p className="mt-3 text-[10px] leading-5 text-[#73798a]">Powered by the <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer" className="text-[#e8b65b] underline underline-offset-4">TMDB API</a>. This product is not endorsed or certified by TMDB. Anime identifiers are provided by MyAnimeList; movie identifiers use IMDb title IDs.</p>
                <div className="premium-coming-soon">
                  <span className="premium-kicker">PREMIUM</span>
                  <strong>Premium Feature</strong>
                  <em className="premium-status">COMING SOON</em>
                </div>
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
        {NAV_ITEMS.filter((item) => item.id !== "search").map((item) => (
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
