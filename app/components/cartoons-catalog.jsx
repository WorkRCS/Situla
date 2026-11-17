"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Baby, Bookmark, Check, Film, Star, Tv, ArrowUpRight, Sparkles, ChevronLeft, ChevronRight, Share2 } from "lucide-react";
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

function CartoonSpotlight({ item, kidsMode = true, onPause, onResume, onPrevious, onNext, index = 0, total = 0 }) {
  if (!item) return null;
  const isMovie = item.mediaType === "cartoon_movie";
  const year = formatYear(item.releaseYear || item.firstAirDate || item.releaseDate);
  const href = isMovie
    ? "/cartoons/watch/movie/" + encodeURIComponent(item.tmdbId)
    : "/cartoons/tv/" + encodeURIComponent(item.tmdbId);
  const image = item.backdropUrl || item.posterUrl;
  const imageUrl = image ? optimizeTmdbImageUrl(image, item.backdropUrl ? "w780" : "w342") : "";

  return (
    <section
      className="hero-card catalog-spotlight"
      key={item.mediaType + ":" + item.tmdbId}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocusCapture={onPause}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onResume?.();
      }}
      aria-label="Cartoon spotlight"
    >
      {imageUrl && <img className="hero-image" src={imageUrl} alt="" fetchPriority="high" decoding="async" />}
      <div className="hero-content">
        <div className="hero-eyebrow"><span className="hero-live-dot" /> {kidsMode ? "SITULA KIDS · FAMILY CATALOGUE" : "SITULA · CARTOON CATALOGUE"}</div>
        <p className="hero-kicker">{item.featured ? "FEATURED CARTOON" : item.hot ? "HOT CARTOON" : "POPULAR CARTOON"}</p>
        <h2 className="hero-title">{item.title}</h2>
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
        {total > 1 && (
          <div className="hero-carousel-footer">
            <span className="hero-carousel-label">DISCOVER ANOTHER CARTOON · {index + 1}/{total}</span>
            <div className="hero-carousel-controls">
              <button type="button" className="hero-arrow" onClick={onPrevious} aria-label="Previous featured cartoon"><ChevronLeft size={16} /></button>
              <span className="hero-progress-track" aria-hidden="true">
                <span className="hero-progress-fill" key={item.mediaType + ":" + item.tmdbId} />
              </span>
              <button type="button" className="hero-arrow" onClick={onNext} aria-label="Next featured cartoon"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function CartoonsCatalog({ view = "cartoons", kidsMode = true, isSaved, onSave, onShare, onPrepareShare }) {
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
  const [heroPaused, setHeroPaused] = useState(false);

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
          const params = new URLSearchParams({ page: "1", limit: "48", sort });
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

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: "48", sort });
      if (selectedGenre !== "All") params.set("genre", selectedGenre);
      if (sort === "random" && shuffleSeed) params.set("seed", shuffleSeed);
      const response = await fetch(endpoint + "?" + params.toString(), {
        cache: "no-store", credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "More cartoons could not be loaded.");
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setItems((current) => [...current, ...nextItems]);
      setPage(nextPage);
      setTotal(Number(payload.pagination?.total) || total);
      setHasMore(nextPage < Number(payload.pagination?.totalPages || 0));
      if (payload.shuffleSeed) setShuffleSeed(String(payload.shuffleSeed));
    } catch (requestError) {
      setLoadMoreError(requestError.message || "More cartoons could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  const sortedHome = useMemo(() => {
    if (!home) return null;
    const series = publicOrder(home.series);
    const movies = publicOrder(home.movies);
    return {
      series,
      movies,
      featuredSeries: series.find((item) => item.featured) || series[0] || null,
      featuredMovie: movies.find((item) => item.featured) || movies[0] || null,
      featuredSeriesList: series.filter((item) => item.featured).slice(0, 12),
      hotSeries: series.filter((item) => item.hot || Number(item.trendScore) > 0).slice(0, 12),
      popularSeries: series.filter((item) => item.popular).slice(0, 12),
      featuredMovies: movies.filter((item) => item.featured).slice(0, 12),
      hotMovies: movies.filter((item) => item.hot || Number(item.trendScore) > 0).slice(0, 12),
      popularMovies: movies.filter((item) => item.popular).slice(0, 12)
    };
  }, [home]);

  const cartoonHeroItems = useMemo(() => {
    const series = sortedHome?.series || [];
    const movies = sortedHome?.movies || [];
    const mixed = [];
    for (let index = 0; index < Math.max(series.length, movies.length); index += 1) {
      if (series[index]) mixed.push(series[index]);
      if (movies[index]) mixed.push(movies[index]);
    }
    return mixed.slice(0, 24);
  }, [sortedHome]);

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
    if (!homeView || cartoonHeroItems.length < 2 || heroPaused) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setHeroIndex((current) => (current + 1) % cartoonHeroItems.length);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [homeView, cartoonHeroItems.length, heroPaused]);

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
        <CartoonSpotlight
          item={featured}
          kidsMode={kidsMode}
          index={heroIndex}
          total={cartoonHeroItems.length}
          onPause={() => setHeroPaused(true)}
          onResume={() => setHeroPaused(false)}
          onPrevious={() => setHeroIndex((current) => (current - 1 + cartoonHeroItems.length) % cartoonHeroItems.length)}
          onNext={() => setHeroIndex((current) => (current + 1) % cartoonHeroItems.length)}
        />
        <CartoonShelf title="Featured TV series" eyebrow="EDITOR'S PICKS" items={sortedHome?.featuredSeriesList} kind="series" variant="featured" moreHref="/cartoons/tv" isSaved={isSaved} onSave={onSave} onShare={onShare} onPrepareShare={onPrepareShare} />
        <CartoonShelf title="Hot right now" eyebrow="RECENT SITULA ACTIVITY" items={sortedHome?.hotSeries} kind="series" variant="hot" moreHref="/cartoons/tv" isSaved={isSaved} onSave={onSave} onShare={onShare} onPrepareShare={onPrepareShare} />
        <CartoonShelf title="Popular cartoon series" eyebrow="PUBLIC AUDIENCE DATA" items={sortedHome?.popularSeries} kind="series" variant="popular" moreHref="/cartoons/tv" isSaved={isSaved} onSave={onSave} onShare={onShare} onPrepareShare={onPrepareShare} />
        <CartoonShelf title="Featured movies" eyebrow="EDITOR'S PICKS" items={sortedHome?.featuredMovies} kind="movie" variant="featured" moreHref="/cartoons/movies" isSaved={isSaved} onSave={onSave} onShare={onShare} onPrepareShare={onPrepareShare} />
        <CartoonShelf title="Hot cartoon movies" eyebrow="RECENT SITULA ACTIVITY" items={sortedHome?.hotMovies} kind="movie" variant="hot" moreHref="/cartoons/movies" isSaved={isSaved} onSave={onSave} onShare={onShare} onPrepareShare={onPrepareShare} />
        <CartoonShelf title="Popular cartoon movies" eyebrow="PUBLIC AUDIENCE DATA" items={sortedHome?.popularMovies?.length ? sortedHome.popularMovies : sortedHome?.movies} kind="movie" variant="popular" moreHref="/cartoons/movies" isSaved={isSaved} onSave={onSave} onShare={onShare} onPrepareShare={onPrepareShare} />
        {sortedHome && !sortedHome.movies.length && !sortedHome.series.length && (
          <div className="catalog-empty-state"><Baby size={28} /><h2>No approved cartoons yet</h2><p>Only reviewed family-friendly titles are shown in Kids Mode.</p></div>
        )}
        {error && <p className="catalog-load-more-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="pb-8 cartoons-listing-catalog" aria-label={pageTitle}>
      <div className="section-heading shelf-heading">
        <div>
          <span>{kidsMode
            ? mixedView ? "SITULA KIDS · MIXED FAMILY CATALOGUE" : "SITULA KIDS · APPROVED CATALOGUE"
            : mixedView ? "SITULA · MIXED CARTOON CATALOGUE" : "SITULA · CARTOON CATALOGUE"}</span>
          <h1>{pageTitle}</h1>
          {mixedView && <p className="series-card-meta">{total ? total + " approved movies & series" : "Movies and TV series in one collection"}</p>}
        </div>
      </div>
      <div className="catalog-toolbar catalog-toolbar-sort-only">
        <label className="catalog-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="random">{mixedView ? "Random mix" : "Random"}</option><option value="popular">Popular</option><option value="newest">Newest</option><option value="rating">Top rated</option><option value="az">A–Z</option></select></label>
      </div>
      {!!genres.length && (
        <div className="home-genre-row">
          {["All", ...genres].map((genre) => <button type="button" key={genre} onClick={() => setSelectedGenre(genre)} className={"genre-chip" + (selectedGenre === genre ? " active" : "")} aria-pressed={selectedGenre === genre}>{genre}</button>)}
        </div>
      )}
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
            <div className="catalog-load-more">
              <button type="button" className="ghost-button catalog-load-more-button" onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore}>
                {loadingMore ? <><span className="catalog-load-spinner" aria-hidden="true" /> Loading…</> : <>Load more {mixedView ? "cartoons" : movieView ? "movies" : "series"} <ArrowUpRight size={15} /></>}
              </button>
              {loadMoreError && <p className="catalog-load-more-error" role="alert">{loadMoreError}</p>}
            </div>
          )}
        </>
      ) : (
        <div className="catalog-empty-state"><Baby size={28} /><h2>No approved titles found</h2><p>Try a different genre or search term.</p></div>
      )}
    </section>
  );
}
