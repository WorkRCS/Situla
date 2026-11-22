"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { buildHomeCollections, homeMediaRoute, mixHomeSpotlight, toHomeSpotlight } from "../../src/home-discovery.js";
import Link from "next/link";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { Button } from "./ui/button.jsx";
import { Card, CardContent, CardHeader } from "./ui/card.jsx";
import { Badge } from "./ui/badge.jsx";
import { Progress } from "./ui/progress.jsx";
import AnnouncementCenter from "./announcement-center.jsx";
import UpcomingSection from "./upcoming-section.jsx";
import { SITE_KIDS_MOBILE_NAV_ITEMS, SITE_MOBILE_NAV_ITEMS, SiteSidebar } from "./site-sidebar.jsx";
import CartoonsCatalog, { CartoonCard } from "./cartoons-catalog.jsx";
import ThreeCardHero from "./three-card-hero.jsx";
import { createHistoryResumeTarget } from "../../src/watch-history.js";
import { optimizeTmdbImageUrl } from "../../src/media-image.js";
import { formatRuntimeDuration } from "../../src/media-time.js";
import {
  getCachedAccountUser,
  resolveAccountUserRefresh,
  setCachedAccountUser
} from "../../src/client-account-session.js";
import { normalizeSavedMediaList, savedMediaKey, savedMediaType, toggleSavedMedia } from "../../src/saved-media.js";
import { ArrowUpRight, Baby, BadgeCheck, CalendarDays, Heart, LogOut, Search, ShieldCheck, UserRound, Share2, MousePointerClick, PanelLeftOpen, PanelLeftClose, Clock3, SlidersHorizontal } from "lucide-react";
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
  kids: "balloon",
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
  return formatRuntimeDuration(minutes);
}

function getAccountInitials(user) {
  const supplied = String(user?.initials || "").trim();
  if (supplied) return Array.from(supplied).slice(0, 2).join("").toLocaleUpperCase();

  const displayName = String(
    user?.name || user?.displayName || user?.fullName || user?.email || ""
  ).trim();
  const words = displayName.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? words.slice(0, 2).map((word) => Array.from(word)[0] || "").join("")
    : Array.from(words[0] || "").slice(0, 2).join("");
  return initials.toLocaleUpperCase() || "S";
}

function searchOptionId(item) {
  if (!item) return "";
  const identity = item.mediaType === "tv" || item.mediaType === "cartoon_tv" || item.mediaType === "cartoon_movie"
    ? item.tmdbId : item.mediaType === "anime" ? item.malId : item.imdbId;
  return "search-option-" + item.mediaType + "-" + String(identity || "unknown");
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
  return homeMediaRoute(movie, "movie");
}

function seriesCardHref(item, kind) {
  return homeMediaRoute(item, kind);
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
  if (!navigator.canShare(data)) return null;
  return navigator.share(data).then(() => "Shared");
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
    onOpen?.(movie);
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

function useMediaRowPointerDrag() {
  const rowRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0, moved: false, suppressClick: false });

  function onPointerDown(event) {
    if (event.pointerType !== "mouse" || event.button !== 0 ||
        event.target?.closest?.("button, input, select, textarea, [contenteditable='true']")) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startScroll: event.currentTarget.scrollLeft,
      moved: false,
      suppressClick: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag.active) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 8) drag.moved = true;
    if (!drag.moved) return;
    event.currentTarget.scrollLeft = drag.startScroll - distance;
    event.currentTarget.classList.add("is-pointer-dragging");
    event.preventDefault();
  }

  function onPointerUp(event) {
    const drag = dragRef.current;
    if (!drag.active) return;
    drag.active = false;
    drag.suppressClick = drag.moved;
    event.currentTarget.classList.remove("is-pointer-dragging");
  }

  function onPointerCancel(event) {
    dragRef.current.active = false;
    dragRef.current.suppressClick = false;
    dragRef.current.moved = false;
    event.currentTarget.classList.remove("is-pointer-dragging");
  }

  function onClickCapture(event) {
    if (!dragRef.current.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current.suppressClick = false;
    dragRef.current.moved = false;
  }

  return { rowRef, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture };
}

