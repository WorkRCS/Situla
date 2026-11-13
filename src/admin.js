import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import {
  User, GuestAccess, ActivitySession, Device, AuthSession, UsageState,
  PlaybackSession, MembershipEvent, PaymentTransaction, AdminAuditLog, Announcement, AnnouncementRead,
  UpcomingItem, UpcomingWaitlist
} from './models.js';
import { connectDatabase } from './db.js';
import { SESSION_COOKIE, getAuthenticatedSession, hasAdminRole, isSameOriginRequest, enforceRateLimit } from './auth.js';
import { addCalendarMonths } from './membership-policy.js';
import { decryptSensitiveIp, parseUserAgent, escapeSearchPattern, isPremiumActive } from './admin-analytics.js';
import { memberFilter, onlineActivityFilter, clampPage } from './admin-queries.js';
import { parseAnnouncementDate, getAnnouncementStatus } from './announcement-utils.js';

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
      browser: { $last: '$browser' },
      operatingSystem: { $last: '$operatingSystem' },
      deviceType: { $last: '$deviceType' }
    } }
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

router.use('*', async (c, next) => {
  let path = new URL(c.req.url).pathname;
  if (path === '/api/admin') path = '/';
  else if (path.startsWith('/api/admin/')) path = path.slice('/api/admin'.length);
  const segments = path.split('/').filter(Boolean);
  const method = c.req.method.toUpperCase();
  const isObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ''));
  const knownRoute =
    (method === 'GET' && ['/dashboard', '/guests', '/users', '/sales', '/announcements'].includes(path)) ||
    (method === 'GET' && segments.length === 2 && ['guests', 'users'].includes(segments[0]) && isObjectId(segments[1])) ||
    (method === 'GET' && segments.length === 3 && segments[0] === 'announcements' && isObjectId(segments[1]) && segments[2] === 'image') ||
    (method === 'PATCH' && segments.length === 3 && segments[0] === 'users' && isObjectId(segments[1]) && segments[2] === 'membership') ||
    (method === 'POST' && segments.length === 3 && segments[0] === 'users' && isObjectId(segments[1]) && segments[2] === 'suspension') ||
    (method === 'DELETE' && segments.length === 3 && segments[0] === 'users' && isObjectId(segments[1]) && segments[2] === 'suspension') ||
    (method === 'POST' && path === '/announcements') ||
    (method === 'PATCH' && segments.length === 2 && segments[0] === 'announcements' && isObjectId(segments[1])) ||
    (method === 'DELETE' && segments.length === 2 && segments[0] === 'announcements' && isObjectId(segments[1])) ||
    (method === 'GET' && path === '/upcoming') ||
    (method === 'POST' && path === '/upcoming') ||
    (method === 'PATCH' && segments.length === 2 && segments[0] === 'upcoming' && isObjectId(segments[1])) ||
    (method === 'DELETE' && segments.length === 2 && segments[0] === 'upcoming' && isObjectId(segments[1])) ||
    (method === 'GET' && segments.length === 3 && segments[0] === 'upcoming' && isObjectId(segments[1]) && segments[2] === 'poster');
  if (!knownRoute) return c.notFound();
  if (method !== 'GET' && !isSameOriginRequest(c)) {
    return c.json({ error: 'A same-origin request is required.', code: 'ORIGIN_CHECK_FAILED' }, 403);
  }
  if (!getCookie(c, SESSION_COOKIE)) {
    return c.json({ error: 'Administrator access required.', code: 'ADMIN_REQUIRED' }, 403);
  }
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
    failedSales, pendingSales, revenue, onlineGuestOwners, onlineUserOwners
  ] = await Promise.all([
    GuestAccess.countDocuments({}),
    User.countDocuments(memberFilter('all', now)),
    User.countDocuments(memberFilter('premium', now)),
    PaymentTransaction.countDocuments({}),
    PaymentTransaction.countDocuments({ status: 'succeeded' }),
    PaymentTransaction.countDocuments({ status: 'failed' }),
    PaymentTransaction.countDocuments({ status: 'pending' }),
    PaymentTransaction.aggregate([
      { $match: { status: 'succeeded' } },
      { $group: { _id: '$currency', total: { $sum: '$amountMinor' }, count: { $sum: 1 } } }
    ]),
    ActivitySession.distinct('ownerId', onlineActivityFilter('guest', now)),
    ActivitySession.distinct('ownerId', onlineActivityFilter('user', now))
  ]);
  const [onlineGuests, onlineUsers] = await Promise.all([
    onlineGuestOwners.length ? GuestAccess.countDocuments({ _id: { $in: onlineGuestOwners } }) : 0,
    onlineUserOwners.length ? User.countDocuments({ _id: { $in: onlineUserOwners }, role: { $ne: 'admin' } }) : 0
  ]);
  return c.json({
    guests: { total: guestTotal, online: onlineGuests, offline: Math.max(0, guestTotal - onlineGuests) },
    users: {
      total: userTotal,
      premium: premiumTotal,
      free: Math.max(0, userTotal - premiumTotal),
      online: onlineUsers,
      offline: Math.max(0, userTotal - onlineUsers)
    },
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
  const requestedPage = pageNumber(c.req.query('page'));
  const total = await GuestAccess.countDocuments({});
  const page = clampPage(requestedPage, total, PAGE_SIZE);
  const guests = await GuestAccess.find({})
    .sort({ lastSeenAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();
  const now = new Date();
  const guestIds = guests.map((item) => item._id);
  const [summaries, onlineOwners] = await Promise.all([
    sessionSummaries('guest', guestIds),
    ActivitySession.distinct('ownerId', onlineActivityFilter('guest', now, guestIds))
  ]);
  const onlineIds = new Set(onlineOwners.map(String));
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
        online: onlineIds.has(String(guest._id))
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
  const activityFilter = { ownerType: 'guest', ownerId: guest._id, expiresAt: { $gt: new Date() } };
  const requestedPage = pageNumber(c.req.query('page'));
  const activityTotal = await ActivitySession.countDocuments(activityFilter);
  const page = clampPage(requestedPage, activityTotal, PAGE_SIZE);
  const [activities, usage, playback, totalAggregate] = await Promise.all([
    ActivitySession.find(activityFilter)
      .sort({ startedAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    UsageState.findOne({ ownerType: 'guest', ownerId: guest._id }).lean(),
    PlaybackSession.find({ ownerType: 'guest', ownerId: guest._id })
      .sort({ startedAt: -1 }).limit(PAGE_SIZE).lean(),
    ActivitySession.aggregate([
      { $match: activityFilter },
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
  const requestedPage = pageNumber(c.req.query('page'));
  const segment = ['free', 'premium', 'all'].includes(c.req.query('segment')) ? c.req.query('segment') : 'all';
  const search = String(c.req.query('search') || '').trim().slice(0, 254);
  const now = new Date();
  const filter = memberFilter(segment, now);
  if (search) filter.email = { $regex: escapeSearchPattern(search), $options: 'i' };
  const total = await User.countDocuments(filter);
  const page = clampPage(requestedPage, total, PAGE_SIZE);
  const users = await User.find(filter)
    .select('email displayName role status suspendedUntil suspensionReason planId membership createdAt lastLoginAt')
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();
  const userIds = users.map((user) => user._id);
  const [summaries, onlineOwners] = await Promise.all([
    sessionSummaries('user', userIds),
    ActivitySession.distinct('ownerId', onlineActivityFilter('user', now, userIds))
  ]);
  const onlineIds = new Set(onlineOwners.map(String));
  return c.json({
    items: users.map((user) => {
      const activity = summaries.get(String(user._id));
      return {
        id: String(user._id), email: user.email, name: user.displayName, role: user.role || 'user',
        status: user.status || 'active', suspendedUntil: user.suspendedUntil || null, suspensionReason: user.suspensionReason || '',
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
        online: onlineIds.has(String(user._id)),
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
  const requestedActivityPage = pageNumber(c.req.query('activityPage'));
  const activityFilter = { ownerType: 'user', ownerId: user._id, expiresAt: { $gt: new Date() } };
  const activityCount = await ActivitySession.countDocuments(activityFilter);
  const activityPage = clampPage(requestedActivityPage, activityCount, PAGE_SIZE);
  const [devices, activities, events, usage, payments, authSessions, totalAggregate] = await Promise.all([
    Device.find({ userId: user._id }).sort({ lastSeenAt: -1 }).limit(PAGE_SIZE).lean(),
    ActivitySession.find(activityFilter).sort({ startedAt: -1 }).skip((activityPage - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
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


function announcementPayload(form) {
  const title = String(form.get('title') || '').trim();
  const description = String(form.get('description') || '').trim();
  const mediaUrl = String(form.get('mediaUrl') || '').trim();
  const scheduledAt = parseAnnouncementDate(form.get('scheduledAt'));
  const status = String(form.get('status') || 'draft');
  if (!title || title.length > 160) return { error: 'Title is required and must be 160 characters or fewer.' };
  if (!description || description.length > 5000) return { error: 'Description is required and must be 5000 characters or fewer.' };
  if (!['draft', 'publish'].includes(status)) return { error: 'Choose draft or publish.' };
  if (mediaUrl) {
    try {
      const parsed = new URL(mediaUrl);
      if (parsed.protocol !== 'https:') return { error: 'Media URL must use HTTPS.' };
    } catch {
      return { error: 'Enter a valid HTTPS media URL.' };
    }
  }
  if (status === 'publish' && !scheduledAt) return { error: 'Choose a valid publication date and time.' };
  const normalizedStatus = getAnnouncementStatus(status, scheduledAt || new Date());
  if (!normalizedStatus) return { error: 'Choose draft or publish with a valid date and time.' };
  return { value: { title, description, mediaUrl, scheduledAt: scheduledAt || new Date(), status: normalizedStatus } };
}

async function readAnnouncementImage(form) {
  const file = form.get('image');
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function' || !file.size) return null;
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
  if (!allowed.has(file.type)) throw new Error('Upload a JPG, PNG, WebP, GIF or AVIF image.');
  if (file.size > 4 * 1024 * 1024) throw new Error('Announcement images must be 4 MB or smaller.');
  const data = Buffer.from(await file.arrayBuffer());
  const isPng = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isGif = data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'));
  const isWebp = data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  const isAvif = data.length >= 12 && data.subarray(4, 12).toString('ascii').includes('ftypavif');
  const validImage = file.type === 'image/png' ? isPng :
    file.type === 'image/jpeg' ? isJpeg :
    file.type === 'image/gif' ? isGif :
    file.type === 'image/webp' ? isWebp :
    file.type === 'image/avif' ? isAvif : false;
  if (!validImage) throw new Error('The uploaded file does not match its declared image format.');
  return { data, contentType: file.type };
}

function serializeAnnouncement(item) {
  const hasImage = Boolean(item.imageContentType);
  return {
    id: String(item._id),
    title: item.title,
    description: item.description,
    mediaUrl: item.mediaUrl || '',
    uploadedImageUrl: hasImage ? '/api/admin/announcements/' + String(item._id) + '/image' : '',
    hasImage,
    scheduledAt: item.scheduledAt,
    status: item.status === 'scheduled' && new Date(item.scheduledAt) <= new Date() ? 'published' : item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

router.get('/announcements/:announcementId/image', async (c) => {
  const id = c.req.param('announcementId');
  if (!objectId(id)) return c.json({ error: 'Invalid announcement ID.' }, 400);
  const item = await Announcement.findById(id).select('+imageData imageContentType').lean();
  if (!item?.imageData || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(item.imageContentType)) {
    return c.json({ error: 'Announcement image not found.' }, 404);
  }
  return c.body(item.imageData, 200, {
    'Content-Type': item.imageContentType,
    'Content-Length': String(item.imageData.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  });
});

router.get('/announcements', async (c) => {
  const requestedPage = pageNumber(c.req.query('page'));
  const total = await Announcement.countDocuments({});
  const page = clampPage(requestedPage, total, PAGE_SIZE);
  const items = await Announcement.find({})
    .select('-imageData')
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();
  return c.json({
    items: items.map(serializeAnnouncement),
    page, limit: PAGE_SIZE, total, hasMore: page * PAGE_SIZE < total
  });
});

router.post('/announcements', async (c) => {
  let form;
  try {
    form = await c.req.formData();
    const parsed = announcementPayload(form);
    if (parsed.error) return c.json({ error: parsed.error }, 400);
    const upload = await readAnnouncementImage(form);
    if (upload && parsed.value.mediaUrl) return c.json({ error: 'Choose a media URL or upload an image, not both.' }, 400);
    const actor = c.get('adminAuth').user;
    const fields = {
      ...parsed.value,
      createdBy: actor._id,
      updatedBy: actor._id,
      ...(upload ? { imageData: upload.data, imageContentType: upload.contentType } : {})
    };
    const item = await Announcement.create(fields);
    await audit(actor._id, 'announcement_created', 'announcement', item._id, { title: item.title, status: item.status, scheduledAt: item.scheduledAt });
    return c.json({ item: serializeAnnouncement(item) }, 201);
  } catch (error) {
    return c.json({ error: error.message || 'Announcement could not be created.' }, 400);
  }
});

router.patch('/announcements/:announcementId', async (c) => {
  const id = c.req.param('announcementId');
  if (!objectId(id)) return c.json({ error: 'Invalid announcement ID.' }, 400);
  const current = await Announcement.findById(id);
  if (!current) return c.json({ error: 'Announcement not found.' }, 404);
  try {
    const form = await c.req.formData();
    const parsed = announcementPayload(form);
    if (parsed.error) return c.json({ error: parsed.error }, 400);
    const upload = await readAnnouncementImage(form);
    if (upload && parsed.value.mediaUrl) return c.json({ error: 'Choose a media URL or upload an image, not both.' }, 400);
    Object.assign(current, parsed.value, { updatedBy: c.get('adminAuth').user._id });
    if (upload) {
      current.imageData = upload.data;
      current.imageContentType = upload.contentType;
      current.mediaUrl = '';
    } else if (parsed.value.mediaUrl) {
      current.imageData = null;
      current.imageContentType = '';
    } else if (form.get('removeImage') === 'true') {
      current.imageData = null;
      current.imageContentType = '';
      current.mediaUrl = '';
    }
    await current.save();
    await audit(c.get('adminAuth').user._id, 'announcement_updated', 'announcement', current._id, { title: current.title, status: current.status, scheduledAt: current.scheduledAt });
    return c.json({ item: serializeAnnouncement(current) });
  } catch (error) {
    return c.json({ error: error.message || 'Announcement could not be updated.' }, 400);
  }
});

router.delete('/announcements/:announcementId', async (c) => {
  const id = c.req.param('announcementId');
  if (!objectId(id)) return c.json({ error: 'Invalid announcement ID.' }, 400);
  const item = await Announcement.findByIdAndDelete(id);
  if (!item) return c.json({ error: 'Announcement not found.' }, 404);
  await AnnouncementRead.deleteMany({ announcementId: item._id });
  await audit(c.get('adminAuth').user._id, 'announcement_deleted', 'announcement', id, { title: item.title });
  return c.json({ deleted: true, id });
});

function serializeUpcomingAdmin(item, waitlistCount = 0) {
  const id = String(item._id);
  return {
    id,
    type: item.type,
    title: item.title,
    posterMode: item.posterMode,
    posterUrl: item.posterUrl || '',
    posterImageUrl: item.posterContentType ? '/api/admin/upcoming/' + id + '/poster' : '',
    hasUploadedPoster: Boolean(item.posterContentType),
    releaseAt: item.releaseAt,
    rating: Number(item.rating || 0),
    isPopular: Boolean(item.isPopular),
    isHot: Boolean(item.isHot),
    isFeatured: Boolean(item.isFeatured),
    isPremium: Boolean(item.isPremium),
    countdownEnabled: item.countdownEnabled !== false,
    status: item.status,
    waitlistCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function safeUpcomingUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password ||
        host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        host.endsWith('.internal') || /^127\\./.test(host) || /^10\\./.test(host) ||
        /^192\\.168\\./.test(host) || /^172\\.(1[6-9]|2[0-9]|3[0-1])\\./.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function upcomingPayload(form, current = null) {
  const title = String(form.get('title') || '').trim();
  const type = String(form.get('type') || '').toLowerCase();
  const posterMode = String(form.get('posterMode') || 'image').toLowerCase();
  const posterUrlRaw = String(form.get('posterUrl') || '').trim();
  const posterUrl = posterUrlRaw ? safeUpcomingUrl(posterUrlRaw) : '';
  const releaseAt = new Date(String(form.get('releaseAt') || ''));
  const rating = Number(form.get('rating') || 0);
  const status = String(form.get('status') || 'published');
  const hasPosterFile = form.get('poster') && typeof form.get('poster') === 'object' &&
    typeof form.get('poster').arrayBuffer === 'function' && Number(form.get('poster').size) > 0;

  if (!title || title.length > 160) return { error: 'Title is required and must be 160 characters or fewer.' };
  if (!['movie', 'tv', 'anime'].includes(type)) return { error: 'Choose Movies, TV Series or Anime.' };
  if (!['embed', 'image'].includes(posterMode)) return { error: 'Choose an embed URL or image poster.' };
  if (posterUrlRaw && !posterUrl) return { error: 'Poster URL must be a valid, public HTTPS address.' };
  if (!Number.isFinite(releaseAt.getTime())) return { error: 'Choose a valid release date and time.' };
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) return { error: 'Rating must be between 0 and 10.' };
  if (!['draft', 'published'].includes(status)) return { error: 'Choose Draft or Published.' };
  if (posterMode === 'embed' && (!posterUrl || hasPosterFile)) return { error: 'An embed URL is required. Do not upload an image in embed mode.' };
  if (posterMode === 'image' && !hasPosterFile && !posterUrl && !current?.posterContentType && form.get('keepPoster') !== 'true') {
    return { error: 'Add an image URL or upload a poster image.' };
  }
  return {
    value: {
      type, title, posterMode, posterUrl,
      releaseAt,
      rating,
      isPopular: form.get('isPopular') === 'true',
      isHot: form.get('isHot') === 'true',
      isFeatured: form.get('isFeatured') === 'true',
      isPremium: form.get('isPremium') === 'true',
      countdownEnabled: form.get('countdownEnabled') !== 'false',
      status
    },
    hasPosterFile
  };
}

async function readUpcomingPoster(form) {
  const file = form.get('poster');
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function' || !file.size) return null;
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
  if (!allowed.has(file.type)) throw new Error('Upload a JPG, PNG, WebP, GIF or AVIF poster.');
  if (file.size > 4 * 1024 * 1024) throw new Error('Poster images must be 4 MB or smaller.');
  const data = Buffer.from(await file.arrayBuffer());
  const isPng = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isGif = data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'));
  const isWebp = data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  const isAvif = data.length >= 12 && data.subarray(4, 12).toString('ascii').includes('ftypavif');
  const valid = file.type === 'image/png' ? isPng : file.type === 'image/jpeg' ? isJpeg :
    file.type === 'image/gif' ? isGif : file.type === 'image/webp' ? isWebp :
    file.type === 'image/avif' ? isAvif : false;
  if (!valid) throw new Error('The poster file does not match its declared image format.');
  return { data, contentType: file.type };
}

router.get('/upcoming/:upcomingId/poster', async (c) => {
  const id = c.req.param('upcomingId');
  if (!objectId(id)) return c.json({ error: 'Invalid upcoming item.' }, 400);
  const item = await UpcomingItem.findById(id).select('+posterData posterContentType').lean();
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
  if (!item?.posterData || !allowed.has(item.posterContentType)) return c.json({ error: 'Poster not found.' }, 404);
  return c.body(item.posterData, 200, {
    'Content-Type': item.posterContentType,
    'Content-Length': String(item.posterData.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  });
});

router.get('/upcoming', async (c) => {
  const type = String(c.req.query('type') || 'all').toLowerCase();
  if (type !== 'all' && !['movie', 'tv', 'anime'].includes(type)) return c.json({ error: 'Invalid media type.' }, 400);
  const filter = type === 'all' ? {} : { type };
  const [items, total] = await Promise.all([
    UpcomingItem.find(filter).select('-posterData').sort({ releaseAt: 1, _id: 1 }).limit(200).lean(),
    UpcomingItem.countDocuments(filter)
  ]);
  const counts = items.length ? await UpcomingWaitlist.aggregate([
    { $match: { upcomingId: { $in: items.map((item) => item._id) } } },
    { $group: { _id: '$upcomingId', count: { $sum: 1 } } }
  ]) : [];
  const countMap = new Map(counts.map((row) => [String(row._id), row.count]));
  return c.json({
    items: items.map((item) => serializeUpcomingAdmin(item, countMap.get(String(item._id)) || 0)),
    total
  });
});

router.post('/upcoming', async (c) => {
  try {
    const form = await c.req.formData();
    const parsed = upcomingPayload(form);
    if (parsed.error) return c.json({ error: parsed.error }, 400);
    const upload = await readUpcomingPoster(form);
    const actor = c.get('adminAuth').user;
    const item = await UpcomingItem.create({
      ...parsed.value,
      createdBy: actor._id,
      updatedBy: actor._id,
      ...(upload ? { posterData: upload.data, posterContentType: upload.contentType } : {})
    });
    await audit(actor._id, 'upcoming_created', 'upcoming', item._id, {
      title: item.title, type: item.type, releaseAt: item.releaseAt, status: item.status
    });
    return c.json({ item: serializeUpcomingAdmin(item) }, 201);
  } catch (error) {
    return c.json({ error: error.message || 'Upcoming item could not be created.' }, 400);
  }
});

router.patch('/upcoming/:upcomingId', async (c) => {
  const id = c.req.param('upcomingId');
  if (!objectId(id)) return c.json({ error: 'Invalid upcoming item.' }, 400);
  const item = await UpcomingItem.findById(id);
  if (!item) return c.json({ error: 'Upcoming item not found.' }, 404);
  try {
    const form = await c.req.formData();
    const parsed = upcomingPayload(form, item);
    if (parsed.error) return c.json({ error: parsed.error }, 400);
    const upload = await readUpcomingPoster(form);
    Object.assign(item, parsed.value, { updatedBy: c.get('adminAuth').user._id });
    if (upload) {
      item.posterData = upload.data;
      item.posterContentType = upload.contentType;
      item.posterUrl = '';
    } else if (parsed.value.posterMode === 'embed' || parsed.value.posterUrl) {
      item.posterData = null;
      item.posterContentType = '';
    } else if (form.get('removePoster') === 'true') {
      item.posterData = null;
      item.posterContentType = '';
      item.posterUrl = '';
    }
    await item.save();
    await audit(c.get('adminAuth').user._id, 'upcoming_updated', 'upcoming', item._id, {
      title: item.title, type: item.type, releaseAt: item.releaseAt, status: item.status
    });
    return c.json({ item: serializeUpcomingAdmin(item) });
  } catch (error) {
    return c.json({ error: error.message || 'Upcoming item could not be updated.' }, 400);
  }
});

router.delete('/upcoming/:upcomingId', async (c) => {
  const id = c.req.param('upcomingId');
  if (!objectId(id)) return c.json({ error: 'Invalid upcoming item.' }, 400);
  const item = await UpcomingItem.findByIdAndDelete(id);
  if (!item) return c.json({ error: 'Upcoming item not found.' }, 404);
  await UpcomingWaitlist.deleteMany({ upcomingId: item._id });
  await audit(c.get('adminAuth').user._id, 'upcoming_deleted', 'upcoming', id, { title: item.title, type: item.type });
  return c.json({ deleted: true, id });
});

router.get('/sales', async (c) => {
  const requestedPage = pageNumber(c.req.query('page'));
  const status = ['succeeded', 'failed', 'pending'].includes(c.req.query('status')) ? c.req.query('status') : 'all';
  const filter = status === 'all' ? {} : { status };
  const total = await PaymentTransaction.countDocuments(filter);
  const page = clampPage(requestedPage, total, PAGE_SIZE);
  const [items, grouped] = await Promise.all([
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
