import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptSensitiveIp, decryptSensitiveIp, parseUserAgent,
  escapeSearchPattern, isPremiumActive, activityTotals
} from '../src/admin-analytics.js';
import { getWatchPolicy } from '../src/membership-policy.js';

test('IP values are encrypted and can only be decrypted with the application secret', () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'test-auth-secret-with-at-least-32-characters-long';
  try {
    const encrypted = encryptSensitiveIp('203.0.113.9');
    assert.notEqual(encrypted, '203.0.113.9');
    assert.equal(decryptSensitiveIp(encrypted), '203.0.113.9');
    assert.equal(decryptSensitiveIp('invalid'), null);
    assert.equal(encryptSensitiveIp(''), null);
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
});

test('browser, operating system and device information are categorized', () => {
  const mobileChrome = parseUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36');
  assert.equal(mobileChrome.browser, 'Chrome');
  assert.equal(mobileChrome.operatingSystem, 'Android');
  assert.equal(mobileChrome.deviceType, 'Mobile');
  const edge = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Edg/120.0.0.0');
  assert.equal(edge.browser, 'Microsoft Edge');
  assert.equal(edge.operatingSystem, 'Windows');
  assert.equal(edge.deviceType, 'Desktop');
});

test('email search escapes regular expression characters', () => {
  assert.equal(escapeSearchPattern('user+tag@example.com'), 'user\\+tag@example\\.com');
});

test('custom-month Premium membership uses the monthly Premium watch policy', () => {
  const policy = getWatchPolicy({
    planId: 'premium',
    membership: { status: 'active', billingCycle: 'custom', expiresAt: new Date(Date.now() + 86400000) }
  });
  assert.equal(policy.planId, 'premium');
  assert.equal(policy.billingCycle, 'custom');
  assert.equal(policy.allowanceSeconds, 18000);
  assert.equal(policy.deviceLimit, 3);
});

test('premium status respects exact expiry and expired membership falls back to Free', () => {
  assert.equal(isPremiumActive({ planId: 'premium', membership: { status: 'active', expiresAt: new Date(Date.now() + 60000) } }), true);
  assert.equal(isPremiumActive({ planId: 'premium', membership: { status: 'active', expiresAt: new Date(Date.now() - 60000) } }), false);
});

test('activity totals separate active and inactive observed time', () => {
  const totals = activityTotals([
    { startedAt: new Date('2026-11-12T10:00:00Z'), lastSeenAt: new Date('2026-11-12T10:10:00Z'), activeSeconds: 240 }
  ]);
  assert.equal(totals.activeSeconds, 240);
  assert.equal(totals.observedSeconds, 600);
  assert.equal(totals.inactiveSeconds, 360);
});
