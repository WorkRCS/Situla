"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, CheckCircle2,
  ChevronRight, Clock3, CreditCard, Crown, Eye, EyeOff, Film, Fingerprint,
  Globe2, LockKeyhole, LogIn, Mail, MonitorSmartphone, ShieldCheck,
  Sparkles, Tv, UserRound
} from "lucide-react";
import {
  DEMO_ACCOUNT, DEMO_MEMBERSHIP, PREMIUM_BILLING,
  readDemoAccountSession, setDemoAccountSession
} from "../../src/membership-preview.js";

const ACTIVE_BILLING = PREMIUM_BILLING.find((item) => item.id === DEMO_MEMBERSHIP.billingCycle) || PREMIUM_BILLING[0];

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

export function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [notice, setNotice] = useState("");

  function completeDemoSignIn(method) {
    setDemoAccountSession(true);
    setNotice(method === "google"
      ? "Google sign-in preview selected. No Google account request was made."
      : "Email sign-in preview selected. No credentials were sent to a server.");
    router.push("/profile");
  }

  function submitEmail(event) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    completeDemoSignIn("email");
  }

  return (
    <main className="account-page login-page">
      <AccountPageTopbar />
      <div className="login-layout">
        <section className="login-showcase">
          <span className="account-eyebrow"><Sparkles size={14} /> THE SITULA EXPERIENCE</span>
          <h1>Your next great watch starts <em>here.</em></h1>
          <p className="login-showcase-description">Sign in to keep your membership details together, see your access status and make the most of every story.</p>
          <div className="login-showcase-points">
            <div><ShieldCheck size={18} /><span><strong>One account, all in one place</strong><small>Your account and membership at a glance.</small></span></div>
            <div><Crown size={18} /><span><strong>Premium member experience</strong><small>Benefits, renewal timing and plan details.</small></span></div>
            <div><MonitorSmartphone size={18} /><span><strong>Made for every screen</strong><small>A considered experience on phone, tablet and desktop.</small></span></div>
          </div>
          <div className="login-showcase-foot">
            <span className="login-showcase-orbit"><span /><span /><span /></span>
            <span><strong>Discover more with Situla</strong><small>Movies · TV series · Anime</small></span>
            <BadgeCheck size={20} />
          </div>
        </section>

        <section className="login-form-card" aria-labelledby="login-title">
          <div className="login-form-heading">
            <span className="login-form-icon"><UserRound size={20} /></span>
            <span className="account-eyebrow">MEMBER ACCESS</span>
            <h2 id="login-title">Welcome back.</h2>
            <p>Sign in to continue to your Situla account.</p>
          </div>
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
              <label className="account-remember"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span>Remember me</span></label>
              <button type="button" className="account-text-button" onClick={() => setNotice("Password recovery will be connected with the authentication service in a later phase.")}>Forgot password?</button>
            </div>
            <button type="submit" className="account-primary-button"><LogIn size={17} /> Continue with email <ArrowRight size={16} /></button>
          </form>
          <div className="account-divider"><span>OR CONTINUE WITH</span></div>
          <button type="button" className="account-google-button" onClick={() => completeDemoSignIn("google")}><span className="account-google-mark" aria-hidden="true">G</span>Continue with Google</button>
          <p className="account-demo-disclaimer"><ShieldCheck size={14} /> Preview mode: no password is verified and no Google OAuth request is sent.</p>
          {notice && <p className="account-action-notice" role="status">{notice}</p>}
          <p className="login-membership-link">New to Situla? <Link href="/plans">Explore membership <ChevronRight size={13} /></Link></p>
        </section>
      </div>
      <p className="account-page-caption">SITULA ACCOUNT EXPERIENCE <span>·</span> UI PREVIEW</p>
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
  const [signedIn, setSignedIn] = useState(true);
  const [renewalNotice, setRenewalNotice] = useState("");
  const [clock, setClock] = useState(null);

  useEffect(() => {
    const syncDemoAccount = () => setSignedIn(readDemoAccountSession());
    syncDemoAccount();
    setClock(new Date());
    window.addEventListener("storage", syncDemoAccount);
    window.addEventListener("situla:demo-account", syncDemoAccount);
    return () => {
      window.removeEventListener("storage", syncDemoAccount);
      window.removeEventListener("situla:demo-account", syncDemoAccount);
    };
  }, []);

  const now = clock || new Date("2026-11-11T12:00:00");
  const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const daysActive = Math.max(0, daysBetween(DEMO_MEMBERSHIP.startedAt, today));
  const daysRemaining = daysBetween(today, DEMO_MEMBERSHIP.expiresAt);
  const membershipActive = daysRemaining >= 0;
  const renewalAvailable = !membershipActive || daysRemaining <= DEMO_MEMBERSHIP.renewWindowDays;
  const elapsedPercent = Math.min(100, Math.max(0, (daysActive / (ACTIVE_BILLING.months * 30)) * 100));
  const activeLabel = daysActive === 1 ? "1 day" : daysActive + " days";
  const expiryLabel = daysRemaining < 0 ? "Expired" : daysRemaining === 0 ? "Expires today" : daysRemaining + " days left";

  if (!signedIn) {
    return (
      <main className="account-page profile-page">
        <AccountPageTopbar profile />
        <section className="profile-signed-out">
          <span className="profile-empty-icon"><LockKeyhole size={25} /></span>
          <span className="account-eyebrow">MEMBER ACCESS REQUIRED</span>
          <h1>Your profile is waiting.</h1>
          <p>Sign in to view the demo membership and account details.</p>
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
            <div className="profile-avatar-large">{DEMO_ACCOUNT.initials}<span><Check size={13} /></span></div>
            <div className="profile-identity-copy">
              <span className="profile-overline">SITULA MEMBER</span>
              <h2>{DEMO_ACCOUNT.name} {DEMO_ACCOUNT.verified && <BadgeCheck size={21} aria-label="Verified Premium member" />}</h2>
              <p>{DEMO_ACCOUNT.email}</p>
              <div className="profile-identity-badges">
                <span className="profile-verified-badge"><BadgeCheck size={13} /> Premium Verified</span>
                <span className="profile-active-badge"><i /> Account active</span>
              </div>
            </div>
          </div>
          <div className="profile-account-health">
            <span>ACCOUNT STATUS</span>
            <strong><i /> {DEMO_ACCOUNT.accountStatus}</strong>
            <small>Good standing · Demo account</small>
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
                <div><span className="profile-overline">YOUR CURRENT PLAN</span><h2>Premium</h2><p>More room for every story.</p></div>
                <div className="profile-plan-price"><strong>₹{ACTIVE_BILLING.monthlyPrice.toLocaleString("en-IN")}</strong><span>/ month</span><small>{ACTIVE_BILLING.billingLabel}</small></div>
              </div>
              <div className="profile-purchase-row">
                <button type="button" className="profile-purchased-button" disabled><CheckCircle2 size={17} /> Purchased · Enjoy Premium <Sparkles size={15} /></button>
                <span className="profile-purchase-caption"><LockKeyhole size={12} /> Already part of your account</span>
              </div>
              <div className="profile-membership-progress">
                <div className="profile-progress-heading"><span>MEMBERSHIP PERIOD</span><strong>{Math.round(elapsedPercent)}% elapsed</strong></div>
                <div className="profile-progress-track"><span style={{ width: elapsedPercent + "%" }} /></div>
                <div className="profile-progress-labels"><span>Started {formatAccountDate(DEMO_MEMBERSHIP.startedAt)}</span><span>{formatAccountDate(DEMO_MEMBERSHIP.expiresAt)}</span></div>
              </div>
              <div className="profile-plan-stats">
                <div><CalendarDays size={16} /><span><small>ACTIVE FOR</small><strong>{activeLabel}</strong></span></div>
                <div><Clock3 size={16} /><span><small>EXPIRY STATUS</small><strong>{expiryLabel}</strong></span></div>
                <div><CreditCard size={16} /><span><small>BILLING CYCLE</small><strong>{ACTIVE_BILLING.label}</strong></span></div>
              </div>
              {renewalAvailable ? (
                <div className="profile-renewal-panel">
                  <span className="profile-renewal-icon"><Sparkles size={17} /></span>
                  <span className="profile-renewal-copy"><strong>{membershipActive ? "Your renewal window is open" : "Renew Premium to restore access"}</strong><small>{membershipActive ? "Renew before " + formatAccountDate(DEMO_MEMBERSHIP.expiresAt) + " to keep your membership going." : "Your previous membership period has ended."}</small></span>
                  <button type="button" onClick={() => setRenewalNotice("Renewal is a visual preview only. Checkout and payment are not connected.")}>Renew plan <ArrowRight size={15} /></button>
                </div>
              ) : (
                <div className="profile-renewal-locked"><LockKeyhole size={15} /><span>Renewal opens {daysRemaining - DEMO_MEMBERSHIP.renewWindowDays} days from now, within 21 days of expiry.</span></div>
              )}
              {renewalNotice && <p className="profile-action-notice" role="status">{renewalNotice}</p>}
            </section>

            <section className="profile-benefits-card">
              <div className="profile-section-heading"><div><span className="account-eyebrow">WHAT YOU GET</span><h2>Premium benefits</h2></div><span className="profile-benefit-count">06 BENEFITS</span></div>
              <div className="profile-benefit-grid">
                <div className="profile-benefit-item"><span><Clock3 size={17} /></span><strong>{ACTIVE_BILLING.allowance} watch allowance</strong><small>Per membership cycle</small></div>
                <div className="profile-benefit-item"><span><LockKeyhole size={17} /></span><strong>{ACTIVE_BILLING.cooldown} cooldown</strong><small>Between watch sessions</small></div>
                <div className="profile-benefit-item"><span><MonitorSmartphone size={17} /></span><strong>Up to 3 devices</strong><small>Manage your registered devices</small></div>
                <div className="profile-benefit-item"><span><BadgeCheck size={17} /></span><strong>Verified badge</strong><small>Premium member identity</small></div>
                <div className="profile-benefit-item"><span><Sparkles size={17} /></span><strong>Early movie updates</strong><small>Upcoming titles and release info</small></div>
                <div className="profile-benefit-item is-planned"><span><Film size={17} /></span><strong>VidBolt movie player</strong><small>Planned · Not active yet</small></div>
              </div>
              <Link href="/plans" className="profile-view-plans">Compare all plans <ArrowRight size={15} /></Link>
            </section>
          </div>

          <aside className="profile-secondary-column">
            <section className="profile-details-card">
              <div className="profile-section-heading"><div><span className="account-eyebrow">ACCOUNT IDENTITY</span><h2>Personal details</h2></div><Fingerprint size={19} /></div>
              <p className="profile-locked-intro">These details are fixed in this preview and cannot be edited.</p>
              <div className="profile-readonly-list">
                <ReadonlyAccountField icon={UserRound} label="Display name" value={DEMO_ACCOUNT.name} />
                <ReadonlyAccountField icon={Mail} label="Email address" value={DEMO_ACCOUNT.email} />
                <ReadonlyAccountField icon={Fingerprint} label="Sign-in method" value={DEMO_ACCOUNT.loginMethod} />
                <ReadonlyAccountField icon={Globe2} label="Profile avatar" value="Situla member avatar" />
              </div>
              <div className="profile-security-note"><ShieldCheck size={16} /><span><strong>Account identity protected</strong><small>Profile name, email and avatar editing are not available in this demo.</small></span></div>
            </section>

            <section className="profile-access-card">
              <div className="profile-section-heading"><div><span className="account-eyebrow">ACCESS SNAPSHOT</span><h2>Your access</h2></div><Tv size={19} /></div>
              <div className="profile-access-row"><span>Plan status</span><strong className={membershipActive ? "is-active" : "is-expired"}>{membershipActive ? "Active" : "Expired"}</strong></div>
              <div className="profile-access-row"><span>Account status</span><strong className="is-active">Active</strong></div>
              <div className="profile-access-row"><span>Current plan</span><strong>Premium</strong></div>
              <div className="profile-access-row"><span>Registered devices</span><strong>0 / 3 used</strong></div>
              <div className="profile-access-row"><span>Smart TV browser</span><strong>Web access</strong></div>
              <p className="profile-access-footnote">Illustrative account information · Not connected to an access API.</p>
            </section>
          </aside>
        </div>
      </div>
      <p className="account-page-caption">SITULA ACCOUNT EXPERIENCE <span>·</span> UI PREVIEW</p>
    </main>
  );
}
