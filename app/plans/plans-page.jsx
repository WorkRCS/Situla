"use client";

import Link from "next/link";
import { useState } from "react";
import { PREMIUM_BILLING } from "../../src/membership-preview.js";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCircle2, CircleX,
  Clock3, Compass, CreditCard, Crown, Eye, Film, Globe2, Info, Layers3,
  LockKeyhole, LogIn, PlayCircle, ShieldCheck, Sparkles, Tv, Unlock,
  UserRound, UserRoundCheck
} from "lucide-react";

const MODES = [
  { id: "guest", label: "Guest", short: "Anonymous" },
  { id: "free", label: "Free", short: "Freemium" },
  { id: "premium", label: "Premium", short: "Verified" }
];

const USD_REFERENCE_INR_PER_USD = 93.8075;
const USD_REFERENCE_DATE = "11 Nov 2026";



function formatUsd(inrAmount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(inrAmount) / USD_REFERENCE_INR_PER_USD);
}

function FeatureStatusCell({ available, detail }) {
  const StatusIcon = available ? CheckCircle2 : CircleX;
  return (
    <span className={"plans-feature-status " + (available ? "is-included" : "is-unavailable")} aria-label={(available ? "Included: " : "Not included: ") + (detail || (available ? "Yes" : "No"))}>
      <StatusIcon size={15} strokeWidth={2.5} aria-hidden="true" />
      <span>{detail || (available ? "Included" : "Not included")}</span>
    </span>
  );
}

const PLANS = [
  {
    id: "guest",
    eyebrow: "NO ACCOUNT NEEDED",
    name: "Anonymous Guest",
    price: "Free access",
    description: "Browse Situla without creating an account and try the viewing experience.",
    allowance: "1 hour",
    cooldown: "2 hours",
    devices: "IP + guest session",
    badge: "No badge",
    updates: "Standard public catalog updates",
    features: [
      "No account or sign-in required",
      "Browse Home, Search, Movies, TV and Anime",
      "Up to 1 hour of watch access per cycle",
      "2-hour watch cooldown after the allowance",
      "Guest restriction uses public IP and an anonymous session",
      "Catalog browsing stays available during cooldown"
    ],
    limits: [
      "No Premium Verified badge",
      "IP limits can affect people sharing the same network",
      "Changing networks can change the public IP seen by the service"
    ],
    action: "guest"
  },
  {
    id: "free",
    eyebrow: "REGISTERED MEMBERSHIP",
    name: "Free",
    price: "No subscription",
    description: "Create an account for a personal, single-device viewing allowance.",
    allowance: "3 hours",
    cooldown: "1 hour",
    devices: "1 registered device",
    badge: "No badge",
    updates: "Standard public catalog updates",
    features: [
      "Account and sign-in required",
      "Up to 3 hours of account watch time per cycle",
      "1-hour watch cooldown after the allowance",
      "1 registered device at a time",
      "Account and device-based access checks",
      "Browse the full catalog during cooldown"
    ],
    limits: [
      "No Premium Verified badge",
      "No Premium early movie updates",
      "One registered device only"
    ],
    action: "free"
  },
  {
    id: "premium",
    eyebrow: "FULL MEMBERSHIP",
    name: "Premium",
    price: "Price to be announced",
    description: "More viewing time, multi-device access and early movie information.",
    allowance: "5 hours",
    cooldown: "40 minutes",
    devices: "Up to 3 registered devices",
    badge: "Verified badge",
    updates: "Early updates and detailed upcoming-movie information",
    features: [
      "Account and active Premium subscription required",
      "Up to 3 registered devices across mobile, computer and TV",
      "One shared account allowance across all registered devices",
      "Premium Verified badge",
      "Early upcoming-movie updates and release information",
      "Premium movie playback planned"
    ],
    limits: [
      "Maximum 3 registered devices",
      "Watch time is shared across all registered devices",
      "Membership checkout and renewals are not active in this preview"
    ],
    action: "premium"
  }
];



