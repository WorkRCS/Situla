"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { optimizeTmdbImageUrl } from "../../src/media-image.js";
import {
  Bookmark, CalendarDays, Film, House, PanelLeftClose, PanelLeftOpen, PlayCircle,
  Settings, Tv, UserRound
} from "lucide-react";

export const SITE_NAV_ITEMS = [
  { id: "home", href: "/", label: "Home", icon: House },
  { id: "movies", href: "/movies", label: "Movies", icon: Film },
  { id: "tv", href: "/tv", label: "TV Series", icon: Tv },
  { id: "anime", href: "/anime", label: "Anime", icon: PlayCircle },
  { id: "upcoming", href: "/upcoming", label: "Upcoming", icon: CalendarDays },
  { id: "saved", href: "/saved", label: "Saved", icon: Bookmark },
  { id: "settings", href: "/settings", label: "Settings", icon: Settings },
  { id: "profile", href: "/profile", label: "Profile", icon: UserRound }
];

function isNavActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
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
  showBrand = false,
  continueItems,
  onResume,
  onCollapsedChange
}) {
  const pathname = usePathname() || "/";
  const [statusUnread, setStatusUnread] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("situla:sidebar-collapsed:v1") === "1");
    } catch {}
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
  return (
    <aside className={"home-sidebar site-sidebar" + (collapsed ? " is-collapsed" : "")} aria-label="Main navigation">
      <div className="site-sidebar-heading">
        {showBrand ? (
          <Link href="/" className="site-sidebar-brand" aria-label="Situla home">
            <img src="/icon.svg" alt="" width="38" height="38" />
            <span><strong>SITULA</strong><small>DISCOVER · WATCH</small></span>
          </Link>
        ) : (
          <span className="site-sidebar-caption">NAVIGATION</span>
        )}
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
      <nav className="home-sidebar-nav" aria-label="Primary navigation">
        {SITE_NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const selected = active ? active === item.id : isNavActive(pathname, item.href);
          return (
            <span className="site-sidebar-nav-item" key={item.id}>
              {index === 5 && <span className="home-sidebar-divider" aria-hidden="true" />}
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
      </nav>
      {continueItems && <ContinueWatching items={continueItems} onResume={onResume} />}
    </aside>
  );
}

export function SiteWorkspace({ children }) {
  const pathname = usePathname() || "/";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <div className={"site-workspace" + (sidebarCollapsed ? " is-sidebar-collapsed" : "")}>
      <SiteSidebar showBrand onCollapsedChange={setSidebarCollapsed} />
      <div className="site-workspace-main">{children}</div>
      <nav className="site-workspace-mobile-nav" aria-label="Main navigation">
        {SITE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const selected = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch={true}
              className={"site-workspace-mobile-link" + (selected ? " active" : "")}
              aria-current={selected ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={selected ? 2.3 : 1.9} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
