"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock, Check, Clock3, Crown, Edit3, ExternalLink, Flame, ImagePlus,
  LoaderCircle, Plus, RefreshCw, Save, Sparkles, Star, Trash2, X
} from "lucide-react";

const TYPES = [
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV Series" },
  { id: "anime", label: "Anime" }
];

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
    "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function initialForm(type = "movie") {
  const release = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    id: "",
    type,
    title: "",
    posterMode: "image",
    posterUrl: "",
    releaseAt: localDateTime(release),
    rating: "0",
    isPopular: false,
    isHot: false,
    isFeatured: false,
    isPremium: false,
    countdownEnabled: true,
    status: "published",
    keepPoster: false
  };
}

function AdminTag({ children, tone = "" }) {
  return <span className={"upcoming-admin-tag " + tone}>{children}</span>;
}

export default function UpcomingManager() {
  const [activeType, setActiveType] = useState("movie");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => initialForm());
  const [posterFile, setPosterFile] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/upcoming?type=" + activeType, {
        cache: "no-store", credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Upcoming items could not be loaded.");
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (loadError) {
      setError(loadError.message || "Upcoming items could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  useEffect(() => { loadItems(); }, [loadItems]);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setForm(initialForm(activeType));
    setPosterFile(null);
    setError("");
    setNotice("");
    setShowEditor(true);
  }

  function startEdit(item) {
    setForm({
      id: item.id,
      type: item.type,
      title: item.title || "",
      posterMode: item.posterMode || "image",
      posterUrl: item.posterUrl || "",
      releaseAt: localDateTime(item.releaseAt),
      rating: String(item.rating || 0),
      isPopular: Boolean(item.isPopular),
      isHot: Boolean(item.isHot),
      isFeatured: Boolean(item.isFeatured),
      isPremium: Boolean(item.isPremium),
      countdownEnabled: item.countdownEnabled !== false,
      status: item.status || "published",
      keepPoster: Boolean(item.hasUploadedPoster)
    });
    setPosterFile(null);
    setError("");
    setNotice("");
    setShowEditor(true);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.set("type", form.type);
      body.set("title", form.title.trim());
      body.set("posterMode", form.posterMode);
      body.set("posterUrl", form.posterUrl.trim());
      if (form.releaseAt) body.set("releaseAt", new Date(form.releaseAt).toISOString());
      body.set("rating", form.rating);
      body.set("isPopular", String(form.isPopular));
      body.set("isHot", String(form.isHot));
      body.set("isFeatured", String(form.isFeatured));
      body.set("isPremium", String(form.isPremium));
      body.set("countdownEnabled", String(form.countdownEnabled));
      body.set("status", form.status);
      body.set("keepPoster", String(form.keepPoster));
      if (posterFile) body.set("poster", posterFile);
      const endpoint = form.id ? "/api/admin/upcoming/" + encodeURIComponent(form.id) : "/api/admin/upcoming";
      const response = await fetch(endpoint, {
        method: form.id ? "PATCH" : "POST",
        credentials: "same-origin",
        body
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Upcoming item could not be saved.");
      setNotice(form.id ? "Upcoming title updated." : "Upcoming title published.");
      setShowEditor(false);
      setPosterFile(null);
      await loadItems();
    } catch (saveError) {
      setError(saveError.message || "Upcoming item could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item) {
    if (!window.confirm("Delete “" + item.title + "” and its waiting-list records?")) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/upcoming/" + encodeURIComponent(item.id), {
        method: "DELETE", credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Upcoming title could not be deleted.");
      setNotice("Upcoming title deleted.");
      await loadItems();
    } catch (deleteError) {
      setError(deleteError.message || "Upcoming title could not be deleted.");
    }
  }

  const currentTypeLabel = TYPES.find((item) => item.id === activeType)?.label || "Upcoming";

  return (
    <section className="upcoming-admin-panel">
      <div className="upcoming-admin-heading">
        <div>
          <span className="admin-kicker">RELEASE MANAGEMENT</span>
          <h2>Upcoming content</h2>
          <p>Create, schedule and manage release cards across all three catalogs. Waiting counts are synced with the public page.</p>
        </div>
        <button type="button" className="admin-primary-button" onClick={startCreate}><Plus size={16} /> Add upcoming title</button>
      </div>

      <div className="upcoming-admin-tabs" role="tablist" aria-label="Upcoming administration categories">
        {TYPES.map((type) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeType === type.id}
            className={activeType === type.id ? "active" : ""}
            key={type.id}
            onClick={() => { setActiveType(type.id); setShowEditor(false); setNotice(""); }}
          >
            {type.label}
          </button>
        ))}
      </div>

      {notice && <div className="admin-toast admin-toast-success"><Check size={15} /> {notice}</div>}
      {error && <div className="admin-toast admin-toast-error">{error}<button type="button" onClick={() => setError("")}><X size={14} /></button></div>}

      {showEditor && (
        <form className="upcoming-editor" onSubmit={saveItem}>
          <div className="upcoming-editor-heading">
            <div><span>{form.id ? "EDIT RELEASE CARD" : "NEW RELEASE CARD"}</span><h3>{form.id ? "Manage upcoming title" : "Add " + currentTypeLabel}</h3></div>
            <button type="button" className="admin-icon-button" onClick={() => setShowEditor(false)} aria-label="Close editor"><X size={18} /></button>
          </div>

          <div className="upcoming-form-grid">
            <label className="upcoming-field upcoming-field-wide">
              <span>Title</span>
              <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} maxLength={160} required placeholder="Enter movie, TV series or anime title" />
            </label>

            <label className="upcoming-field">
              <span>Release date & time</span>
              <input type="datetime-local" value={form.releaseAt} onChange={(event) => updateForm("releaseAt", event.target.value)} required />
            </label>

            <label className="upcoming-field">
              <span>Rating (0–10)</span>
              <input type="number" min="0" max="10" step="0.1" value={form.rating} onChange={(event) => updateForm("rating", event.target.value)} />
            </label>

            <div className="upcoming-field upcoming-field-wide">
              <span>Poster source</span>
              <div className="upcoming-source-switch">
                <button type="button" className={form.posterMode === "image" ? "active" : ""} onClick={() => updateForm("posterMode", "image")}><ImagePlus size={15} /> Image / Poster</button>
                <button type="button" className={form.posterMode === "embed" ? "active" : ""} onClick={() => updateForm("posterMode", "embed")}><ExternalLink size={15} /> Embed URL</button>
              </div>
              {form.posterMode === "embed" ? (
                <input type="url" value={form.posterUrl} onChange={(event) => updateForm("posterUrl", event.target.value)} placeholder="https://… embed URL" required />
              ) : (
                <>
                  <input type="url" value={form.posterUrl} onChange={(event) => { updateForm("posterUrl", event.target.value); updateForm("keepPoster", false); }} placeholder="Optional public HTTPS image URL" />
                  <label className="upcoming-file-picker">
                    <ImagePlus size={17} />
                    <span>{posterFile ? posterFile.name : form.keepPoster ? "Current uploaded poster will be kept" : "Choose a custom poster image"}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => { setPosterFile(event.target.files?.[0] || null); updateForm("keepPoster", false); }} />
                  </label>
                  <small className="upcoming-field-hint">JPG, PNG, WebP, GIF or AVIF · Maximum 4 MB.</small>
                </>
              )}
            </div>
          </div>

          <div className="upcoming-flags">
            <span>Content labels</span>
            <label><input type="checkbox" checked={form.isPopular} onChange={(event) => updateForm("isPopular", event.target.checked)} /> <Star size={14} /> Popular</label>
            <label><input type="checkbox" checked={form.isHot} onChange={(event) => updateForm("isHot", event.target.checked)} /> <Flame size={14} /> Hot</label>
            <label><input type="checkbox" checked={form.isFeatured} onChange={(event) => updateForm("isFeatured", event.target.checked)} /> <Sparkles size={14} /> Featured</label>
            <label><input type="checkbox" checked={form.isPremium} onChange={(event) => updateForm("isPremium", event.target.checked)} /> <Crown size={14} /> Premium</label>
          </div>

          <div className="upcoming-form-options">
            <label className="upcoming-toggle"><input type="checkbox" checked={form.countdownEnabled} onChange={(event) => updateForm("countdownEnabled", event.target.checked)} /><span><strong>Live countdown</strong><small>Show a real-time countdown on the public Upcoming page.</small></span></label>
            <label className="upcoming-toggle"><input type="checkbox" checked={form.status === "published"} onChange={(event) => updateForm("status", event.target.checked ? "published" : "draft")} /><span><strong>Published</strong><small>Show this title to users. Turn off to keep it as a draft.</small></span></label>
          </div>

          <div className="upcoming-editor-actions">
            <button type="button" className="admin-secondary-button" onClick={() => setShowEditor(false)}>Cancel</button>
            <button type="submit" className="admin-primary-button" disabled={saving}>
              {saving ? <LoaderCircle className="upcoming-spin" size={16} /> : <Save size={16} />}
              {saving ? "Saving…" : form.id ? "Save changes" : "Publish upcoming title"}
            </button>
          </div>
        </form>
      )}

      <div className="upcoming-admin-list-heading">
        <div><span className="admin-kicker">{currentTypeLabel.toUpperCase()}</span><h3>{items.length} managed titles</h3></div>
        <button type="button" className="admin-refresh" onClick={loadItems} disabled={loading}><RefreshCw size={14} /> Refresh</button>
      </div>

      {loading ? (
        <div className="upcoming-admin-loading"><LoaderCircle className="upcoming-spin" size={23} /> Loading {currentTypeLabel.toLowerCase()}…</div>
      ) : items.length ? (
        <div className="upcoming-admin-list">
          {items.map((item) => (
            <article className="upcoming-admin-item" key={item.id}>
              <div className="upcoming-admin-thumb">
                {item.posterMode === "embed" && item.posterUrl
                  ? <iframe src={item.posterUrl} title={item.title + " preview"} loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" />
                  : item.posterImageUrl || item.posterUrl
                    ? <img src={item.posterImageUrl || item.posterUrl} alt="" loading="lazy" />
                    : <CalendarClock size={24} />}
              </div>
              <div className="upcoming-admin-item-copy">
                <div className="upcoming-admin-item-title"><h4>{item.title}</h4><AdminTag tone={item.status === "published" ? "published" : "draft"}>{item.status}</AdminTag></div>
                <div className="upcoming-admin-item-tags">
                  {item.isPopular && <AdminTag tone="popular">Popular</AdminTag>}
                  {item.isHot && <AdminTag tone="hot">Hot</AdminTag>}
                  {item.isFeatured && <AdminTag tone="featured">Featured</AdminTag>}
                  {item.isPremium && <AdminTag tone="premium">Premium</AdminTag>}
                </div>
                <div className="upcoming-admin-item-meta">
                  <span><CalendarClock size={13} /> {new Date(item.releaseAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  {item.rating > 0 && <span><Star size={13} /> {Number(item.rating).toFixed(1)}</span>}
                  <strong><BellIcon /> {Number(item.waitlistCount || 0).toLocaleString("en-IN")} waiting</strong>
                  {item.countdownEnabled && <span><Clock3 size={13} /> Countdown on</span>}
                </div>
              </div>
              <div className="upcoming-admin-item-actions">
                <button type="button" className="admin-icon-button" onClick={() => startEdit(item)} aria-label={"Edit " + item.title}><Edit3 size={16} /></button>
                <button type="button" className="admin-icon-button is-danger" onClick={() => deleteItem(item)} aria-label={"Delete " + item.title}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="upcoming-admin-empty"><CalendarClock size={28} /><strong>No upcoming {currentTypeLabel.toLowerCase()} yet</strong><p>Add a release card to start collecting waiting-list interest.</p><button type="button" className="admin-primary-button" onClick={startCreate}><Plus size={15} /> Add first title</button></div>
      )}
    </section>
  );
}

function BellIcon() {
  return <span aria-hidden="true">♧</span>;
}
