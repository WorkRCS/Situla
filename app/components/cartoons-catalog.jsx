"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Baby, Film, Search, Star, Tv, ArrowUpRight, Sparkles } from "lucide-react";

function formatYear(value) {
  const year = Number(value);
  if (year > 1800 && year < 3000) return String(year);
  const date = String(value || "");
  return /^\d{4}/.test(date) ? date.slice(0, 4) : "";
}

function CartoonCard({ item, kind }) {
  const isMovie = kind === "movie";
  const href = isMovie
    ? "/cartoons/watch/movie/" + encodeURIComponent(item.tmdbId)
    : "/cartoons/tv/" + encodeURIComponent(item.tmdbId);
  const year = formatYear(item.releaseYear || item.releaseDate || item.firstAirDate);
  const label = item.catalogBadge?.label || (item.popular ? "Popular" : item.hot ? "Hot" : "");
  return (
    <Link href={href} className="movie-card cartoon-media-card">
      <span className="movie-poster cartoon-poster">
        {item.posterUrl
          ? <img src={item.posterUrl} alt={item.title + " poster"} loading="lazy" decoding="async" />
          : <span className="cartoon-poster-fallback"><Baby size={28} /></span>}
        {label && <span className={"catalog-badge " + (item.catalogBadge?.kind || "popular")}>{label}</span>}
        {item.minimumAge != null && <span className="cartoon-age-chip">{Number(item.minimumAge)}+</span>}
        <span className="cartoon-card-play"><span>WATCH</span><ArrowUpRight size={14} /></span>
      </span>
      <span className="cartoon-card-copy">
        <strong>{item.title}</strong>
        <small>
          {year}{year && item.voteAverage ? " · " : ""}
          {item.voteAverage > 0 && <span><Star size={11} fill="currentColor" /> {Number(item.voteAverage).toFixed(1)}</span>}
          {item.numberOfEpisodes > 0 && " · " + item.numberOfEpisodes + " eps"}
          {item.runtime > 0 && " · " + item.runtime + " min"}
        </small>
        {Array.isArray(item.genres) && item.genres.length > 0 && (
          <em>{item.genres.slice(0, 2).join(" · ")}</em>
        )}
      </span>
    </Link>
  );
}