const SeriesCard = memo(function SeriesCard({ item, kind, onOpen, onSave, saved = false, navigating = false, onPreload, homeRank = 0, cardClassName = "" }) {
  const [shareFeedback, setShareFeedback] = useState("");
  const [sharePreparing, setSharePreparing] = useState(false);
  const isTv = kind === "tv";
  const isAnime = kind === "anime";
  const catalogBadge = resolveCatalogBadge(item.catalogBadge);
  const title = isTv ? item.title : (item.titleEnglish || item.title);
  const year = item.releaseYear || (item.firstAirDate ? item.firstAirDate.slice(0, 4) : "");
  const rating = isTv ? item.voteAverage : item.score;
  const meta = isTv
    ? [year, item.runtime ? formatRuntime(item.runtime) + " / ep" : "TV series", item.numberOfSeasons ? item.numberOfSeasons + " seasons" : "", item.numberOfEpisodes ? item.numberOfEpisodes + " eps" : ""].filter(Boolean).join(" · ")
    : [year, item.episodes ? item.episodes + " episodes" : "Anime series"].filter(Boolean).join(" · ");
  const category = (item.genres || []).slice(0, 2).join(" · ");
  const posterUrl = item.posterUrl || item.posterFallbackUrl;
  const href = seriesCardHref(item, kind);

  function handleOpen(event) {
    if (navigating) {
      event.preventDefault();
      return;
    }
    onOpen?.(item, kind);
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
        {Number(homeRank) > 0 && <span className="home-collection-rank" aria-hidden="true">{String(homeRank).padStart(2, "0")}</span>}
        {navigating && <span className="media-loading-overlay" role="status" aria-label={"Opening " + (isTv ? "TV series" : "anime")}><span className="inline-loading-spinner" /></span>}
      </div>
      <h3 className="mt-2 truncate text-[13px] font-bold text-white">{title}</h3>
      <p className="series-card-meta">{meta}</p>
      {category && <p className="series-card-category">{category}</p>}
    </>
  );

  return (
    <article className={"movie-card series-card series-card-" + kind + (cardClassName ? " " + cardClassName : "")}>
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

function SeriesShelf({ title, eyebrow, description = "", variant = "series", items, kind, onOpen, onSave, savedIds, pendingNavigation = "", onPreload }) {
  const shelfDrag = useMediaRowPointerDrag();
  if (!items.length) return null;
  return (
    <section className={"netflix-shelf home-series-shelf home-collection-" + variant}>
      <div className="section-heading shelf-heading">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 className={eyebrow ? "mt-1" : ""}>{title}</h2>
          {description && <p className="home-collection-description">{description}</p>}
        </div>
        <Link href={kind === "tv" ? "/tv" : "/anime"} className="shelf-browse-link">
          Explore all <BootstrapIcon icon="arrow-up-right" size={14} />
        </Link>
      </div>
      <div
        ref={shelfDrag.rowRef}
        className="media-row flex gap-4 overflow-x-auto pb-3"
        onPointerDown={shelfDrag.onPointerDown}
        onPointerMove={shelfDrag.onPointerMove}
        onPointerUp={shelfDrag.onPointerUp}
        onPointerCancel={shelfDrag.onPointerCancel}
        onClickCapture={shelfDrag.onClickCapture}
      >
        {items.slice(0, 10).map((item, index) => (
          <SeriesCard
            key={kind === "tv" ? item.tmdbId : item.malId}
            item={item}
            kind={kind}
            onOpen={onOpen}
            onSave={onSave}
            saved={savedIds?.has(savedMediaKey(item, kind)) || false}
            onPreload={onPreload}
            homeRank={index + 1}
            navigating={pendingNavigation === seriesNavigationKey(item, kind)}
          />
        ))}
      </div>
    </section>
  );
}

function MixedSeriesShelf({ title, eyebrow, description = "", variant = "popular", items, onOpen, onSave, savedIds, pendingNavigation = "", onPreload }) {
  const shelfDrag = useMediaRowPointerDrag();
  if (!items.length) return null;
  return (
    <section className={"netflix-shelf home-series-shelf home-collection-" + variant}>
      <div className="section-heading shelf-heading">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 className={eyebrow ? "mt-1" : ""}>{title}</h2>
          {description && <p className="home-collection-description">{description}</p>}
        </div>
        <div className="shelf-browse-links">
          <Link href="/tv" className="shelf-browse-link">TV <BootstrapIcon icon="arrow-up-right" size={13} /></Link>
          <Link href="/anime" className="shelf-browse-link">Anime <BootstrapIcon icon="arrow-up-right" size={13} /></Link>
        </div>
      </div>
      <div
        ref={shelfDrag.rowRef}
        className="media-row flex gap-4 overflow-x-auto pb-3"
        onPointerDown={shelfDrag.onPointerDown}
        onPointerMove={shelfDrag.onPointerMove}
        onPointerUp={shelfDrag.onPointerUp}
        onPointerCancel={shelfDrag.onPointerCancel}
        onClickCapture={shelfDrag.onClickCapture}
      >
        {items.slice(0, 10).map((item, index) => {
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
              homeRank={index + 1}
              navigating={pendingNavigation === seriesNavigationKey(item, kind)}
            />
          );
        })}
      </div>
    </section>
  );
}

function MovieShelf({ title, eyebrow, description = "", variant = "movies", movies, onOpen, onSave, savedIds, pendingNavigation = "", onPreload }) {
  const shelfDrag = useMediaRowPointerDrag();
  if (!movies.length) return null;

  return (
    <section className={"netflix-shelf home-movie-shelf home-collection-" + variant}>
      <div className="section-heading shelf-heading">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 className={eyebrow ? "mt-1" : ""}>{title}</h2>
          {description && <p className="home-collection-description">{description}</p>}
        </div>
      </div>
      <div
        ref={shelfDrag.rowRef}
        className="media-row flex gap-4 overflow-x-auto pb-3"
        onPointerDown={shelfDrag.onPointerDown}
        onPointerMove={shelfDrag.onPointerMove}
        onPointerUp={shelfDrag.onPointerUp}
        onPointerCancel={shelfDrag.onPointerCancel}
        onClickCapture={shelfDrag.onClickCapture}
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

function HomeMixedShelf({ items, activeHeroId = "", onMovieOpen, onSeriesOpen, onSave, savedIds, pendingNavigation = "", onMoviePreload, onSeriesPreload }) {
  const shelfDrag = useMediaRowPointerDrag();
  const trendingItems = items.filter((item) => item.heroId !== activeHeroId);
  if (!trendingItems.length) return null;

  return (
    <section className="netflix-shelf home-mixed-shelf">
      <div className="section-heading shelf-heading">
        <div>
          <span>LIVE DATABASE · MOVIES · TV · ANIME</span>
          <h2>Explore the catalog</h2>
          <p className="home-collection-description">Current titles returned by Situla’s catalogue database, with the featured title shown above.</p>
        </div>
      </div>
      <div
        ref={shelfDrag.rowRef}
        className="media-row flex gap-4 overflow-x-auto pb-3"
        onPointerDown={shelfDrag.onPointerDown}
        onPointerMove={shelfDrag.onPointerMove}
        onPointerUp={shelfDrag.onPointerUp}
        onPointerCancel={shelfDrag.onPointerCancel}
        onClickCapture={shelfDrag.onClickCapture}
      >
        {trendingItems.map((item) => item.mediaType === "movie" ? (
          <MovieCard
            key={item.heroId}
            movie={item}
            onOpen={onMovieOpen}
            onSave={onSave}
            saved={savedIds.has(savedMediaKey(item, "movie"))}
            navigating={pendingNavigation === movieNavigationKey(item)}
            onPreload={onMoviePreload}
          />
        ) : (
          <SeriesCard
            key={item.heroId}
            item={item}
            kind={item.mediaType}
            onOpen={onSeriesOpen}
            onSave={onSave}
            saved={savedIds.has(savedMediaKey(item, item.mediaType))}
            navigating={pendingNavigation === seriesNavigationKey(item, item.mediaType)}
            onPreload={onSeriesPreload}
          />
        ))}
      </div>
    </section>
  );
}

const NAV_ITEMS = [
  { id: "home", href: "/", label: "Home", icon: "home" },
  { id: "movies", href: "/movies", label: "Movies", icon: "film" },
  { id: "tv", href: "/tv", label: "TV", icon: "tv" },
  { id: "anime", href: "/anime", label: "Anime", icon: "play" },
  { id: "upcoming", href: "/upcoming", label: "Upcoming", icon: "calendar" },
  { id: "search", href: "/search", label: "Search", icon: "search" },
  { id: "saved", href: "/saved", label: "Saved", icon: "saved" },
  { id: "settings", href: "/settings", label: "Settings", icon: "settings" }
];

const KIDS_NAV_ITEMS = [
  { id: "home", href: "/", label: "Home", icon: "home" },
  { id: "cartoonMovies", href: "/cartoons/movies", label: "Movies", icon: "film" },
  { id: "cartoonTv", href: "/cartoons/tv", label: "TV Series", icon: "tv" },
  { id: "saved", href: "/saved", label: "My List", icon: "saved" },
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
  const [searchSort, setSearchSort] = useState("relevance");
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState([]);
  const [searchYears, setSearchYears] = useState([]);
  const [searchDateRange, setSearchDateRange] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const searchRequestVersion = useRef(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountUser, setAccountUser] = useState(() => getCachedAccountUser());
  const accountSyncVersion = useRef(0);
  const [kidsMode, setKidsMode] = useState(false);
  const [kidsModeReady, setKidsModeReady] = useState(false);
  const [kidsModeBusy, setKidsModeBusy] = useState(false);
  const [kidsModeError, setKidsModeError] = useState("");
  const kidsModeRequestId = useRef(0);
  const kidsModePreferenceRef = useRef(false);
  const kidsModeIntentRef = useRef(false);
  const kidsModeSaveInFlightRef = useRef(false);
  const [upcomingHasUnread, setUpcomingHasUnread] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [homeFeedCount, setHomeFeedCount] = useState(5);
  const homeFeedSentinelRef = useRef(null);
  const catalogLoadSentinelRef = useRef(null);
  const demoSignedIn = Boolean(accountUser);
  const navigationItems = kidsMode ? KIDS_NAV_ITEMS : NAV_ITEMS;
  const kidsOnlyView = ["home", "cartoons", "cartoonMovies", "cartoonTv", "saved", "settings"].includes(tab);
  const navigationTab = (kidsMode && !kidsOnlyView) || tab === "cartoons" ? "home" : tab;

  useEffect(() => {
    const nextQuery = String(initialQuery || "").slice(0, 120);
    setQuery(nextQuery);
    setSearchInput(nextQuery);
  }, [initialQuery]);

  useEffect(() => {
    let active = true;
    async function loadKidsMode() {
      const requestId = ++kidsModeRequestId.current;
      try {
        const response = await fetch("/api/kids-mode", { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || typeof payload.enabled !== "boolean") {
          throw new Error(payload.error || "Kids Mode settings are unavailable.");
        }
        if (active && requestId === kidsModeRequestId.current) {
          const enabled = Boolean(payload.enabled);
          setKidsModeReady(true);
          if (!kidsModeSaveInFlightRef.current) {
            kidsModePreferenceRef.current = enabled;
            kidsModeIntentRef.current = enabled;
            setKidsMode(enabled);
          }
        }
      } catch {
        // Fail closed on first load so Normal content never flashes before the
        // server confirms whether the account is in Kids Mode. Focus retries.
      }
    }
    loadKidsMode();
    const refresh = () => loadKidsMode();
    window.addEventListener("focus", refresh);
    window.addEventListener("situla:auth-change", refresh);
    return () => {
      active = false;
      kidsModeRequestId.current += 1;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("situla:auth-change", refresh);
    };
  }, []);

  async function persistKidsModePreference() {
    if (kidsModeSaveInFlightRef.current) return;
    kidsModeSaveInFlightRef.current = true;
    setKidsModeBusy(true);
    try {
      while (true) {
        const requestedMode = kidsModeIntentRef.current;
        try {
          const response = await fetch("/api/kids-mode", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: requestedMode })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || typeof payload.enabled !== "boolean") {
            throw new Error(payload.error || "Kids Mode could not be updated.");
          }
          kidsModePreferenceRef.current = Boolean(payload.enabled);
          if (kidsModeIntentRef.current === kidsModePreferenceRef.current) {
            setKidsMode(kidsModePreferenceRef.current);
            break;
          }
        } catch (error) {
          // A newer tap supersedes an older failed request; persist the latest intent.
          if (kidsModeIntentRef.current !== requestedMode) continue;
          kidsModeIntentRef.current = kidsModePreferenceRef.current;
          setKidsMode(kidsModePreferenceRef.current);
          setKidsModeError(error.message || "Kids Mode could not be updated.");
          break;
        }
      }
    } finally {
      kidsModeSaveInFlightRef.current = false;
      setKidsModeBusy(false);
    }
  }

  async function changeKidsMode(enabled) {
    const nextMode = Boolean(enabled);
    kidsModeIntentRef.current = nextMode;
    setKidsModeError("");
    // Switch the page immediately; only preference persistence runs in the background.
    setKidsMode(Boolean(enabled));
    if (!kidsModeSaveInFlightRef.current) void persistKidsModePreference();
  }

  useEffect(() => {
    if (!kidsModeReady || kidsMode) return undefined;
    let active = true;
    async function refreshUpcomingStatus() {
      try {
        const response = await fetch("/api/upcoming/status", { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (active && response.ok) setUpcomingHasUnread(Boolean(payload.hasUnread));
      } catch {}
    }
    refreshUpcomingStatus();
    const interval = window.setInterval(refreshUpcomingStatus, 30_000);
    window.addEventListener("focus", refreshUpcomingStatus);
    window.addEventListener("situla:upcoming-waitlist-updated", refreshUpcomingStatus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshUpcomingStatus);
      window.removeEventListener("situla:upcoming-waitlist-updated", refreshUpcomingStatus);
    };
  }, [tab, kidsModeReady, kidsMode]);
  const [genre, setGenre] = useState("All");
  const [movies, setMovies] = useState([]);
  const [featuredMovie, setFeaturedMovie] = useState(null);
  const [heroMovies, setHeroMovies] = useState([]);
  const [homeTvShows, setHomeTvShows] = useState([]);
  const [homeAnimeShows, setHomeAnimeShows] = useState([]);
  const [homeSeriesReady, setHomeSeriesReady] = useState(false);
  const [pendingHomeNavigation, setPendingHomeNavigation] = useState("");
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaletteColors, setHeroPaletteColors] = useState([]);
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
  const [loadMoreError, setLoadMoreError] = useState("");
  const loadMoreLock = useRef(false);
  const isScrollingRef = useRef(false);

  useEffect(() => {
    let stopTimer = 0;
    const onScroll = () => {
      isScrollingRef.current = true;
      if (stopTimer) window.clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => {
        isScrollingRef.current = false;
        stopTimer = 0;
      }, 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (stopTimer) window.clearTimeout(stopTimer);
    };
  }, []);

  useEffect(() => {
    setPendingHomeNavigation("");
  }, [tab]);

  useEffect(() => {
    let active = true;
    async function syncServerAccount() {
      const requestVersion = ++accountSyncVersion.current;
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (active && requestVersion === accountSyncVersion.current) {
          const nextUser = resolveAccountUserRefresh(response, payload, getCachedAccountUser());
          setCachedAccountUser(nextUser);
          setAccountUser(nextUser);
        }
      } catch {
        // A temporary network/API failure is not proof that the member signed out.
      }
    }
    syncServerAccount();
    window.addEventListener("focus", syncServerAccount);
    window.addEventListener("situla:auth-change", syncServerAccount);
    return () => {
      active = false;
      accountSyncVersion.current += 1;
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
    try {
      const stored = JSON.parse(localStorage.getItem("situla:search-history:v1") || "[]");
      setRecentSearches(Array.isArray(stored)
        ? [...new Set(stored.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 6)
        : []);
    } catch {
      setRecentSearches([]);
    }
  }, [searchOpen]);

  useEffect(() => {
    function handleGlobalSearchShortcut(event) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || String(event.key).toLowerCase() !== "k") return;
      event.preventDefault();
      setSearchOpen(true);
    }
    window.addEventListener("keydown", handleGlobalSearchShortcut);
    return () => window.removeEventListener("keydown", handleGlobalSearchShortcut);
  }, []);

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
    if (!kidsModeReady) return;
    setSearchType("all");
    setSearchYear("all");
    setSearchSort("relevance");
    setSelectedSearchIndex(0);
    setSearchYears([]);
    setSearchDateRange(null);
    setSuggestions([]);
    setSearchHasMore(false);
    setSearchPage(1);
    setSearchError("");
    setSuggestionsLoading(false);
    setSearchLoadingMore(false);
  }, [kidsModeReady, kidsMode]);

  useEffect(() => {
    if (!kidsModeReady || !searchOpen || kidsMode) return undefined;
    const controller = new AbortController();
    async function loadNormalSearchYears() {
      try {
        const response = await fetch("/api/search/filters?type=" + encodeURIComponent(searchType), {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Search filters are unavailable.");
        if (controller.signal.aborted) return;
        const years = Array.isArray(payload.years)
          ? payload.years.map(Number).filter((year) => Number.isInteger(year))
          : [];
        setSearchYears(years);
        setSearchDateRange({
          oldestYear: payload.oldestYear ?? (years.length ? years[years.length - 1] : null),
          newestYear: payload.newestYear ?? (years.length ? years[0] : null)
        });
        setSearchYear((current) => current !== "all" && !years.includes(Number(current)) ? "all" : current);
      } catch {
        if (!controller.signal.aborted) {
          setSearchYears([]);
          setSearchDateRange(null);
        }
      }
    }
    loadNormalSearchYears();
    return () => controller.abort();
  }, [kidsModeReady, kidsMode, searchOpen, searchType]);

  useEffect(() => {
    if (!kidsModeReady || !searchOpen) return undefined;
    const requestVersion = ++searchRequestVersion.current;
    const isCurrentRequest = () => requestVersion === searchRequestVersion.current;
    const value = searchInput.trim();
    if (kidsMode) {
      if (value.length === 1) {
        setSuggestions([]);
        setSuggestionsLoading(false);
        setSearchError('');
        setSearchHasMore(false);
        setSearchPage(1);
        return undefined;
      }
      const controller = new AbortController();
      const timer = window.setTimeout(async () => {
        setSuggestionsLoading(true);
        setSearchError('');
        const params = new URLSearchParams({ page: '1', limit: '20' });
        if (value.length >= 2) params.set('q', value);
        if (searchYear !== 'all') params.set('year', searchYear);
        try {
          const response = await fetch('/api/cartoons/search?' + params.toString(), {
            cache: 'no-store', credentials: 'same-origin',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)])
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Cartoon search is unavailable.');
          if (!controller.signal.aborted && isCurrentRequest()) {
            const results = Array.isArray(payload.items) ? payload.items : [];
            setSuggestions(results.filter((item) => ['cartoon_movie', 'cartoon_tv'].includes(item?.mediaType)));
            setSearchHasMore(payload.hasMore === true);
            setSearchPage(Number(payload.pagination?.page) || 1);
            setSearchYears(Array.isArray(payload.years) ? payload.years.map(Number).filter(Number.isInteger) : []);
            setSearchDateRange(payload.dateRange || null);
          }
        } catch (error) {
          if (!controller.signal.aborted && isCurrentRequest()) {
            setSuggestions([]);
            setSearchError(error.message || 'Cartoon search is unavailable.');
            setSearchHasMore(false);
          }
        } finally {
          if (!controller.signal.aborted && isCurrentRequest()) setSuggestionsLoading(false);
        }
      }, value.length >= 2 ? 160 : 0);
      return () => {
        window.clearTimeout(timer);
        controller.abort();
        if (isCurrentRequest()) searchRequestVersion.current += 1;
      };
    }
    if (value.length > 0 && value.length < 3) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setSearchError('');
      setSearchHasMore(false);
      setSearchPage(1);
      return undefined;
    }
    const hasFilters = searchType !== 'all' || searchYear !== 'all';
    if (!value && !hasFilters) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setSearchError('');
      setSearchHasMore(false);
      setSearchPage(1);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      setSearchError('');
      const params = new URLSearchParams({ page: '1', limit: '20', type: searchType });
      if (value.length >= 3) params.set('q', value);
      if (searchYear !== 'all') params.set('year', searchYear);
      params.set('sort', searchSort);
      try {
        const response = await fetch('/api/search?' + params.toString(), {
          cache: 'no-store', credentials: 'same-origin',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)])
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Search is temporarily unavailable. Please retry.');
        if (!controller.signal.aborted && isCurrentRequest()) {
          const results = Array.isArray(payload.items) ? payload.items : [];
          setSuggestions(results.filter((item) => ['movie', 'tv', 'anime'].includes(item?.mediaType)));
          setSearchHasMore(payload.hasMore === true);
          setSearchPage(Number(payload.page) || 1);
        }
      } catch {
        if (!controller.signal.aborted && isCurrentRequest()) {
          setSuggestions([]);
          setSearchError('Search could not load right now. Check your connection and try again.');
          setSearchHasMore(false);
        }
      } finally {
        if (!controller.signal.aborted && isCurrentRequest()) setSuggestionsLoading(false);
      }
    }, value.length >= 3 ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (isCurrentRequest()) searchRequestVersion.current += 1;
    };
  }, [searchInput, searchOpen, searchType, searchYear, searchSort, kidsModeReady, kidsMode]);
  useEffect(() => {
    if (!kidsModeReady || kidsMode) { setLoading(false); return undefined; }
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
          if (tab !== "movies") {
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
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, tab === "search" && query.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tab, genre, kidsModeReady, kidsMode]);

  useEffect(() => {
    if (!kidsModeReady || kidsMode || tab !== "home") return undefined;
    const controller = new AbortController();

    async function loadSeries(mediaType) {
      const params = new URLSearchParams({ page: "1", limit: "60" });
      const endpoint = (mediaType === "tv" ? "/api/tv?" : "/api/anime?") + params.toString();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Series picks are unavailable.");
      return Array.isArray(payload.items) ? payload.items : [];
    }

    Promise.allSettled([
      loadSeries("tv"),
      loadSeries("anime")
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
  }, [tab, kidsModeReady, kidsMode]);

  const homeBrowseItems = useMemo(
    () => mixHomeSpotlight({
      movies: heroMovies,
      tv: homeTvShows.map((item) => toHomeSpotlight(item, "tv")).filter(Boolean),
      anime: homeAnimeShows.map((item) => toHomeSpotlight(item, "anime")).filter(Boolean)
    }),
    [heroMovies, homeTvShows, homeAnimeShows]
  );
  const homeHeroItems = useMemo(() => homeBrowseItems.slice(0, 20), [homeBrowseItems]);

  useEffect(() => {
    setHomeFeedCount(5);
  }, [homeBrowseItems]);

  const premiumCatalog = accountUser?.planId === "premium";
  const homeCollections = useMemo(() => buildHomeCollections({
    spotlightItems: homeHeroItems,
    movies,
    tv: homeTvShows,
    anime: homeAnimeShows,
    categories: categoryShelves
  }, { premiumCatalog }), [
    homeHeroItems, movies, homeTvShows, homeAnimeShows, categoryShelves, premiumCatalog
  ]);
  const {
    popularSeriesItems,
    favoriteSeriesItems,
    topTvShows,
    topAnimeShows,
    movieItems: homeMovieItems,
    categoryShelves: homeCategoryShelves
  } = homeCollections;

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
          setTvPage(Number(payload.pagination?.page) || 1);
          setTvTotal(Number(payload.pagination?.total) || items.length);
        } else {
          setAnimeShows(items);
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

  const allGenres = useMemo(() => ["All", ...homeCategoryShelves.map((item) => item.name)], [homeCategoryShelves]);

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
    const requestVersion = searchRequestVersion.current;
    const requestKidsMode = kidsMode;
    const nextPage = searchPage + 1;
    const value = searchInput.trim();
    const params = new URLSearchParams({ page: String(nextPage), limit: '20' });
    if (requestKidsMode) {
      if (value.length >= 2) params.set('q', value);
      if (searchYear !== 'all') params.set('year', searchYear);
    } else {
      params.set('type', searchType);
      params.set('sort', searchSort);
      if (value.length >= 3) params.set('q', value);
      if (searchYear !== 'all') params.set('year', searchYear);
    }
    setSearchLoadingMore(true);
    setSearchError('');
    try {
      const response = await fetch((requestKidsMode ? '/api/cartoons/search?' : '/api/search?') + params.toString(), {
        cache: 'no-store', credentials: 'same-origin',
        signal: AbortSignal.timeout(20_000)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'More search results are unavailable.');
      if (requestVersion !== searchRequestVersion.current) return;
      const returnedItems = Array.isArray(payload.items) ? payload.items : [];
      const nextItems = returnedItems.filter((item) => requestKidsMode
        ? ['cartoon_movie', 'cartoon_tv'].includes(item?.mediaType)
        : ['movie', 'tv', 'anime'].includes(item?.mediaType));
      setSuggestions((current) => {
        const identity = (item) => item.mediaType === 'tv' || item.mediaType === 'cartoon_tv' || item.mediaType === 'cartoon_movie'
          ? item.tmdbId : item.mediaType === 'anime' ? item.malId : item.imdbId;
        const ids = new Set(current.map((item) => item.mediaType + ':' + String(identity(item))));
        return [...current, ...nextItems.filter((item) => {
          const id = item.mediaType + ':' + String(identity(item));
          if (ids.has(id)) return false;
          ids.add(id);
          return true;
        })];
      });
      setSearchPage(Number(payload.pagination?.page || payload.page) || nextPage);
      setSearchHasMore(payload.hasMore === true || Number(payload.pagination?.page) < Number(payload.pagination?.totalPages));
      if (requestKidsMode) {
        setSearchYears(Array.isArray(payload.years) ? payload.years.map(Number).filter(Number.isInteger) : searchYears);
        setSearchDateRange(payload.dateRange || searchDateRange);
      }
    } catch {
      if (requestVersion === searchRequestVersion.current) {
        setSearchError('More results could not load. Your current results are still available.');
      }
    } finally {
      if (requestVersion === searchRequestVersion.current) setSearchLoadingMore(false);
    }
  }

  function openSearchResult(item) {
    if (!((kidsMode && ['cartoon_movie', 'cartoon_tv'].includes(item?.mediaType)) ||
        (!kidsMode && ['movie', 'tv', 'anime'].includes(item?.mediaType)))) {
      setSearchError(kidsMode
        ? 'Only approved cartoon movies and TV series can be opened in Kids Mode.'
        : 'This title does not belong to the current search catalogue.');
      return;
    }
    const recentTerm = searchInput.trim();
    if (!kidsMode && recentTerm.length >= 3) {
      const nextRecent = [recentTerm, ...recentSearches.filter((term) => term.toLocaleLowerCase() !== recentTerm.toLocaleLowerCase())].slice(0, 6);
      setRecentSearches(nextRecent);
      try { localStorage.setItem("situla:search-history:v1", JSON.stringify(nextRecent)); } catch {}
    }
    setSearchOpen(false);
    if (item.mediaType === 'cartoon_movie') {
      const tmdbId = Number(item.tmdbId);
      if (Number.isSafeInteger(tmdbId) && tmdbId > 0) router.push('/cartoons/watch/movie/' + tmdbId);
      else setSearchError('This cartoon movie has an invalid TMDB ID.');
      return;
    }
    if (item.mediaType === 'cartoon_tv') {
      const tmdbId = Number(item.tmdbId);
      if (Number.isSafeInteger(tmdbId) && tmdbId > 0) router.push('/cartoons/tv/' + tmdbId);
      else setSearchError('This cartoon series has an invalid TMDB ID.');
      return;
    }
    if (item.mediaType === 'tv') return openTvSeries(item);
    if (item.mediaType === 'anime') return openAnimeSeries(item);
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
  const isCartoonSaved = useCallback((item, mediaType) => (
    savedIds.has(savedMediaKey(item, mediaType))
  ), [savedIds]);
  const prepareCartoonSharePoster = useCallback((item) => {
    if (item?.posterUrl) void prepareSharePosterBlob(item.posterUrl).catch(() => {});
  }, []);
  const shareCartoon = useCallback(async (item, mediaType) => {
    const isMovie = mediaType === "cartoon_movie";
    const href = isMovie
      ? "/cartoons/watch/movie/" + encodeURIComponent(item?.tmdbId)
      : "/cartoons/tv/" + encodeURIComponent(item?.tmdbId);
    if (!item?.tmdbId) return "Cartoon link unavailable.";
    const title = item.title || (isMovie ? "Cartoon movie" : "Cartoon TV series");
    const url = new URL(href, window.location.origin).toString();
    const posterUrl = item.posterUrl || "";
    if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || typeof File !== "function") {
      return copyContentUrl(url);
    }
    if (!posterUrl) return "Poster unavailable for sharing.";
    if (!sharePosterBlobs.has(String(posterUrl))) {
      try {
        await prepareSharePosterBlob(posterUrl);
        return "Poster ready — tap Share again";
      } catch {
        return "Poster unavailable for sharing.";
      }
    }
    try {
      const shareTask = shareMediaCard({ title, href, posterUrl });
      if (!shareTask) return copyContentUrl(url);
      await shareTask;
      return "Shared";
    } catch (shareError) {
      if (shareError?.name === "AbortError") return "";
      return "Poster ready — tap Share again";
    }
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
    if (!movieCardHref(movie)) return openMovie(movie, options);
    setPendingHomeNavigation(movieNavigationKey(movie));
    return openMovie(movie, options);
  }, [openMovie]);

  const openHomeSeries = useCallback((series, kind, options) => {
    if (!seriesCardHref(series, kind)) {
      return kind === "tv" ? openTvSeries(series, options) : openAnimeSeries(series, options);
    }
    setPendingHomeNavigation(seriesNavigationKey(series, kind));
    return kind === "tv" ? openTvSeries(series, options) : openAnimeSeries(series, options);
  }, [openTvSeries, openAnimeSeries]);

  const openHomeTvSeries = useCallback((item, _kind, options) => openHomeSeries(item, "tv", options), [openHomeSeries]);
  const openHomeAnimeSeries = useCallback((item, _kind, options) => openHomeSeries(item, "anime", options), [openHomeSeries]);


  async function loadMore() {
    if (loadMoreLock.current) return;
    loadMoreLock.current = true;
    setLoadMoreError("");
    setLoadingMore(true);
    try {
      if (tab === "home" || tab === "movies" || tab === "search") {
        const nextPage = moviesPage + 1;
        const params = new URLSearchParams({ page: String(nextPage), limit: "5" });
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
        if (!nextItems.length) throw new Error("No additional movies were returned. Please try again.");
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
          limit: "5",
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
        if (!nextItems.length) throw new Error("No additional TV series were returned. Please try again.");
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
        if (!nextItems.length) throw new Error("No additional Anime titles were returned. Please try again.");
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
    } catch (loadError) {
      const hasExistingItems = tab === "tv" ? tvShows.length > 0
        : tab === "anime" ? animeShows.length > 0
          : tab === "search" ? searchResults.length > 0
            : movies.length > 0;
      const mediaLabel = tab === "tv" ? "TV series" : tab === "anime" ? "Anime" : "movies";
      const statusMessage = loadError?.name === "TimeoutError"
        ? "The request timed out. Your current titles are still available; try loading more again."
        : "Could not load more " + mediaLabel + ". Your current titles are still available; please try again.";
      setLoadMoreError(statusMessage);
      if (!hasExistingItems) setError(statusMessage);
    } finally {
      loadMoreLock.current = false;
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const sentinel = homeFeedSentinelRef.current;
    if (tab !== "home" || kidsMode || !kidsModeReady || !sentinel || homeFeedCount >= homeBrowseItems.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setHomeFeedCount((current) => Math.min(homeBrowseItems.length, current + 5));
      }
    }, { rootMargin: "750px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, kidsMode, kidsModeReady, homeFeedCount, homeBrowseItems.length]);

  useEffect(() => {
    const canLoadMore = tab === "tv" ? hasMoreTv
      : tab === "anime" ? hasMoreAnime
        : (tab === "home" || tab === "movies") ? hasMoreMovies : false;
    const sentinel = catalogLoadSentinelRef.current;
    if (!sentinel || !canLoadMore || loading || loadingMore || loadMoreLock.current) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !loadMoreLock.current) void loadMore();
    }, { rootMargin: "900px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, kidsModeReady, kidsMode, loading, loadingMore, moviesPage, tvPage, animePage, movies.length, tvShows.length, animeShows.length, moviesTotal, tvTotal, animeTotal]);

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

  const visibleWatchHistory = kidsMode
    ? watchHistory.filter((item) => ["cartoon_movie", "cartoon_tv"].includes(String(item.mediaType || "")))
    : watchHistory;
  const visibleSavedMovies = kidsMode
    ? savedMovies.filter((item) => ["cartoon_movie", "cartoon_tv"].includes(savedMediaType(item)))
    : savedMovies;
  const sortedHistory = [...visibleWatchHistory].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const hasMoreMovies = movies.length > 0 && movies.length < moviesTotal;
  const hasMoreTv = tvShows.length < tvTotal;
  const hasMoreAnime = animeShows.length < animeTotal;
  const featured = homeSeriesReady ? (homeHeroItems[heroIndex % Math.max(1, homeHeroItems.length)] || featuredMovie) : null;


  useEffect(() => {
    if (tab === "home" && featured) prefetchHomeSpotlight(featured);
  }, [tab, featured?.heroId]);

  return (
    <main className="app-shell">
      <header className={"app-header safe-top site-app-header" + (tab === "home" ? " home-app-header" : "")}>
        <div className="header-inner mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 md:px-8">
          <button
            type="button"
            className="site-app-sidebar-toggle"
            aria-label={sidebarCollapsed ? "Open website navigation" : "Close website navigation"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Open navigation" : "Close navigation"}
            onClick={() => window.dispatchEvent(new Event("situla:toggle-sidebar"))}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <Link href="/" className="brand-lockup" aria-label="Situla home">
            <img src="/icon.svg" alt="" className="brand-logo" width="40" height="40" />
            <span className="brand-copy min-w-0">
              <strong>SITULA</strong>
              <small>{({
                home: "DISCOVER STORIES",
                cartoons: kidsMode ? "KIDS · CARTOONS" : "CARTOON COLLECTION",
                cartoonMovies: kidsMode ? "KIDS · MOVIES" : "CARTOON MOVIES",
                cartoonTv: kidsMode ? "KIDS · TV SERIES" : "CARTOON TV SERIES",
                movies: "MOVIE COLLECTION",
                tv: "TV SERIES",
                anime: "ANIME COLLECTION",
                upcoming: "UPCOMING RELEASES",
                search: "SEARCH MOVIES",
                saved: "YOUR COLLECTION",
                settings: "APP SETTINGS"
              })[tab] || "DISCOVER MOVIES"}</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navigationItems.filter((item) => item.id !== "search").map((item) => (
              <Link key={item.id} href={item.href} className={"desktop-nav-link" + (navigationTab === item.id ? " active" : "")} aria-current={navigationTab === item.id ? "page" : undefined}>
                {item.id === "upcoming" ? <CalendarDays size={17} /> : <Icon name={item.icon} size={17} />}
                <span className="nav-label-with-dot">{item.label}{item.id === "upcoming" && upcomingHasUnread && <b className="upcoming-nav-live" aria-label="New releases waiting for your reminder">LIVE</b>}</span>
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <div className="header-search-wrap">
              <button
                type="button"
                className="header-search search-box header-search-trigger"
                onClick={() => setSearchOpen(true)}
                aria-label={kidsMode ? "Search cartoons" : "Search movies, TV series and anime"}
                aria-haspopup="dialog"
                aria-expanded={searchOpen}
              >
                <Search size={18} strokeWidth={2} aria-hidden="true" />
                <span className="header-search-label">{kidsMode ? "Search cartoons" : "Search movies, TV & anime"}</span>
              </button>
            </div>
            <div className="header-account-wrap">
              <button
                type="button"
                className="header-avatar-trigger"
                onClick={() => setAccountOpen((open) => !open)}
                aria-label="Open user account menu"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <span className="header-avatar-initials">{getAccountInitials(accountUser)}</span>
                {demoSignedIn && <span className="header-avatar-online" aria-hidden="true" />}
              </button>
              {accountOpen && (
                <div className="header-account-popover" role="menu" aria-label="User account">
                  <div className="header-popover-identity">
                    <span className="header-popover-avatar">{getAccountInitials(accountUser)}</span>
                    <span>
                      <strong>{demoSignedIn ? accountUser?.name || 'Welcome to Situla' : "Welcome to Situla"}</strong>
                      <small>{demoSignedIn ? accountUser?.email || 'Sign in to access your account' : "Sign in to access your account"}</small>
                    </span>
                    {demoSignedIn && accountUser?.planId === "premium" && <BadgeCheck size={16} aria-label="Verified Premium member" />}
                  </div>
                  <div className="header-popover-divider" />
                  <section className="header-kids-mode" aria-label="Kids Mode toggle">
                    <div className="header-kids-mode-control">
                      <div className="header-kids-mode-label-group">
                        <span className="header-kids-mode-icon" aria-hidden="true"><Baby size={19} /></span>
                        <span className="header-kids-mode-label">Kids Mode</span>
                      </div>
                      <button
                        type="button"
                        className={"header-kids-mode-switch" + (kidsMode ? " is-on" : "")}
                        role="switch"
                        aria-checked={kidsMode}
                        aria-label="Kids Mode"
                        aria-busy={kidsModeBusy}
                        disabled={!kidsModeReady}
                        onClick={() => changeKidsMode(!kidsMode)}
                      >
                        <span className="header-kids-mode-switch-track"><span /></span>
                      </button>
                    </div>
                    <span className="sr-only" role="status">{kidsModeError}</span>
                  </section>
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
                        accountSyncVersion.current += 1;
                        const response = await fetch("/api/auth/logout", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "same-origin",
                          body: "{}"
                        }).catch(() => null);
                        if (response?.ok) {
                          setCachedAccountUser(null);
                          setAccountUser(null);
                        }
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
                <span>{kidsMode ? "SITULA KIDS · APPROVED CARTOONS" : "SMART CATALOG SEARCH"}</span>
                <h2 id="search-dialog-title">{kidsMode ? "Find a cartoon" : "Find your next watch"}</h2>
                <p>{kidsMode ? "Search approved cartoon movies and TV series only." : "Search titles, original names and IMDb / TMDB / MAL IDs. Spelling variations are supported."}</p>
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
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setSelectedSearchIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchOpen(false);
                  } else if (event.key === "ArrowDown" && suggestions.length) {
                    event.preventDefault();
                    setSelectedSearchIndex((current) => Math.min(suggestions.length - 1, current + 1));
                  } else if (event.key === "ArrowUp" && suggestions.length) {
                    event.preventDefault();
                    setSelectedSearchIndex((current) => Math.max(0, current - 1));
                  } else if (event.key === "Enter" && suggestions[selectedSearchIndex]) {
                    event.preventDefault();
                    openSearchResult(suggestions[selectedSearchIndex]);
                  }
                }}
                placeholder="Search titles, original names or catalogue IDs…"
                aria-label="Search titles, original names or catalogue IDs"
                aria-activedescendant={suggestions[selectedSearchIndex] ? searchOptionId(suggestions[selectedSearchIndex]) : undefined}
              />
              {searchInput && (
                <button type="button" onClick={() => { setSearchInput(""); setSuggestions([]); setSearchError(""); setSearchHasMore(false); setSearchPage(1); setSearchLoadingMore(false); }} aria-label="Clear search">
                  <BootstrapIcon icon="x-lg" size={16} />
                </button>
              )}
            </label>
            {!kidsMode && (
              <div className="search-keyboard-hint">
                <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                <span><kbd>Enter</kbd> Open result</span>
                <span><kbd>Esc</kbd> Close</span>
                <span className="search-global-shortcut"><kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd> Search anywhere</span>
              </div>
            )}
            <div className="search-filter-row">
              {!kidsMode && (
                <div className="search-type-filters" role="group" aria-label="Filter by media type">
                  {[
                    { value: "all", label: "All" },
                    { value: "movie", label: "Movies" },
                    { value: "tv", label: "TV series" },
                    { value: "anime", label: "Anime" }
                  ].map((filter) => (
                    <button key={filter.value} type="button"
                      className={"search-type-button" + (searchType === filter.value ? " active" : "")}
                      aria-pressed={searchType === filter.value} onClick={() => setSearchType(filter.value)}>
                      {filter.label}
                    </button>
                  ))}
                </div>
              )}
              <label className="search-year-filter">
                <span>Release year</span>
                <select value={searchYear} onChange={(event) => setSearchYear(event.target.value)} aria-label={kidsMode ? "Filter cartoons by database release year" : "Filter by release year"}>
                  <option value="all">All years</option>
                  {searchYears.map((year) => <option key={year} value={String(year)}>{year}</option>)}
                  {searchYears.length === 0 && <option value="" disabled>{searchDateRange ? "No database years available" : "Loading database years…"}</option>}
                </select>
              </label>
              {!kidsMode && (
                <label className="search-sort-filter">
                  <span><SlidersHorizontal size={12} /> Sort results</span>
                  <select value={searchSort} onChange={(event) => { setSearchSort(event.target.value); setSelectedSearchIndex(0); }} aria-label="Sort search results">
                    <option value="relevance">Best match</option>
                    <option value="newest">Newest first</option>
                    <option value="popular">Most popular</option>
                    <option value="rating">Highest rated</option>
                  </select>
                </label>
              )}
            </div>
            {searchDateRange && (
              <p className="search-results-caption" aria-label={kidsMode ? "Cartoon catalogue release date range" : "Catalogue release year range"}>
                {kidsMode ? "Database dates:" : "Database years:"} {kidsMode
                  ? (searchDateRange.oldestDate || searchDateRange.oldestYear || "—") + " – " + (searchDateRange.newestDate || searchDateRange.newestYear || "—")
                  : (searchDateRange.oldestYear || "—") + " – " + (searchDateRange.newestYear || "—")}
              </p>
            )}

            {searchInput.trim().length > 0 && searchInput.trim().length < (kidsMode ? 2 : 3) ? (
              <div className="suggestion-empty">{kidsMode ? "Enter at least 2 characters to search cartoons." : "Enter at least 3 characters to start smart search."}</div>
            ) : !kidsMode && !searchInput.trim() && searchType === "all" && searchYear === "all" ? (
              <div className="search-idle-state">
                <div className="search-idle-intro">
                  <span className="search-idle-icon"><Search size={18} /></span>
                  <span><strong>What would you like to watch?</strong><small>Search by title, original title, or a catalogue ID. Minor spelling mistakes are okay.</small></span>
                </div>
                {recentSearches.length > 0 ? (
                  <div className="search-recent-section">
                    <div className="search-recent-heading">
                      <span><Clock3 size={13} /> Recent searches</span>
                      <button type="button" onClick={() => {
                        setRecentSearches([]);
                        try { localStorage.removeItem("situla:search-history:v1"); } catch {}
                      }}>Clear history</button>
                    </div>
                    <div className="search-recent-list">
                      {recentSearches.map((term) => (
                        <button key={term} type="button" className="search-recent-chip" onClick={() => {
                          setSearchInput(term);
                          setSearchType("all");
                          setSearchYear("all");
                          setSearchSort("relevance");
                        }}>{term}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="search-idle-tip">Try a title like “Interstellar”, an original title, or paste an IMDb / TMDB / MAL ID.</p>
                )}
              </div>
            ) : suggestionsLoading ? (
              <div className="suggestion-loading"><span className="suggestion-spinner" /> Searching the catalog…</div>
            ) : searchError && !suggestions.length ? (
              <div className="suggestion-empty" role="alert">{searchError}</div>
            ) : suggestions.length ? (
              <>
                <div className="search-results-caption">
                  {suggestions.length} results shown · {kidsMode ? "Approved cartoons" : searchType === "all" ? "All catalogs" : searchType === "tv" ? "TV series" : searchType === "anime" ? "Anime" : "Movies"}
                  {searchYear !== "all" ? " · " + searchYear : ""}
                  {kidsMode ? " · Database release dates" : " · " + ({ relevance: "Best match", newest: "Newest first", popular: "Most popular", rating: "Highest rated" }[searchSort] || "Best match")}
                </div>
                <div className="search-results-list" role="listbox" aria-label="Search results">
                  {suggestions.map((item, index) => {
                    const identity = item.mediaType === "tv" || item.mediaType === "cartoon_tv" || item.mediaType === "cartoon_movie"
                      ? item.tmdbId : item.mediaType === "anime" ? item.malId : item.imdbId;
                    const date = item.releaseDate || item.firstAirDate || item.airedFrom || (item.releaseYear ? String(item.releaseYear) : "Release date unavailable");
                    const mediaLabel = item.mediaType === "cartoon_movie" ? "CARTOON MOVIE" : item.mediaType === "cartoon_tv" ? "CARTOON SERIES" : String(item.mediaType || "movie").toUpperCase();
                    return (
                      <button
                        key={item.mediaType + ":" + identity}
                        type="button"
                        id={searchOptionId(item)}
                        className={"suggestion-item" + (selectedSearchIndex === index ? " is-active" : "")}
                        role="option"
                        aria-selected={selectedSearchIndex === index}
                        onClick={() => openSearchResult(item)}
                      >
                        {item.posterUrl || item.posterFallbackUrl
                          ? <img src={optimizeTmdbImageUrl(item.posterUrl || item.posterFallbackUrl, "w92")} alt="" loading="lazy" decoding="async" />
                          : <div className="suggestion-poster"><BootstrapIcon icon="film" size={17} /></div>}
                        <span className="suggestion-title">
                          <strong>{item.titleEnglish || item.title}</strong>
                          <small>{mediaLabel} · {date}</small>
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

      <div className={(tab === "home" ? "home-page-layout" : "app-view-layout catalog-page-layout mx-auto max-w-[1600px] px-4 pt-5 md:px-8 md:pt-8 " + (tab === "movies" ? "movies-catalog-page" : tab === "tv" ? "tv-catalog-page" : tab === "anime" ? "anime-catalog-page" : ["cartoons", "cartoonMovies", "cartoonTv"].includes(tab) ? "cartoons-catalog-page" : "")) + (sidebarCollapsed ? " is-sidebar-collapsed" : "")}>
        <SiteSidebar
          active={navigationTab}
          upcomingHasUnread={kidsMode ? false : upcomingHasUnread}
          continueItems={tab === "home" ? sortedHistory : undefined}
          onResume={tab === "home" ? resumeHistoryItem : undefined}
          onCollapsedChange={setSidebarCollapsed}
          kidsMode={kidsMode}
        />

        {tab === "home" && (
          <div className="home-main-column">
            {!kidsModeReady && (
              <section className="home-mode-loading" role="status" aria-label="Preparing your home feed">
                <div className="hero-skeleton"><div className="skeleton-hero-copy"><div className="skeleton-line short" /><div className="skeleton-line hero-title" /><div className="skeleton-line wide" /><div className="skeleton-hero-button" /></div></div>
                <SkeletonShelf title="Preparing your feed" />
              </section>
            )}
            <div
              className="home-mode-panel"
              hidden={!kidsModeReady || kidsMode}
              aria-hidden={!kidsModeReady || kidsMode}
              style={{
              "--home-hero-color-1": heroPaletteColors?.[0] ? `rgb(${heroPaletteColors?.[0]})` : "#111827",
              "--home-hero-color-2": heroPaletteColors?.[1] ? `rgb(${heroPaletteColors?.[1]})` : "#17212b",
              "--home-hero-color-3": heroPaletteColors?.[2] ? `rgb(${heroPaletteColors?.[2]})` : "#171d2c",
              "--home-hero-color-4": heroPaletteColors?.[3] ? `rgb(${heroPaletteColors?.[3]})` : "#201a29"
            }}
            >
            {featured ? (
              <ThreeCardHero
                items={homeHeroItems}
                index={heroIndex}
                onIndexChange={setHeroIndex}
                onPaletteChange={setHeroPaletteColors}
                getImage={(item) => {
                  const image = item.heroImage || item.backdropUrl || item.bannerUrl || item.posterUrl || item.heroPoster;
                  return image ? optimizeTmdbImageUrl(image, "w342") : "";
                }}
                getTitle={(item) => item.heroTitle || "Untitled"}
                ariaLabel="Movies, TV series and anime spotlight"
                renderCenter={(heroItem, onCenterImageLoad) => {
                  const navigationKey = heroItem.mediaType === "movie"
                    ? "movie:" + heroItem.imdbId
                    : heroItem.mediaType + ":" + String(heroItem.mediaType === "tv" ? heroItem.tmdbId : heroItem.malId);
                  return (
                    <section className="hero-card home-hero-card" aria-label={heroItem.heroMediaLabel + " spotlight"}>
                      {(heroItem.heroImage || heroItem.backdropUrl || heroItem.bannerUrl || heroItem.posterUrl) && (
                        <img
                          key={String(heroItem.heroId || heroItem.imdbId || heroItem.tmdbId || heroItem.malId)}
                          className="hero-image"
                          src={optimizeTmdbImageUrl(heroItem.heroImage || heroItem.backdropUrl || heroItem.bannerUrl || heroItem.posterUrl, "w342")}
                          alt=""
                          fetchPriority="high"
                          decoding="async"
                          onLoad={onCenterImageLoad}
                          onError={(event) => {
                            const imageElement = event.currentTarget;
                            const fallback = heroItem.heroPoster || heroItem.posterUrl || heroItem.posterFallbackUrl;
                            if (fallback && !imageElement.dataset.posterFallback) {
                              imageElement.dataset.posterFallback = "true";
                              imageElement.src = optimizeTmdbImageUrl(fallback, "w342");
                            } else {
                              imageElement.style.display = "none";
                            }
                          }}
                        />
                      )}
                      <button
                        type="button"
                        className="hero-art-link"
                        aria-label={"Explore " + heroItem.heroTitle}
                        aria-busy={pendingHomeNavigation === navigationKey}
                        disabled={Boolean(pendingHomeNavigation)}
                        onClick={() => openHomeSpotlight(heroItem)}
                      />
                      {pendingHomeNavigation === navigationKey && (
                        <span className="hero-route-loading" role="status"><span className="inline-loading-spinner" /> Opening {heroItem.heroMediaLabel.toLowerCase()}…</span>
                      )}
                      <div className="hero-content">
                        <div className="hero-eyebrow"><span className="hero-live-dot" /> SITULA SPOTLIGHT · {heroItem.heroMediaLabel}</div>
                        <p className="hero-kicker">
                          {heroItem.mediaType === "movie" ? "A film for your next movie night" : heroItem.mediaType === "tv" ? "A series to settle into" : "A new world to discover"}
                        </p>
                        <h1 className="hero-title">{heroItem.heroTitle}</h1>
                        <div className="hero-meta" aria-label="Title details">
                          {heroItem.heroYear && <span>{heroItem.heroYear}</span>}
                          {heroItem.heroRating > 0 && <span className="hero-rating"><Icon name="star" size={13} /> {Number(heroItem.heroRating).toFixed(1)}</span>}
                          {heroItem.heroRuntime > 0 && <span>{formatRuntime(heroItem.heroRuntime)}</span>}
                          {heroItem.heroEpisodes > 0 && <span>{heroItem.heroEpisodes} episodes</span>}
                          {heroItem.heroGenres?.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
                        </div>
                        <p className="hero-description">{heroItem.heroOverview || "Discover a new favourite on Situla."}</p>
                        <div className="hero-actions">
                          <button
                            type="button"
                            className="gold-button"
                            onClick={() => openHomeSpotlight(heroItem)}
                            disabled={Boolean(pendingHomeNavigation)}
                            aria-busy={Boolean(pendingHomeNavigation)}
                          >
                            {pendingHomeNavigation ? <span className="inline-loading-spinner" /> : <Icon name="play" size={17} />}
                            {pendingHomeNavigation ? "Opening…" : heroItem.mediaType === "movie" ? "Watch now" : heroItem.mediaType === "tv" ? "Explore TV series" : "Explore anime"}
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => toggleSaved(heroItem, heroItem.mediaType)}
                            aria-pressed={savedIds.has(savedMediaKey(heroItem, heroItem.mediaType))}
                          >
                            <Icon name={savedIds.has(savedMediaKey(heroItem, heroItem.mediaType)) ? "check" : "bookmark"} size={16} />
                            {savedIds.has(savedMediaKey(heroItem, heroItem.mediaType)) ? "In my list" : "Add to my list"}
                          </button>
                        </div>
                      </div>
                    </section>
                  );
                }}
              />
            ) : loading || !homeSeriesReady ? (
              <>
                <div className="hero-skeleton"><div className="skeleton-hero-copy"><div className="skeleton-line short" /><div className="skeleton-line hero-title" /><div className="skeleton-line wide" /><div className="skeleton-line medium" /><div className="skeleton-hero-button" /></div></div>
              </>
            ) : (
              <div className="empty-panel"><Icon name="film" size={32} /><p className="mt-3 font-bold text-white">Your catalog is getting ready</p><p className="mt-2 text-xs">{error || "Approved titles from the Situla API will appear here."}</p></div>
            )}


            {homeBrowseItems.length > 0 && (
              <section className="home-scroll-feed" aria-label="Discover more movies, TV series and anime">
                <div className="section-heading shelf-heading">
                  <div>
                    <span>DISCOVER MORE</span>
                    <h2>Discover More</h2>
                    <p className="home-collection-description">A continuously mixed selection of movies, TV series and anime from Situla’s catalogue.</p>
                  </div>
                </div>
                <div className="catalog-grid">
                  {homeBrowseItems.slice(0, homeFeedCount).map((item) => item.mediaType === "movie" ? (
                    <MovieCard key={item.heroId} movie={item} onOpen={openHomeMovie} onSave={toggleSaved}
                      saved={savedIds.has(savedMediaKey(item, "movie"))} navigating={pendingHomeNavigation === movieNavigationKey(item)}
                      onPreload={prefetchHomeMovie} />
                  ) : (
                    <SeriesCard key={item.heroId} item={item} kind={item.mediaType} onOpen={openHomeSeries} onSave={toggleSaved}
                      saved={savedIds.has(savedMediaKey(item, item.mediaType))} navigating={pendingHomeNavigation === seriesNavigationKey(item, item.mediaType)}
                      onPreload={prefetchHomeSeries} />
                  ))}
                </div>
                {homeFeedCount < homeBrowseItems.length && (
                  <div ref={homeFeedSentinelRef} className="catalog-infinite-sentinel" aria-live="polite">
                    <span className="catalog-infinite-hint">Scroll to load 5 more titles</span>
                  </div>
                )}
              </section>
            )}

            {loading && movies.length > 0 && <p className="mt-5 text-center text-xs text-[#858b9b]">Refreshing catalog…</p>}
            {error && movies.length === 0 && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
            {error && movies.length > 0 && <p className="mt-4 text-center text-xs text-rose-300">{error}</p>}
            {hasMoreMovies && !loading && (
              <div ref={catalogLoadSentinelRef} className="catalog-infinite-sentinel" aria-live="polite">
                {loadingMore ? "Loading 5 more movies…" : loadMoreError ? <p className="catalog-load-more-error" role="alert">{loadMoreError} <button type="button" className="catalog-retry-link" onClick={() => { setLoadMoreError(""); void loadMore(); }}>Retry</button></p> : <span className="catalog-infinite-hint">Scroll to load 5 more movies</span>}
              </div>
            )}
            
            </div>
            <div className="kids-mode-panel" hidden={!kidsModeReady || !kidsMode} aria-hidden={!kidsModeReady || !kidsMode}>
              <CartoonsCatalog view="kidsHome" kidsMode={kidsMode} isSaved={isCartoonSaved} onSave={toggleSaved} onShare={shareCartoon} onPrepareShare={prepareCartoonSharePoster} />
            </div>
            
          </div>
        )}

        {tab !== "home" && (
          <div className="app-view-main-column">
            <div className="app-view-mode-panel" hidden={!kidsModeReady || (kidsMode && !kidsOnlyView)} aria-hidden={!kidsModeReady || (kidsMode && !kidsOnlyView)}>
        {["cartoons", "cartoonMovies", "cartoonTv"].includes(tab) && (
          <CartoonsCatalog view={tab} kidsMode={kidsMode} isSaved={isCartoonSaved} onSave={toggleSaved} onShare={shareCartoon} onPrepareShare={prepareCartoonSharePoster} />
        )}

        {tab === "movies" && (
          <section className="pb-8" aria-label="Movies catalog">
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
            {hasMoreMovies && !loading && <div ref={catalogLoadSentinelRef} className="catalog-infinite-sentinel" aria-live="polite">{loadingMore ? "Loading 5 more movies…" : loadMoreError ? <p role="alert">{loadMoreError} <button type="button" className="catalog-retry-link" onClick={() => { setLoadMoreError(""); void loadMore(); }}>Retry</button></p> : <span className="catalog-infinite-hint">Scroll to load 5 more movies</span>}</div>}
          </section>
        )}

        {tab === "tv" && (
          <section className="pb-8" aria-label="TV series catalog">
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
            {hasMoreTv && !loading && <div ref={catalogLoadSentinelRef} className="catalog-infinite-sentinel" aria-live="polite">{loadingMore ? "Loading 5 more TV series…" : loadMoreError ? <p role="alert">{loadMoreError} <button type="button" className="catalog-retry-link" onClick={() => { setLoadMoreError(""); void loadMore(); }}>Retry</button></p> : <span className="catalog-infinite-hint">Scroll to load 5 more TV series</span>}</div>}
          </section>
        )}

        {tab === "anime" && (
          <section className="pb-8" aria-label="Anime catalog">
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
            {hasMoreAnime && !loading && <div ref={catalogLoadSentinelRef} className="catalog-infinite-sentinel" aria-live="polite">{loadingMore ? "Loading 5 more anime…" : loadMoreError ? <p role="alert">{loadMoreError} <button type="button" className="catalog-retry-link" onClick={() => { setLoadMoreError(""); void loadMore(); }}>Retry</button></p> : <span className="catalog-infinite-hint">Scroll to load 5 more anime</span>}</div>}
          </section>
        )}

        {tab === "upcoming" && <UpcomingSection />}

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
            {visibleSavedMovies.length ? (
              <div className="catalog-grid">
                {visibleSavedMovies.map((item) => {
                  const kind = savedMediaType(item);
                  const key = savedMediaKey(item);
                  if (kind === "cartoon_movie" || kind === "cartoon_tv") {
                    return <CartoonCard
                      key={key} item={item}
                      kind={kind === "cartoon_movie" ? "movie" : "series"}
                      saved={savedIds.has(key)}
                      onSave={toggleSaved}
                      onShare={shareCartoon}
                      onPrepareShare={prepareCartoonSharePoster}
                    />;
                  }
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
                <div className="about-situla-heading">
                  <span className="about-situla-eyebrow">THE SITULA EXPERIENCE</span>
                  <h2 className="font-bold">About Situla</h2>
                  <p>One place to discover movies, TV series and anime, with a catalog organized around trusted title identifiers.</p>
                </div>
                <div className="about-provider-heading">
                  <span>POWERED BY</span>
                  <p>Recognized media platforms for consistent title identification.</p>
                </div>
                <div className="about-provider-grid" aria-label="Media identifier sources">
                  <a className="about-provider-card" href="https://www.imdb.com/" target="_blank" rel="noopener noreferrer" aria-label="IMDb — movie identifiers">
                    <span className="about-provider-logo about-provider-logo-imdb"><img src="https://cdn.simpleicons.org/imdb/F5C518" alt="IMDb logo" loading="lazy" /></span>
                    <span className="about-provider-copy"><strong>IMDb</strong><small>Movie identifiers</small></span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                  <a className="about-provider-card" href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" aria-label="The Movie Database — TV series identifiers">
                    <span className="about-provider-logo about-provider-logo-tmdb"><img src="https://cdn.simpleicons.org/themoviedatabase/01B4E4" alt="The Movie Database logo" loading="lazy" /></span>
                    <span className="about-provider-copy"><strong>TMDB</strong><small>TV series identifiers</small></span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                  <a className="about-provider-card" href="https://myanimelist.net/" target="_blank" rel="noopener noreferrer" aria-label="MyAnimeList — anime identifiers">
                    <span className="about-provider-logo about-provider-logo-mal"><img src="https://cdn.simpleicons.org/myanimelist/2E51A2" alt="MyAnimeList logo" loading="lazy" /></span>
                    <span className="about-provider-copy"><strong>MyAnimeList</strong><small>Anime identifiers</small></span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                </div>
                <p className="about-provider-disclaimer">IMDb, TMDB and MyAnimeList are referenced for their respective title identifiers. Situla is an independent product and is not affiliated with or endorsed by these services.</p>
                <Link href="/plans" className="premium-coming-soon premium-plan-link" aria-label="Explore Situla Premium plans">
                  <span className="premium-kicker">SITULA PREMIUM</span>
                  <span className="premium-plan-copy"><strong>Explore Situla Premium</strong><em className="premium-status premium-status-available">AVAILABLE</em><small>Compare plans and discover membership benefits.</small></span>
                  <span className="premium-plan-action"><MousePointerClick className="premium-plan-pointer" size={18} aria-hidden="true" /><span>VIEW PLANS</span><ArrowUpRight size={14} aria-hidden="true" /></span>
                </Link>
                <p className="mt-3 text-[10px] font-bold tracking-[.14em] text-[#73798a]">SITULA · WEB APP</p>
              </div>
            </div>
          </section>
        )}

            </div>
            <div className="kids-mode-panel" hidden={!kidsModeReady || !kidsMode || kidsOnlyView} aria-hidden={!kidsModeReady || !kidsMode || kidsOnlyView}>
              <CartoonsCatalog view="cartoons" />
            </div>

        
            
          </div>
        )}
      </div>

      <nav className={"bottom-nav" + (kidsMode ? " is-kids-nav" : "")} aria-label="Main navigation">
        {(kidsMode ? SITE_KIDS_MOBILE_NAV_ITEMS : SITE_MOBILE_NAV_ITEMS).map((item) => {
          const NavigationIcon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={"nav-button" + (navigationTab === item.id ? " active" : "")}
              aria-current={navigationTab === item.id ? "page" : undefined}
              prefetch={true}
            >
              <NavigationIcon size={20} strokeWidth={navigationTab === item.id ? 2.25 : 1.9} />
              <span className="nav-label-with-dot">{item.label}{item.id === "upcoming" && upcomingHasUnread && <b className="upcoming-nav-live" aria-label="New releases waiting for your reminder">LIVE</b>}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
