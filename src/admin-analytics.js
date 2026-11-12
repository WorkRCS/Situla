import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { authSecret } from './auth.js';

function encryptionKey() {
  return createHash('sha256').update(authSecret()).digest();
}

export function encryptSensitiveIp(ip) {
  const value = String(ip || '').trim();
  if (!value || value.length > 64) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptSensitiveIp(payload) {
  if (typeof payload !== 'string' || !payload) return null;
  try {
    const [ivText, tagText, ciphertextText] = payload.split('.');
    const iv = Buffer.from(ivText || '', 'base64url');
    const tag = Buffer.from(tagText || '', 'base64url');
    const ciphertext = Buffer.from(ciphertextText || '', 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function parseUserAgent(value = '') {
  const userAgent = String(value || '').slice(0, 500);
  const browser = /EdgA?\//i.test(userAgent) ? 'Microsoft Edge' :
    /OPR\//i.test(userAgent) ? 'Opera' :
    /Brave\//i.test(userAgent) ? 'Brave' :
    /Firefox\//i.test(userAgent) ? 'Firefox' :
    /Chrome\//i.test(userAgent) ? 'Chrome' :
    /Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent) ? 'Safari' : 'Unknown';
  const operatingSystem = /Windows NT/i.test(userAgent) ? 'Windows' :
    /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS' :
    /Android/i.test(userAgent) ? 'Android' :
    /Mac OS X|Macintosh/i.test(userAgent) ? 'macOS' :
    /CrOS/i.test(userAgent) ? 'ChromeOS' :
    /Linux/i.test(userAgent) ? 'Linux' : 'Unknown';
  const deviceType = /iPad|Tablet/i.test(userAgent) ? 'Tablet' :
    /Mobile|iPhone|iPod|Android/i.test(userAgent) ? 'Mobile' :
    userAgent ? 'Desktop' : 'Unknown';
  return { browser, operatingSystem, deviceType };
}

export function escapeSearchPattern(value = '') {
  return String(value || '').slice(0, 254).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isPremiumActive(user, now = new Date()) {
  return Boolean(user && user.planId === 'premium' &&
    user.membership?.status === 'active' &&
    (!user.membership?.expiresAt || new Date(user.membership.expiresAt) > now));
}

export function activityTotals(sessions = [], now = new Date()) {
  const activeSeconds = sessions.reduce((sum, item) => sum + Math.max(0, Number(item.activeSeconds) || 0), 0);
  const elapsedSeconds = sessions.reduce((sum, item) => {
    const end = item.endedAt || item.lastSeenAt || item.startedAt;
    return sum + Math.max(0, Math.floor((new Date(end).getTime() - new Date(item.startedAt).getTime()) / 1000));
  }, 0);
  const lastSeenAt = sessions.reduce((latest, item) => {
    const date = item.lastSeenAt ? new Date(item.lastSeenAt) : null;
    return date && (!latest || date > latest) ? date : latest;
  }, null);
  return {
    activeSeconds,
    observedSeconds: elapsedSeconds,
    inactiveSeconds: Math.max(0, elapsedSeconds - activeSeconds),
    lastSeenAt,
    currentlyOnline: Boolean(lastSeenAt && now.getTime() - lastSeenAt.getTime() <= 2 * 60 * 1000)
  };
}
