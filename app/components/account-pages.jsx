"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mixHomeSpotlight, toHomeSpotlight } from "../../src/home-discovery.js";
import {
  ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleX, Clock3, CreditCard, Crown, Eye, EyeOff, Film, Fingerprint,
  Globe2, Info, LockKeyhole, LogIn, Mail, MonitorSmartphone, ShieldCheck,
  Sparkles, Tv, UserRound, X
} from "lucide-react";
import { PREMIUM_BILLING } from "../../src/membership-preview.js";

function AccountBrand() {
  return (
    <Link href="/" className="account-brand" aria-label="Situla home">
      <img src="/icon.svg" alt="" width="40" height="40" />
      <span><strong>SITULA</strong><small>DISCOVER · WATCH · BELONG</small></span>
    </Link>
  );
}

function AccountPageTopbar({ profile = false }) {
  return (
    <header className="account-page-topbar">
      <AccountBrand />
      <nav aria-label="Account navigation">
        <Link href="/plans" className="account-top-link">{profile ? <Crown size={15} /> : <Sparkles size={15} />}{profile ? "Plans & pricing" : "Explore plans"}</Link>
        <Link href="/" className="account-top-link account-top-home"><ArrowLeft size={15} /> Back to Situla</Link>
      </nav>
    </header>
  );
}

