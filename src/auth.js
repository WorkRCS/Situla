import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { OAuth2Client } from 'google-auth-library';
import { User, AuthSession, AuthRateLimit } from './models.js';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'situla_session';
export const GUEST_COOKIE = 'situla_guest';
export const OAUTH_STATE_COOKIE = 'situla_google_state';
export const OAUTH_NONCE_COOKIE = 'situla_google_nonce';
const PASSWORD_COST = 32768;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELISM = 1;
const PASSWORD_KEY_LENGTH = 64;
export const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
let oauthClient;

export function authSecret() {
  const value = String(process.env.AUTH_SECRET || '');
  if (Buffer.byteLength(value) < 32) {
    const error = new Error('AUTH_SECRET must contain at least 32 bytes. Generate one and add it to .env.');
    error.status = 503;
    error.code = 'AUTH_SECRET_NOT_CONFIGURED';
    throw error;
  }
  return value;
}

export function hashToken(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function keyedHash(value) {
  return createHmac('sha256', authSecret()).update(String(value)).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validPassword(value) {
  const length = typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : 0;
  return length >= 10 && length <= 128;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, PASSWORD_KEY_LENGTH, {
    N: PASSWORD_COST, r: PASSWORD_BLOCK_SIZE, p: PASSWORD_PARALLELISM,
    maxmem: 64 * 1024 * 1024
  });
  return ['scrypt', PASSWORD_COST, PASSWORD_BLOCK_SIZE, PASSWORD_PARALLELISM,
    salt.toString('base64url'), Buffer.from(derived).toString('base64url')].join('$');
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (n !== PASSWORD_COST || r !== PASSWORD_BLOCK_SIZE || p !== PASSWORD_PARALLELISM) return false;
  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (salt.length !== 16 || expected.length !== PASSWORD_KEY_LENGTH) return false;
    const actual = Buffer.from(await scrypt(password, salt, expected.length, {
      N: n, r, p, maxmem: 64 * 1024 * 1024
    }));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function getClientIp(c) {
  const candidates = [
    c.req.header('x-real-ip'),
    c.req.header('cf-connecting-ip'),
    c.req.header('x-forwarded-for')?.split(',')[0]
  ];
  for (const value of candidates) {
    const ip = String(value || '').trim();
    if (ip && ip.length <= 64 && !/[\s,]/.test(ip)) return ip;
  }
  // Next.js local development may not populate proxy IP headers. Use a
  // loopback-only identity there; never apply this fallback in production.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const hostname = new URL(c.req.url).hostname.toLowerCase();
      if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return '127.0.0.1';
    } catch {}
  }
  return '';
}

export function isSameOriginRequest(c) {
  const origin = c.req.header('origin');
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const requestUrl = new URL(c.req.url);
    const host = String(c.req.header('x-forwarded-host') || c.req.header('host') || requestUrl.host).toLowerCase();
    const protocol = String(c.req.header('x-forwarded-proto') || requestUrl.protocol.replace(':', '')).split(',')[0].trim().toLowerCase();
    return parsed.host.toLowerCase() === host && parsed.protocol.replace(':', '').toLowerCase() === protocol;
  } catch {
    return false;
  }
}

function cookieSettings(maxAge, path = '/') {
  const settings = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path
  };
  if (Number.isFinite(maxAge)) settings.maxAge = maxAge;
  return settings;
}

export function clearAuthCookies(c) {
  deleteCookie(c, SESSION_COOKIE, cookieSettings(0));
  // Clean up the legacy registered-device cookie on the next explicit sign-out.
  deleteCookie(c, 'situla_device', cookieSettings(0));
  deleteCookie(c, GUEST_COOKIE, cookieSettings(0));
  deleteCookie(c, OAUTH_STATE_COOKIE, cookieSettings(0, '/api/auth/google'));
  deleteCookie(c, OAUTH_NONCE_COOKIE, cookieSettings(0, '/api/auth/google'));
}

export function clearOAuthCookies(c) {
  deleteCookie(c, OAUTH_STATE_COOKIE, cookieSettings(0, '/api/auth/google'));
  deleteCookie(c, OAUTH_NONCE_COOKIE, cookieSettings(0, '/api/auth/google'));
}

export function setOAuthCookie(c, name, value) {
  setCookie(c, name, value, cookieSettings(10 * 60, '/api/auth/google'));
}

