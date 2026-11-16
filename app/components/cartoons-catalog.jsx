"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Baby, Film, Search, Star, Tv, ArrowUpRight, Sparkles } from "lucide-react";
import { optimizeTmdbImageUrl } from "../../src/media-image.js";

function formatYear(value) {
  const year = Number(value);
  if (year > 1800 && year < 3000) return String(year);
  const date = String(value || "");
  return /^\\d{4}/.test(date) ? date.slice(0, 4) : "";
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

function CartoonCard({ item, kind = "series" }) {
  const isMovie = kind === "movie";
  const href = isMovie
    ? "/cartoons/watch/movie/" + encodeURIComponent(item.tmdbId)
    : "/cartoons/tv/" + encodeURIComponent(item.tmdbId);
  const year = formatYear(item.releaseYear || item.releaseDate || item.firstAirDate);
  const badgeLabel = item.catalogBadge?.label || (item.featured ? "Featured" : item.hot ? "Hot" : item.popular ? "Popular" : "");
  const badgeKind = item.catalogBadge?.kind || (item.featured ? "featured" : item.hot ? "hot" : "popular");
  const posterUrl = item.posterUrl ? optimizeTmdbImageUrl(item.posterUrl, "w185") : "";

  const meta = isMovie
    ? [year || "Movie", item.runtime > 0 ? item.runtime + " min" : ""].filter(Boolean).join(" · ")
    : [
        year || "TV series",
        item.runtime > 0 ? item.runtime + " min / ep" : "",
        item.numberOfSeasons > 0 ? item.numberOfSeasons + " seasons" : "",
        item.numberOfEpisodes > 0 ? item.numberOfEpisodes + " eps" : ""
      ].filter(Boolean).join(" · ");
  const category = Array.isArray(item.genres) ? item.genres.slice(0, 2).join(" · ") : "";

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
          {badgeLabel && (
            <span className={"catalog-badge catalog-badge-" + badgeKind} role="status" aria-label={badgeLabel + " title"}>
              {badgeLabel}
            </span>
          )}
          {Number(item.voteAverage) > 0 && (
            <span className="rating-pill"><Star size={11} fill="currentColor" /> {Number(item.voteAverage).toFixed(1)}</span>
          )}
        </div>
        <h3 className="mt-2 truncate text-[13px] font-bold text-white">{item.title}</h3>
        <p className="series-card-meta">{meta}</p>
        {category && <p className="series-card-category">{category}</p>}
      </Link>
    </article>
  );
}

function CartoonShelf({ title, eyebrow, items, kind = "series", moreHref, variant = "series" }) {
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
        {items.map((item) => <CartoonCard key={kind + ":" + item.tmdbId} item={item} kind={kind} />)}
      </div>
    </section>
  );
}

