import { isIP } from 'node:net';

export function normalizeUpcomingUrl(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    const hostname = host.replace(/^\[|\]$/g, '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !host.includes('.') ||
      host.endsWith('.') ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      isIP(hostname)
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function countdownParts(releaseAt, now = Date.now()) {
  const target = new Date(releaseAt).getTime();
  const current = Number(now);
  if (!Number.isFinite(target) || !Number.isFinite(current)) return null;
  const remainingMs = target - current;
  if (remainingMs <= 0) return { launched: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const secondsTotal = Math.floor(remainingMs / 1000);
  return {
    launched: false,
    days: Math.floor(secondsTotal / 86400),
    hours: Math.floor((secondsTotal % 86400) / 3600),
    minutes: Math.floor((secondsTotal % 3600) / 60),
    seconds: secondsTotal % 60
  };
}
