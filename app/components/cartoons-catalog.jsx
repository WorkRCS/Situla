"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Baby, Bookmark, Check, Film, Star, Tv, ArrowUpRight, Sparkles, Share2 } from "lucide-react";
import ThreeCardHero from "./three-card-hero.jsx";
import { optimizeTmdbImageUrl } from "../../src/media-image.js";
import { formatRuntimeDuration } from "../../src/media-time.js";

function formatYear(value) {
  const year = Number(value);
  if (year > 1800 && year < 3000) return String(year);
  const date = String(value || "");
  return /^\\d{4}/.test(date) ? date.slice(0, 4) : "";
}

function createCartoonRefreshSeed() {
  try {
    if (typeof window !== "undefined" && window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch {}
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function publicOrder(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) =>
    Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
    Number(Boolean(b.hot)) - Number(Boolean(a.hot)) ||
    Number(Boolean(b.popular)) - Number(Boolean(a.popular)) ||
    (Number(b.popularity) || 0) - (Number(a.popularity) || 0) ||
    (Number(b.voteAverage) || 0) - (Number(a.voteAverage) || 0) ||
    (Number(b.voteCount) || 0) - (Number(a.voteCount) || 0)
  );
}

export function CartoonCard({
  item,
  kind = "series",
  saved = false,
  onSave,
  onShare,
  onPrepareShare
}) {
  const isMovie = kind === "movie";
  const mediaType = isMovie ? "cartoon_movie" : "cartoon_tv";
  const href = isMovie
    ? "/cartoons/watch/movie/" + encodeURIComponent(item.tmdbId)
    : "/cartoons/tv/" + encodeURIComponent(item.tmdbId);
  const year = formatYear(item.releaseYear || item.releaseDate || item.firstAirDate);
  const catalogBadge = item.catalogBadge?.kind
    ? item.catalogBadge
    : item.featured
      ? { label: "Featured", kind: "featured" }
      : item.hot
        ? { label: "Hot", kind: "hot" }
        : item.popular
          ? { label: "Popular", kind: "popular" }
          : { label: "Featured", kind: "featured" };
  const posterUrl = item.posterUrl ? optimizeTmdbImageUrl(item.posterUrl, "w185") : "";
  const [shareFeedback, setShareFeedback] = useState("");
  const [sharePreparing, setSharePreparing] = useState(false);

  const meta = isMovie
    ? [year || "Movie", item.runtime > 0 ? formatRuntimeDuration(item.runtime) : ""].filter(Boolean).join(" · ")
    : [
        year || "TV series",
        item.runtime > 0 ? formatRuntimeDuration(item.runtime) + " / ep" : "",
        item.numberOfSeasons > 0 ? item.numberOfSeasons + " seasons" : "",
        item.numberOfEpisodes > 0 ? item.numberOfEpisodes + " eps" : ""
      ].filter(Boolean).join(" · ");
  const category = Array.isArray(item.genres) ? item.genres.slice(0, 2).join(" · ") : "";

  function handleSave(event) {
    event.preventDefault();
    event.stopPropagation();
    onSave?.(item, mediaType);
  }

  async function handleShare(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!onShare || sharePreparing) return;
    setSharePreparing(true);
    try {
      const feedback = await onShare(item, mediaType);
      setShareFeedback(feedback || "");
    } catch {
      setShareFeedback("Could not share this cartoon.");
    } finally {
      setSharePreparing(false);
    }
  }

  return (
    <article className={"movie-card series-card series-card-tv" + (isMovie ? " cartoon-movie-card" : " cartoon-series-card")}>
      <Link
        href={href}
        className="media-open-button block w-full text-left"
        aria-label={"Open " + (item.title || "cartoon")}
      >
        <div className="movie-poster">
          {posterUrl
            ? <img src={posterUrl} alt={item.title + " poster"} loading="lazy" decoding="async" />
            : <span className="poster-fallback"><Baby size={28} /></span>}
          <span className={"catalog-badge catalog-badge-" + catalogBadge.kind} role="status" aria-label={catalogBadge.label + " title"}>
            {catalogBadge.label}
          </span>
          {Number(item.voteAverage) > 0 && (
            <span className="rating-pill"><Star size={11} fill="currentColor" /> {Number(item.voteAverage).toFixed(1)}</span>
          )}
        </div>
        <h3 className="mt-2 truncate text-[13px] font-bold text-white">{item.title}</h3>
        <p className="series-card-meta">{meta}</p>
        {category && <p className="series-card-category">{category}</p>}
      </Link>
      <button
        type="button"
        onClick={handleSave}
        className={"save-button" + (saved ? " saved" : "")}
        aria-label={saved ? "Remove from My List" : "Save cartoon to My List"}
        aria-pressed={saved}
        title={saved ? "Remove from My List" : "Save to My List"}
      >
        {saved ? <Check size={15} /> : <Bookmark size={15} />}
      </button>
      <button
        type="button"
        className="share-button"
        onClick={handleShare}
        onPointerEnter={() => onPrepareShare?.(item)}
        onFocus={() => onPrepareShare?.(item)}
        disabled={sharePreparing}
        aria-busy={sharePreparing}
        aria-label={"Share " + (item.title || "cartoon")}
        title="Share poster and cartoon link"
      >
        <Share2 size={15} />
      </button>
      {shareFeedback && <span className="share-feedback" role="status">{shareFeedback}</span>}
    </article>
  );
}

