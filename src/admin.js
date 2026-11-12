import { Hono } from 'hono';
import {
  User, GuestAccess, ActivitySession, Device, AuthSession, UsageState,
  PlaybackSession, MembershipEvent, PaymentTransaction, AdminAuditLog
} from './models.js';
import { connectDatabase } from './db.js';
import { getAuthenticatedSession, hasAdminRole, isSameOriginRequest, enforceRateLimit } from './auth.js';
import { addCalendarMonths } from './membership-policy.js';
import { decryptSensitiveIp, parseUserAgent, escapeSearchPattern, isPremiumActive } from './admin-analytics.js';

const router = new Hono();
const PAGE_SIZE = 10;
const ACTIVITY_RETENTION_DAYS = 180;
const durationOptions = new Set([1, 6, 8, 10, 12]);

function pageNumber(value) {
  const number = Number(value || 1);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 100000) : 1;
}

function objectId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || ''));
}

function premiumFilter(now = new Date()) {
  return {
    role: 'user',
    planId: 'premium',
    'membership.status': 'active',
    $or: [
      { 'membership.expiresAt': null },
      { 'membership.expiresAt': { $gt: now } }
    ]
  };
}

function freeFilter(now = new Date()) {
  return {
    role: 'user',
    $or: [
      { planId: { $ne: 'premium' } },
      { 'membership.status': { $ne: 'active' } },
      { 'membership.expiresAt': { $lte: now } }
    ]
  };
}

async function audit(actorUserId, action, targetType, targetId = '', metadata = {}) {
  const now = new Date();
  await AdminAuditLog.create({
    actorUserId, action, targetType, targetId: String(targetId || ''),
    metadata, expiresAt: new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000)
  });
}