function LoginPosterRail({ items, direction }) {
  return (
    <div className={"login-poster-rail login-poster-rail--" + direction}>
      <div className="login-poster-track">
        {[0, 1].map((copy) => (
          <div className="login-poster-set" key={copy}>
            {items.map((item, index) => {
              const prioritize = copy === 0 && index < 3;
              return (
                <div className="login-poster-card" key={item.heroId + "-" + copy}>
                  <img
                    src={item.heroPoster}
                    alt=""
                    draggable={false}
                    loading={prioritize ? "eager" : "lazy"}
                    fetchPriority={prioritize ? "high" : "low"}
                    decoding="async"
                    width="500"
                    height="750"
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [posterColumns, setPosterColumns] = useState({ downward: [], upward: [] });
  const preloadedPosterUrls = useRef(new Set());

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("authError") === "google") {
      setAuthError("Google Sign-in could not be completed. Check the OAuth client ID, client secret and exact callback URL, then try again.");
      window.history.replaceState(window.history.state, "", "/login");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = "situla:login-posters:v1";
    const catalog = { movies: [], tv: [], anime: [] };

    async function readCatalog(path) {
      try {
        const response = await fetch(path, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return [];
        const payload = await response.json().catch(() => ({}));
        return Array.isArray(payload.items) ? payload.items : [];
      } catch {
        return [];
      }
    }

    function publishPosterColumns() {
      if (controller.signal.aborted) return;
      const mixed = mixHomeSpotlight(catalog);
      const posters = mixed
        .filter((item) => item && typeof item.heroPoster === "string" &&
          (item.heroPoster.startsWith("https://") || item.heroPoster.startsWith("http://")))
        .slice(0, 48);

      setPosterColumns({
        downward: posters.filter((item, index) => index % 2 === 0),
        upward: posters.filter((item, index) => index % 2 === 1)
      });
    }

    function restorePosterCache() {
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
        if (!cached?.catalog || Date.now() - cached.savedAt > 6 * 60 * 60 * 1000) return;
        for (const key of ["movies", "tv", "anime"]) {
          if (Array.isArray(cached.catalog[key])) catalog[key] = cached.catalog[key];
        }
        publishPosterColumns();
      } catch {}
    }

    function persistPosterCache() {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), catalog }));
      } catch {}
    }

    restorePosterCache();

    const sources = [
      { key: "movies", mediaType: "movie", path: "/api/movies?limit=10" },
      { key: "tv", mediaType: "tv", path: "/api/tv?limit=10" },
      { key: "anime", mediaType: "anime", path: "/api/anime?limit=10" }
    ];

    Promise.all(sources.map(async (source) => {
      const items = await readCatalog(source.path);
      catalog[source.key] = items.map((item) => {
        const poster = toHomeSpotlight(item, source.mediaType);
        return poster?.heroPoster
          ? { mediaType: poster.mediaType, heroId: poster.heroId, heroPoster: poster.heroPoster }
          : null;
      }).filter(Boolean);
      publishPosterColumns();
      persistPosterCache();
    }));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const posterUrls = [...new Set(
      [...posterColumns.downward, ...posterColumns.upward]
        .map((poster) => poster.heroPoster)
        .filter(Boolean)
    )].filter((url) => !preloadedPosterUrls.current.has(url));
    let cancelled = false;
    const chunkSize = 4;

    async function preloadPoster(url) {
      preloadedPosterUrls.current.add(url);
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = url;

      try {
        if (typeof image.decode === "function") {
          await image.decode();
        } else {
          await new Promise((resolve) => {
            image.onload = resolve;
            image.onerror = resolve;
          });
        }
      } catch {}
    }

    async function preloadPosterChunks() {
      for (let start = 0; start < posterUrls.length; start += chunkSize) {
        if (cancelled) return;
        const chunk = posterUrls.slice(start, start + chunkSize);
        await Promise.all(chunk.map((url) => preloadPoster(url)));
        if (start + chunkSize < posterUrls.length) {
          await new Promise((resolve) => window.setTimeout(resolve, 64));
        }
      }
    }

    void preloadPosterChunks();
    return () => {
      cancelled = true;
    };
  }, [posterColumns]);

  async function submitEmail(event) {
    event.preventDefault();
    if (submitting || !email.trim() || !password) return;
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setAuthError("Enter a valid email address.");
      return;
    }
    const passwordBytes = new TextEncoder().encode(password).length;
    if (passwordBytes < 10 || passwordBytes > 128) {
      setAuthError("Use a password with at least 10 characters (maximum 128 bytes).");
      return;
    }
    setSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: normalizedEmail, password, rememberMe })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Sign-in failed. Please try again.");
      router.replace("/profile");
    } catch (error) {
      setAuthError(error.message || "Sign-in is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="account-page login-page">
      <section
        className="login-poster-stage"
        aria-label="Featured movie, TV series and anime posters"
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
      >
        <div className="login-poster-columns" aria-hidden="true">
          <LoginPosterRail items={posterColumns.downward} direction="down" />
          <LoginPosterRail items={posterColumns.upward} direction="up" />
        </div>
      </section>

      <section className="login-form-panel" aria-label="Sign in">
        <section className="login-form-card" aria-label="Situla sign-in form">
          <form className="login-form" onSubmit={submitEmail}>
            <label className="account-field">
              <span>Email address</span>
              <span className="account-input-wrap">
                <Mail size={17} />
                <input type="email" name="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required suppressHydrationWarning />
              </span>
            </label>
            <label className="account-field">
              <span>Password</span>
              <span className="account-input-wrap">
                <LockKeyhole size={17} />
                <input type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" placeholder="At least 10 characters" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={128} required />
                <button type="button" className="account-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            <p className="login-auth-hint">New email? Situla will create a Free account automatically. Existing email? Enter your account password to sign in. Password: 10–128 bytes.</p>
            <div className="login-form-options">
              <label className="account-remember">
                <input type="checkbox" name="rememberMe" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                <span>Remember me</span>
              </label>
            </div>
            <button type="submit" className="account-primary-button" disabled={submitting}>Continue with email</button>
          </form>
          {authError && <p className="account-action-notice" role="alert">{authError}</p>}
          <div className="account-divider" role="separator">OR</div>
          <button type="button" className="account-google-button" onClick={() => window.location.assign("/api/auth/google")}>
            <img
              className="account-google-logo"
              src="https://developers.google.com/static/identity/images/g-logo.png"
              alt=""
              width="20"
              height="20"
            />
            Continue with Google
          </button>
        </section>
      </section>
    </main>
  );
}

function formatAccessDuration(value) {
  if (value === null || value === undefined) return "Unlimited";
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? hours + "h " + minutes + "m" : minutes + "m";
}

function formatAccountDate(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value + "T00:00:00"));
}

