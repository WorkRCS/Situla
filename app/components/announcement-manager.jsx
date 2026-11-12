"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Edit3, ImagePlus, LoaderCircle, Megaphone, Plus, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";

const PAGE_SIZE = 10;
const formatDateTime = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZoneName: "short" }) : "—";

function localDateTimeValue(value = new Date()) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function AnnouncementManager() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [existingImage, setExistingImage] = useState("");
  const [removeImage, setRemoveImage] = useState(false);

  const endpoint = "/api/admin/announcements";

  async function load(reset = true) {
    if (reset) setLoading(true);
    setError("");
    try {
      const nextPage = reset ? 1 : page + 1;
      const response = await fetch(endpoint + "?page=" + nextPage + "&limit=" + PAGE_SIZE, {
        cache: "no-store", credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Announcements could not be loaded.");
      setItems((current) => reset ? (payload.items || []) : [...current, ...(payload.items || [])]);
      setPage(Number(payload.page) || nextPage);
      setTotal(Number(payload.total) || 0);
      setHasMore(Boolean(payload.hasMore));
    } catch (loadError) {
      setError(loadError.message || "Announcements could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(true); }, []);

  function resetEditor() {
    setTitle("");
    setDescription("");
    setMediaUrl("");
    setScheduledAt(localDateTimeValue());
    setImageFile(null);
    setExistingImage("");
    setRemoveImage(false);
    setEditing(null);
  }

  function openCreate() {
    resetEditor();
    setEditorOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setTitle(item.title || "");
    setDescription(item.description || "");
    setMediaUrl(item.mediaUrl || "");
    setScheduledAt(localDateTimeValue(item.scheduledAt || item.createdAt));
    setImageFile(null);
    setExistingImage(item.uploadedImageUrl || "");
    setRemoveImage(false);
    setEditorOpen(true);
  }

  async function save(status) {
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("description", description.trim());
      form.set("mediaUrl", mediaUrl.trim());
      form.set("status", status);
      if (scheduledAt) form.set("scheduledAt", new Date(scheduledAt).toISOString());
      if (imageFile) form.set("image", imageFile);
      if (removeImage) form.set("removeImage", "true");

      const response = await fetch(editing ? endpoint + "/" + editing.id : endpoint, {
        method: editing ? "PATCH" : "POST",
        credentials: "same-origin",
        body: form
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Announcement could not be saved.");
      setNotice(editing ? "Announcement updated." : status === "draft" ? "Draft saved." : "Announcement published or scheduled.");
      setEditorOpen(false);
      resetEditor();
      await load(true);
    } catch (saveError) {
      setError(saveError.message || "Announcement could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item) {
    if (!window.confirm("Delete the announcement “" + item.title + "”? This also deletes its read receipts.")) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint + "/" + item.id, {
        method: "DELETE",
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Announcement could not be deleted.");
      setNotice("Announcement deleted.");
      await load(true);
    } catch (deleteError) {
      setError(deleteError.message || "Announcement could not be deleted.");
    }
  }

  const uploadLabel = useMemo(() => imageFile ? imageFile.name : existingImage ? "Uploaded image attached" : "No uploaded image", [imageFile, existingImage]);

  return (
    <section className="admin-section-panel announcement-admin-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="admin-kicker">SITE COMMUNICATION</span>
          <h2>Announcements</h2>
          <p>Create updates for every visitor, schedule the exact publication time, and attach an image or supported video embed.</p>
        </div>
        <button type="button" className="admin-primary-button" onClick={openCreate}><Plus size={16} /> New announcement</button>
      </div>

      {notice && <div className="announcement-admin-notice"><Check size={16} /> {notice}<button type="button" onClick={() => setNotice("")}><X size={14} /></button></div>}
      {error && <p className="admin-inline-error">{error}</p>}

      {loading ? (
        <div className="admin-list-loading"><LoaderCircle className="admin-spin" size={18} /> Loading announcements…</div>
      ) : items.length ? (
        <div className="announcement-admin-list">
          {items.map((item) => <article className="announcement-admin-card" key={item.id}>
            <div className="announcement-admin-card-main">
              <span className="announcement-admin-icon"><Megaphone size={18} /></span>
              <div className="announcement-admin-card-copy">
                <div className="announcement-admin-card-title"><h3>{item.title}</h3><span className={"announcement-admin-status status-" + item.status}>{item.status}</span></div>
                <p>{item.description}</p>
                <div className="announcement-admin-card-meta"><span><CalendarClock size={13} /> {formatDateTime(item.scheduledAt)}</span><span>Created {formatDateTime(item.createdAt)}</span>{item.mediaUrl && <span>URL media</span>}{item.hasImage && <span>Uploaded image</span>}</div>
              </div>
            </div>
            <div className="announcement-admin-actions">
              <button type="button" className="admin-row-action" onClick={() => openEdit(item)}><Edit3 size={14} /> Edit</button>
              <button type="button" className="announcement-admin-delete" onClick={() => remove(item)}><Trash2 size={14} /> Delete</button>
            </div>
          </article>)}
          {hasMore && <button type="button" className="admin-load-more" onClick={() => load(false)} disabled={loading}><RefreshCw size={14} /> Load 10 more</button>}
          {!hasMore && <p className="admin-end-list">Showing all {total.toLocaleString("en-IN")} announcements</p>}
        </div>
      ) : (
        <div className="announcement-admin-empty"><Megaphone size={27} /><strong>No announcements yet</strong><p>Publish now or schedule a message to appear in the site-wide announcement bar.</p><button type="button" className="admin-primary-button" onClick={openCreate}><Plus size={15} /> Create announcement</button></div>
      )}

      {editorOpen && <div className="admin-modal-backdrop announcement-editor-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) setEditorOpen(false);
      }}>
        <section className="admin-modal admin-modal-wide announcement-editor" role="dialog" aria-modal="true" aria-label={editing ? "Edit announcement" : "New announcement"}>
          <header className="admin-modal-header">
            <div><span className="admin-kicker">SITE COMMUNICATION</span><h2>{editing ? "Edit announcement" : "New announcement"}</h2><p>Visitors see it after the scheduled date and time.</p></div>
            <button type="button" className="admin-icon-button" aria-label="Close" disabled={saving} onClick={() => setEditorOpen(false)}><X size={20} /></button>
          </header>
          <form className="announcement-editor-form" onSubmit={(event) => { event.preventDefault(); save("publish"); }}>
            <label>Title <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="Announcement title" /></label>
            <label>Description <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={5} required placeholder="Write the announcement details…" /></label>
            <label>Publication date &amp; time <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required /></label>
            <p className="announcement-editor-hint">The selected time is saved as an exact timestamp and shown in each visitor’s local time zone. Future times are scheduled automatically.</p>
            <label>Image / embed URL (optional) <input type="url" value={mediaUrl} onChange={(event) => { setMediaUrl(event.target.value); if (event.target.value) { setImageFile(null); setRemoveImage(true); } }} placeholder="https://example.com/image.jpg or YouTube / Vimeo link" /></label>
            <p className="announcement-editor-hint">Direct image URLs show as images. Supported YouTube and Vimeo URLs render in an embedded player. Other HTTPS links appear as a safe external link.</p>
            <div className="announcement-upload-box">
              <span><ImagePlus size={18} /> Upload image instead</span>
              <label className="announcement-upload-control"><UploadCloud size={16} /> Choose image file <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => { const file = event.target.files?.[0] || null; setImageFile(file); if (file) { setMediaUrl(""); setRemoveImage(false); } }} /></label>
              <small>{uploadLabel} · JPG, PNG, WebP, GIF or AVIF · maximum 4 MB</small>
              {existingImage && !removeImage && !imageFile && <div className="announcement-existing-image"><img src={existingImage} alt="Current announcement attachment" /><button type="button" onClick={() => { setExistingImage(""); setRemoveImage(true); }}>Remove attached image</button></div>}
            </div>
            {error && <p className="admin-inline-error">{error}</p>}
            <div className="announcement-editor-actions">
              <button type="button" className="admin-mini-neutral" disabled={saving} onClick={() => save("draft")}>{saving ? "Saving…" : "Save draft"}</button>
              <button type="submit" className="admin-primary-button" disabled={saving || !title.trim() || !description.trim()}>{saving ? "Saving…" : "Publish / schedule"}</button>
            </div>
          </form>
        </section>
      </div>}
    </section>
  );
}
