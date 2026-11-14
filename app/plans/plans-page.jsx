"use client";

import Link from "next/link";
import { useState } from "react";
import { PREMIUM_BILLING } from "../../src/membership-preview.js";
import {
  ArrowLeft, ArrowRight, Check, Clock3, CreditCard, Crown,
  Globe2, LockKeyhole, ShieldCheck, UserRound, UserRoundCheck
} from "lucide-react";

const PLAN_BILLING_DEFAULT = "monthly";

function PlanMetric({ label, value, detail }) {
  return (
    <div className="plans-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function PlanFeature({ children }) {
  return (
    <li>
      <Check size={14} strokeWidth={2.6} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export default function PlansPage() {
  const [billingCycle, setBillingCycle] = useState(PLAN_BILLING_DEFAULT);
  const selectedBilling = PREMIUM_BILLING.find((item) => item.id === billingCycle) || PREMIUM_BILLING[0];

  return (
    <main className="plans-page">
      <div className="plans-shell">
        <header className="plans-topbar">
          <Link href="/" className="plans-brand" aria-label="Situla home">
            <img src="/icon.svg" alt="" width="38" height="38" />
            <span><strong>SITULA</strong><small>PLANS & ACCESS</small></span>
          </Link>
          <Link href="/" className="plans-back-link">
            <ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
            Back to Situla
          </Link>
        </header>

        <section className="plans-intro" aria-labelledby="plans-title">
          <span className="plans-eyebrow">SITULA MEMBERSHIP</span>
          <h1 id="plans-title">Simple plans. Clear limits.</h1>
          <p>Choose guest access, a free account, or Premium access. Catalog browsing stays available while a watch cooldown is active.</p>
        </section>

        <section className="plans-cards" aria-label="Available Situla plans">
          <article className="plans-card plans-card-guest">
            <div className="plans-card-heading">
              <span className="plans-plan-icon"><UserRound size={19} aria-hidden="true" /></span>
              <div><span className="plans-card-kicker">NO ACCOUNT REQUIRED</span><h2>Guest</h2></div>
            </div>
            <div className="plans-price-line"><strong>Free</strong><span>Browse without signing in</span></div>
            <div className="plans-metrics">
              <PlanMetric label="WATCH TIME" value="1 hour" detail="per cycle" />
              <PlanMetric label="COOLDOWN" value="2 hours" detail="after the limit" />
              <PlanMetric label="ACCESS" value="Guest" detail="IP + session" />
            </div>
            <ul className="plans-feature-list">
              <PlanFeature>No account or sign-in needed</PlanFeature>
              <PlanFeature>Movies, TV and Anime catalog access</PlanFeature>
              <PlanFeature>Catalog browsing remains available during cooldown</PlanFeature>
            </ul>
            <Link href="/" className="plans-card-action plans-card-action-secondary">
              Continue as Guest <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </article>

          <article className="plans-card plans-card-free">
            <div className="plans-card-heading">
              <span className="plans-plan-icon"><UserRoundCheck size={19} aria-hidden="true" /></span>
              <div><span className="plans-card-kicker">REGISTERED ACCOUNT</span><h2>Free</h2></div>
            </div>
            <div className="plans-price-line"><strong>₹0</strong><span>No subscription fee</span></div>
            <div className="plans-metrics">
              <PlanMetric label="WATCH TIME" value="3 hours" detail="per cycle" />
              <PlanMetric label="COOLDOWN" value="1 hour" detail="after the limit" />
              <PlanMetric label="DEVICES" value="1" detail="registered device" />
            </div>
            <ul className="plans-feature-list">
              <PlanFeature>Account sign-in and watch tracking</PlanFeature>
              <PlanFeature>Full catalog browsing during cooldown</PlanFeature>
              <PlanFeature>One registered device at a time</PlanFeature>
            </ul>
            <Link href="/login" className="plans-card-action plans-card-action-secondary">
              Sign in or create account <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </article>

          <article className="plans-card plans-card-premium">
            <div className="plans-card-heading">
              <span className="plans-plan-icon premium"><Crown size={19} aria-hidden="true" /></span>
              <div><span className="plans-card-kicker">MULTI-DEVICE ACCESS</span><h2>Premium</h2></div>
            </div>

            <div className="plans-billing">
              <span className="plans-billing-label">BILLING PERIOD</span>
              <div className="plans-billing-options" role="group" aria-label="Premium billing period">
                {PREMIUM_BILLING.map((billing) => (
                  <button
                    key={billing.id}
                    type="button"
                    className={billingCycle === billing.id ? "active" : ""}
                    onClick={() => setBillingCycle(billing.id)}
                    aria-pressed={billingCycle === billing.id}
                  >
                    {billing.label}
                  </button>
                ))}
              </div>
              <div className="plans-premium-price">
                <strong>₹{selectedBilling.totalPrice.toLocaleString("en-IN")}</strong>
                <span>{selectedBilling.billingLabel}</span>
              </div>
              <p className="plans-effective-rate">
                ₹{selectedBilling.monthlyPrice.toLocaleString("en-IN")} per month
                {selectedBilling.months > 1 ? " effective rate" : ""}
              </p>
            </div>

            <div className="plans-metrics">
              <PlanMetric label="WATCH TIME" value={selectedBilling.allowance} detail="per billing cycle" />
              <PlanMetric label="COOLDOWN" value={selectedBilling.cooldown} detail="after the limit" />
              <PlanMetric label="DEVICES" value="Up to 3" detail="registered devices" />
            </div>
            <ul className="plans-feature-list">
              <PlanFeature>One shared allowance across registered devices</PlanFeature>
              <PlanFeature>Premium Verified badge</PlanFeature>
              <PlanFeature>Early upcoming-movie updates</PlanFeature>
            </ul>
            <div className="plans-premium-note">
              <LockKeyhole size={14} aria-hidden="true" />
              <span>Premium access is currently activated by an administrator. Online checkout and renewals are not available yet.</span>
            </div>
            <button type="button" className="plans-card-action plans-card-action-disabled" disabled>
              <CreditCard size={15} aria-hidden="true" /> Checkout unavailable
            </button>
          </article>
        </section>

        <section className="plans-access-notes" aria-label="Access details">
          <div>
            <Globe2 size={16} aria-hidden="true" />
            <p><strong>Guest access</strong><span>Uses the public IP seen by Situla and an anonymous session. People on a shared network may share an IP limit.</span></p>
          </div>
          <div>
            <ShieldCheck size={16} aria-hidden="true" />
            <p><strong>Account and devices</strong><span>Free supports one registered device; Premium supports up to three devices on the same account.</span></p>
          </div>
          <div>
            <Clock3 size={16} aria-hidden="true" />
            <p><strong>Watch limits</strong><span>Watch allowance and cooldown are checked by the server. Catalog browsing remains available during cooldown.</span></p>
          </div>
        </section>
      </div>
    </main>
  );
}