function daysBetween(startValue, endValue) {
  const start = new Date(startValue + "T00:00:00");
  const end = new Date(endValue + "T00:00:00");
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function ReadonlyAccountField({ icon: FieldIcon, label, value }) {
  return (
    <div className="profile-readonly-field">
      <span className="profile-field-icon"><FieldIcon size={16} /></span>
      <span className="profile-field-copy"><small>{label}</small><strong>{value}</strong></span>
      <span className="profile-locked-label"><LockKeyhole size={12} /> Locked</span>
    </div>
  );
}

function PremiumUpgradeModal({ onClose }) {
  const [billingCycle, setBillingCycle] = useState("monthly");
  const closeButtonRef = useRef(null);
  const selectedBilling = PREMIUM_BILLING.find((item) => item.id === billingCycle) || PREMIUM_BILLING[0];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    };
  }, [onClose]);

  const includedFeatures = [
    "Browse Movies, TV series and Anime",
    "Account-based watch tracking and server-verified access",
    "Up to 3 registered devices across mobile, computer and TV",
    "One shared account watch allowance across registered devices",
    "Premium Verified member badge",
    "Early upcoming-movie updates and release information"
  ];
  const limits = [
    "Maximum of 3 registered devices",
    "Watch time is shared across all registered devices",
    "Premium movie playback is planned, but not active yet"
  ];

  return (
    <div className="profile-upgrade-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="profile-upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-upgrade-title" aria-describedby="profile-upgrade-description">
        <header className="profile-upgrade-header">
          <div className="profile-upgrade-heading">
            <span className="profile-upgrade-kicker"><Crown size={13} /> SITULA PREMIUM MEMBERSHIP</span>
            <h2 id="profile-upgrade-title">Choose your Premium plan</h2>
            <p id="profile-upgrade-description">More watch time, multi-device access and member benefits. Compare the available billing periods before choosing.</p>
          </div>
          <button ref={closeButtonRef} type="button" className="profile-upgrade-close" onClick={onClose} aria-label="Close Premium plan details">
            <X size={19} />
          </button>
        </header>

        <div className="profile-upgrade-body">
          <section className="profile-upgrade-pricing" aria-labelledby="profile-upgrade-billing-title">
            <div className="profile-upgrade-section-heading">
              <div><span>PREMIUM BILLING</span><h3 id="profile-upgrade-billing-title">Select a membership period</h3></div>
              <span className="profile-upgrade-currency">INR · ₹</span>
            </div>
            <div className="profile-upgrade-billing-options" role="group" aria-label="Premium billing period">
              {PREMIUM_BILLING.map((billing) => (
                <button key={billing.id} type="button" className={"profile-upgrade-billing-option" + (billingCycle === billing.id ? " is-selected" : "")} onClick={() => setBillingCycle(billing.id)} aria-pressed={billingCycle === billing.id}>
                  <strong>{billing.label}</strong>
                  <span>₹{billing.monthlyPrice.toLocaleString("en-IN")}<small>/mo</small></span>
                  <em>{billing.months} {billing.months === 1 ? "month" : "months"}</em>
                </button>
              ))}
            </div>
            <div className="profile-upgrade-price-summary">
              <div><span>Equivalent monthly rate</span><strong>₹{selectedBilling.monthlyPrice.toLocaleString("en-IN")} <small>/ month</small></strong></div>
              <div><span>{selectedBilling.billingLabel}</span><strong>₹{selectedBilling.totalPrice.toLocaleString("en-IN")}</strong></div>
            </div>
          </section>

          <section className="profile-upgrade-plan-stats" aria-label="Selected Premium plan limits">
            <div><Clock3 size={17} /><span><small>WATCH ALLOWANCE</small><strong>{selectedBilling.allowance}</strong><em>per cycle</em></span></div>
            <div><LockKeyhole size={17} /><span><small>COOLDOWN</small><strong>{selectedBilling.cooldown}</strong><em>after allowance</em></span></div>
            <div><MonitorSmartphone size={17} /><span><small>DEVICES</small><strong>Up to 3</strong><em>registered devices</em></span></div>
          </section>

          <div className="profile-upgrade-feature-grid">
            <section className="profile-upgrade-feature-panel">
              <h3><CheckCircle2 size={15} /> Included with Premium</h3>
              <ul>
                {includedFeatures.map((feature) => <li key={feature}><Check size={13} /> <span>{feature}</span></li>)}
                <li><Check size={13} /> <span>{selectedBilling.allowance} watch allowance per membership cycle</span></li>
                <li><Check size={13} /> <span>{selectedBilling.cooldown === "No periodic cooldown" ? "No scheduled watch cooldown while the yearly membership is active" : selectedBilling.cooldown + " cooldown after the watch allowance"}</span></li>
              </ul>
            </section>
            <section className="profile-upgrade-feature-panel is-limited">
              <h3><Info size={15} /> Limits & not included</h3>
              <ul>
                {limits.map((limit) => <li key={limit}><CircleX size={13} /> <span>{limit}</span></li>)}
                <li><CircleX size={13} /> <span>Online checkout and automatic renewal are not active yet</span></li>
              </ul>
            </section>
          </div>

          <div className="profile-upgrade-checkout-notice" role="status">
            <Info size={17} />
            <span><strong>Checkout is not connected yet.</strong><small>You can review and select a plan here, but payment cannot be collected and Premium access cannot be activated from this window yet.</small></span>
          </div>
        </div>

        <footer className="profile-upgrade-footer">
          <button type="button" className="profile-upgrade-secondary" onClick={onClose}>Close</button>
          <button type="button" className="profile-upgrade-purchase" disabled aria-disabled="true"><CreditCard size={16} /> Purchase unavailable</button>
        </footer>
      </section>
    </div>
  );
}

