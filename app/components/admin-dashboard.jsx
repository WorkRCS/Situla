"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, ArrowLeft, Ban, BadgeCheck, CalendarClock, Check, ChevronDown, Clock3,
  CreditCard, Crown, Download, Laptop, LoaderCircle, LogOut, Mail, Monitor,
  MousePointerClick, RefreshCw, Search, Shield, ShieldCheck, Smartphone, Tablet,
  UserRound, Users, X, CircleDollarSign, Eye, Globe2, History, UserPlus, UserX, Megaphone
} from "lucide-react";
import AnnouncementManager from "./announcement-manager.jsx";
import UpcomingManager from "./upcoming-manager.jsx";

const PAGE_SIZE = 10;
const dateTime = (value) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
const dateOnly = (value) => value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";
const duration = (seconds = 0) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? hours + "h " + minutes + "m" : minutes + "m";
};
const inr = (minor = 0) => "₹" + (Math.max(0, Number(minor) || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const previewExpiry = (months) => {
  const next = new Date();
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + Number(months));
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
};
const userName = (user) => user?.name || user?.email?.split("@")[0] || "User";

function MetricCard({ icon: Icon, label, value, hint, onClick, tone = "" }) {
  return (
    <button type="button" className={"admin-metric-card " + tone} onClick={onClick} disabled={!onClick}>
      <span className="admin-metric-icon"><Icon size={19} /></span>
      <span className="admin-metric-copy"><small>{label}</small><strong>{value ?? "—"}</strong><em>{hint || "Updated live"}</em></span>
      {onClick && <span className="admin-metric-action"><ChevronDown size={16} /></span>}
    </button>
  );
}

function EmptyState({ title, detail }) {
  return <div className="admin-empty"><span><Activity size={24} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

function DeviceGlyph({ type }) {
  if (type === "Mobile") return <Smartphone size={16} />;
  if (type === "Tablet") return <Tablet size={16} />;
  return <Monitor size={16} />;
}

function ModalFrame({ title, subtitle, onClose, children, wide = true }) {
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={"admin-modal " + (wide ? "admin-modal-wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <header className="admin-modal-header">
          <div><span className="admin-kicker">SITULA ADMIN</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="admin-icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="admin-modal-body">{children}</div>
      </section>
    </div>
  );
}

export default function AdminDashboard() {
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [denied, setDenied] = useState(false);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState("guests");
  const [modal, setModal] = useState("");
  const [segment, setSegment] = useState("free");
  const [search, setSearch] = useState("");
  const [salesStatus, setSalesStatus] = useState("all");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [error, setError] = useState("");
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [guestDetail, setGuestDetail] = useState(null);
  const [guestPage, setGuestPage] = useState(1);
  const [guestMore, setGuestMore] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignUser, setAssignUser] = useState(null);
  const [durationMonths, setDurationMonths] = useState("12");
  const [suspendUser, setSuspendUser] = useState(null);
  const [suspendHours, setSuspendHours] = useState("168");
  const [suspendReason, setSuspendReason] = useState("");
  const [mutationLoading, setMutationLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const listBodyRef = useRef(null);
  const sentinelRef = useRef(null);
  const requestLock = useRef(false);
  const listRequestVersion = useRef(0);
  const listAbortController = useRef(null);

  const refreshStats = useCallback(async () => {
    const response = await fetch("/api/admin/dashboard", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("Dashboard data could not be loaded.");
    setStats(await response.json());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (!alive) return;
        if (payload.code === "ACCOUNT_SUSPENDED") {
          window.location.replace("/suspended");
          return;
        }
        if (!response.ok || payload.user?.role !== "admin") {
          setDenied(true);
          setChecking(false);
          return;
        }
        setAuthorized(true);
        await refreshStats();
      } catch {
        if (alive) setError("Could not verify the administrator session.");
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshStats]);

  useEffect(() => {
    if (!authorized) return undefined;
    const refreshVisibleStats = () => {
      if (document.visibilityState === "visible") {
        refreshStats().catch((refreshError) => {
          setError(refreshError.message || "Could not refresh dashboard activity.");
        });
      }
    };
    const interval = window.setInterval(refreshVisibleStats, 15 * 1000);
    document.addEventListener("visibilitychange", refreshVisibleStats);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisibleStats);
    };
  }, [authorized, refreshStats]);

  const endpoint = modal === "guests" ? "/api/admin/guests" :
    modal === "users" ? "/api/admin/users?segment=" + encodeURIComponent(segment) + "&search=" + encodeURIComponent(search.trim()) :
    modal === "sales" ? "/api/admin/sales?status=" + encodeURIComponent(salesStatus) : "";

  const loadPage = useCallback(async (nextPage, replace = false, requestVersion = listRequestVersion.current) => {
    if (!endpoint || requestVersion !== listRequestVersion.current) return;
    if (requestLock.current && !replace) return;

    if (replace) listAbortController.current?.abort();
    const controller = new AbortController();
    listAbortController.current = controller;
    requestLock.current = true;
    setListLoading(true);
    setError("");

    try {
      const joiner = endpoint.includes("?") ? "&" : "?";
      const response = await fetch(endpoint + joiner + "page=" + nextPage + "&limit=" + PAGE_SIZE, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load records.");
      if (requestVersion !== listRequestVersion.current) return;

      if (!Array.isArray(payload.items)) {
        throw new Error("The server returned an invalid record list.");
      }
      const actualPage = Number.isSafeInteger(payload.page) && payload.page > 0 ? payload.page : nextPage;
      const actualTotal = Math.max(0, Number(payload.total) || 0);
      setRows((current) => {
        if (replace || actualPage <= 1) return payload.items;
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...payload.items.filter((item) => !existingIds.has(item.id))];
      });
      setPage(actualPage);
      setTotal(actualTotal);
      setHasMore(Boolean(payload.hasMore) && payload.items.length > 0 && actualPage * PAGE_SIZE < actualTotal);
      setListReady(true);
    } catch (loadError) {
      if (loadError.name !== "AbortError" && requestVersion === listRequestVersion.current) {
        setError(loadError.message || "Could not load records.");
      }
    } finally {
      if (requestVersion === listRequestVersion.current && listAbortController.current === controller) {
        listAbortController.current = null;
        requestLock.current = false;
        setListLoading(false);
      }
    }
  }, [endpoint]);

  useEffect(() => {
    if (!modal || selectedGuest || selectedUser || !authorized) return;

    const requestVersion = ++listRequestVersion.current;
    listAbortController.current?.abort();
    listAbortController.current = null;
    requestLock.current = false;

    setRows([]);
    setPage(0);
    setTotal(0);
    setHasMore(false);
    setListReady(false);
    setListLoading(false);
    setError("");

    const timer = window.setTimeout(
      () => loadPage(1, true, requestVersion),
      modal === "users" ? 180 : 0
    );
    return () => {
      window.clearTimeout(timer);
      if (listRequestVersion.current === requestVersion) {
        listRequestVersion.current += 1;
        listAbortController.current?.abort();
        listAbortController.current = null;
        requestLock.current = false;
      }
    };
  }, [modal, segment, search, salesStatus, authorized, selectedGuest, selectedUser, loadPage]);

  useEffect(() => {
    // Do not allow page two to load until page one has returned actual records.
    if (!modal || !listReady || rows.length === 0 || !hasMore || listLoading || selectedGuest || selectedUser) return;
    const root = listBodyRef.current;
    const target = sentinelRef.current;
    const requestVersion = listRequestVersion.current;
    if (!root || !target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !requestLock.current) {
        loadPage(page + 1, false, requestVersion);
      }
    }, { root, rootMargin: "100px", threshold: 0.1 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [modal, listReady, rows.length, hasMore, listLoading, page, loadPage, selectedGuest, selectedUser]);

  const openModal = (name, userSegment = "all") => {
    listRequestVersion.current += 1;
    listAbortController.current?.abort();
    listAbortController.current = null;
    requestLock.current = false;
    setListLoading(false);
    setModal(name);
    setRows([]);
    setPage(0);
    setTotal(0);
    setHasMore(false);
    setListReady(false);
    setSelectedGuest(null);
    setGuestDetail(null);
    setSelectedUser(null);
    setUserDetail(null);
    setSearch("");
    setSegment(name === "users" ? userSegment : "free");
    setSalesStatus("all");
    setNotice("");
  };

  async function openGuest(guest) {
    setSelectedGuest(guest);
    setGuestLoading(true);
    setGuestPage(1);
    try {
      const response = await fetch("/api/admin/guests/" + guest.id + "?page=1", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Guest details unavailable.");
      setGuestDetail(payload);
      setGuestMore(Boolean(payload.activityPage?.hasMore));
    } catch (loadError) {
      setError(loadError.message || "Guest details unavailable.");
    } finally { setGuestLoading(false); }
  }

  async function loadUserActivityMore() {
    if (!selectedUser || detailLoading || !userDetail?.activityPage?.hasMore) return;
    setDetailLoading(true);
    try {
      const nextPage = userDetail.activityPage.page + 1;
      const response = await fetch("/api/admin/users/" + selectedUser.id + "?activityPage=" + nextPage, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "More user activity unavailable.");
      setUserDetail((current) => current ? {
        ...current,
        activity: [...current.activity, ...payload.activity],
        activityPage: payload.activityPage
      } : payload);
    } catch (loadError) {
      setError(loadError.message || "Could not load more activity.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadGuestMore() {
    if (!selectedGuest || guestLoading || !guestMore) return;
    setGuestLoading(true);
    try {
      const nextPage = guestPage + 1;
      const response = await fetch("/api/admin/guests/" + selectedGuest.id + "?page=" + nextPage, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "More guest activity unavailable.");
      setGuestDetail((current) => current ? { ...current, activity: [...current.activity, ...payload.activity], playback: current.playback } : payload);
      setGuestPage(nextPage);
      setGuestMore(Boolean(payload.activityPage?.hasMore));
    } catch (loadError) { setError(loadError.message || "Could not load more activity."); }
    finally { setGuestLoading(false); }
  }

  async function openUser(user) {
    setSelectedUser(user);
    setDetailLoading(true);
    setUserDetail(null);
    try {
      const response = await fetch("/api/admin/users/" + user.id, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "User details unavailable.");
      setUserDetail(payload);
    } catch (loadError) { setError(loadError.message || "User details unavailable."); }
    finally { setDetailLoading(false); }
  }

  async function mutate(url, method, body, successMessage) {
    setMutationLoading(true);
    setError("");
    try {
      const response = await fetch(url, {
        method, credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The requested change failed.");
      setNotice(successMessage);
      setAssignUser(null);
      setSuspendUser(null);
      await refreshStats();
      if (modal === "users") {
        await loadPage(1, true);
        if (selectedUser) await openUser({ id: selectedUser.id });
      }
      return true;
    } catch (mutationError) {
      setError(mutationError.message || "The requested change failed.");
      return false;
    } finally { setMutationLoading(false); }
  }

  async function assignPremium() {
    if (!assignUser) return;
    await mutate("/api/admin/users/" + assignUser.id + "/membership", "PATCH", {
      planId: "premium", durationMonths: Number(durationMonths)
    }, "Premium assigned for " + durationMonths + " months. This is an admin grant, not a paid sale.");
  }

  async function removePremium(user) {
    if (!window.confirm("Remove Premium from " + user.email + "?")) return;
    await mutate("/api/admin/users/" + user.id + "/membership", "PATCH", {
      planId: "free", reason: "Removed by administrator"
    }, "Premium access removed.");
  }

  async function suspendAccount() {
    if (!suspendUser) return;
    await mutate("/api/admin/users/" + suspendUser.id + "/suspension", "POST", {
      durationHours: Number(suspendHours), reason: suspendReason
    }, "Account suspension applied.");
  }

  async function unsuspendAccount(user) {
    if (!window.confirm("Restore access for " + user.email + "?")) return;
    await mutate("/api/admin/users/" + user.id + "/suspension", "DELETE", null, "Account access restored.");
  }

  function closeModal() {
    listRequestVersion.current += 1;
    listAbortController.current?.abort();
    listAbortController.current = null;
    requestLock.current = false;
    setListLoading(false);
    setListReady(false);
    setModal("");
    setSelectedGuest(null); setGuestDetail(null);
    setSelectedUser(null); setUserDetail(null);
    setAssignUser(null); setSuspendUser(null);
  }

  if (checking) {
    return <main className="admin-page admin-page-state"><LoaderCircle className="admin-spin" size={30} /><p>Verifying administrator access…</p></main>;
  }
  if (denied || !authorized) {
    return <main className="admin-page admin-page-state"><Shield size={36} /><h1>Administrator access only</h1><p>This page is available only to accounts with the database admin role.</p><a href="/" className="admin-primary-link">Back to Situla</a></main>;
  }

  return (
    <main className="admin-page">
      <div className="admin-shell">
        <header className="admin-topbar">
          <a href="/" className="admin-brand"><img src="/icon.svg" alt="" /><span><b>SITULA</b><small>CONTROL CENTER</small></span></a>
          <div className="admin-topbar-right"><span className="admin-secure-label"><ShieldCheck size={15} /> Role verified</span><a href="/" className="admin-back-link"><ArrowLeft size={15} /> Back to site</a></div>
        </header>

        <section className="admin-heading-row">
          <div><span className="admin-kicker">SITULA / ADMINISTRATION</span><h1>Admin dashboard</h1><p>Manage guests, members, Premium access, account security and verified payment records.</p></div>
          <button type="button" className="admin-refresh" onClick={() => refreshStats().catch((e) => setError(e.message))}><RefreshCw size={15} /> Refresh data</button>
        </section>

        <nav className="admin-main-tabs" aria-label="Admin dashboard sections">
          <button className={activeTab === "guests" ? "active" : ""} onClick={() => setActiveTab("guests")}><Globe2 size={17} /> Guests <span>{stats?.guests?.total ?? "—"}</span></button>
          <button className={activeTab === "users" ? "active" : ""} onClick={() => setActiveTab("users")}><Users size={17} /> Users <span>{stats?.users?.total ?? "—"}</span></button>
          <button className={activeTab === "sales" ? "active" : ""} onClick={() => setActiveTab("sales")}><CircleDollarSign size={17} /> Sales <span>{stats?.sales?.total ?? "—"}</span></button>
          <button className={activeTab === "announcements" ? "active" : ""} onClick={() => setActiveTab("announcements")}><Megaphone size={17} /> Announcements</button>
          <button className={activeTab === "upcoming" ? "active" : ""} onClick={() => setActiveTab("upcoming")}><CalendarClock size={17} /> Upcoming</button>
        </nav>

        {activeTab === "guests" && <section className="admin-section-panel">
          <div className="admin-panel-heading"><div><span className="admin-kicker">ANONYMOUS VISITORS</span><h2>Guest analytics</h2><p>Unique guest identities are grouped by the server-side IP hash.</p></div><button onClick={() => openModal("guests")} className="admin-primary-button"><Eye size={16} /> View guest records</button></div>
          <div className="admin-metric-grid admin-metric-grid-three">
            <MetricCard icon={Globe2} label="Total guests" value={stats?.guests?.total?.toLocaleString("en-IN")} hint="Unique guest IP identities" onClick={() => openModal("guests")} />
            <MetricCard icon={Activity} label="Online now" value={stats?.guests?.online?.toLocaleString("en-IN")} hint="Visible and recently active · refreshes every 15 seconds" tone="admin-metric-highlight" onClick={() => openModal("guests")} />
            <MetricCard icon={Clock3} label="Offline" value={stats?.guests?.offline?.toLocaleString("en-IN")} hint="Not active in the last 2 minutes" onClick={() => openModal("guests")} />
          </div>
          <div className="admin-info-note"><ShieldCheck size={18} /><p>Guest IPs collected from now on are encrypted at rest and shown only in admin detail views. Older guest records contain hashed IPs only and cannot be reversed.</p></div>
        </section>}

        {activeTab === "users" && <section className="admin-section-panel">
          <div className="admin-panel-heading"><div><span className="admin-kicker">ACCOUNT DIRECTORY</span><h2>Member management</h2><p>Search by email, inspect sessions and devices, assign or remove Premium, and suspend accounts.</p></div><button onClick={() => openModal("users")} className="admin-primary-button"><Users size={16} /> Manage users</button></div>
          <div className="admin-metric-grid admin-metric-grid-five">
            <MetricCard icon={Users} label="Total users" value={stats?.users?.total?.toLocaleString("en-IN")} hint="All registered non-admin accounts" onClick={() => openModal("users", "all")} />
            <MetricCard icon={UserRound} label="Free users" value={stats?.users?.free?.toLocaleString("en-IN")} hint="No active Premium membership" onClick={() => openModal("users", "free")} />
            <MetricCard icon={Crown} label="Premium users" value={stats?.users?.premium?.toLocaleString("en-IN")} hint="Active Premium memberships" tone="admin-metric-highlight" onClick={() => openModal("users", "premium")} />
            <MetricCard icon={Activity} label="Online now" value={stats?.users?.online?.toLocaleString("en-IN")} hint="Visible and recently active" tone="admin-metric-highlight" onClick={() => openModal("users", "all")} />
            <MetricCard icon={Clock3} label="Offline" value={stats?.users?.offline?.toLocaleString("en-IN")} hint="Not active in the last 2 minutes" onClick={() => openModal("users", "all")} />
          </div>
          <div className="admin-info-note"><BadgeCheck size={18} /><p>Admin Premium grants use calendar-month expiry and attach to the member record. They are recorded separately from paid sales.</p></div>
        </section>}

        {activeTab === "sales" && <section className="admin-section-panel">
          <div className="admin-panel-heading"><div><span className="admin-kicker">PAYMENT REPORTING</span><h2>Sales overview</h2><p>Payment totals include verified transaction records only.</p></div><button onClick={() => openModal("sales")} className="admin-primary-button"><CreditCard size={16} /> View sales records</button></div>
          <div className="admin-metric-grid admin-metric-grid-four">
            <MetricCard icon={CreditCard} label="All payments" value={stats?.sales?.total?.toLocaleString("en-IN")} hint="Recorded transactions" onClick={() => openModal("sales")} />
            <MetricCard icon={Check} label="Successful" value={stats?.sales?.succeeded?.toLocaleString("en-IN")} hint="Verified successful payments" tone="admin-metric-highlight" onClick={() => { openModal("sales"); setSalesStatus("succeeded"); }} />
            <MetricCard icon={X} label="Failed" value={stats?.sales?.failed?.toLocaleString("en-IN")} hint="Failed payment records" onClick={() => { openModal("sales"); setSalesStatus("failed"); }} />
            <MetricCard icon={Clock3} label="Pending" value={stats?.sales?.pending?.toLocaleString("en-IN")} hint="Awaiting provider confirmation" onClick={() => { openModal("sales"); setSalesStatus("pending"); }} />
          </div>
          <div className="admin-sales-revenue">
            <span><CircleDollarSign size={19} /> Verified revenue</span>
            {stats?.sales?.revenue?.length ? stats.sales.revenue.map((item) => <strong key={item.currency}>{item.currency} {(item.amountMinor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>) : <strong>₹0</strong>}
          </div>
          <div className="admin-info-note admin-info-warning"><CreditCard size={18} /><p>Online checkout is not connected yet. This screen will show successful and failed sales when a payment provider writes verified transaction callbacks. Manual Premium assignment is never counted as a sale.</p></div>
        </section>}

        {activeTab === "announcements" && <AnnouncementManager />}

        {activeTab === "upcoming" && <UpcomingManager />}

        {notice && <div className="admin-toast admin-toast-success"><Check size={16} /> {notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
        {error && <div className="admin-toast admin-toast-error">{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
        <footer className="admin-footer"><span><ShieldCheck size={14} /> Admin-only data · API role-verified</span><span>Activity retention: 180 days</span></footer>
      </div>

      {modal && <ModalFrame title={modal === "guests" ? "Guest management" : modal === "users" ? "User management" : "Sales records"} subtitle={modal === "guests" ? "Guest visits, IP history, browser and active/idle time." : modal === "users" ? "Search members, review complete account profiles, devices, membership and activity." : "Provider transaction records, status and revenue."} onClose={closeModal}>
        {modal === "guests" && selectedGuest ? <div className="admin-detail-view">
          <button className="admin-back-button" onClick={() => { setSelectedGuest(null); setGuestDetail(null); }}><ArrowLeft size={15} /> Back to guests</button>
          {guestLoading && !guestDetail ? <EmptyState title="Loading guest activity" detail="Fetching IP and visit history securely." /> : guestDetail && <>
            <div className="admin-detail-summary"><div><span>GUEST ID</span><strong>{selectedGuest.id}</strong></div><div><span>FIRST SEEN</span><strong>{dateTime(guestDetail.guest.firstSeenAt)}</strong></div><div><span>LAST SEEN</span><strong>{dateTime(guestDetail.guest.lastSeenAt)}</strong></div><div><span>TOTAL ACTIVE</span><strong>{duration(guestDetail.totals.activeSeconds)}</strong></div></div>
            <h3 className="admin-subheading">Visit timeline <small>{guestDetail.activityPage.total} recorded sessions</small></h3>
            {guestDetail.activity.length ? <div className="admin-activity-list">{guestDetail.activity.map((item) => <article className="admin-activity-card" key={item.id}>
              <div className="admin-activity-top"><strong>{dateTime(item.startedAt)}</strong><span className={item.online ? "admin-status-pill status-online" : "admin-status-pill"}>{item.online ? "Online" : "Offline"}</span></div>
              <div className="admin-activity-grid"><div><span>IP address</span><strong>{item.ipAddress || "Not available for older visit"}</strong></div><div><span>Browser</span><strong>{item.browser}</strong></div><div><span>Operating system</span><strong>{item.operatingSystem}</strong></div><div><span>Device</span><strong>{item.deviceType}</strong></div><div><span>Active time</span><strong>{duration(item.activeSeconds)}</strong></div><div><span>Idle time</span><strong>{duration(item.inactiveSeconds)}</strong></div><div><span>Last activity</span><strong>{dateTime(item.lastSeenAt)}</strong></div><div><span>Ended</span><strong>{dateTime(item.endedAt)}</strong></div></div>
              <details className="admin-ua-details"><summary>Browser fingerprint details</summary><code>{item.userAgent || "Not recorded"}</code></details>
            </article>)}</div> : <EmptyState title="No tracked visits yet" detail="New visit activity will appear after the site telemetry heartbeat runs." />}
            <div className="admin-detail-actions">{guestMore && <button className="admin-secondary-button" onClick={loadGuestMore} disabled={guestLoading}>{guestLoading ? "Loading…" : "Load 10 older visits"}</button>}</div>
            <h3 className="admin-subheading">Watch activity</h3>
            {guestDetail.playback.length ? <div className="admin-simple-list">{guestDetail.playback.map((item,index) => <div key={index}><span>{item.mediaType.toUpperCase()} · {item.mediaId}{item.episode ? " · Ep " + item.episode : ""}</span><small>{dateTime(item.startedAt)} · {item.status}</small></div>)}</div> : <p className="admin-muted">No playback sessions recorded.</p>}
            <p className="admin-muted">Playback allowance used: {duration(guestDetail.usage.watchedSeconds)} · Last watched {dateTime(guestDetail.usage.lastUsedAt)}</p>
          </>}
        </div> : modal === "users" && selectedUser ? <div className="admin-detail-view">
          <button className="admin-back-button" onClick={() => { setSelectedUser(null); setUserDetail(null); }}><ArrowLeft size={15} /> Back to users</button>
          {detailLoading || !userDetail ? <EmptyState title="Loading member profile" detail="Fetching membership, sessions and registered devices." /> : <>
            <div className="admin-user-profile-head">
              <span className="admin-user-avatar">{userName(userDetail.user).slice(0, 1).toUpperCase()}</span>
              <div className="admin-user-identity">
                <h3>{userName(userDetail.user)}</h3>
                <p>{userDetail.user.email || "Email unavailable"}</p>
                <div className="admin-user-card-badges">
                  <span className={"admin-status-pill " + (userDetail.user.status === "active" ? "status-online" : "status-danger")}>{userDetail.user.status === "suspended" ? "Suspended" : "Active account"}</span>
                  <span className={"admin-plan-pill " + (userDetail.user.planId === "premium" ? "premium" : "")}>{userDetail.user.planId.toUpperCase()} PLAN</span>
                  <span className={"admin-user-meta-pill " + (userDetail.user.emailVerified ? "is-verified" : "is-unverified")}>{userDetail.user.emailVerified ? "Email verified" : "Email not verified"}</span>
                  <span className="admin-user-meta-pill">{userDetail.user.loginMethod || "Email & Password"}</span>
                  <span className="admin-user-meta-pill">Role: {userDetail.user.role || "user"}</span>
                </div>
              </div>
            </div>
            <div className="admin-user-id"><span>USER ID</span><code>{userDetail.user.id}</code></div>
            {userDetail.user.status === "suspended" && <div className="admin-info-note admin-info-warning"><Ban size={17}/><p>This account is suspended {userDetail.user.suspendedUntil ? "until " + dateTime(userDetail.user.suspendedUntil) : "permanently"}.{userDetail.user.suspensionReason ? " Reason: " + userDetail.user.suspensionReason : ""}</p></div>}
            <div className="admin-detail-summary admin-user-detail-summary">
              <div><span>JOINED</span><strong>{dateTime(userDetail.user.createdAt)}</strong></div>
              <div><span>LAST LOGIN</span><strong>{dateTime(userDetail.user.lastLoginAt)}</strong></div>
              <div><span>ACCESS STATUS</span><strong>{userDetail.user.planId === "premium" ? "Active Premium" : "Free access"}</strong></div>
              <div><span>PLAN DURATION</span><strong>{userDetail.user.membership.durationMonths ? userDetail.user.membership.durationMonths + " months" : "—"}</strong></div>
              <div><span>BILLING CYCLE</span><strong>{userDetail.user.membership.billingCycle || "—"}</strong></div>
              <div><span>PREMIUM STARTED</span><strong>{dateTime(userDetail.user.membership.startedAt)}</strong></div>
              <div><span>PREMIUM EXPIRES</span><strong>{dateTime(userDetail.user.membership.expiresAt)}</strong></div>
              <div><span>ACTIVE TIME</span><strong>{duration(userDetail.totals.activeSeconds)}</strong></div>
              <div><span>WATCH TIME</span><strong>{duration(userDetail.usage.watchedSeconds)}</strong></div>
              <div><span>RECORDED SESSIONS</span><strong>{userDetail.activityPage.total.toLocaleString("en-IN")}</strong></div>
            </div>
            <div className="admin-detail-actions">
              {userDetail.user.planId === "premium" ? <button className="admin-danger-button" onClick={() => removePremium({ id: userDetail.user.id, email: userDetail.user.email })}>Remove Premium</button> : <button className="admin-primary-button" onClick={() => setAssignUser({ id: userDetail.user.id, email: userDetail.user.email })}><Crown size={15} /> Assign Premium</button>}
              {userDetail.user.status === "suspended" ? <button className="admin-secondary-button" onClick={() => unsuspendAccount({ id: userDetail.user.id, email: userDetail.user.email })}>Restore access</button> : <button className="admin-danger-button" onClick={() => setSuspendUser({ id: userDetail.user.id, email: userDetail.user.email })}><Ban size={15} /> Suspend account</button>}
            </div>
            <h3 className="admin-subheading">Devices & browsers <small>{userDetail.devices.length}</small></h3>
            {userDetail.devices.length ? <div className="admin-device-list">{userDetail.devices.map((device) => <div key={device.id}><span className="admin-device-icon"><DeviceGlyph type={device.deviceType} /></span><div><strong>{device.browser} · {device.operatingSystem}</strong><small>{device.deviceType} · Last seen {dateTime(device.lastSeenAt)}</small><em>{device.label}</em></div><span className={"admin-status-pill " + (device.active ? "status-online" : "")}>{device.active ? "Registered" : "Revoked"}</span></div>)}</div> : <p className="admin-muted">No registered devices.</p>}
            <h3 className="admin-subheading">Recent activity <small>{userDetail.activityPage.total} sessions in retention window</small></h3>
            {userDetail.activity.length ? <div className="admin-activity-list">{userDetail.activity.map((item) => <article className="admin-activity-card" key={item.id}><div className="admin-activity-top"><strong>{dateTime(item.startedAt)}</strong><span>{duration(item.activeSeconds)} active · {duration(item.inactiveSeconds)} idle</span></div><div className="admin-activity-grid"><div><span>IP address</span><strong>{item.ipAddress || "Not available"}</strong></div><div><span>Browser</span><strong>{item.browser}</strong></div><div><span>OS / Device</span><strong>{item.operatingSystem} · {item.deviceType}</strong></div><div><span>Last seen</span><strong>{dateTime(item.lastSeenAt)}</strong></div></div><details className="admin-ua-details"><summary>Full user-agent string</summary><code>{item.userAgent}</code></details></article>)}</div> : <p className="admin-muted">No activity history captured yet.</p>}
            {userDetail.activityPage.hasMore && <button className="admin-load-more" onClick={loadUserActivityMore} disabled={detailLoading}>{detailLoading ? "Loading…" : "Load 10 older sessions"}</button>}
            <h3 className="admin-subheading">Login sessions <small>{userDetail.authSessions.length} recent sessions</small></h3>
            {userDetail.authSessions.length ? <div className="admin-simple-list">{userDetail.authSessions.map((session,index)=><div key={index}><span>Signed in {dateTime(session.createdAt)}</span><small>Last seen {dateTime(session.lastSeenAt)} · {session.revokedAt ? "Revoked" : "Expires " + dateTime(session.expiresAt)}</small></div>)}</div> : <p className="admin-muted">No login session history recorded.</p>}
            <h3 className="admin-subheading">Payment history <small>{userDetail.payments.length} recent records</small></h3>
            {userDetail.payments.length ? <div className="admin-simple-list">{userDetail.payments.map((payment) => <div key={payment.id}><span>{payment.provider} · {payment.status.toUpperCase()} · {payment.currency} {(payment.amountMinor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span><small>{dateTime(payment.paidAt || payment.createdAt)} · {payment.transactionRef}</small></div>)}</div> : <p className="admin-muted">No verified paid transactions recorded for this user.</p>}
            <h3 className="admin-subheading">Premium assignment history</h3>
            {userDetail.membershipHistory.length ? <div className="admin-simple-list">{userDetail.membershipHistory.map((event,index)=><div key={index}><span>{event.action === "assigned" ? "Premium assigned" : "Premium removed"} · {event.durationMonths ? event.durationMonths + " months" : "—"}</span><small>{dateTime(event.createdAt)} · Expires {dateTime(event.expiresAt)}</small></div>)}</div> : <p className="admin-muted">No manual assignment history.</p>}
          </>}
        </div> : <>
          {modal === "users" && <div className="admin-modal-toolbar admin-user-toolbar">
            <div className="admin-inner-tabs"><button className={segment === "all" ? "active" : ""} onClick={() => { setSegment("all"); setSearch(""); }}>All users</button><button className={segment === "free" ? "active" : ""} onClick={() => { setSegment("free"); setSearch(""); }}>Free users</button><button className={segment === "premium" ? "active" : ""} onClick={() => { setSegment("premium"); setSearch(""); }}>Premium users</button></div>
            <span className="admin-result-count">{total.toLocaleString("en-IN")} users · 10 per page</span>
            <label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by email address" type="search" /></label>
          </div>}
          {modal === "sales" && <div className="admin-modal-toolbar"><div className="admin-inner-tabs">{["all","succeeded","failed","pending"].map((value)=><button key={value} className={salesStatus===value?"active":""} onClick={()=>setSalesStatus(value)}>{value === "all" ? "All" : value[0].toUpperCase()+value.slice(1)}</button>)}</div><span className="admin-result-count">{total.toLocaleString("en-IN")} records</span></div>}
          {modal === "guests" && <div className="admin-modal-toolbar"><span className="admin-result-count">{total.toLocaleString("en-IN")} unique guest identities · 10 per page</span></div>}
          {error && <p className="admin-inline-error">{error}</p>}
          <div className="admin-table-wrap" ref={listBodyRef}>
            {modal === "guests" && rows.length > 0 && <div className="admin-record-list admin-guest-record-list">
              {rows.map((guest, index) => <article className="admin-record-card admin-guest-card" key={guest.id}>
                <div className="admin-record-card-heading">
                  <span className="admin-record-avatar"><Globe2 size={17} /></span>
                  <div className="admin-record-card-identity">
                    <strong>Guest · {guest.id.slice(-6)}</strong>
                    <small>Record {(page - 1) * PAGE_SIZE + index + 1} · First seen {dateTime(guest.firstSeenAt)}</small>
                  </div>
                  <span className={"admin-status-pill " + (guest.online ? "status-online" : "")}>{guest.online ? "Online now" : "Offline"}</span>
                </div>
                <div className="admin-record-facts">
                  <div><span>LAST SEEN</span><strong>{dateTime(guest.lastSeenAt)}</strong></div>
                  <div><span>VISITS</span><strong>{Number(guest.sessions || 0).toLocaleString("en-IN")}</strong></div>
                  <div><span>TOTAL ACTIVE</span><strong>{duration(guest.activeSeconds)}</strong></div>
                  <div><span>BROWSER</span><strong>{guest.browser || "Unknown"}</strong></div>
                  <div><span>OPERATING SYSTEM</span><strong>{guest.operatingSystem || "Unknown"}</strong></div>
                  <div><span>DEVICE</span><strong>{guest.deviceType || "Unknown"}</strong></div>
                </div>
                <div className="admin-record-card-footer">
                  <span className="admin-record-id">ID · {guest.id}</span>
                  <button className="admin-row-action" onClick={() => openGuest(guest)}><Eye size={14} /> View guest details</button>
                </div>
              </article>)}
            </div>}
            {modal === "users" && rows.length > 0 && <div className="admin-user-list">
              {rows.map((user, index) => <article className="admin-user-card" key={user.id}>
                <div className="admin-user-card-header">
                  <span className="admin-user-avatar">{userName(user).slice(0, 1).toUpperCase()}</span>
                  <div className="admin-user-card-identity">
                    <strong>{userName(user)}</strong>
                    <span className="admin-user-card-email">{user.email || "Email unavailable"}</span>
                    <div className="admin-user-card-badges">
                      <span className={"admin-plan-pill " + (user.planId === "premium" ? "premium" : "")}>{user.planId === "premium" ? "PREMIUM" : "FREE"}</span>
                      <span className={"admin-status-pill " + (user.status === "suspended" ? "status-danger" : "status-online")}>{user.status === "suspended" ? "Suspended" : "Active account"}</span>
                      <span className={"admin-status-pill " + (user.online ? "status-online" : "")}>{user.online ? "Online now" : "Offline"}</span>
                    </div>
                  </div>
                </div>
                <div className="admin-user-card-facts">
                  <div><span>JOINED</span><strong>{dateOnly(user.createdAt)}</strong></div>
                  <div><span>MEMBERSHIP</span><strong>{user.planId === "premium" ? (user.membership.durationMonths ? user.membership.durationMonths + " months · Premium" : "Premium") : "Free plan"}</strong><small>{user.planId === "premium" ? "Expires " + dateOnly(user.membership.expiresAt) : "No active Premium access"}</small></div>
                  <div><span>ACTIVE TIME</span><strong>{duration(user.activeSeconds)}</strong><small>Last seen {dateTime(user.lastSeenAt)}</small></div>
                  <div><span>DEVICE & BROWSER</span><strong>{user.browser || "Unknown"} · {user.operatingSystem || "Unknown"}</strong><small>{user.deviceType || "Device not recorded"}</small></div>
                </div>
                {user.status === "suspended" && <p className="admin-user-suspension-note">Suspended {user.suspendedUntil ? "until " + dateTime(user.suspendedUntil) : "permanently"}{user.suspensionReason ? " · " + user.suspensionReason : ""}</p>}
                <div className="admin-user-card-actions">
                  <button className="admin-row-action" onClick={() => openUser(user)}><Eye size={14} /> View full profile</button>
                  <div className="admin-row-actions">
                    {user.planId === "premium" ? <button className="admin-mini-danger" onClick={() => removePremium(user)}>Remove Premium</button> : <button className="admin-mini-primary" onClick={() => setAssignUser(user)}>Assign Premium</button>}
                    {user.status === "suspended" ? <button className="admin-mini-neutral" onClick={() => unsuspendAccount(user)}>Restore</button> : <button className="admin-mini-neutral" onClick={() => setSuspendUser(user)}>Suspend</button>}
                  </div>
                </div>
              </article>)}
            </div>}
            {modal === "sales" && rows.length > 0 && <div className="admin-record-list admin-sales-record-list">
              {rows.map((sale, index) => <article className="admin-record-card admin-sales-card" key={sale.id}>
                <div className="admin-record-card-heading">
                  <span className="admin-record-avatar"><CreditCard size={17} /></span>
                  <div className="admin-record-card-identity">
                    <strong>{sale.email || "Guest checkout"}</strong>
                    <small>Transaction {(page - 1) * PAGE_SIZE + index + 1} · {sale.provider || "Unknown provider"}</small>
                  </div>
                  <span className={"admin-status-pill " + (sale.status === "succeeded" ? "status-online" : sale.status === "failed" ? "status-danger" : "")}>{sale.status || "Unknown"}</span>
                </div>
                <div className="admin-sale-amount">
                  <span>TRANSACTION AMOUNT</span>
                  <strong>{sale.currency || ""} {(Number(sale.amountMinor || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
                </div>
                <div className="admin-record-facts">
                  <div><span>PLAN</span><strong>{sale.planId || "—"}</strong></div>
                  <div><span>BILLING CYCLE</span><strong>{sale.billingCycle || "—"}</strong></div>
                  <div><span>TRANSACTION DATE</span><strong>{dateTime(sale.paidAt || sale.createdAt)}</strong></div>
                  <div><span>PROVIDER</span><strong>{sale.provider || "—"}</strong></div>
                </div>
                <div className="admin-record-reference">
                  <span>TRANSACTION REFERENCE</span>
                  <code>{sale.transactionRef || "Not supplied by provider"}</code>
                </div>
                {sale.failureCode && <p className="admin-record-warning">Failure code: {sale.failureCode}</p>}
                <div className="admin-record-card-footer">
                  <span className="admin-record-id">{sale.userId ? "User · " + sale.userId : "Guest / no linked member"}</span>
                </div>
              </article>)}
            </div>}
            {listReady && !listLoading && rows.length === 0 && !error && <EmptyState title={modal === "sales" ? "No payment records yet" : modal === "guests" ? "No guest records yet" : "No users match this search"} detail={modal === "sales" ? "No transactions were returned for this filter. Payment checkout integration is not connected yet." : modal === "guests" ? "No guest identities have been recorded yet. A guest record appears after guest activity is captured." : search ? "Try another email address or switch the user segment." : "No registered member accounts were returned for this segment."} />}
            {listLoading && <div className="admin-list-loading"><LoaderCircle className="admin-spin" size={18} /> Loading records…</div>}
            <div className="admin-load-sentinel" ref={sentinelRef} />
            {rows.length > 0 && hasMore && <button className="admin-load-more" disabled={listLoading} onClick={()=>loadPage(page + 1, false, listRequestVersion.current)}>{listLoading ? "Loading…" : "Load 10 more"}</button>}
            {rows.length > 0 && !hasMore && <p className="admin-end-list">Showing all {total.toLocaleString("en-IN")} records</p>}
          </div>
        </>}
      </ModalFrame>}

      {assignUser && <ModalFrame title="Assign Premium" subtitle={assignUser.email} onClose={() => setAssignUser(null)} wide={false}>
        <div className="admin-form-stack"><label>Premium duration<select value={durationMonths} onChange={(event)=>setDurationMonths(event.target.value)}><option value="1">1 month</option><option value="6">6 months</option><option value="8">8 months</option><option value="10">10 months</option><option value="12">12 months · 1 year</option></select></label><div className="admin-info-note"><CalendarClock size={17}/><p>Starts immediately and expires on {dateOnly(previewExpiry(durationMonths))}. This grant is attached to the user record and is not a payment sale.</p></div><button className="admin-primary-button admin-full-button" disabled={mutationLoading} onClick={assignPremium}>{mutationLoading ? "Saving…" : "Confirm Premium assignment"}</button></div>
      </ModalFrame>}

      {suspendUser && <ModalFrame title="Suspend account" subtitle={suspendUser.email} onClose={() => setSuspendUser(null)} wide={false}>
        <div className="admin-form-stack"><label>Suspension duration<select value={suspendHours} onChange={(event)=>setSuspendHours(event.target.value)}><option value="1">1 hour</option><option value="24">1 day</option><option value="168">7 days</option><option value="720">30 days</option><option value="0">Permanent · until restored</option></select></label><label>Reason (optional)<textarea value={suspendReason} onChange={(event)=>setSuspendReason(event.target.value)} maxLength={240} placeholder="Add an internal moderation reason" /></label><div className="admin-info-note admin-info-warning"><Ban size={17}/><p>The user will be signed out of protected features and shown a suspension notice on their next site request.</p></div><button className="admin-danger-button admin-full-button" disabled={mutationLoading} onClick={suspendAccount}>{mutationLoading ? "Applying…" : "Confirm suspension"}</button></div>
      </ModalFrame>}
    </main>
  );
}