async function sessionSummaries(ownerType, ownerIds) {
  if (!ownerIds.length) return new Map();
  const rows = await ActivitySession.aggregate([
    { $match: { ownerType, ownerId: { $in: ownerIds }, expiresAt: { $gt: new Date() } } },
    { $sort: { lastSeenAt: 1 } },
    { $group: {
      _id: '$ownerId',
      sessions: { $sum: 1 },
      activeSeconds: { $sum: '$activeSeconds' },
      lastSeenAt: { $max: '$lastSeenAt' },
      isActive: { $max: '$isActive' },
      browser: { $last: '$browser' },
      operatingSystem: { $last: '$operatingSystem' },
      deviceType: { $last: '$deviceType' }
    } }
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

router.use('*', async (c, next) => {
  try {
    await connectDatabase();
    const authenticated = await getAuthenticatedSession(c);
    if (!authenticated || !hasAdminRole(authenticated.user)) {
      return c.json({ error: 'Administrator access required.', code: 'ADMIN_REQUIRED' }, 403);
    }
    if (!await enforceRateLimit('admin-api:' + String(authenticated.user._id), 180, 60)) {
      return c.json({ error: 'Too many admin requests. Please wait and retry.', code: 'ADMIN_RATE_LIMITED' }, 429);
    }
    c.set('adminAuth', authenticated);
    await next();
  } catch (error) {
    console.error('Admin API failed:', error?.message || 'Unknown error');
    return c.json({ error: 'The admin service is temporarily unavailable.' }, 503);
  }
});

router.get('/dashboard', async (c) => {
  const now = new Date();
  const [
    guestTotal, userTotal, premiumTotal, paymentTotal, successfulSales,
    failedSales, pendingSales, revenue
  ] = await Promise.all([
    GuestAccess.countDocuments({}),
    User.countDocuments({ role: 'user' }),
    User.countDocuments(premiumFilter(now)),
    PaymentTransaction.countDocuments({}),
    PaymentTransaction.countDocuments({ status: 'succeeded' }),
    PaymentTransaction.countDocuments({ status: 'failed' }),
    PaymentTransaction.countDocuments({ status: 'pending' }),
    PaymentTransaction.aggregate([
      { $match: { status: 'succeeded' } },
      { $group: { _id: '$currency', total: { $sum: '$amountMinor' }, count: { $sum: 1 } } }
    ])
  ]);
  const onlineCutoff = new Date(now.getTime() - 2 * 60 * 1000);
  const [onlineGuests, onlineUsers] = await Promise.all([
    ActivitySession.aggregate([
      { $match: { ownerType: 'guest', isActive: true, lastSeenAt: { $gte: onlineCutoff }, expiresAt: { $gt: now } } },
      { $group: { _id: '$ownerId' } },
      { $count: 'total' }
    ]),
    ActivitySession.aggregate([
      { $match: { ownerType: 'user', isActive: true, lastSeenAt: { $gte: onlineCutoff }, expiresAt: { $gt: now } } },
      { $group: { _id: '$ownerId' } },
      { $count: 'total' }
    ])
  ]);
  return c.json({
    guests: { total: guestTotal, online: onlineGuests[0]?.total || 0 },
    users: { total: userTotal, premium: premiumTotal, free: Math.max(0, userTotal - premiumTotal), online: onlineUsers[0]?.total || 0 },
    sales: {
      total: paymentTotal, succeeded: successfulSales, failed: failedSales, pending: pendingSales,
      revenue: revenue.map((item) => ({ currency: item._id, amountMinor: item.total, transactions: item.count })),
      paymentIntegration: 'not_connected'
    },
    activityRetentionDays: ACTIVITY_RETENTION_DAYS,
    pageSize: PAGE_SIZE,
    generatedAt: now
  });
});

router.get('/guests', async (c) => {
  const page = pageNumber(c.req.query('page'));
  const [total, guests] = await Promise.all([
    GuestAccess.countDocuments({}),
    GuestAccess.find({}).sort({ lastSeenAt: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean()
  ]);
  const summaries = await sessionSummaries('guest', guests.map((item) => item._id));
  return c.json({
    items: guests.map((guest) => {
      const activity = summaries.get(String(guest._id));
      return {
        id: String(guest._id),
        firstSeenAt: guest.firstSeenAt,
        lastSeenAt: guest.lastSeenAt,
        sessions: activity?.sessions || 0,
        activeSeconds: activity?.activeSeconds || 0,
        browser: activity?.browser || 'Unknown',
        operatingSystem: activity?.operatingSystem || 'Unknown',
        deviceType: activity?.deviceType || 'Unknown',
        online: Boolean(activity?.isActive && activity?.lastSeenAt && Date.now() - new Date(activity.lastSeenAt).getTime() <= 120000)
      };
    }),
    page, limit: PAGE_SIZE, total, hasMore: page * PAGE_SIZE < total
  });
});

router.get('/guests/:guestId', async (c) => {
  const guestId = c.req.param('guestId');
  if (!objectId(guestId)) return c.json({ error: 'Invalid guest ID.' }, 400);
  const guest = await GuestAccess.findById(guestId).lean();
  if (!guest) return c.json({ error: 'Guest not found.' }, 404);
  const page = pageNumber(c.req.query('page'));
  const [activities, activityTotal, usage, playback, totalAggregate] = await Promise.all([
    ActivitySession.find({ ownerType: 'guest', ownerId: guest._id, expiresAt: { $gt: new Date() } })
      .sort({ startedAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    ActivitySession.countDocuments({ ownerType: 'guest', ownerId: guest._id, expiresAt: { $gt: new Date() } }),
    UsageState.findOne({ ownerType: 'guest', ownerId: guest._id }).lean(),
    PlaybackSession.find({ ownerType: 'guest', ownerId: guest._id })
      .sort({ startedAt: -1 }).limit(PAGE_SIZE).lean(),
    ActivitySession.aggregate([
      { $match: { ownerType: 'guest', ownerId: guest._id, expiresAt: { $gt: new Date() } } },
      { $group: { _id: null, activeSeconds: { $sum: '$activeSeconds' }, sessions: { $sum: 1 } } }
    ])
  ]);
  await audit(c.get('adminAuth').user._id, 'guest_sensitive_details_viewed', 'guest', guestId, { page });
  return c.json({
    guest: {
      id: String(guest._id), firstSeenAt: guest.firstSeenAt, lastSeenAt: guest.lastSeenAt,
      ipAddress: null, ipNote: 'Full IP is available only for activity records collected after secure telemetry was enabled.'
    },
    activity: activities.map((item) => ({
      id: String(item._id), startedAt: item.startedAt, lastSeenAt: item.lastSeenAt, endedAt: item.endedAt,
      activeSeconds: item.activeSeconds || 0,
      inactiveSeconds: Math.max(0, Math.floor((new Date(item.endedAt || item.lastSeenAt).getTime() - new Date(item.startedAt).getTime()) / 1000) - (item.activeSeconds || 0)),
      online: Boolean(item.isActive && !item.endedAt && Date.now() - new Date(item.lastSeenAt).getTime() <= 120000),
      ipAddress: decryptSensitiveIp(item.ipEncrypted),
      browser: item.browser, operatingSystem: item.operatingSystem, deviceType: item.deviceType,
      userAgent: item.userAgent
    })),
    activityPage: { page, limit: PAGE_SIZE, total: activityTotal, hasMore: page * PAGE_SIZE < activityTotal },
    playback: playback.map((item) => ({
      mediaType: item.mediaType, mediaId: item.mediaId, season: item.season, episode: item.episode,
      startedAt: item.startedAt, endedAt: item.endedAt, status: item.status, isPlaying: item.isPlaying
    })),
    usage: { watchedSeconds: usage?.usedSeconds || 0, lastUsedAt: usage?.lastUsedAt || null },
    totals: { sessions: totalAggregate[0]?.sessions || 0, activeSeconds: totalAggregate[0]?.activeSeconds || 0 }
  });
});

router.get('/users', async (c) => {
  const page = pageNumber(c.req.query('page'));
  const segment = ['free', 'premium', 'all'].includes(c.req.query('segment')) ? c.req.query('segment') : 'free';
  const search = String(c.req.query('search') || '').trim().slice(0, 254);
  const now = new Date();
  const filter = segment === 'premium' ? premiumFilter(now) :
    segment === 'free' ? freeFilter(now) : { role: 'user' };
  if (search) filter.email = { $regex: escapeSearchPattern(search), $options: 'i' };
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).select('email displayName role status suspendedUntil suspensionReason planId membership createdAt lastLoginAt')
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean()
  ]);
  const summaries = await sessionSummaries('user', users.map((user) => user._id));
  return c.json({
    items: users.map((user) => {
      const activity = summaries.get(String(user._id));
      return {
        id: String(user._id), email: user.email, name: user.displayName, role: user.role,
        status: user.status, suspendedUntil: user.suspendedUntil || null, suspensionReason: user.suspensionReason || '',
        planId: isPremiumActive(user, now) ? 'premium' : 'free',
        membership: {
          billingCycle: user.membership?.billingCycle || null,
          durationMonths: user.membership?.durationMonths || null,
          startedAt: user.membership?.startedAt || null,
          expiresAt: user.membership?.expiresAt || null
        },
        createdAt: user.createdAt, lastLoginAt: user.lastLoginAt || null,
        sessions: activity?.sessions || 0, activeSeconds: activity?.activeSeconds || 0,
        lastSeenAt: activity?.lastSeenAt || user.lastLoginAt || null,
        online: Boolean(activity?.isActive && activity?.lastSeenAt && Date.now() - new Date(activity.lastSeenAt).getTime() <= 120000),
        browser: activity?.browser || 'Unknown', operatingSystem: activity?.operatingSystem || 'Unknown',
        deviceType: activity?.deviceType || 'Unknown'
      };
    }),
    segment, search, page, limit: PAGE_SIZE, total, hasMore: page * PAGE_SIZE < total
  });
});

router.get('/users/:userId', async (c) => {
  const userId = c.req.param('userId');
  if (!objectId(userId)) return c.json({ error: 'Invalid user ID.' }, 400);
  const user = await User.findById(userId).select('email displayName role status suspendedUntil suspensionReason planId membership createdAt lastLoginAt emailVerified googleSub hasPassword').lean();
  if (!user || user.role === 'admin') return c.json({ error: 'User not found.' }, 404);
  await audit(c.get('adminAuth').user._id, 'user_sensitive_details_viewed', 'user', userId, {});
  const activityPage = pageNumber(c.req.query('activityPage'));
  const activityFilter = { ownerType: 'user', ownerId: user._id, expiresAt: { $gt: new Date() } };
  const [devices, activities, activityCount, events, usage, payments, authSessions, totalAggregate] = await Promise.all([
    Device.find({ userId: user._id }).sort({ lastSeenAt: -1 }).limit(PAGE_SIZE).lean(),
    ActivitySession.find(activityFilter).sort({ startedAt: -1 }).skip((activityPage - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    ActivitySession.countDocuments(activityFilter),
    MembershipEvent.find({ userId: user._id }).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean(),
    UsageState.findOne({ ownerType: 'user', ownerId: user._id }).lean(),
    PaymentTransaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean(),
    AuthSession.find({ userId: user._id }).select('deviceId createdAt lastSeenAt expiresAt revokedAt').sort({ createdAt: -1 }).limit(PAGE_SIZE).lean(),
    ActivitySession.aggregate([
      { $match: { ownerType: 'user', ownerId: user._id, expiresAt: { $gt: new Date() } } },
      { $group: { _id: null, activeSeconds: { $sum: '$activeSeconds' }, sessions: { $sum: 1 } } }
    ])
  ]);
  return c.json({
    user: {
      id: String(user._id), email: user.email, name: user.displayName, role: user.role,
      status: user.status, suspendedUntil: user.suspendedUntil || null, suspensionReason: user.suspensionReason || '',
      emailVerified: Boolean(user.emailVerified), loginMethod: user.googleSub ? (user.hasPassword ? 'Google & Email' : 'Google') : 'Email & Password',
      planId: isPremiumActive(user) ? 'premium' : 'free',
      membership: {
        billingCycle: user.membership?.billingCycle || null,
        durationMonths: user.membership?.durationMonths || null,
        status: user.membership?.status || 'inactive',
        startedAt: user.membership?.startedAt || null,
        expiresAt: user.membership?.expiresAt || null
      },
      createdAt: user.createdAt, lastLoginAt: user.lastLoginAt || null
    },
    devices: devices.map((device) => ({
      id: String(device._id), label: device.label, ...parseUserAgent(device.label),
      lastSeenAt: device.lastSeenAt, createdAt: device.createdAt, revokedAt: device.revokedAt,
      active: !device.revokedAt
    })),
    activity: activities.map((item) => ({
      id: String(item._id), startedAt: item.startedAt, lastSeenAt: item.lastSeenAt, endedAt: item.endedAt,
      activeSeconds: item.activeSeconds || 0,
      inactiveSeconds: Math.max(0, Math.floor((new Date(item.endedAt || item.lastSeenAt).getTime() - new Date(item.startedAt).getTime()) / 1000) - (item.activeSeconds || 0)),
      ipAddress: decryptSensitiveIp(item.ipEncrypted),
      browser: item.browser, operatingSystem: item.operatingSystem, deviceType: item.deviceType,
      userAgent: item.userAgent
    })),
    activityPage: { page: activityPage, limit: PAGE_SIZE, total: activityCount, hasMore: activityPage * PAGE_SIZE < activityCount },
    membershipHistory: events.map((event) => ({
      action: event.action, planId: event.planId, billingCycle: event.billingCycle,
      durationMonths: event.durationMonths, startedAt: event.startedAt, expiresAt: event.expiresAt,
      reason: event.reason, createdAt: event.createdAt
    })),
    payments: payments.map((payment) => ({
      id: String(payment._id), provider: payment.provider, transactionRef: payment.transactionRef,
      status: payment.status, amountMinor: payment.amountMinor, currency: payment.currency,
      billingCycle: payment.billingCycle, createdAt: payment.createdAt, paidAt: payment.paidAt
    })),
    authSessions: authSessions.map((session) => ({
      deviceId: String(session.deviceId), createdAt: session.createdAt, lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt, revokedAt: session.revokedAt
    })),
    usage: { watchedSeconds: usage?.usedSeconds || 0, lastUsedAt: usage?.lastUsedAt || null },
    totals: { sessions: totalAggregate[0]?.sessions || 0, activeSeconds: totalAggregate[0]?.activeSeconds || 0 }
  });
});

router.patch('/users/:userId/membership', async (c) => {
  if (!isSameOriginRequest(c)) return c.json({ error: 'A same-origin request is required.' }, 403);
  const userId = c.req.param('userId');
  if (!objectId(userId)) return c.json({ error: 'Invalid user ID.' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const admin = c.get('adminAuth').user;
  const user = await User.findById(userId);
  if (!user) return c.json({ error: 'User not found.' }, 404);
  if (user.role === 'admin') return c.json({ error: 'Admin accounts cannot be modified through member management.' }, 403);
  if (body.planId === 'free') {
    user.planId = 'free';
    user.membership = {
      status: 'inactive', billingCycle: null, startedAt: null,
      expiresAt: null, durationMonths: null, activatedBy: admin._id
    };
    await user.save();
    await MembershipEvent.create({
      userId: user._id, adminId: admin._id, action: 'removed', planId: 'free',
      reason: String(body.reason || 'Premium removed by administrator').slice(0, 240)
    });
    await audit(admin._id, 'premium_removed', 'user', userId, { email: user.email });
    return c.json({ userId, planId: 'free', status: 'removed', user: {
      id: userId, email: user.email, planId: 'free', membership: user.membership
    } });
  }
  const durationMonths = Number(body.durationMonths ??
    (body.billingCycle === 'monthly' ? 1 : body.billingCycle === 'six-months' ? 6 : body.billingCycle === 'yearly' ? 12 : NaN));
  if (body.planId !== 'premium' || !durationOptions.has(durationMonths)) {
    return c.json({ error: 'Choose a valid Premium duration: 1, 6, 8, 10 or 12 months.' }, 400);
  }
  const startedAt = new Date();
  const expiresAt = addCalendarMonths(startedAt, durationMonths);
  const billingCycle = durationMonths === 1 ? 'monthly' :
    durationMonths === 6 ? 'six-months' : durationMonths === 12 ? 'yearly' : 'custom';
  user.planId = 'premium';
  user.membership = {
    status: 'active', billingCycle, startedAt, expiresAt, durationMonths, activatedBy: admin._id
  };
  await user.save();
  await MembershipEvent.create({
    userId: user._id, adminId: admin._id, action: 'assigned', planId: 'premium',
    billingCycle, durationMonths, startedAt, expiresAt,
    reason: String(body.reason || 'Premium assigned by administrator').slice(0, 240)
  });
  await audit(admin._id, 'premium_assigned', 'user', userId, { email: user.email, durationMonths, expiresAt });
  return c.json({ userId, planId: 'premium', durationMonths, startedAt, expiresAt, payment: 'not_connected' });
});

router.post('/users/:userId/suspension', async (c) => {
  if (!isSameOriginRequest(c)) return c.json({ error: 'A same-origin request is required.' }, 403);
  const userId = c.req.param('userId');
  if (!objectId(userId)) return c.json({ error: 'Invalid user ID.' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const durationHours = Number(body.durationHours);
  if (![0, 1, 24, 168, 720].includes(durationHours)) {
    return c.json({ error: 'Choose a suspension duration of 1 hour, 1 day, 7 days, 30 days or permanent.' }, 400);
  }
  const admin = c.get('adminAuth').user;
  const user = await User.findById(userId);
  if (!user) return c.json({ error: 'User not found.' }, 404);
  if (String(user._id) === String(admin._id) || user.role === 'admin') {
    return c.json({ error: 'Administrator accounts cannot be suspended here.' }, 403);
  }
  const now = new Date();
  user.status = 'suspended';
  user.suspendedUntil = durationHours ? new Date(now.getTime() + durationHours * 60 * 60 * 1000) : null;
  user.suspensionReason = String(body.reason || '').trim().slice(0, 240);
  await user.save();
  await audit(admin._id, 'user_suspended', 'user', userId, { durationHours, suspendedUntil: user.suspendedUntil });
  return c.json({ userId, status: user.status, suspendedUntil: user.suspendedUntil, reason: user.suspensionReason });
});

router.delete('/users/:userId/suspension', async (c) => {
  if (!isSameOriginRequest(c)) return c.json({ error: 'A same-origin request is required.' }, 403);
  const userId = c.req.param('userId');
  if (!objectId(userId)) return c.json({ error: 'Invalid user ID.' }, 400);
  const admin = c.get('adminAuth').user;
  const user = await User.findById(userId);
  if (!user) return c.json({ error: 'User not found.' }, 404);
  if (user.role === 'admin') return c.json({ error: 'Administrator accounts are not managed here.' }, 403);
  user.status = 'active';
  user.suspendedUntil = null;
  user.suspensionReason = '';
  await user.save();
  await audit(admin._id, 'user_unsuspended', 'user', userId, { email: user.email });
  return c.json({ userId, status: 'active' });
});

router.get('/sales', async (c) => {
  const page = pageNumber(c.req.query('page'));
  const status = ['succeeded', 'failed', 'pending'].includes(c.req.query('status')) ? c.req.query('status') : 'all';
  const filter = status === 'all' ? {} : { status };
  const [total, items, grouped] = await Promise.all([
    PaymentTransaction.countDocuments(filter),
    PaymentTransaction.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
      .select('userId email provider transactionRef status amountMinor currency planId billingCycle paidAt createdAt failureCode').lean(),
    PaymentTransaction.aggregate([
      { $group: {
        _id: '$status', count: { $sum: 1 },
        revenue: { $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, '$amountMinor', 0] } }
      } }
    ])
  ]);
  return c.json({
    items: items.map((item) => ({
      id: String(item._id), userId: item.userId ? String(item.userId) : null,
      email: item.email, provider: item.provider, transactionRef: item.transactionRef,
      status: item.status, amountMinor: item.amountMinor, currency: item.currency,
      planId: item.planId, billingCycle: item.billingCycle,
      paidAt: item.paidAt, createdAt: item.createdAt, failureCode: item.failureCode || ''
    })),
    summary: grouped.reduce((result, item) => {
      result[item._id] = { count: item.count, revenueMinor: item.revenue };
      return result;
    }, {}),
    paymentIntegration: 'not_connected',
    page, limit: PAGE_SIZE, total, hasMore: page * PAGE_SIZE < total
  });
});

export default router;
