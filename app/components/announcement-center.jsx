"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ExternalLink, Megaphone, X } from "lucide-react";
import { formatAnnouncementDateTime, resolveAnnouncementMedia } from "../../src/announcement-utils.js";

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

function dateTimeValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function announcementDate(value) {
  return formatAnnouncementDateTime(value);
}

export default function AnnouncementCenter({ onOpen }) {
  const rootRef = useRef(null);
  const [items, setItems] = useState([]);
  const [readIds, setReadIds] = useState(() => new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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
      setLoadError("");
    } catch (error) {
      if (error.name !== "AbortError") {
        setItems([]);
        setLoadError("Announcements are temporarily unavailable.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAnnouncements(controller.signal);
    const interval = window.setInterval(() => loadAnnouncements(), 60_000);
    const onFocus = () => loadAnnouncements();
    const onAuthChange = () => loadAnnouncements();
    window.addEventListener("focus", onFocus);
    window.addEventListener("situla:auth-change", onAuthChange);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("situla:auth-change", onAuthChange);
    };
  }, [loadAnnouncements]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.isRead && !readIds.has(String(item.id))).length,
    [items, readIds]
  );

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

  function toggleOpen() {
    if (!open) onOpen?.();
    setOpen((value) => !value);
  }

  return (
    <div className="header-notifications-wrap" ref={rootRef}>
      <button
        type="button"
        className="header-notification-trigger"
        onClick={toggleOpen}
        aria-label={unreadCount ? "Announcements, " + unreadCount + " unread" : "Announcements"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell size={19} strokeWidth={1.9} />
        {unreadCount > 0 && (
          <span className="header-notification-count" aria-label={unreadCount + " unread announcements"}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section className="header-notification-popover" role="dialog" aria-label="Announcements" aria-modal="false">
          <div className="header-notification-heading">
            <span>
              <strong>Announcements</strong>
              <small>{unreadCount ? unreadCount + " UNREAD UPDATES" : "SITULA UPDATES"}</small>
            </span>
            <button type="button" aria-label="Close announcements" onClick={() => setOpen(false)}>
              <X size={17} />
            </button>
          </div>
          <div className="header-notification-list">
            {loading && <p className="header-announcement-message">Loading announcements…</p>}
            {!loading && loadError && <p className="header-announcement-message">{loadError}</p>}
            {!loading && !loadError && !items.length && (
              <div className="header-announcement-empty">
                <span><Megaphone size={19} /></span>
                <strong>No announcements yet</strong>
                <p>New Situla updates will appear here.</p>
              </div>
            )}
            {items.map((item) => {
              const isRead = Boolean(item.isRead || readIds.has(String(item.id)));
              const media = resolveAnnouncementMedia(item.mediaUrl, item.imageUrl);
              const publishedAt = item.scheduledAt || item.createdAt;
              return (
                <article className={"header-announcement-item" + (isRead ? " is-read" : "")} key={item.id}>
                  <div className="header-announcement-meta">
                    <span className="header-announcement-status">{isRead ? "READ" : "NEW"}</span>
                    <time dateTime={dateTimeValue(publishedAt)}>{announcementDate(publishedAt)}</time>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="header-announcement-description">{item.description}</p>
                  {media?.type === "image" && (
                    <img className="header-announcement-media" src={media.src} alt="" loading="lazy" />
                  )}
                  {media?.type === "iframe" && (
                    <div className="header-announcement-embed">
                      <iframe
                        src={media.src}
                        title={item.title + " media"}
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  )}
                  {media?.type === "link" && (
                    <a className="header-announcement-media-link" href={media.src} target="_blank" rel="noopener noreferrer">
                      Open attached media <ExternalLink size={13} />
                    </a>
                  )}
                  {!isRead && (
                    <div className="header-announcement-footer">
                      <button type="button" onClick={() => markAsRead(item)}>
                        <Check size={14} /> Mark as read
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