function CartoonShelf({ title, eyebrow, description, items, kind = "series", moreHref }) {
  if (!items?.length) return null;
  return (
    <section className="netflix-shelf cartoon-shelf">
      <div className="section-heading cartoon-shelf-heading">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {moreHref && <Link href={moreHref} className="catalog-view-all">View all <ArrowUpRight size={14} /></Link>}
      </div>
      <div className="cartoon-card-rail">
        {items.map((item) => <CartoonCard key={item.tmdbId} item={item} kind={kind} />)}
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
          const response = await fetch("/api/cartoons/home", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
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
    const series = Array.isArray(home.series) ? home.series : [];
    const movies = Array.isArray(home.movies) ? home.movies : [];
    return {
      series,
      movies,
      featuredSeries: home.featuredSeries || series[0] || null,
      featuredMovie: home.featuredMovie || movies[0] || null,
      popularSeries: series.filter((item) => item.popular).slice(0, 12),
      hotSeries: series.filter((item) => item.hot).slice(0, 12),
      featuredSeriesList: series.filter((item) => item.featured).slice(0, 12),
      popularMovies: movies.filter((item) => item.popular).slice(0, 12),
      featuredMovies: movies.filter((item) => item.featured).slice(0, 12)
    };
  }, [home]);

  if (loading && !homeView && !items.length) {
    return <section className="cartoon-page-state"><span className="inline-loading-spinner" /><p>Loading approved cartoons…</p></section>;
  }
  if (error && !home && !items.length) {
    return <section className="cartoon-page-state"><Baby size={30} /><h1>Cartoons are unavailable</h1><p>{error}</p></section>;
  }

  if (homeView) {
    const featured = sortedHome?.featuredSeries || sortedHome?.featuredMovie;
    return (
      <section className="cartoon-hub-page pb-8" aria-label="Cartoons">
        <div className="cartoon-page-intro">
          <span className="cartoon-page-kicker"><Baby size={15} /> SITULA KIDS</span>
          <h1>Cartoons for every little adventure</h1>
          <p>A dedicated space for age-reviewed animated movies and TV series.</p>
          <div className="cartoon-quick-links">
            <Link href="/cartoons/movies"><Film size={16} /> Cartoon Movies <ArrowUpRight size={14} /></Link>
            <Link href="/cartoons/tv"><Tv size={16} /> Cartoon TV <ArrowUpRight size={14} /></Link>
          </div>
          <span className="cartoon-catalog-count">
            {(home?.totals?.movies ?? 0).toLocaleString()} movies · {(home?.totals?.series ?? 0).toLocaleString()} series in approved catalogue
          </span>
        </div>
        {featured && (
          <section className="hero-card cartoon-hero-card">
            {(featured.backdropUrl || featured.posterUrl) && (
              <img className="hero-image" src={featured.backdropUrl || featured.posterUrl} alt="" fetchPriority="high" decoding="async" />
            )}
            <div className="hero-content">
              <span className="hero-eyebrow"><Sparkles size={13} /> FAMILY SPOTLIGHT</span>
              <span className="hero-kicker">{featured.mediaType === "cartoon_movie" ? "FEATURED CARTOON MOVIE" : "FEATURED CARTOON SERIES"}</span>
              <h2 className="hero-title">{featured.title}</h2>
              <div className="hero-meta">
                {formatYear(featured.releaseYear || featured.firstAirDate || featured.releaseDate)}
                {featured.voteAverage > 0 && <span><Star size={12} fill="currentColor" /> {Number(featured.voteAverage).toFixed(1)}</span>}
                {featured.minimumAge != null && <span>{featured.minimumAge}+</span>}
                {featured.genres?.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
              </div>
              <p className="hero-description">{featured.overview || "A family-friendly story selected for the Situla Cartoons catalogue."}</p>
              <div className="hero-actions">
                <Link className="gold-button" href={featured.mediaType === "cartoon_movie" ? "/cartoons/watch/movie/" + featured.tmdbId : "/cartoons/tv/" + featured.tmdbId}>
                  <Film size={16} /> {featured.mediaType === "cartoon_movie" ? "Watch movie" : "Explore series"}
                </Link>
              </div>
            </div>
          </section>
        )}
        {loading && !home && <div className="cartoon-loading-state">Loading cartoons…</div>}
        <CartoonShelf title="Featured series" eyebrow="EDITOR'S PICKS" items={sortedHome?.featuredSeriesList} kind="series" moreHref="/cartoons/tv" />
        <CartoonShelf title="Hot right now" eyebrow="RECENT SITULA ACTIVITY" items={sortedHome?.hotSeries} kind="series" moreHref="/cartoons/tv" />
        <CartoonShelf title="Popular cartoon series" eyebrow="AUDIENCE FAVOURITES" items={sortedHome?.popularSeries} kind="series" moreHref="/cartoons/tv" />
        <CartoonShelf title="Cartoon movies" eyebrow="ANIMATED MOVIE NIGHT" items={sortedHome?.popularMovies?.length ? sortedHome.popularMovies : sortedHome?.movies} kind="movie" moreHref="/cartoons/movies" />
        <CartoonShelf title="Featured movies" eyebrow="CURATED FOR FAMILIES" items={sortedHome?.featuredMovies} kind="movie" moreHref="/cartoons/movies" />
        {sortedHome && !sortedHome.movies.length && !sortedHome.series.length && (
          <div className="cartoon-empty-state"><Baby size={28} /><h2>Your approved cartoons catalogue is being prepared</h2><p>Run the offline cartoon seed command after the static catalogue has been reviewed.</p></div>
        )}
      </section>
    );
  }

  return (
    <section className="cartoon-catalog-page pb-8" aria-label={pageTitle}>
      <div className="section-heading cartoon-catalog-title">
        <div><span>SITULA KIDS · APPROVED CATALOGUE</span><h1>{pageTitle}</h1><p>Titles appear here only after an age suitability review.</p></div>
      </div>
      <div className="cartoon-catalog-toolbar">
        <label className="cartoon-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={"Search " + pageTitle.toLowerCase()} aria-label={"Search " + pageTitle} /></label>
        <label className="cartoon-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="popular">Popular</option><option value="newest">Newest</option><option value="rating">Top rated</option><option value="az">A–Z</option></select></label>
      </div>
      {!!genres.length && (
        <div className="home-genre-row cartoon-genre-row" aria-label="Filter cartoons by genre">
          {["All", ...genres].map((genre) => <button type="button" key={genre} onClick={() => setSelectedGenre(genre)} className={"genre-chip" + (selectedGenre === genre ? " active" : "")} aria-pressed={selectedGenre === genre}>{genre}</button>)}
        </div>
      )}
      {error && <p className="cartoon-inline-error">{error}</p>}
      {items.length ? (
        <div className="catalog-grid cartoon-catalog-grid">
          {items.map((item) => <CartoonCard key={item.tmdbId} item={item} kind={kind} />)}
        </div>
      ) : (
        <div className="cartoon-empty-state"><Baby size={28} /><h2>No approved titles found</h2><p>Try a different genre or search term.</p></div>
      )}
    </section>
  );
}
