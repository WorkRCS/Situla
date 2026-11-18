"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { optimizeTmdbImageUrl } from "../../src/media-image.js";
import {
  Bookmark, CalendarDays, Film, House, PanelLeftClose, PanelLeftOpen, PlayCircle,
  Settings, ShieldCheck, Tv
} from "lucide-react";

export const SITE_NAV_ITEMS = [
  { id: "home", href: "/", label: "Home", icon: House },
  { id: "movies", href: "/movies", label: "Movies", icon: Film },
  { id: "tv", href: "/tv", label: "TV Series", icon: Tv },
  { id: "anime", href: "/anime", label: "Anime", icon: PlayCircle },
  { id: "upcoming", href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { id: "saved", href: "/saved", label: "Saved", icon: Bookmark },
  { id: "settings", href: "/settings", label: "Settings", icon: Settings }
];

export const SITE_KIDS_NAV_ITEMS = [
  { id: "home", href: "/", label: "Home", icon: House },
  { id: "cartoonMovies", href: "/cartoons/movies", label: "Cartoon Movies", icon: Film },
  { id: "cartoonTv", href: "/cartoons/tv", label: "TV Series", icon: Tv },
  { id: "saved", href: "/saved", label: "My List", icon: Bookmark },
  { id: "settings", href: "/settings", label: "Settings", icon: Settings }
];

// Profile is intentionally omitted from navigation; it remains in the header account menu.
export const SITE_MOBILE_NAV_ITEMS = SITE_NAV_ITEMS
  .filter((item) => item.id !== "profile")
  .map((item) => item.id === "tv" ? { ...item, label: "TV" } : item);

export const SITE_KIDS_MOBILE_NAV_ITEMS = SITE_KIDS_NAV_ITEMS;

function isNavActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function isMostSpecificNavActive(pathname, item, items) {
  if (!isNavActive(pathname, item.href)) return false;
  return !items.some((candidate) => candidate.href !== item.href &&
    candidate.href.startsWith(item.href + "/") &&
    isNavActive(pathname, candidate.href));
}

function ContinueWatching({ items = [], onResume }) {
  if (!onResume) return null;
  return (
    <section className="home-sidebar-watch" aria-label="Continue watching">
      <div className="home-sidebar-section-title">Continue Watching</div>
      {items.slice(0, 4).map((item) => {
        const duration = Math.max(0, Number(item.duration) || 0);
        const watched = Math.min(duration || Number(item.watched) || 0, Math.max(0, Number(item.watched) || 0));
        const progress = duration > 0 ? Math.max(0, Math.min(100, (watched / duration) * 100)) : 0;
        const typeLabel = item.mediaType === "tv" ? "TV SERIES" : item.mediaType === "anime" ? "ANIME" : "MOVIE";
        return (
          <button key={item.key} type="button" className="home-continue-item" onClick={() => onResume(item)}>
            <span className="home-continue-art">
              {item.posterUrl
                ? <img src={optimizeTmdbImageUrl(item.posterUrl, "w92")} alt="" loading="lazy" decoding="async" />
                : <Film size={17} />}
              <span className="home-continue-play"><PlayCircle size={11} /></span>
            </span>
            <span className="home-continue-copy">
              <strong>{item.title || "Untitled"}</strong>
              <small>{typeLabel}{item.episode ? " · EP " + item.episode : ""}</small>
              <span className="home-continue-progress"><i style={{ width: progress + "%" }} /></span>
            </span>
          </button>
        );
      })}
      {!items.length && <p className="home-sidebar-empty">Your recent watches will appear here.</p>}
    </section>
  );
}

export function SiteSidebar({
  active,
  upcomingHasUnread,
  continueItems,
  onResume,
  onCollapsedChange,
  kidsMode = false
}) {
  const pathname = usePathname() || "/";
  const [statusUnread, setStatusUnread] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      const savedPreference = window.localStorage.getItem("situla:sidebar-collapsed:v1");
      if (savedPreference === "1") setCollapsed(true);
      else if (savedPreference === "0") setCollapsed(false);
      else setCollapsed(window.matchMedia("(min-width: 1101px)").matches);
    } catch {
      setCollapsed(false);
    }
  }, []);

  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  useEffect(() => {
    if (typeof upcomingHasUnread === "boolean") return;
    let active = true;
    async function refreshStatus() {
      try {
        const response = await fetch("/api/upcoming/status", { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (active && response.ok) setStatusUnread(Boolean(payload.hasUnread));
      } catch {}
    }
    refreshStatus();
    const interval = window.setInterval(refreshStatus, 30_000);
    window.addEventListener("focus", refreshStatus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshStatus);
    };
  }, [upcomingHasUnread]);

  const showUpcomingLive = typeof upcomingHasUnread === "boolean" ? upcomingHasUnread : statusUnread;
  const navItems = kidsMode ? SITE_KIDS_NAV_ITEMS : SITE_NAV_ITEMS;
  const activeItem = navItems.some((item) => item.id === active) ? active : null;
  const discoverItems = kidsMode ? navItems.slice(0, 3) : navItems.slice(0, 5);
  const personalItems = kidsMode ? navItems.slice(3) : navItems.slice(5);
  return (
    <aside className={"home-sidebar site-sidebar" + (collapsed ? " is-collapsed" : "")} aria-label="Main navigation">
      <div className="site-sidebar-heading">
        <Link href="/" className="site-sidebar-brand" aria-label="Situla home">
          <img src="/icon.svg" alt="" width="38" height="38" />
          <span><strong>SITULA</strong><small>DISCOVER · WATCH</small></span>
        </Link>
        <button
          type="button"
          className="site-sidebar-toggle"
          onClick={() => setCollapsed((value) => {
            const nextValue = !value;
            try { window.localStorage.setItem("situla:sidebar-collapsed:v1", nextValue ? "1" : "0"); } catch {}
            return nextValue;
          })}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
      <nav className="home-sidebar-nav site-sidebar-navigation" aria-label="Primary navigation">
        <div className="site-sidebar-nav-group">
          <span className="site-sidebar-section-label">DISCOVER</span>
          {discoverItems.map((item) => {
            const Icon = item.icon;
            const selected = activeItem
              ? activeItem === item.id
              : isMostSpecificNavActive(pathname, item, navItems);
            return (
              <span className="site-sidebar-nav-item" key={item.id}>
                <Link
                  href={item.href}
                  prefetch={true}
                  className={"home-side-link" + (selected ? " active" : "")}
                  aria-current={selected ? "page" : undefined}
                  title={item.label}
                >
                  <Icon size={17} strokeWidth={selected ? 2.2 : 1.9} />
                  <span>{item.label}</span>
                  {item.id === "upcoming" && showUpcomingLive && (
                    <b className="upcoming-nav-live" aria-label="New releases waiting for your reminder">LIVE</b>
                  )}
                </Link>
              </span>
            );
          })}
        </div>
        <div className="site-sidebar-nav-group site-sidebar-nav-group-secondary">
          <span className="home-sidebar-divider" aria-hidden="true" />
          <span className="site-sidebar-section-label">YOUR SPACE</span>
          {personalItems.map((item) => {
            const Icon = item.icon;
            const selected = activeItem
              ? activeItem === item.id
              : isMostSpecificNavActive(pathname, item, navItems);
            return (
              <span className="site-sidebar-nav-item" key={item.id}>
                <Link
                  href={item.href}
                  prefetch={true}
                  className={"home-side-link" + (selected ? " active" : "")}
                  aria-current={selected ? "page" : undefined}
                  title={item.label}
                >
                  <Icon size={17} strokeWidth={selected ? 2.2 : 1.9} />
                  <span>{item.label}</span>
                </Link>
              </span>
            );
          })}
        </div>
      </nav>
      {continueItems && <ContinueWatching items={continueItems} onResume={onResume} />}
      <div className="site-sidebar-footer" aria-label="Situla workspace">
        <span className="site-sidebar-footer-mark"><ShieldCheck size={15} strokeWidth={1.9} /></span>
        <span className="site-sidebar-footer-copy"><strong>SITULA WORKSPACE</strong><small>Discover · Watch · Belong</small></span>
      </div>
    </aside>
  );
}