function CartoonShelf({ title, eyebrow, items, kind = "series", moreHref, variant = "series", isSaved, onSave, onShare, onPrepareShare }) {
  if (!items?.length) return null;
  const shelfClass = kind === "movie" ? "home-movie-shelf" : "home-series-shelf";
  return (
    <section className={"netflix-shelf " + shelfClass + " home-collection-" + variant}>
      <div className="section-heading shelf-heading">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 className={eyebrow ? "mt-1" : ""}>{title}</h2>
        </div>
        {moreHref && <Link href={moreHref} className="shelf-browse-link">Explore all <ArrowUpRight size={14} /></Link>}
      </div>
      <div className="media-row flex gap-4 overflow-x-auto pb-3">
        {items.map((item) => {
          const mediaType = kind === "movie" ? "cartoon_movie" : "cartoon_tv";
          return <CartoonCard key={kind + ":" + item.tmdbId}
            item={item} kind={kind}
            saved={Boolean(isSaved?.(item, mediaType))}
            onSave={onSave} onShare={onShare} onPrepareShare={onPrepareShare}
          />;
        })}
      </div>
    </section>
  );
}

function CartoonSpotlight({ items, index, onIndexChange, kidsMode = true, onPaletteChange }) {
  const current = items?.[index] || items?.[0] || null;
  if (!current) return null;

  return (
    <ThreeCardHero
      items={items}
      index={index}
      onIndexChange={onIndexChange}
      onPaletteChange={onPaletteChange}
      getImage={(item) => {
        const image = item.backdropUrl || item.posterUrl;
        return image ? optimizeTmdbImageUrl(image, "w342") : "";
      }}
      getTitle={(item) => item.title || "Untitled cartoon"}
      ariaLabel="Approved cartoons spotlight"
      renderCenter={(item, onCenterImageLoad) => {
        const isMovie = item.mediaType === "cartoon_movie";
        const year = formatYear(item.releaseYear || item.firstAirDate || item.releaseDate);
        const href = isMovie
          ? "/cartoons/watch/movie/" + encodeURIComponent(item.tmdbId)
          : "/cartoons/tv/" + encodeURIComponent(item.tmdbId);
        const image = item.backdropUrl || item.posterUrl;
        const imageUrl = image ? optimizeTmdbImageUrl(image, item.backdropUrl ? "w780" : "w342") : "";

        return (
          <section className="hero-card home-hero-card cartoons-home-hero" aria-label="Cartoon spotlight">
            {imageUrl && (
              <img
                key={item.mediaType + ":" + item.tmdbId}
                className="hero-image"
                crossOrigin="anonymous"
                src={imageUrl}
                alt=""
                fetchPriority="high"
                decoding="async"
                onLoad={onCenterImageLoad}
                onError={(event) => {
                  const imageElement = event.currentTarget;
                  if (!imageElement.dataset.corsRetry) {
                    imageElement.dataset.corsRetry = "true";
                    const failedUrl = imageElement.currentSrc || imageElement.src;
                    imageElement.removeAttribute("crossorigin");
                    imageElement.src = failedUrl;
                    return;
                  }
                  const fallback = item.backdropUrl && item.posterUrl
                    ? optimizeTmdbImageUrl(item.posterUrl, "w342")
                    : "";
                  if (fallback && !imageElement.dataset.posterFallback) {
                    imageElement.dataset.posterFallback = "true";
                    imageElement.src = fallback;
                  } else {
                    imageElement.style.display = "none";
                  }
                }}
              />
            )}
            <div className="hero-content">
              <div className="hero-eyebrow"><span className="hero-live-dot" /> {kidsMode ? "SITULA KIDS · FAMILY CATALOGUE" : "SITULA · CARTOON CATALOGUE"}</div>
              <p className="hero-kicker">{item.featured ? "FEATURED CARTOON" : item.hot ? "HOT CARTOON" : "POPULAR CARTOON"}</p>
              <h1 className="hero-title">{item.title}</h1>
              <div className="hero-meta">
                {year && <span>{year}</span>}
                {Number(item.voteAverage) > 0 && <span className="hero-rating"><Star size={13} fill="currentColor" /> {Number(item.voteAverage).toFixed(1)}</span>}
                {item.minimumAge != null && <span>{Number(item.minimumAge)}+</span>}
                {(item.genres || []).slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
              </div>
              <p className="hero-description">{item.overview || "Discover this family-friendly animated title on Situla."}</p>
              <div className="hero-actions">
                <Link href={href} className="gold-button"><Film size={16} /> {isMovie ? "Watch movie" : "Explore series"}</Link>
              </div>
            </div>
          </section>
        );
      }}
    />
  );
}

export default function CartoonsCatalog({ view = "cartoons", kidsMode = true, isSaved, onSave, onShare, onPrepareShare, onHeroPaletteChange }) {
  const [home, setHome] = useState(null);
  const [items, setItems] = useState([]);
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [sort, setSort] = useState("random");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [shuffleSeed, setShuffleSeed] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [error, setError] = useState("");
  const [heroIndex, setHeroIndex] = useState(0);
  const [homeFeedCount, setHomeFeedCount] = useState(5);
  const listingSentinelRef = useRef(null);
  const homeFeedSentinelRef = useRef(null);

  const homeView = view === "kidsHome";
  const mixedView = view === "cartoons";
  const movieView = view === "cartoonMovies";
  const kind = movieView ? "movie" : "series";
  const endpoint = mixedView ? "/api/cartoons/catalog" : movieView ? "/api/cartoons/movies" : "/api/cartoons/series";
  const pageTitle = mixedView ? "Cartoons" : movieView ? "Cartoon Movies" : "Cartoon TV Series";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setLoadMoreError("");
      setPage(1);
      setHasMore(false);
      setTotal(0);
      setShuffleSeed("");
      if (!homeView) setItems([]);
      if (homeView) setHome(null);
      try {
        if (homeView) {
          const seed = createCartoonRefreshSeed();
          const response = await fetch("/api/cartoons/home?seed=" + encodeURIComponent(seed), {
            cache: "no-store", credentials: "same-origin", signal: controller.signal
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "Cartoon catalog is unavailable.");
          if (!controller.signal.aborted) setHome(payload);
        } else {
          const params = new URLSearchParams({ page: "1", limit: "5", sort });
          if (sort === "random") params.set("seed", createCartoonRefreshSeed());
          if (selectedGenre !== "All") params.set("genre", selectedGenre);
          const response = await fetch(endpoint + "?" + params.toString(), {
            cache: "no-store", credentials: "same-origin", signal: controller.signal
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || pageTitle + " is unavailable.");
          if (!controller.signal.aborted) {
            const nextItems = Array.isArray(payload.items) ? payload.items : [];
            setItems(nextItems);
            setGenres(Array.isArray(payload.genres) ? payload.genres : []);
            setTotal(Number(payload.pagination?.total) || nextItems.length);
            setPage(1);
            setHasMore(Number(payload.pagination?.totalPages) > 1);
            setShuffleSeed(String(payload.shuffleSeed || ""));
          }
        }
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.message || "Cartoon catalog is temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const timer = window.setTimeout(load, homeView ? 0 : 100);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [homeView, endpoint, sort, selectedGenre, pageTitle]);

  useEffect(() => {
    setSort("random");
  }, [view]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loadMoreError) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: "5", sort });
      if (selectedGenre !== "All") params.set("genre", selectedGenre);
      if (sort === "random" && shuffleSeed) params.set("seed", shuffleSeed);
      const response = await fetch(endpoint + "?" + params.toString(), {
        cache: "no-store", credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "More cartoons could not be loaded.");
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setItems((current) => {
        const seen = new Set(current.map((item) => String(item.mediaType || kind) + ":" + String(item.tmdbId)));
        return [...current, ...nextItems.filter((item) => {
          const key = String(item.mediaType || kind) + ":" + String(item.tmdbId);
          if (!item.tmdbId || seen.has(key)) return false;
          seen.add(key);
          return true;
        })];
      });
      setPage(nextPage);
      setTotal(Number(payload.pagination?.total) || total);
      setHasMore(nextPage < Number(payload.pagination?.totalPages || 0));
      if (payload.shuffleSeed) setShuffleSeed(String(payload.shuffleSeed));
    } catch (requestError) {
      setLoadMoreError(requestError.message || "More cartoons could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loadMoreError, page, sort, selectedGenre, shuffleSeed, endpoint, total, kind]);

  const sortedHome = useMemo(() => {
    if (!home) return null;
    const series = publicOrder(home.series);
    const movies = publicOrder(home.movies);
    const fillShelf = (matched, source) =>
      (matched.length >= Math.min(5, source.length) ? matched : source).slice(0, 12);
    return {
      series,
      movies,
      featuredSeries: series.find((item) => item.featured) || series[0] || null,
      featuredMovie: movies.find((item) => item.featured) || movies[0] || null,
      // When public badges are sparse, use ranked catalogue records as shelf
      // fallbacks instead of rendering one- or two-card home sections.
      featuredSeriesList: fillShelf(series.filter((item) => item.featured), series),
      hotSeries: fillShelf(series.filter((item) => item.hot || Number(item.trendScore) > 0), series),
      popularSeries: fillShelf(series.filter((item) => item.popular), series),
      featuredMovies: fillShelf(movies.filter((item) => item.featured), movies),
      hotMovies: fillShelf(movies.filter((item) => item.hot || Number(item.trendScore) > 0), movies),
      popularMovies: fillShelf(movies.filter((item) => item.popular), movies)
    };
  }, [home]);

  const cartoonFeedItems = useMemo(() => {
    const series = sortedHome?.series || [];
    const movies = sortedHome?.movies || [];
    const mixed = [];
    for (let index = 0; index < Math.max(series.length, movies.length); index += 1) {
      if (series[index]) mixed.push(series[index]);
      if (movies[index]) mixed.push(movies[index]);
    }
    return mixed;
  }, [sortedHome]);

  const cartoonHeroItems = useMemo(() => cartoonFeedItems.slice(0, 24), [cartoonFeedItems]);

  useEffect(() => {
    setHomeFeedCount(5);
  }, [home]);

  useEffect(() => {
    if (!cartoonHeroItems.length) {
      setHeroIndex(0);
      return;
    }
    let previousId = "";
    try { previousId = localStorage.getItem("situla:kids:home-spotlight:v1") || ""; } catch {}
    const getId = (item) => String(item?.mediaType || "") + ":" + String(item?.tmdbId || "");
    const freshItems = cartoonHeroItems.filter((item) => getId(item) !== previousId);
    const pool = freshItems.length ? freshItems : cartoonHeroItems;
    const selected = pool[Math.floor(Math.random() * pool.length)] || cartoonHeroItems[0];
    try { localStorage.setItem("situla:kids:home-spotlight:v1", getId(selected)); } catch {}
    const selectedIndex = cartoonHeroItems.findIndex((item) => getId(item) === getId(selected));
    setHeroIndex(Math.max(0, selectedIndex));
  }, [cartoonHeroItems]);

  useEffect(() => {
    const sentinel = listingSentinelRef.current;
    if (!sentinel || !hasMore || loading || loadingMore || loadMoreError) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "850px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMoreError, loadMore]);

  useEffect(() => {
    const sentinel = homeFeedSentinelRef.current;
    if (!homeView || !sentinel || homeFeedCount >= cartoonFeedItems.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setHomeFeedCount((current) => Math.min(cartoonFeedItems.length, current + 5));
      }
    }, { rootMargin: "750px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [homeView, homeFeedCount, cartoonFeedItems.length]);

  if (loading && !homeView && !items.length) {
    return <section className="catalog-page-state"><span className="inline-loading-spinner" /><p>Loading approved cartoons…</p></section>;
  }
  if (error && !home && !items.length) {
    return <section className="catalog-page-state"><Baby size={30} /><h1>Cartoons are unavailable</h1><p>{error}</p></section>;
  }

  if (homeView) {
    const featured = cartoonHeroItems[heroIndex] || sortedHome?.featuredSeries || sortedHome?.featuredMovie;
    return (
      <section className="pb-8 cartoons-home-catalog" aria-label="Cartoons catalog">
        {featured && (featured.backdropUrl || featured.posterUrl) && (
          <div className="home-hero-atmosphere" aria-hidden="true">
            <img src={optimizeTmdbImageUrl(featured.backdropUrl || featured.posterUrl, "w342")} alt="" decoding="async" />
          </div>
        )}
        <CartoonSpotlight
          items={cartoonHeroItems}
          index={heroIndex}
          onIndexChange={setHeroIndex}
          onPaletteChange={onHeroPaletteChange}
          kidsMode={kidsMode}
        />
        {cartoonFeedItems.length > 0 && (
          <section className="home-scroll-feed cartoons-home-feed" aria-label="Discover more approved cartoons">
            <div className="section-heading shelf-heading">
              <div>
                <span>DISCOVER MORE</span>
                <h2>Discover More</h2>
                <p className="home-collection-description">A mixed feed of approved cartoon movies and TV series.</p>
              </div>
            </div>
            <div className="catalog-grid">
              {cartoonFeedItems.slice(0, homeFeedCount).map((item) => {
                const itemKind = item.mediaType === "cartoon_movie" ? "movie" : "series";
                const mediaType = itemKind === "movie" ? "cartoon_movie" : "cartoon_tv";
                return <CartoonCard key={mediaType + ":" + item.tmdbId}
                  item={item} kind={itemKind}
                  saved={Boolean(isSaved?.(item, mediaType))}
                  onSave={onSave} onShare={onShare} onPrepareShare={onPrepareShare}
                />;
              })}
            </div>
            {homeFeedCount < cartoonFeedItems.length && (
              <div ref={homeFeedSentinelRef} className="catalog-infinite-sentinel" aria-live="polite">
                <span className="catalog-infinite-hint">Scroll to load 5 more cartoons</span>
              </div>
            )}
          </section>
        )}
        {sortedHome && !sortedHome.movies.length && !sortedHome.series.length && (
          <div className="catalog-empty-state"><Baby size={28} /><h2>No approved cartoons yet</h2><p>Only reviewed family-friendly titles are shown in Kids Mode.</p></div>
        )}
        {error && <p className="catalog-load-more-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="pb-8 cartoons-listing-catalog" aria-label={pageTitle}>

      {error && <p className="catalog-load-more-error" role="alert">{error}</p>}
      {items.length ? (
        <>
          <div className="catalog-grid">
            {items.map((item) => {
              const itemKind = item.mediaType === "cartoon_movie" ? "movie" : mixedView ? "series" : kind;
              const mediaType = itemKind === "movie" ? "cartoon_movie" : "cartoon_tv";
              return <CartoonCard key={itemKind + ":" + item.tmdbId}
                item={item} kind={itemKind}
                saved={Boolean(isSaved?.(item, mediaType))}
                onSave={onSave} onShare={onShare} onPrepareShare={onPrepareShare}
              />;
            })}
          </div>
          {loading && <p className="mt-5 text-center text-xs text-[#858b9b]">Refreshing catalogue…</p>}
          {hasMore && !loading && (
            <div ref={listingSentinelRef} className="catalog-infinite-sentinel" aria-live="polite">
              {loadingMore ? <><span className="catalog-load-spinner" aria-hidden="true" /> Loading 5 more titles…</>
                : loadMoreError ? <p className="catalog-load-more-error" role="alert">{loadMoreError} <button type="button" className="catalog-retry-link" onClick={() => { setLoadMoreError(""); void loadMore(); }}>Retry</button></p>
                : <span className="catalog-infinite-hint">Scroll to discover 5 more {mixedView ? "cartoons" : movieView ? "movies" : "series"}</span>}
            </div>
          )}
        </>
      ) : (
        <div className="catalog-empty-state"><Baby size={28} /><h2>No approved titles found</h2><p>Try a different genre or search term.</p></div>
      )}
    </section>
  );
}
