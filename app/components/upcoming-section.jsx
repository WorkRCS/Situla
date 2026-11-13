"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CalendarClock, Crown, Flame, ListChecks, LoaderCircle, Share2, Sparkles, Star } from "lucide-react";

const UPCOMING_TABS = [
  { id: "movie", label: "Movies", subtitle: "Upcoming Movies" },
  { id: "tv", label: "TV Series", subtitle: "Upcoming TV Series" },
  { id: "anime", label: "Anime", subtitle: "Upcoming Anime" }
];

function dateLabel(value) {
  if (!value) return "Release date not set";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short"
  });
}

function countdownLabel(value, now) {
  const remaining = new Date(value).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return "Launching now";
  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [
    days ? days + "d" : "",
    hours.toString().padStart(2, "0") + "h",
    minutes.toString().padStart(2, "0") + "m",
    secs.toString().padStart(2, "0") + "s"
  ].filter(Boolean).join(" ");
}

function UpcomingTag({ children, tone = "" }) {
  return <span className={"upcoming-tag " + tone}>{children}</span>;
}

export default function UpcomingSection() {
  const [activeType, setActiveType] = useState("movie");
  const [showMine, setShowMine] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [pendingId, setPendingId] = useState("");

  const loadItems = useCallback(async (signal, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    const params = new URLSearchParams({ type: activeType });
    if (showMine) params.set("mine", "1");
    try {
      const response = await fetch("/api/upcoming?" + params.toString(), {
        cache: "no-store", credentials: "same-origin", signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && showMine) throw new Error("Sign in to view your waiting list.");
        throw new Error(payload.error || "Upcoming titles could not be loaded.");
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (loadError) {
      if (!silent && loadError?.name !== "AbortError") setError(loadError.message || "Upcoming titles could not be loaded.");
    } finally {
      if (!signal?.aborted && !silent) setLoading(false);
    }
  }, [activeType, showMine]);

  useEffect(() => {
    const requestedType = new URLSearchParams(window.location.search).get("type");
    if (UPCOMING_TABS.some((tab) => tab.id === requestedType)) setActiveType(requestedType);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadItems(controller.signal);
    return () => controller.abort();
  }, [loadItems]);

  useEffect(() => {
    if (loading || !window.location.hash.startsWith("#upcoming-")) return;
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, items]);

  useEffect(() => {
    const interval = window.setInterval(() => loadItems(undefined, true), 30_000);
    return () => window.clearInterval(interval);
  }, [loadItems]);

  useEffect(() => {
    fetch("/api/upcoming/read", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }).then((response) => {
      if (response.ok) window.dispatchEvent(new Event("situla:upcoming-read"));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!items.some((item) => item.countdownEnabled)) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [items]);

  const activeLabel = useMemo(() => UPCOMING_TABS.find((item) => item.id === activeType)?.subtitle || "Upcoming", [activeType]);

  async function toggleWaiting(item) {
    if (pendingId) return;
    setPendingId(item.id);
    setError("");
    try {
      const response = await fetch("/api/upcoming/" + encodeURIComponent(item.id) + "/waitlist", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.assign("/login?next=%2Fupcoming");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Waiting list could not be updated.");
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, isWaiting: Boolean(payload.isWaiting), waitlistCount: Number(payload.waitlistCount) || 0 }
        : entry));
    } catch (actionError) {
      setError(actionError.message || "Waiting list could not be updated.");
    } finally {
      setPendingId("");
    }
  }

  async function shareItem(item) {
    const url = window.location.origin + "/upcoming?type=" +
      encodeURIComponent(item.type) + "#upcoming-" + encodeURIComponent(item.id);
    const shareData = {
      title: item.title + " · Coming soon on Situla",
      text: "See the release countdown and join the waiting list on Situla.",
      url
    };

    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        return;
      }
    } catch (shareError) {
      if (shareError?.name === "AbortError") return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setError("Title link copied to clipboard.");
    } catch {
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      setError(copied ? "Title link copied to clipboard." : "Could not copy the share link.");
    }
  }

  return (
    <section className="upcoming-page" aria-label="Upcoming releases">
      <header className="upcoming-page-heading">
        <div>
          <span className="upcoming-eyebrow"><span className="upcoming-eyebrow-dot" /> SITULA RELEASE RADAR</span>
          <h1>Coming Soon</h1>
          <p>Discover what is launching next. Join the waiting list and see how many people are looking forward to each title.</p>
        </div>
        <div className="upcoming-heading-icon" aria-hidden="true"><CalendarClock size={29} /></div>
      </header>

      <div className="upcoming-toolbar">
        <div className="upcoming-tabs" role="tablist" aria-label="Upcoming content categories">
          {UPCOMING_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeType === tab.id}
              className={"upcoming-tab" + (activeType === tab.id ? " active" : "")}
              onClick={() => { setActiveType(tab.id); setShowMine(false); }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={"upcoming-mine-toggle" + (showMine ? " active" : "")}
          aria-pressed={showMine}
          onClick={() => setShowMine((value) => !value)}
        >
          <ListChecks size={16} /> {showMine ? "All upcoming" : "My waiting list"}
        </button>
      </div>

      <div className="upcoming-results-heading">
        <div><span>{activeLabel.toUpperCase()}</span><strong>{loading ? "Loading…" : items.length + " titles"}</strong></div>
        <small>Sorted by release date · Your local time</small>
      </div>

      {error && <p className="upcoming-inline-message" role="status">{error}</p>}

      {loading ? (
        <div className="upcoming-loading"><LoaderCircle className="upcoming-spin" size={25} /><span>Preparing the release list…</span></div>
      ) : items.length ? (
        <div className="upcoming-grid">
          {items.map((item) => (
            <article className="upcoming-card" id={"upcoming-" + item.id} key={item.id}>
              <div className="upcoming-poster">
                {item.posterMode === "embed" && item.posterUrl ? (
                  <iframe
                    src={item.posterUrl}
                    title={item.title + " poster preview"}
                    loading="lazy"
                    referrerPolicy="strict-origin"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                    allow="fullscreen; picture-in-picture"
                  />
                ) : (item.posterImageUrl || item.posterUrl) ? (
                  <img src={item.posterImageUrl || item.posterUrl} alt={item.title + " poster"} loading="lazy" decoding="async" />
                ) : (
                  <div className="upcoming-poster-fallback"><CalendarClock size={34} /><span>Coming Soon</span></div>
                )}
                <div className="upcoming-poster-badges">
                  {item.isHot && <UpcomingTag tone="hot"><Flame size={10} /> HOT</UpcomingTag>}
                  {item.isPopular && <UpcomingTag tone="popular">POPULAR</UpcomingTag>}
                  {item.isFeatured && <UpcomingTag tone="featured"><Sparkles size={10} /> FEATURED</UpcomingTag>}
                  {item.isPremium && <UpcomingTag tone="premium"><Crown size={10} /> PREMIUM</UpcomingTag>}
                </div>
                {Number(item.rating) > 0 && Number.isFinite(Number(item.rating)) && (
                  <span className="rating-pill upcoming-rating-pill">
                    <Star size={11} fill="currentColor" /> {Number(item.rating).toFixed(1)}
                  </span>
                )}
                {item.countdownEnabled && (
                  <div className="upcoming-countdown upcoming-countdown-overlay" aria-label={"Time until release: " + countdownLabel(item.releaseAt, now)}>
                    <strong>{countdownLabel(item.releaseAt, now)}</strong>
                  </div>
                )}
              </div>

              <div className="upcoming-card-body">
                <h2>{item.title}</h2>
                <div className="upcoming-card-meta">
                  <span><CalendarClock size={13} /> {dateLabel(item.releaseAt)}</span>
                </div>

                <div className="upcoming-card-actions">
                  <button
                    type="button"
                    className={"upcoming-wait-button" + (item.isWaiting ? " is-waiting" : "")}
                    onClick={() => toggleWaiting(item)}
                    disabled={pendingId === item.id}
                    aria-pressed={item.isWaiting}
                  >
                    <Bell size={16} className={!item.isWaiting ? "upcoming-bell-motion" : ""} />
                    <span>{pendingId === item.id ? "Updating…" : item.isWaiting ? "On your waiting list" : "Join waiting list"}</span>
                    <strong>{Number(item.waitlistCount || 0).toLocaleString("en-IN")}</strong>
                  </button>
                  <button type="button" className="upcoming-share-button" onClick={() => shareItem(item)} aria-label={"Share " + item.title} title="Share this title">
                    <Share2 size={16} />
                  </button>
                </div>
                <p className="upcoming-interest-note">{Number(item.waitlistCount || 0).toLocaleString("en-IN")} {Number(item.waitlistCount) === 1 ? "person is" : "people are"} waiting for this title</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="upcoming-empty">
          <span><CalendarClock size={30} /></span>
          <h2>{showMine ? "Your waiting list is empty" : "Nothing announced yet"}</h2>
          <p>{showMine ? "Join a title's waiting list and it will appear here." : "New Movies, TV Series and Anime will appear here as soon as the admin publishes them."}</p>
          {showMine && <button type="button" onClick={() => setShowMine(false)}>Browse upcoming titles</button>}
        </div>
      )}
    </section>
  );
}
