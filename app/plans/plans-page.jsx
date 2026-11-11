"use client";

import Link from "next/link";
import { useState } from "react";

const MODES = [
  { id: "guest", label: "Guest", short: "Anonymous" },
  { id: "free", label: "Free", short: "Freemium" },
  { id: "premium", label: "Premium", short: "Verified" }
];

const PLANS = [
  {
    id: "guest",
    eyebrow: "NO ACCOUNT NEEDED",
    name: "Anonymous Guest",
    price: "Free access",
    description: "Browse Situla without creating an account and try the viewing experience.",
    allowance: "1 hour",
    cooldown: "5 hours",
    devices: "IP + guest session",
    badge: "No badge",
    player: "VidLink Pro for movies · VidBolt for TV & Anime",
    updates: "Standard public catalog updates",
    features: [
      "No account or sign-in required",
      "Browse Home, Search, Movies, TV and Anime",
      "Up to 1 hour of watch access per cycle",
      "5-hour watch cooldown after the allowance",
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
    allowance: "1 hour",
    cooldown: "2 hours",
    devices: "1 registered device",
    badge: "No badge",
    player: "VidLink Pro for movies · VidBolt for TV & Anime",
    updates: "Standard public catalog updates",
    features: [
      "Account and sign-in required",
      "Up to 1 hour of account watch time per cycle",
      "2-hour watch cooldown after the allowance",
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
    allowance: "3 hours",
    cooldown: "2 hours",
    devices: "Up to 3 registered devices",
    badge: "Verified badge",
    player: "VidBolt for Premium movies (planned) · VidBolt for TV & Anime",
    updates: "Early updates and detailed upcoming-movie information",
    features: [
      "Account and active Premium subscription required",
      "Up to 3 hours of shared account watch time per cycle",
      "2-hour watch cooldown after the allowance",
      "Up to 3 registered devices across mobile, computer and TV",
      "One shared account allowance across all registered devices",
      "Premium Verified badge",
      "Early upcoming-movie updates and release information",
      "VidBolt planned for Premium movie playback"
    ],
    limits: [
      "Maximum 3 registered devices",
      "Watch time is shared across all registered devices",
      "Price and checkout will be announced separately"
    ],
    action: "premium"
  }
];

const COMPARISON = [
  ["Account required", "No", "Yes", "Yes"],
  ["Watch allowance per cycle", "1 hour", "1 hour", "3 hours"],
  ["Cooldown after allowance", "5 hours", "2 hours", "2 hours"],
  ["Restriction scope", "Public IP + guest session", "Account + device", "Account + up to 3 devices"],
  ["Registered devices", "IP/session based", "1", "Up to 3"],
  ["Movie player", "VidLink Pro", "VidLink Pro", "VidBolt (planned)"],
  ["TV & Anime player", "VidBolt", "VidBolt", "VidBolt"],
  ["Premium Verified badge", "No", "No", "Yes"],
  ["Upcoming movie updates", "Public updates", "Public updates", "Early + detailed"],
  ["Watch-page cooldown", "Movie, TV & Anime", "Movie, TV & Anime", "Movie, TV & Anime"],
  ["Browse catalog during cooldown", "Yes", "Yes", "Yes"],
  ["Android TV browser", "Web experience", "Web experience", "Web experience"]
];

export default function PlansPage() {
  const [previewMode, setPreviewMode] = useState("guest");
  const [notice, setNotice] = useState("");

  function choosePreview(mode) {
    setPreviewMode(mode);
    setNotice("Preview changed to " + MODES.find((item) => item.id === mode).label + ". This is a visual demo only; it does not sign you in, start a subscription, or change access permissions.");
  }

  function showActionNotice(kind) {
    if (kind === "free") {
      setNotice("Login is a preview action only. The account and sign-in system will be connected in a later implementation phase.");
      return;
    }
    setNotice("Premium checkout is not active in this UI preview. No payment or subscription has been started.");
  }

  const currentMode = MODES.find((item) => item.id === previewMode);
  const lockTime = previewMode === "guest" ? "04:42:18" : "01:42:18";
  const lockDuration = previewMode === "guest" ? "5-hour guest cooldown" : previewMode === "free" ? "2-hour Free cooldown" : "2-hour Premium cooldown";

  return (
    <main className="plans-page">
      <div className="plans-shell">
        <header className="plans-topbar">
          <Link href="/" className="plans-brand" aria-label="Situla home">
            <img src="/icon.svg" alt="" width="38" height="38" />
            <span><strong>SITULA</strong><small>MEMBERSHIP & ACCESS</small></span>
          </Link>
          <Link href="/" className="plans-back-link"><i className="bi bi-arrow-left" aria-hidden="true" /> Back to Situla</Link>
        </header>

        <section className="plans-hero">
          <div className="plans-hero-copy">
            <span className="plans-eyebrow"><i className="bi bi-layers" aria-hidden="true" /> THREE WAYS TO WATCH</span>
            <h1>Choose your way to <em>watch more.</em></h1>
            <p>Explore Situla as an anonymous guest, a Free member, or a Premium member. Compare viewing time, cooldowns, devices and playback access before choosing a plan.</p>
            <div className="plans-hero-points">
              <span><i className="bi bi-check-circle-fill" aria-hidden="true" /> Browse remains open</span>
              <span><i className="bi bi-shield-check" aria-hidden="true" /> Watch access is checked</span>
              <span><i className="bi bi-tv" aria-hidden="true" /> TV browser experience</span>
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
            <span className="plans-demo-tag"><i className="bi bi-eye" aria-hidden="true" /> UI PREVIEW ONLY</span>
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
          {notice && <div className="plans-action-notice" role="status"><i className="bi bi-info-circle" aria-hidden="true" /> {notice}</div>}
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
                    {plan.id === "premium" ? <span className="plans-recommended"><i className="bi bi-stars" aria-hidden="true" /> PREMIUM</span> : isCurrent ? <span className="plans-current-tag">PREVIEWING</span> : null}
                  </div>
                  <div className="plans-card-title-row">
                    <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
                    {plan.id === "premium" ? <span className="plans-plan-icon premium"><i className="bi bi-patch-check-fill" aria-hidden="true" /></span> : plan.id === "free" ? <span className="plans-plan-icon"><i className="bi bi-person-check" aria-hidden="true" /></span> : <span className="plans-plan-icon"><i className="bi bi-person" aria-hidden="true" /></span>}
                  </div>
                  <div className="plans-price-line"><strong>{plan.price}</strong>{plan.id === "premium" && <small>Pricing announced later</small>}</div>
                  <div className="plans-stats">
                    <div><span>WATCH TIME</span><strong>{plan.allowance}</strong><small>per cycle</small></div>
                    <div><span>COOLDOWN</span><strong>{plan.cooldown}</strong><small>after limit</small></div>
                    <div><span>DEVICES</span><strong>{plan.devices}</strong><small>access policy</small></div>
                  </div>
                  <div className="plans-playback-line"><span><i className="bi bi-play-circle" aria-hidden="true" /> PLAYBACK</span><strong>{plan.player}</strong></div>
                  <div className="plans-feature-block">
                    <h4><i className="bi bi-check2-circle" aria-hidden="true" /> Included</h4>
                    <ul>{plan.features.map((feature) => <li key={feature}><i className="bi bi-check2" aria-hidden="true" /> <span>{feature}</span></li>)}</ul>
                  </div>
                  <div className="plans-limit-block">
                    <h4><i className="bi bi-info-circle" aria-hidden="true" /> Limits & notes</h4>
                    <ul>{plan.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
                  </div>
                  {plan.id === "guest" ? (
                    <Link href="/" className="plans-action plans-action-guest"><i className="bi bi-arrow-right-circle" aria-hidden="true" /> Continue as Guest</Link>
                  ) : plan.id === "free" ? (
                    <button type="button" className="plans-action plans-action-free" onClick={() => showActionNotice("free")} disabled={previewMode === "free"}>
                      <i className={previewMode === "free" ? "bi bi-check-circle-fill" : "bi bi-box-arrow-in-right"} aria-hidden="true" />
                      {previewMode === "free" ? "Logged in · Preview" : "Login"}
                    </button>
                  ) : (
                    <button type="button" className="plans-action plans-action-premium" onClick={() => showActionNotice("premium")} disabled={previewMode === "premium"}>
                      <i className={previewMode === "premium" ? "bi bi-patch-check-fill" : "bi bi-stars"} aria-hidden="true" />
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
                <li><i className="bi bi-check-circle" aria-hidden="true" /> Home, Search and catalog browsing stay available.</li>
                <li><i className="bi bi-check-circle" aria-hidden="true" /> Movie, TV and Anime Watch Pages share the same access decision for that plan.</li>
                <li><i className="bi bi-check-circle" aria-hidden="true" /> When cooldown ends, the server can allow a new watch cycle.</li>
              </ul>
            </div>
            <div className="plans-lock-demo">
              <div className="plans-lock-demo-head"><span><i className="bi bi-lock-fill" aria-hidden="true" /> WATCH ACCESS PAUSED</span><span className="plans-lock-demo-pill">LOCKED</span></div>
              <div className="plans-lock-timer-label">EXAMPLE · {lockDuration.toUpperCase()}</div>
              <strong className="plans-lock-timer">{lockTime}</strong>
              <p>Time remaining in this illustrative cooldown</p>
              <div className="plans-lock-demo-divider" />
              <div className="plans-lock-categories"><span><i className="bi bi-film" aria-hidden="true" /> Movies</span><span><i className="bi bi-tv" aria-hidden="true" /> TV</span><span><i className="bi bi-play-btn" aria-hidden="true" /> Anime</span></div>
              <div className="plans-lock-foot"><i className="bi bi-unlock" aria-hidden="true" /> Catalog browsing remains available</div>
            </div>
          </div>
        </section>

        <section className="plans-compare-section" aria-labelledby="plans-compare-title">
          <div className="plans-section-heading">
            <div><span className="plans-section-kicker">SIDE-BY-SIDE DETAILS</span><h2 id="plans-compare-title">Every plan, clearly compared</h2></div>
          </div>
          <div className="plans-table-wrap" tabIndex="0" aria-label="Scrollable plan comparison">
            <table className="plans-table">
              <thead><tr><th scope="col">Feature</th><th scope="col">Anonymous Guest</th><th scope="col">Free</th><th scope="col">Premium <span className="plans-table-verified"><i className="bi bi-patch-check-fill" aria-hidden="true" /> Verified</span></th></tr></thead>
              <tbody>{COMPARISON.map((row) => <tr key={row[0]}><th scope="row">{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="plans-table-hint"><i className="bi bi-arrows" aria-hidden="true" /> On smaller screens, swipe the comparison table horizontally.</p>
        </section>

        <section className="plans-tv-section" aria-labelledby="plans-tv-title">
          <div className="plans-tv-icon"><i className="bi bi-tv" aria-hidden="true" /></div>
          <div className="plans-tv-copy">
            <span className="plans-section-kicker">ONE WEBSITE · NO TV APP</span>
            <h2 id="plans-tv-title">Use Situla in your TV browser</h2>
            <p>Open the same Situla website in a compatible browser installed on an Android or Smart TV. No separate Situla TV app is planned.</p>
            <div className="plans-tv-points">
              <span><i className="bi bi-check2" aria-hidden="true" /> TV-sized responsive layout</span>
              <span><i className="bi bi-check2" aria-hidden="true" /> Remote-friendly navigation design</span>
              <span><i className="bi bi-check2" aria-hidden="true" /> Same plan and Watch Page rules</span>
            </div>
            <small>Compatibility depends on the TV model, installed browser, video codecs and third-party embedded player support. Not every TV/browser combination can be guaranteed.</small>
          </div>
        </section>

        <section className="plans-policy-section" aria-labelledby="plans-policy-title">
          <div className="plans-section-heading">
            <div><span className="plans-section-kicker">POLICIES & IMPORTANT NOTES</span><h2 id="plans-policy-title">Know what the limits mean</h2></div>
          </div>
          <div className="plans-policy-grid">
            <article><span className="plans-policy-icon"><i className="bi bi-globe2" aria-hidden="true" /></span><h3>Guest IP policy</h3><p>Guest cooldown uses the public IP seen by Situla together with an anonymous session. People sharing one Wi-Fi or carrier network may share an IP, while VPNs or network changes can change the IP. IP is not a unique person identifier.</p></article>
            <article><span className="plans-policy-icon"><i className="bi bi-person-lock" aria-hidden="true" /></span><h3>Account & device policy</h3><p>Free usage belongs to one account and one registered device. Premium usage is shared across the account's registered devices, up to three. A device switch or revoked device will need server-side verification.</p></article>
            <article><span className="plans-policy-icon"><i className="bi bi-hourglass-split" aria-hidden="true" /></span><h3>Watch timer policy</h3><p>Watch limits are intended to count playback usage, not ordinary catalog browsing. The server is the source of truth for allowance and cooldown; browser clocks must not control access.</p></article>
            <article><span className="plans-policy-icon"><i className="bi bi-play-circle" aria-hidden="true" /></span><h3>Third-party player policy</h3><p>Situla can gate Watch Pages and prevent a player from loading during cooldown. Strictly stopping an already-running third-party stream also depends on provider support for expiring playback sessions or server-side playback authorization.</p></article>
          </div>
        </section>

        <section className="plans-launch-note">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <div><strong>Plan page preview — membership systems are not active yet.</strong><p>Account sign-in, Premium checkout, verified status, device registration, IP restrictions and server-side watch enforcement will be implemented separately. Prices and launch dates have not been announced. The demo controls above do not create accounts, take payments or grant access.</p></div>
        </section>

        <div className="plans-bottom-cta">
          <div><span className="plans-section-kicker">READY WHEN YOU ARE</span><h2>Start with Situla, your way.</h2><p>Browse now, or explore the membership options before they launch.</p></div>
          <Link href="/" className="plans-action plans-action-guest"><i className="bi bi-arrow-right-circle" aria-hidden="true" /> Explore Situla</Link>
        </div>
      </div>
    </main>
  );
}