export default function PlansPage() {
  const [previewMode, setPreviewMode] = useState("guest");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [notice, setNotice] = useState("");

  function choosePreview(mode) {
    setPreviewMode(mode);
    setNotice("Comparison view changed to " + MODES.find((item) => item.id === mode).label + ". This does not change your actual server-side access.");
  }

  function showActionNotice(kind) {
    if (kind === "free") {
      window.location.assign("/login");
      return;
    }
    setNotice("Premium checkout is not active in this UI preview. No payment or subscription has been started.");
  }

  const currentMode = MODES.find((item) => item.id === previewMode);
  const selectedBilling = PREMIUM_BILLING.find((item) => item.id === billingCycle) || PREMIUM_BILLING[0];
  const lockTime = previewMode === "guest" ? "01:42:18" : "00:42:18";
  const lockDuration = previewMode === "guest" ? "2-hour guest cooldown" : previewMode === "free" ? "1-hour Free cooldown" : selectedBilling.cooldown + " Premium cooldown";
  const featureRows = [
    { label: "Browse catalog during cooldown", cells: [
      { available: true, detail: "Available" }, { available: true, detail: "Available" }, { available: true, detail: "Available" }
    ]},
    { label: "Use Situla without an account", cells: [
      { available: true, detail: "Guest access" }, { available: false }, { available: false }
    ]},
    { label: "Account-based watch tracking", cells: [
      { available: false }, { available: true, detail: "Included" }, { available: true, detail: "Included" }
    ]},
    { label: "IP + anonymous guest-session limit", cells: [
      { available: true, detail: "Included" }, { available: false }, { available: false }
    ]},
    { label: "Watch allowance per cycle", cells: [
      { available: true, detail: "1 hour" }, { available: true, detail: "3 hours" }, { available: true, detail: selectedBilling.allowance }
    ]},
    { label: "Cooldown after watch allowance", cells: [
      { available: true, detail: "2 hours" }, { available: true, detail: "1 hour" }, { available: true, detail: selectedBilling.cooldown }
    ]},
    { label: "20-minute cooldown (6-month billing)", cells: [
      { available: false }, { available: false }, { available: billingCycle === "six-months", detail: billingCycle === "six-months" ? "Included" : "6-month plan only" }
    ]},
    { label: "Unlimited streaming (Yearly billing)", cells: [
      { available: false }, { available: false }, { available: billingCycle === "yearly", detail: billingCycle === "yearly" ? "Included" : "Yearly plan only" }
    ]},
    { label: "Registered device management", cells: [
      { available: false, detail: "IP/session based" }, { available: true, detail: "1 device" }, { available: true, detail: "Up to 3" }
    ]},
    { label: "Premium Verified badge", cells: [
      { available: false }, { available: false }, { available: true, detail: "Included" }
    ]},
    { label: "Early upcoming-movie updates", cells: [
      { available: false }, { available: false }, { available: true, detail: "Included" }
    ]},
    { label: "Premium movie playback", cells: [
      { available: false }, { available: false }, { available: false, detail: "Planned, not active" }
    ]},
    { label: "TV & Anime streaming access", cells: [
      { available: true, detail: "Included" }, { available: true, detail: "Included" }, { available: true, detail: "Included" }
    ]},
    { label: "Android / Smart TV browser access", cells: [
      { available: true, detail: "Web access" }, { available: true, detail: "Web access" }, { available: true, detail: "Web access" }
    ]}
  ];

  return (
    <main className="plans-page">
      <div className="plans-shell">
        <header className="plans-topbar">
          <Link href="/" className="plans-brand" aria-label="Situla home">
            <img src="/icon.svg" alt="" width="38" height="38" />
            <span><strong>SITULA</strong><small>MEMBERSHIP & ACCESS</small></span>
          </Link>
          <Link href="/" className="plans-back-link"><ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" /> Back to Situla</Link>
        </header>

        <section className="plans-hero">
          <div className="plans-hero-copy">
            <span className="plans-eyebrow"><Layers3 size={15} strokeWidth={2} aria-hidden="true" /> THREE WAYS TO WATCH</span>
            <h1>Choose your way to <em>watch more.</em></h1>
            <p>Explore Situla as an anonymous guest, a Free member, or a Premium member. Compare viewing time, cooldowns, devices and playback access before choosing a plan.</p>
            <div className="plans-hero-points">
              <span><CheckCircle2 size={14} strokeWidth={2.3} aria-hidden="true" /> Browse remains open</span>
              <span><ShieldCheck size={14} strokeWidth={2.1} aria-hidden="true" /> Watch access is checked</span>
              <span><Tv size={14} strokeWidth={2.1} aria-hidden="true" /> TV browser experience</span>
            </div>
          </div>
          <aside className="plans-hero-side">
            <span className="plans-side-kicker">SITULA ACCESS MODEL</span>
            <strong>One website.<br />Three access levels.</strong>
            <div className="plans-side-divider" />
            <span>Movies <b>·</b> TV <b>·</b> Anime</span>
            <small>Plan details and policy preview</small>
          </aside>
        </section>

        <section className="plans-preview-panel" aria-labelledby="plans-preview-title">
          <div className="plans-preview-heading">
            <div>
              <span className="plans-section-kicker">INTERACTIVE DEMO</span>
              <h2 id="plans-preview-title">Preview the plan button states</h2>
              <p>Switch the sample visitor type to see how the plan actions and status labels will look.</p>
            </div>
            <span className="plans-demo-tag"><Eye size={13} strokeWidth={2} aria-hidden="true" /> UI PREVIEW ONLY</span>
          </div>
          <div className="plans-mode-switch" role="group" aria-label="Preview visitor type">
            {MODES.map((mode) => (
              <button key={mode.id} type="button" className={previewMode === mode.id ? "active" : ""} onClick={() => choosePreview(mode.id)} aria-pressed={previewMode === mode.id}>
                {mode.label}
              </button>
            ))}
          </div>
          <div className="plans-preview-status" aria-live="polite">
            <span className="plans-preview-dot" />
            <span>Previewing <strong>{currentMode.label}</strong> mode</span>
            <span className="plans-preview-disclaimer">Changing this preview does not change your real account or permissions.</span>
          </div>
          {notice && <div className="plans-action-notice" role="status"><Info size={13} strokeWidth={2} aria-hidden="true" /> {notice}</div>}
        </section>

        <section className="plans-cards-section" aria-labelledby="plans-heading">
          <div className="plans-section-heading">
            <div><span className="plans-section-kicker">COMPARE MEMBERSHIPS</span><h2 id="plans-heading">Find the access that fits</h2></div>
            <span className="plans-section-note">No hidden differences. Policies shown below.</span>
          </div>
          <div className="plans-cards">
            {PLANS.map((plan) => {
              const isCurrent = previewMode === plan.id;
              return (
                <article key={plan.id} className={"plans-card plans-card-" + plan.id + (isCurrent ? " is-preview-current" : "")}>
                  <div className="plans-card-topline">
                    <span>{plan.eyebrow}</span>
                    {plan.id === "premium" ? <span className="plans-recommended"><Sparkles size={12} strokeWidth={2.1} aria-hidden="true" /> PREMIUM</span> : isCurrent ? <span className="plans-current-tag">PREVIEWING</span> : null}
                  </div>
                  <div className="plans-card-title-row">
                    <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
                    {plan.id === "premium" ? <span className="plans-plan-icon premium"><Crown size={18} strokeWidth={1.9} aria-hidden="true" /></span> : plan.id === "free" ? <span className="plans-plan-icon"><UserRoundCheck size={17} strokeWidth={1.9} aria-hidden="true" /></span> : <span className="plans-plan-icon"><UserRound size={17} strokeWidth={1.9} aria-hidden="true" /></span>}
                  </div>
                  {plan.id === "premium" ? (
                    <div className="plans-premium-pricing">
                      <span className="plans-billing-label">CHOOSE PREMIUM BILLING</span>
                      <div className="plans-billing-options" role="group" aria-label="Premium billing period">
                        {PREMIUM_BILLING.map((billing) => (
                          <button key={billing.id} type="button" className={billingCycle === billing.id ? "active" : ""} onClick={() => setBillingCycle(billing.id)} aria-pressed={billingCycle === billing.id}>
                            <strong>{billing.label}</strong>
                            <span>₹{billing.monthlyPrice}/mo</span>
                          </button>
                        ))}
                      </div>
                      <div className="plans-price-breakdown">
                        <div><span>Monthly rate</span><strong>₹{selectedBilling.monthlyPrice}<small>/month</small></strong><em>{formatUsd(selectedBilling.monthlyPrice)} USD / month</em></div>
                        <div><span>{selectedBilling.billingLabel}</span><strong>₹{selectedBilling.totalPrice.toLocaleString("en-IN")}</strong><em>{formatUsd(selectedBilling.totalPrice)} USD approx.</em></div>
                      </div>
                      <p className="plans-fx-note">Approximate USD display · Reference rate: ₹{USD_REFERENCE_INR_PER_USD.toFixed(4)} per $1 · {USD_REFERENCE_DATE}. Actual payment conversion and fees may vary.</p>
                    </div>
                  ) : (
                    <div className="plans-price-line"><strong>{plan.price}</strong></div>
                  )}
                  <div className="plans-stats">
                    <div><span>WATCH TIME</span><strong>{plan.id === "premium" ? selectedBilling.allowance : plan.allowance}</strong><small>{plan.id === "premium" && selectedBilling.allowance === "Unlimited" ? "yearly plan" : "per cycle"}</small></div>
                    <div><span>COOLDOWN</span><strong>{plan.id === "premium" ? selectedBilling.cooldown : plan.cooldown}</strong><small>{plan.id === "premium" && billingCycle === "yearly" ? "while yearly plan is active" : "after limit"}</small></div>
                    <div><span>DEVICES</span><strong>{plan.devices}</strong><small>access policy</small></div>
                  </div>
                  <div className="plans-feature-block">
                    <h4><CheckCircle2 size={13} strokeWidth={2.2} aria-hidden="true" /> Included</h4>
                    <ul>
                      {plan.features.map((feature) => <li key={feature}><Check size={13} strokeWidth={2.7} aria-hidden="true" /> <span>{feature}</span></li>)}
                      {plan.id === "premium" && <>
                        <li><Check size={13} strokeWidth={2.7} aria-hidden="true" /> <span>{selectedBilling.allowance === "Unlimited" ? "Unlimited streaming on the Yearly package" : "Up to 5 hours per Monthly cycle or 10 hours per 6-month cycle"}</span></li>
                        <li><Check size={13} strokeWidth={2.7} aria-hidden="true" /> <span>{selectedBilling.cooldown === "No periodic cooldown" ? "No scheduled watch cooldown while the Yearly package is active" : selectedBilling.cooldown + " cooldown after the watch allowance"}</span></li>
                      </>}
                    </ul>
                  </div>
                  <div className="plans-limit-block">
                    <h4><Info size={13} strokeWidth={2} aria-hidden="true" /> Limits & notes</h4>
                    <ul>{plan.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
                  </div>
                  {plan.id === "guest" ? (
                    <Link href="/" className="plans-action plans-action-guest"><ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" /> Continue as Guest</Link>
                  ) : plan.id === "free" ? (
                    <button type="button" className="plans-action plans-action-free" onClick={() => showActionNotice("free")} disabled={previewMode === "free"}>
                      {previewMode === "free" ? <CheckCircle2 size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
                      {previewMode === "free" ? "Logged in · Preview" : "Login"}
                    </button>
                  ) : (
                    <button type="button" className="plans-action plans-action-premium" onClick={() => showActionNotice("premium")} disabled={previewMode === "premium"}>
                      {previewMode === "premium" ? <BadgeCheck size={16} aria-hidden="true" /> : <CreditCard size={16} strokeWidth={2} aria-hidden="true" />}
                      {previewMode === "premium" ? "Current plan · Preview" : "Buy Premium"}
                    </button>
                  )}
                  {isCurrent && <p className="plans-current-caption">This is the selected demo state. Real membership status will come from the server.</p>}
                </article>
              );
            })}
          </div>
        </section>

        <section className="plans-lock-section" aria-labelledby="plans-lock-title">
          <div className="plans-section-heading">
            <div><span className="plans-section-kicker">HOW WATCH ACCESS WORKS</span><h2 id="plans-lock-title">Cooldown locks Watch Pages, not Situla</h2></div>
            <span className="plans-section-note">Illustrative screen · not a live timer</span>
          </div>
          <div className="plans-lock-layout">
            <div className="plans-lock-copy">
              <h3>Keep exploring while your watch timer rests.</h3>
              <p>When a plan's watch allowance is used, Movie, TV Episode and Anime Watch Pages show a server-controlled countdown instead of loading the player.</p>
              <ul>
                <li><CheckCircle2 size={13} strokeWidth={2.3} aria-hidden="true" /> Home, Search and catalog browsing stay available.</li>
                <li><CheckCircle2 size={13} strokeWidth={2.3} aria-hidden="true" /> Movie, TV and Anime Watch Pages share the same access decision for that plan.</li>
                <li><CheckCircle2 size={13} strokeWidth={2.3} aria-hidden="true" /> When cooldown ends, the server can allow a new watch cycle.</li>
              </ul>
            </div>
            <div className="plans-lock-demo">
              <div className="plans-lock-demo-head"><span><LockKeyhole size={13} strokeWidth={2.1} aria-hidden="true" /> WATCH ACCESS PAUSED</span><span className="plans-lock-demo-pill">LOCKED</span></div>
              <div className="plans-lock-timer-label">EXAMPLE · {lockDuration.toUpperCase()}</div>
              <strong className="plans-lock-timer">{lockTime}</strong>
              <p>Time remaining in this illustrative cooldown</p>
              <div className="plans-lock-demo-divider" />
              <div className="plans-lock-categories"><span><Film size={13} strokeWidth={2} aria-hidden="true" /> Movies</span><span><Tv size={14} strokeWidth={2.1} aria-hidden="true" /> TV</span><span><PlayCircle size={13} strokeWidth={2} aria-hidden="true" /> Anime</span></div>
              <div className="plans-lock-foot"><Unlock size={13} strokeWidth={2} aria-hidden="true" /> Catalog browsing remains available</div>
            </div>
          </div>
        </section>

        <section className="plans-compare-section" aria-labelledby="plans-compare-title">
          <div className="plans-section-heading">
            <div><span className="plans-section-kicker">SIDE-BY-SIDE DETAILS</span><h2 id="plans-compare-title">Every plan, clearly compared</h2></div>
          </div>
          <div className="plans-feature-matrix" role="table" aria-label="Plan feature availability comparison">
            <div className="plans-matrix-header" role="row">
              <div role="columnheader">Feature</div>
              <div role="columnheader"><UserRound size={14} aria-hidden="true" /> Guest</div>
              <div role="columnheader"><UserRoundCheck size={14} aria-hidden="true" /> Free</div>
              <div role="columnheader"><Crown size={14} aria-hidden="true" /> Premium</div>
            </div>
            {featureRows.map((row) => (
              <div className="plans-matrix-row" role="row" key={row.label}>
                <div className="plans-matrix-feature" role="rowheader">{row.label}</div>
                <div className="plans-matrix-cells" role="presentation">
                  {row.cells.map((cell, index) => (
                    <div className="plans-matrix-cell" role="cell" key={index}>
                      <span className="plans-matrix-mobile-label">{MODES[index].label}</span>
                      <FeatureStatusCell available={cell.available} detail={cell.detail} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="plans-matrix-legend" aria-label="Feature availability legend">
            <span><CheckCircle2 size={14} aria-hidden="true" /> Included</span>
            <span><CircleX size={14} aria-hidden="true" /> Not included</span>
          </div>
        </section>

        <section className="plans-tv-section" aria-labelledby="plans-tv-title">
          <div className="plans-tv-icon"><Tv size={14} strokeWidth={2.1} aria-hidden="true" /></div>
          <div className="plans-tv-copy">
            <span className="plans-section-kicker">ONE WEBSITE · NO TV APP</span>
            <h2 id="plans-tv-title">Use Situla in your TV browser</h2>
            <p>Open the same Situla website in a compatible browser installed on an Android or Smart TV. No separate Situla TV app is planned.</p>
            <div className="plans-tv-points">
              <span><Check size={13} strokeWidth={2.7} aria-hidden="true" /> TV-sized responsive layout</span>
              <span><Check size={13} strokeWidth={2.7} aria-hidden="true" /> Remote-friendly navigation design</span>
              <span><Check size={13} strokeWidth={2.7} aria-hidden="true" /> Same plan and Watch Page rules</span>
            </div>
            <small>Compatibility depends on the TV model, installed browser and supported video formats. Not every TV/browser combination can be guaranteed.</small>
          </div>
        </section>

        <section className="plans-policy-section" aria-labelledby="plans-policy-title">
          <div className="plans-section-heading">
            <div><span className="plans-section-kicker">POLICIES & IMPORTANT NOTES</span><h2 id="plans-policy-title">Know what the limits mean</h2></div>
          </div>
          <div className="plans-policy-grid">
            <article><span className="plans-policy-icon"><Globe2 size={16} strokeWidth={2} aria-hidden="true" /></span><h3>Guest IP policy</h3><p>Guest cooldown uses the public IP seen by Situla together with an anonymous session. People sharing one Wi-Fi or carrier network may share an IP, while VPNs or network changes can change the IP. IP is not a unique person identifier.</p></article>
            <article><span className="plans-policy-icon"><ShieldCheck size={16} strokeWidth={2} aria-hidden="true" /></span><h3>Account & device policy</h3><p>Free usage belongs to one account and one registered device. Premium usage is shared across the account's registered devices, up to three. A device switch or revoked device will need server-side verification.</p></article>
            <article><span className="plans-policy-icon"><Clock3 size={16} strokeWidth={2} aria-hidden="true" /></span><h3>Watch timer policy</h3><p>Watch limits are intended to count playback usage, not ordinary catalog browsing. The server is the source of truth for allowance and cooldown; browser clocks must not control access.</p></article>
            <article><span className="plans-policy-icon"><PlayCircle size={13} strokeWidth={2} aria-hidden="true" /></span><h3>Playback access policy</h3><p>Situla can restrict Watch Pages and prevent playback from starting during a cooldown. Ending a session that is already in progress can depend on session expiry and playback authorization, so restrictions may not take effect instantly on every device.</p></article>
          </div>
        </section>

        <section className="plans-launch-note">
          <Info size={13} strokeWidth={2} aria-hidden="true" />
          <div><strong>Account and watch limits are server-enforced.</strong><p>Email sign-up, Google sign-in (after OAuth setup), registered devices and watch cooldowns use the Situla backend. Premium access is currently activated by an administrator; online checkout and automatic subscription renewal are not connected, so the Buy Premium action does not take payment or grant a plan.</p></div>
        </section>

        <div className="plans-bottom-cta">
          <div><span className="plans-section-kicker">READY WHEN YOU ARE</span><h2>Start with Situla, your way.</h2><p>Browse as a guest or create an account. Premium checkout is not connected yet.</p></div>
          <Link href="/" className="plans-action plans-action-guest"><Compass size={16} strokeWidth={2.1} aria-hidden="true" /> Explore Situla</Link>
        </div>
      </div>
    </main>
  );
}
