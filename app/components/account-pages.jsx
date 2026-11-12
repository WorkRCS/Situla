"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mixHomeSpotlight, toHomeSpotlight } from "../../src/home-discovery.js";
import {
  ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, CheckCircle2,
  ChevronRight, Clock3, CreditCard, Crown, Eye, EyeOff, Film, Fingerprint,
  Globe2, LockKeyhole, LogIn, Mail, MonitorSmartphone, ShieldCheck,
  Sparkles, Tv, UserRound
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
      { key: "movies", mediaType: "movie", path: "/api/movies?limit=16" },
      { key: "tv", mediaType: "tv", path: "/api/tv?limit=16" },
      { key: "anime", mediaType: "anime", path: "/api/anime?limit=16" }
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
    setSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password, rememberMe })
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
                <input type="email" name="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </span>
            </label>
            <label className="account-field">
              <span>Password</span>
              <span className="account-input-wrap">
                <LockKeyhole size={17} />
                <input type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <button type="button" className="account-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
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

export function ProfilePage() {
  const [account, setAccount] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [deviceSummary, setDeviceSummary] = useState({ active: 0, limit: 1 });
  const [renewalNotice, setRenewalNotice] = useState("");
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

  const now = clock || new Date();
  const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const membership = account?.membership || {};
  const membershipActive = account?.planId === "premium" && membership.status === "active" &&
    (!membership.expiresAt || new Date(membership.expiresAt) > now);
  const activeBilling = PREMIUM_BILLING.find((item) => item.id === membership.billingCycle) || null;
  const startedAt = membership.startedAt ? String(membership.startedAt).slice(0, 10) :
    account?.createdAt ? String(account.createdAt).slice(0, 10) : today;
  const expiresAt = membership.expiresAt ? String(membership.expiresAt).slice(0, 10) : null;
  const daysActive = Math.max(0, daysBetween(startedAt, today));
  const daysRemaining = expiresAt ? daysBetween(today, expiresAt) : null;
  const renewalAvailable = membershipActive && daysRemaining !== null && daysRemaining <= 21;
  const elapsedPercent = activeBilling && daysRemaining !== null
    ? Math.min(100, Math.max(0, (daysActive / (activeBilling.months * 30)) * 100)) : 0;
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
          <span className="profile-preview-pill"><Eye size={13} /> DEMO PROFILE</span>
        </div>

        <section className="profile-overview-panel">
          <div className="profile-identity">
            <div className="profile-avatar-large">{account.initials}<span><Check size={13} /></span></div>
            <div className="profile-identity-copy">
              <span className="profile-overline">SITULA MEMBER</span>
              <h2>{account.name} {membershipActive && account.emailVerified && <BadgeCheck size={21} aria-label="Verified Premium member" />}</h2>
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
                <span className="profile-plan-active"><i /> {membershipActive ? "ACTIVE MEMBERSHIP" : "MEMBERSHIP EXPIRED"}</span>
              </div>
              <div className="profile-plan-heading">
                <div><span className="profile-overline">YOUR CURRENT PLAN</span><h2>{account.planId === "premium" ? "Premium" : "Free"}</h2><p>{account.planId === "premium" ? "More room for every story." : "Your Situla account is active."}</p></div>
                <div className="profile-plan-price"><strong>{activeBilling ? "₹" + activeBilling.monthlyPrice.toLocaleString("en-IN") : "Free"}</strong><span>/ month</span><small>{activeBilling?.billingLabel || "No subscription"}</small></div>
              </div>
              <div className="profile-purchase-row">
                <button type="button" className="profile-purchased-button" disabled><CheckCircle2 size={17} /> {membershipActive ? "Purchased · Enjoy Premium" : "Free plan · Active"} <Sparkles size={15} /></button>
                <span className="profile-purchase-caption"><LockKeyhole size={12} /> Already part of your account</span>
              </div>
              <div className="profile-membership-progress">
                <div className="profile-progress-heading"><span>MEMBERSHIP PERIOD</span><strong>{Math.round(elapsedPercent)}% elapsed</strong></div>
                <div className="profile-progress-track"><span style={{ width: elapsedPercent + "%" }} /></div>
                <div className="profile-progress-labels"><span>Started {formatAccountDate(startedAt)}</span><span>{expiresAt ? formatAccountDate(expiresAt) : 'No expiry'}</span></div>
              </div>
              <div className="profile-plan-stats">
                <div><CalendarDays size={16} /><span><small>ACTIVE FOR</small><strong>{activeLabel}</strong></span></div>
                <div><Clock3 size={16} /><span><small>EXPIRY STATUS</small><strong>{expiryLabel}</strong></span></div>
                <div><CreditCard size={16} /><span><small>BILLING CYCLE</small><strong>{activeBilling?.label || 'Free'}</strong></span></div>
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
                <div className="profile-benefit-item"><span><BadgeCheck size={17} /></span><strong>Verified badge</strong><small>Premium member identity</small></div>
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
                <ReadonlyAccountField icon={UserRound} label="Display name" value={DEMO_ACCOUNT.name} />
                <ReadonlyAccountField icon={Mail} label="Email address" value={DEMO_ACCOUNT.email} />
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
              <div className="profile-access-row"><span>Smart TV browser</span><strong>Web access</strong></div>
              <p className="profile-access-footnote">Membership and device status are read from the server.</p>
            </section>
          </aside>
        </div>
      </div>
      <p className="account-page-caption">SITULA ACCOUNT EXPERIENCE <span>·</span> UI PREVIEW</p>
    </main>
  );
}