export async function enforceRateLimit(key, limit, windowSeconds = 900) {
  const keyHash = keyedHash('rate:' + key);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowSeconds * 1000);
  const state = await AuthRateLimit.findOneAndUpdate(
    { keyHash },
    [
      { $set: {
        windowEndsAt: { $cond: [{ $gt: ['$windowEndsAt', now] }, '$windowEndsAt', windowEnd] },
        count: { $cond: [{ $gt: ['$windowEndsAt', now] }, { $add: [{ $ifNull: ['$count', 0] }, 1] }, 1] }
      } },
      { $set: { expiresAt: { $add: ['$windowEndsAt', 60000] } } }
    ],
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: false, updatePipeline: true }
  );
  return Number(state?.count || 0) <= limit;
}

export function hasAdminRole(user) {
  return user?.role === 'admin';
}

export async function isAccountSuspended(user, now = new Date()) {
  if (!user || user.status !== 'suspended') return false;
  if (user.suspendedUntil && new Date(user.suspendedUntil) <= now) {
    user.status = 'active';
    user.suspendedUntil = null;
    user.suspensionReason = '';
    await user.save();
    return false;
  }
  return true;
}

export async function getSuspendedSession(c) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const session = await AuthSession.findOne({
    tokenHash: hashToken(token),
    revokedAt: null
  });
  if (!session) return null;
  const user = await User.findById(session.userId);
  if (!user || !await isAccountSuspended(user)) return null;
  return { session, user };
}

export async function createLoginSession(c, user) {
  const token = randomToken();
  const now = new Date();
  const ip = getClientIp(c);
  await AuthSession.create({
    userId: user._id,
    tokenHash: hashToken(token),
    ipHash: ip ? keyedHash('auth-ip:' + ip) : null,
    lastSeenAt: now,
    revokedAt: null
  });
  const previousToken = getCookie(c, SESSION_COOKIE);
  if (previousToken) {
    await AuthSession.updateOne(
      { tokenHash: hashToken(previousToken), revokedAt: null },
      { $set: { revokedAt: now } }
    );
  }
  setCookie(c, SESSION_COOKIE, token, cookieSettings(SESSION_COOKIE_MAX_AGE_SECONDS));
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });
  return { createdAt: now };
}

export async function getAuthenticatedSession(c) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const session = await AuthSession.findOne({
    tokenHash: hashToken(token),
    revokedAt: null
  });
  if (!session) return null;
  const user = await User.findById(session.userId);
  if (!user || await isAccountSuspended(user) || user.status !== 'active') return null;
  const now = new Date();
  if (now.getTime() - new Date(session.lastSeenAt || 0).getTime() > 60000) {
    await AuthSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: now } });
  }
  // Refresh the persistent cookie during authenticated activity so an active
  // account is not signed out by a deployment or a fixed inactivity timer.
  setCookie(c, SESSION_COOKIE, token, cookieSettings(SESSION_COOKIE_MAX_AGE_SECONDS));
  return { session, user };
}

export async function revokeCurrentSession(c) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await AuthSession.updateOne(
      { tokenHash: hashToken(token), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  clearAuthCookies(c);
}

export function safeUser(user) {
  if (!user) return null;
  const premiumActive = user.planId === 'premium' &&
    user.membership?.status === 'active' &&
    (!user.membership?.expiresAt || new Date(user.membership.expiresAt) > new Date());
  const name = user.displayName || user.email.split('@')[0];
  return {
    id: String(user._id),
    name,
    initials: name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'S',
    email: user.email,
    loginMethod: user.googleSub ? (user.hasPassword ? 'Google & Email' : 'Google') : 'Email & Password',
    emailVerified: Boolean(user.emailVerified),
    role: user.role,
    status: user.status,
    planId: premiumActive ? 'premium' : 'free',
    membership: {
      billingCycle: user.membership?.billingCycle || null,
      status: user.membership?.status || 'inactive',
      startedAt: user.membership?.startedAt || null,
      expiresAt: user.membership?.expiresAt || null,
      durationMonths: user.membership?.durationMonths || null
    },
    suspendedUntil: user.suspendedUntil || null,
    suspensionReason: user.suspensionReason || '',
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

export function getGoogleOAuthClient() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '');
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '');
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || '');
  if (!clientId || !clientSecret || !redirectUri) {
    const error = new Error('Google Sign-in is not configured yet.');
    error.status = 503;
    error.code = 'GOOGLE_NOT_CONFIGURED';
    throw error;
  }
  if (!oauthClient) oauthClient = new OAuth2Client(clientId, clientSecret, redirectUri);
  return oauthClient;
}