export function SiteWorkspace({ children, kidsMode }) {
  const pathname = usePathname() || "/";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [serverKidsMode, setServerKidsMode] = useState(false);

  useEffect(() => {
    if (typeof kidsMode === "boolean") {
      setServerKidsMode(kidsMode);
      return undefined;
    }
    const controller = new AbortController();
    fetch("/api/kids-mode", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (response.ok && !controller.signal.aborted) setServerKidsMode(Boolean(payload.enabled));
    }).catch(() => {});
    return () => controller.abort();
  }, [kidsMode]);

  const activeKidsMode = typeof kidsMode === "boolean" ? kidsMode : serverKidsMode;
  return (
    <div className={"site-workspace" + (sidebarCollapsed ? " is-sidebar-collapsed" : "")}>
      <SiteSidebar onCollapsedChange={setSidebarCollapsed} kidsMode={activeKidsMode} />
      <div className="site-workspace-main">{children}</div>
      <nav className={"bottom-nav site-workspace-mobile-nav" + (activeKidsMode ? " is-kids-nav" : "")} aria-label="Main navigation">
        {(activeKidsMode ? SITE_KIDS_MOBILE_NAV_ITEMS : SITE_MOBILE_NAV_ITEMS).map((item) => {
          const Icon = item.icon;
          const mobileItems = activeKidsMode ? SITE_KIDS_MOBILE_NAV_ITEMS : SITE_MOBILE_NAV_ITEMS;
          const selected = isMostSpecificNavActive(pathname, item, mobileItems);
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch={true}
              className={"nav-button site-workspace-mobile-link" + (selected ? " active" : "")}
              aria-current={selected ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={selected ? 2.25 : 1.9} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
