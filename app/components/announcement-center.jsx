"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Check, ChevronDown, ExternalLink, Megaphone, X } from "lucide-react";
import { resolveAnnouncementMedia } from "../../src/announcement-utils.js";

function readLocalIds(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveLocalId(id, storageKey) {
  try {
    const ids = readLocalIds(storageKey);
    ids.add(String(id));
    localStorage.setItem(storageKey, JSON.stringify([...ids].slice(-300)));
  } catch {}
}

function announcementDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short"
  }).format(date);
}



export default function AnnouncementCenter() {
  const pathname = usePathname();
  const [items, setItems] = useState([]);
  const [readIds, setReadIds] = useState(() => new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storageKey, setStorageKey] = useState("situla:announcement-reads:v1:guest");

  const loadAnnouncements = useCallback(async (signal) => {
    try {
      const response = await fetch("/api/announcements", {
        cache: "no-store",
        credentials: "same-origin",
        signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Announcements unavailable.");
      const scope = String(payload.viewerScope || "guest").replace(/[^a-zA-Z0-9:_-]/g, "");
      const key = "situla:announcement-reads:v1:" + (scope || "guest");
      const localIds = readLocalIds(key);
      setStorageKey(key);
      setReadIds(localIds);
      setItems((Array.isArray(payload.items) ? payload.items : []).map((item) => ({
        ...item,
        isRead: Boolean(item.isRead || localIds.has(String(item.id)))
      })));
    } catch (error) {
      if (error.name !== "AbortError") setItems([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pathname?.startsWith("/suspended")) return undefined;
    const controller = new AbortController();
    loadAnnouncements(controller.signal);
    const interval = window.setInterval(() => loadAnnouncements(), 60_000);
    const onFocus = () => loadAnnouncements();
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname, loadAnnouncements]);

  const unreadCount = useMemo(() => items.filter((item) => !item.isRead && !readIds.has(String(item.id))).length, [items, readIds]);
  const featured = useMemo(() => items.find((item) => !item.isRead && !readIds.has(String(item.id))) || items[0] || null, [items, readIds]);

  async function markAsRead(item) {
    const id = String(item.id);
    saveLocalId(id, storageKey);
    setReadIds((current) => new Set([...current, id]));
    setItems((current) => current.map((entry) => entry.id === id ? { ...entry, isRead: true } : entry));
    try {
      await fetch("/api/announcements/" + encodeURIComponent(id) + "/read", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
    } catch {}
  }

  if (pathname?.startsWith("/suspended") || loading || !items.length) return null;

  return (
    <>
      <aside className="site-announcement-bar" aria-label="Situla announcements">
        <span className="site-announcement-mark"><Megaphone size={16} /></span>
        <span className="site-announcement-label">ANNOUNCEMENT</span>
        <span className="site-announcement-title">{featured?.title || "Latest updates from Situla"}</span>
        {featured?.scheduledAt && <time className="site-announcement-time" dateTime={new Date(featured.scheduledAt).toISOString()}>{announcementDate(featured.scheduledAt)}</time>}
        {unreadCount > 0 && <span className="site-announcement-count">{unreadCount} new</span>}
        <button type="button" className="site-announcement-open" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <Bell size={15} /> View <ChevronDown size={14} />
        </button>
      </aside>

      {open && <div className="site-announcement-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}>
        <section className="site-announcement-panel" role="dialog" aria-modal="true" aria-label="Announcements">
          <header className="site-announcement-panel-header">
            <div><span>STAY IN THE LOOP</span><h2>Announcements</h2><p>{unreadCount ? unreadCount + " unread updates" : "You are all caught up."}</p></div>
            <button type="button" aria-label="Close announcements" onClick={() => setOpen(false)}><X size={19} /></button>
          </header>
          <div className="site-announcement-list">
            {items.map((item) => {
              const isRead = Boolean(item.isRead || readIds.has(String(item.id)));
              const media = resolveAnnouncementMedia(item.mediaUrl, item.imageUrl);
              return <article className={"site-announcement-item" + (isRead ? " is-read" : "")} key={item.id}>
                <div className="site-announcement-item-meta">
                  <span className="site-announcement-status">{isRead ? "READ" : "NEW"}</span>
                  <time dateTime={new Date(item.scheduledAt).toISOString()}>Publish time · {announcementDate(item.scheduledAt)}</time>
                </div>
                <h3>{item.title}</h3>
                <p className="site-announcement-description">{item.description}</p>
                {media?.type === "image" && <img className="site-announcement-media" src={media.src} alt="" loading="lazy" />}
                {media?.type === "iframe" && <div className="site-announcement-embed"><iframe src={media.src} title={item.title + " media"} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>}
                {media?.type === "link" && <a className="site-announcement-media-link" href={media.src} target="_blank" rel="noopener noreferrer">Open attached media <ExternalLink size={13} /></a>}
                <div className="site-announcement-item-footer">
                  <span>{item.createdAt ? "Uploaded " + announcementDate(item.createdAt) : ""}</span>
                  {!isRead && <button type="button" onClick={() => markAsRead(item)}><Check size={14} /> Mark as read</button>}
                </div>
              </article>;
            })}
          </div>
        </section>
      </div>}
    </>
  );
}
