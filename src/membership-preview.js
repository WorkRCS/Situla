export const PREMIUM_BILLING = [
  { id: "monthly", label: "Monthly", months: 1, monthlyPrice: 199, totalPrice: 199, allowance: "5 hours", cooldown: "40 minutes", billingLabel: "Billed monthly" },
  { id: "six-months", label: "6 Months", months: 6, monthlyPrice: 149, totalPrice: 894, allowance: "10 hours", cooldown: "20 minutes", billingLabel: "Billed every 6 months" },
  { id: "yearly", label: "Yearly", months: 12, monthlyPrice: 119, totalPrice: 1428, allowance: "Unlimited", cooldown: "No periodic cooldown", billingLabel: "Billed yearly" }
];

export const DEMO_ACCOUNT = Object.freeze({
  name: "Alex Morgan",
  initials: "AM",
  email: "alex.morgan@example.com",
  loginMethod: "Email & Password",
  joinedAt: "2026-10-31",
  verified: true,
  accountStatus: "Active"
});

export const DEMO_MEMBERSHIP = Object.freeze({
  planId: "premium",
  billingCycle: "monthly",
  status: "active",
  startedAt: "2026-10-31",
  expiresAt: "2026-11-30",
  renewWindowDays: 21
});

const DEMO_SESSION_KEY = "situla:demo-account-session:v1";

export function readDemoAccountSession() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(DEMO_SESSION_KEY) !== "signed-out";
  } catch {
    return true;
  }
}

export function setDemoAccountSession(signedIn) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DEMO_SESSION_KEY, signedIn ? "signed-in" : "signed-out");
    } catch {}
    window.dispatchEvent(new Event("situla:demo-account"));
  }
}
