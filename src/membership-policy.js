export const WATCH_POLICIES = Object.freeze({
  guest: Object.freeze({ allowanceSeconds: 3600, cooldownSeconds: 7200, deviceLimit: 0 }),
  free: Object.freeze({ allowanceSeconds: 10800, cooldownSeconds: 3600, deviceLimit: 1 }),
  premium: Object.freeze({
    monthly: Object.freeze({ allowanceSeconds: 18000, cooldownSeconds: 2400, deviceLimit: 3 }),
    'six-months': Object.freeze({ allowanceSeconds: 36000, cooldownSeconds: 1200, deviceLimit: 3 }),
    yearly: Object.freeze({ allowanceSeconds: null, cooldownSeconds: 0, deviceLimit: 3 })
  })
});

export function getWatchPolicy(user = null, now = new Date()) {
  if (!user) return { planId: 'guest', billingCycle: null, ...WATCH_POLICIES.guest };
  const membership = user.membership || {};
  const premiumActive = user.planId === 'premium' &&
    membership.status === 'active' &&
    (!membership.expiresAt || new Date(membership.expiresAt) > now);
  if (!premiumActive) return { planId: 'free', billingCycle: null, ...WATCH_POLICIES.free };
  const billingCycle = WATCH_POLICIES.premium[membership.billingCycle] ? membership.billingCycle : 'monthly';
  return { planId: 'premium', billingCycle, ...WATCH_POLICIES.premium[billingCycle] };
}

export function getAccessSnapshot(policy, state = {}, now = new Date()) {
  const unlimited = policy.allowanceSeconds === null;
  const usedSeconds = unlimited ? 0 : Math.max(0, Number(state.usedSeconds) || 0);
  const cooldownUntil = !unlimited && state.cooldownUntil ? new Date(state.cooldownUntil) : null;
  const cooldownRemainingSeconds = cooldownUntil && cooldownUntil > now
    ? Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000) : 0;
  const remainingSeconds = unlimited
    ? null : Math.max(0, policy.allowanceSeconds - usedSeconds);
  return {
    allowed: cooldownRemainingSeconds === 0 && (remainingSeconds === null || remainingSeconds > 0),
    planId: policy.planId,
    billingCycle: policy.billingCycle,
    allowanceSeconds: policy.allowanceSeconds,
    cooldownSeconds: policy.cooldownSeconds,
    usedSeconds,
    remainingSeconds,
    cooldownUntil,
    cooldownRemainingSeconds
  };
}

export function addCalendarMonths(date, months) {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}