export function ProfilePage() {
  const router = useRouter();
  const [account, setAccount] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [deviceSummary, setDeviceSummary] = useState({ active: 0, limit: 1 });
  const [devices, setDevices] = useState([]);
  const [access, setAccess] = useState(null);
  const [revokingDeviceId, setRevokingDeviceId] = useState("");
  const [deviceNotice, setDeviceNotice] = useState("");
  const [renewalNotice, setRenewalNotice] = useState("");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [clock, setClock] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadAccount() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok || !payload.user) {
          setAccount(null);
          return;
        }
        setAccount(payload.user);
        setDeviceSummary(payload.devices || { active: 0, limit: 1 });
        setAccess(payload.access || null);
        const devicesResponse = await fetch("/api/auth/devices", { cache: "no-store", credentials: "same-origin" });
        const devicesPayload = await devicesResponse.json().catch(() => ({}));
        if (active && devicesResponse.ok) setDevices(Array.isArray(devicesPayload.items) ? devicesPayload.items : []);
      } catch {
        if (active) setAccount(null);
      } finally {
        if (active) {
          setClock(new Date());
          setAccountLoading(false);
        }
      }
    }
    loadAccount();
    const onFocus = () => loadAccount();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function revokeDevice(deviceId) {
    if (revokingDeviceId) return;
    setRevokingDeviceId(deviceId);
    setDeviceNotice("");
    try {
      const response = await fetch("/api/auth/devices/" + encodeURIComponent(deviceId), {
        method: "DELETE",
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "This device could not be removed.");
      if (payload.currentDevice) {
        window.dispatchEvent(new Event("situla:auth-change"));
        router.replace("/login");
        return;
      }
      const [meResponse, devicesResponse] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/auth/devices", { cache: "no-store", credentials: "same-origin" })
      ]);
      const me = await meResponse.json().catch(() => ({}));
      const list = await devicesResponse.json().catch(() => ({}));
      if (meResponse.ok) {
        setDeviceSummary(me.devices || { active: 0, limit: 1 });
        setAccess(me.access || null);
      }
      if (devicesResponse.ok) setDevices(Array.isArray(list.items) ? list.items : []);
      setDeviceNotice("The selected device has been signed out.");
    } catch (error) {
      setDeviceNotice(error.message || "This device could not be removed.");
    } finally {
      setRevokingDeviceId("");
    }
  }

  const now = clock || new Date();
  const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const membership = account?.membership || {};
  const membershipActive = account?.planId === "premium" && membership.status === "active" &&
    (!membership.expiresAt || new Date(membership.expiresAt) > now);
  const activeBilling = PREMIUM_BILLING.find((item) => item.id === membership.billingCycle) || null;
  const customGrantMonths = membership.billingCycle === 'custom' ? Number(membership.durationMonths) || null : null;
  const membershipMonths = activeBilling?.months || customGrantMonths;
  const startedAt = membership.startedAt ? String(membership.startedAt).slice(0, 10) :
    account?.createdAt ? String(account.createdAt).slice(0, 10) : today;
  const expiresAt = membership.expiresAt ? String(membership.expiresAt).slice(0, 10) : null;
  const daysActive = Math.max(0, daysBetween(startedAt, today));
  const daysRemaining = expiresAt ? daysBetween(today, expiresAt) : null;
  const renewalAvailable = membershipActive && daysRemaining !== null && daysRemaining <= 21;
  const elapsedPercent = membershipMonths && daysRemaining !== null
    ? Math.min(100, Math.max(0, (daysActive / (membershipMonths * 30)) * 100)) : 0;
  const activeLabel = daysActive === 1 ? "1 day" : daysActive + " days";
  const expiryLabel = !membershipActive ? "No Premium subscription" :
    daysRemaining < 0 ? "Expired" : daysRemaining === 0 ? "Expires today" : daysRemaining + " days left";

  if (accountLoading) {
    return (
      <main className="account-page profile-page">
        <AccountPageTopbar profile />
        <section className="profile-signed-out">
          <span className="profile-empty-icon"><LockKeyhole size={25} /></span>
          <span className="account-eyebrow">SITULA ACCOUNT</span>
          <h1>Loading your account.</h1>
          <p>Checking your secure server session.</p>
        </section>
      </main>
    );
  }

  if (!account) {
    return (
      <main className="account-page profile-page">
        <AccountPageTopbar profile />
        <section className="profile-signed-out">
          <span className="profile-empty-icon"><LockKeyhole size={25} /></span>
          <span className="account-eyebrow">MEMBER ACCESS REQUIRED</span>
          <h1>Your profile is waiting.</h1>
          <p>Sign in to view your account and membership details.</p>
          <Link href="/login" className="account-primary-button"><LogIn size={17} /> Go to login <ArrowRight size={16} /></Link>
        </section>
      </main>
    );
  }

  return (
    <main className="account-page profile-page">
      <AccountPageTopbar profile />
      <div className="profile-content">
        <div className="profile-page-heading">
          <div><span className="account-eyebrow">YOUR SITULA ACCOUNT</span><h1>Profile & membership</h1><p>Account identity, access and Premium plan status.</p></div>
          <span className="profile-preview-pill"><Eye size={13} /> {account.planId === "premium" ? "PREMIUM MEMBER" : "FREE MEMBER"}</span>
        </div>

        <section className="profile-overview-panel">
          <div className="profile-identity">
            <div className="profile-avatar-large">{account.initials}<span><Check size={13} /></span></div>
            <div className="profile-identity-copy">
              <span className="profile-overline">SITULA MEMBER</span>
              <h2>{account.name} {membershipActive && <BadgeCheck size={21} aria-label="Verified Premium member" />}</h2>
              <p>{account.email}</p>
              <div className="profile-identity-badges">
                <span className="profile-verified-badge">{membershipActive ? <><BadgeCheck size={13} /> Premium Verified</> : "Free member"}</span>
                <span className="profile-active-badge"><i /> Account active</span>
              </div>
            </div>
          </div>
          <div className="profile-account-health">
            <span>ACCOUNT STATUS</span>
            <strong><i /> {account.status === 'active' ? 'Active' : 'Suspended'}</strong>
            <small>Good standing · Server account</small>
          </div>
        </section>

        <div className="profile-main-grid">
          <div className="profile-primary-column">
            <section className="profile-membership-card">
              <div className="profile-card-topline">
                <div className="profile-card-plan-icon"><Crown size={21} /></div>
                <span className="profile-plan-active"><i /> {membershipActive ? "ACTIVE MEMBERSHIP" : account.planId === "free" ? "ACTIVE FREE PLAN" : "MEMBERSHIP EXPIRED"}</span>
              </div>
              <div className="profile-plan-heading">
                <div><span className="profile-overline">YOUR CURRENT PLAN</span><h2>{account.planId === "premium" ? "Premium" : "Free"}</h2><p>{account.planId === "premium" ? "More room for every story." : "Your Situla account is active."}</p></div>
                <div className="profile-plan-price"><strong>{activeBilling ? "₹" + activeBilling.monthlyPrice.toLocaleString("en-IN") : membershipActive && customGrantMonths ? "Admin grant" : "Free"}</strong>{activeBilling && <span>/ month</span>}<small>{activeBilling?.billingLabel || (membershipActive && customGrantMonths ? customGrantMonths + "-month administrator grant" : "No subscription")}</small></div>
              </div>
              <div className="profile-purchase-row">
                <button type="button" className="profile-purchased-button" disabled><CheckCircle2 size={17} /> {membershipActive ? "Premium · Active" : "Free plan · Active"} <Sparkles size={15} /></button>
                <span className="profile-purchase-caption"><LockKeyhole size={12} /> Verified by the Situla server</span>
              </div>
              <div className="profile-membership-progress">
                <div className="profile-progress-heading"><span>MEMBERSHIP PERIOD</span><strong>{Math.round(elapsedPercent)}% elapsed</strong></div>
                <div className="profile-progress-track"><span style={{ width: elapsedPercent + "%" }} /></div>
                <div className="profile-progress-labels"><span>Started {formatAccountDate(startedAt)}</span><span>{expiresAt ? formatAccountDate(expiresAt) : 'No expiry'}</span></div>
              </div>
              <div className="profile-plan-stats">
                <div><CalendarDays size={16} /><span><small>ACTIVE FOR</small><strong>{activeLabel}</strong></span></div>
                <div><Clock3 size={16} /><span><small>EXPIRY STATUS</small><strong>{expiryLabel}</strong></span></div>
                <div><CreditCard size={16} /><span><small>BILLING CYCLE</small><strong>{activeBilling?.label || (membershipActive && customGrantMonths ? customGrantMonths + " months · Admin grant" : 'Free')}</strong></span></div>
              </div>
              {renewalAvailable ? (
                <div className="profile-renewal-panel">
                  <span className="profile-renewal-icon"><Sparkles size={17} /></span>
                  <span className="profile-renewal-copy"><strong>{membershipActive ? "Your renewal window is open" : "Renew Premium to restore access"}</strong><small>{membershipActive ? "Renew before " + formatAccountDate(expiresAt) + " to keep your membership going." : "Your previous membership period has ended."}</small></span>
                  <button type="button" onClick={() => setRenewalNotice("Payment checkout is not connected. Premium renewal will remain unavailable until payments are enabled.")}>Renew plan <ArrowRight size={15} /></button>
                </div>
              ) : (
                <div className="profile-renewal-locked"><LockKeyhole size={15} /><span>{membershipActive ? "Renewal opens " + Math.max(0, (daysRemaining || 0) - 21) + " days from now, within 21 days of expiry." : "No renewal is required for the Free plan. Payment checkout is not connected."}</span></div>
              )}
              {renewalNotice && <p className="profile-action-notice" role="status">{renewalNotice}</p>}
            </section>

            <section className="profile-benefits-card">
              <div className="profile-section-heading"><div><span className="account-eyebrow">WHAT YOU GET</span><h2>Premium benefits</h2></div><span className="profile-benefit-count">06 BENEFITS</span></div>
              <div className="profile-benefit-grid">
                <div className="profile-benefit-item"><span><Clock3 size={17} /></span><strong>{membershipActive && activeBilling ? activeBilling.allowance : "3 hours"} watch allowance</strong><small>Per membership cycle</small></div>
                <div className="profile-benefit-item"><span><LockKeyhole size={17} /></span><strong>{membershipActive && activeBilling ? activeBilling.cooldown : "1 hour"} cooldown</strong><small>Between watch sessions</small></div>
                <div className="profile-benefit-item"><span><MonitorSmartphone size={17} /></span><strong>Up to {deviceSummary.limit} device{deviceSummary.limit === 1 ? "" : "s"}</strong><small>Manage your registered devices</small></div>
                <div className="profile-benefit-item"><span><BadgeCheck size={17} /></span><strong>{membershipActive ? "Verified badge" : "Free member access"}</strong><small>{membershipActive ? "Premium member identity" : "Registered Free account"}</small></div>
                <div className="profile-benefit-item"><span><Sparkles size={17} /></span><strong>Early movie updates</strong><small>Upcoming titles and release info</small></div>
                <div className="profile-benefit-item is-planned"><span><Film size={17} /></span><strong>Premium movie playback</strong><small>Payment not connected</small></div>
              </div>
              <Link href="/plans" className="profile-view-plans">Compare all plans <ArrowRight size={15} /></Link>
            </section>
          </div>

          <aside className="profile-secondary-column">
            <section className="profile-details-card">
              <div className="profile-section-heading"><div><span className="account-eyebrow">ACCOUNT IDENTITY</span><h2>Personal details</h2></div><Fingerprint size={19} /></div>
              <p className="profile-locked-intro">Account details are managed securely by Situla.</p>
              <div className="profile-readonly-list">
                <ReadonlyAccountField icon={UserRound} label="Display name" value={account.name} />
                <ReadonlyAccountField icon={Mail} label="Email address" value={account.email} />
                <ReadonlyAccountField icon={Fingerprint} label="Sign-in method" value={account.loginMethod} />
                <ReadonlyAccountField icon={Globe2} label="Profile avatar" value={account.initials + " account avatar"} />
              </div>
              <div className="profile-security-note"><ShieldCheck size={16} /><span><strong>Account identity protected</strong><small>Profile identity and sign-in details are protected by your server session.</small></span></div>
            </section>

            <section className="profile-access-card">
              <div className="profile-section-heading"><div><span className="account-eyebrow">ACCESS SNAPSHOT</span><h2>Your access</h2></div><Tv size={19} /></div>
              <div className="profile-access-row"><span>Plan status</span><strong className={membershipActive ? "is-active" : "is-expired"}>{membershipActive ? "Active" : "Free"}</strong></div>
              <div className="profile-access-row"><span>Account status</span><strong className="is-active">Active</strong></div>
              <div className="profile-access-row"><span>Current plan</span><strong>{account.planId === "premium" ? "Premium" : "Free"}</strong></div>
              <div className="profile-access-row"><span>Registered devices</span><strong>{deviceSummary.active} / {deviceSummary.limit} used</strong></div>
              <div className="profile-access-row"><span>Watch access</span><strong>{!access ? "Checking" : access.cooldownRemainingSeconds > 0 ? "Cooldown · " + formatAccessDuration(access.cooldownRemainingSeconds) : access.remainingSeconds === null ? "Unlimited" : formatAccessDuration(access.remainingSeconds) + " left"}</strong></div>
              <div className="profile-access-row"><span>Smart TV browser</span><strong>Web access</strong></div>
              <div className="profile-device-list" aria-label="Registered devices">
                {devices.map((device) => (
                  <div className="profile-device-row" key={device.id}>
                    <span className="profile-device-copy">
                      <strong>{device.current ? "This device" : "Registered device"}{device.slot ? " · " + device.slot : ""}</strong>
                      <small>{device.label || "Browser"} · {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleDateString() : "Recently active"}</small>
                    </span>
                    <button
                      type="button"
                      className="profile-device-revoke"
                      onClick={() => revokeDevice(device.id)}
                      disabled={Boolean(revokingDeviceId)}
                    >
                      {revokingDeviceId === device.id ? "Removing…" : device.current ? "Sign out" : "Remove"}
                    </button>
                  </div>
                ))}
              </div>
              {deviceNotice && <p className="profile-action-notice" role="status">{deviceNotice}</p>}
              <p className="profile-access-footnote">Membership, watch allowance and devices are verified by the server.</p>
            </section>
          </aside>
        </div>
      </div>
      <p className="account-page-caption">SITULA ACCOUNT EXPERIENCE <span>·</span> SERVER-VERIFIED SESSION</p>
    </main>
  );
}