function CartoonSpotlight({ item }) {
  if (!item) return null;
  const isMovie = item.mediaType === "cartoon_movie";
  const year = formatYear(item.releaseYear || item.firstAirDate || item.releaseDate);
  const href = isMovie
    ? "/cartoons/watch/movie/" + encodeURIComponent(item.tmdbId)
    : "/cartoons/tv/" + encodeURIComponent(item.tmdbId);
  const image = item.backdropUrl || item.posterUrl;
  const imageUrl = image ? optimizeTmdbImageUrl(image, item.backdropUrl ? "w780" : "w342") : "";

  return (
    <section className="hero-card catalog-spotlight" key={item.tmdbId}>
      {imageUrl && <img className="hero-image" src={imageUrl} alt="" fetchPriority="high" decoding="async" />}
      <div className="hero-content">
        <div className="hero-eyebrow"><span className="hero-live-dot" /> SITULA KIDS · FAMILY CATALOGUE</div>
        <p className="hero-kicker">{item.featured ? "FEATURED CARTOON" : "POPULAR CARTOON"}</p>
        <h2 className="hero-title">{item.title}</h2>
        <div className="hero-meta">
          {year && <span>{year}</span>}
          {Number(item.voteAverage) > 0 && <span className="hero-rating"><Star size={13} fill="currentColor" /> {Number(item.voteAverage).toFixed(1)}</span>}
          {item.minimumAge != null && <span>{Number(item.minimumAge)}+</span>}
          {(item.genres || []).slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
        </div>
        <p className="hero-description">{item.overview || "Discover this family-friendly animated series on Situla."}</p>
        <div className="hero-actions">
          <Link href={href} className="gold-button"><Film size={16} /> {isMovie ? "Watch movie" : "Explore series"}</Link>
        </div>
      </div>
    </section>
  );
}

export default function CartoonsCatalog({ view = "cartoons" }) {
  const [home, setHome] = useState(null);
  const [items, setItems] = useState([]);
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [sort, setSort] = useState("popular");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const homeView = view === "cartoons";
  const movieView = view === "cartoonMovies";
  const kind = movieView ? "movie" : "series";
  const endpoint = movieView ? "/api/cartoons/movies" : "/api/cartoons/series";
  const pageTitle = movieView ? "Cartoon Movies" : "Cartoon TV Series";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (homeView) {
          const response = await fetch("/api/cartoons/home", {
            cache: "no-store", credentials: "same-origin", signal: controller.signal
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "Cartoon catalog is unavailable.");
          if (!controller.signal.aborted) setHome(payload);
        } else {
          const params = new URLSearchParams({ page: "1", limit: "48", sort });
          if (query.trim()) params.set("q", query.trim());
          if (selectedGenre !== "All") params.set("genre", selectedGenre);
          const response = await fetch(endpoint + "?" + params.toString(), {
            cache: "no-store", credentials: "same-origin", signal: controller.signal
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || pageTitle + " is unavailable.");
          if (!controller.signal.aborted) {
            setItems(Array.isArray(payload.items) ? payload.items : []);
            setGenres(Array.isArray(payload.genres) ? payload.genres : []);
          }
        }
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.message || "Cartoon catalog is temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const timer = window.setTimeout(load, homeView ? 0 : 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [homeView, endpoint, sort, query, selectedGenre, pageTitle]);

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

  if (loading && !homeView && !items.length) {
    return <section className="catalog-page-state"><span className="inline-loading-spinner" /><p>Loading approved cartoons…</p></section>;
  }
  if (error && !home && !items.length) {
    return <section className="catalog-page-state"><Baby size={30} /><h1>Cartoons are unavailable</h1><p>{error}</p></section>;
  }

  if (homeView) {
    const featured = sortedHome?.featuredSeries || sortedHome?.featuredMovie;
    return (
      <section className="pb-8" aria-label="Cartoons catalog">
        <CartoonSpotlight item={featured} />
        <CartoonShelf title="Featured TV series" eyebrow="EDITOR'S PICKS" items={sortedHome?.featuredSeriesList} kind="series" variant="featured" moreHref="/cartoons/tv" />
        <CartoonShelf title="Hot right now" eyebrow="RECENT SITULA ACTIVITY" items={sortedHome?.hotSeries} kind="series" variant="hot" moreHref="/cartoons/tv" />
        <CartoonShelf title="Popular cartoon series" eyebrow="PUBLIC AUDIENCE DATA" items={sortedHome?.popularSeries} kind="series" variant="popular" moreHref="/cartoons/tv" />
        <CartoonShelf title="Featured movies" eyebrow="EDITOR'S PICKS" items={sortedHome?.featuredMovies} kind="movie" variant="featured" moreHref="/cartoons/movies" />
        <CartoonShelf title="Hot cartoon movies" eyebrow="RECENT SITULA ACTIVITY" items={sortedHome?.hotMovies} kind="movie" variant="hot" moreHref="/cartoons/movies" />
        <CartoonShelf title="Popular cartoon movies" eyebrow="PUBLIC AUDIENCE DATA" items={sortedHome?.popularMovies?.length ? sortedHome.popularMovies : sortedHome?.movies} kind="movie" variant="popular" moreHref="/cartoons/movies" />
        {sortedHome && !sortedHome.movies.length && !sortedHome.series.length && (
          <div className="catalog-empty-state"><Baby size={28} /><h2>No approved cartoons yet</h2><p>Only reviewed family-friendly titles are shown in Kids Mode.</p></div>
        )}
        {error && <p className="catalog-load-more-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="pb-8" aria-label={pageTitle}>
      <div className="section-heading shelf-heading">
        <div>
          <span>SITULA KIDS · APPROVED CATALOGUE</span>
          <h1>{pageTitle}</h1>
        </div>
      </div>
      <div className="catalog-toolbar">
        <label className="catalog-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={"Search " + pageTitle.toLowerCase()} aria-label={"Search " + pageTitle} /></label>
        <label className="catalog-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="popular">Popular</option><option value="newest">Newest</option><option value="rating">Top rated</option><option value="az">A–Z</option></select></label>
      </div>
      {!!genres.length && (
        <div className="home-genre-row">
          {["All", ...genres].map((genre) => <button type="button" key={genre} onClick={() => setSelectedGenre(genre)} className={"genre-chip" + (selectedGenre === genre ? " active" : "")} aria-pressed={selectedGenre === genre}>{genre}</button>)}
        </div>
      )}
      {error && <p className="catalog-load-more-error" role="alert">{error}</p>}
      {items.length ? (
        <div className="catalog-grid">
          {items.map((item) => <CartoonCard key={item.tmdbId} item={item} kind={kind} />)}
        </div>
      ) : (
        <div className="catalog-empty-state"><Baby size={28} /><h2>No approved titles found</h2><p>Try a different genre or search term.</p></div>
      )}
    </section>
  );
}
