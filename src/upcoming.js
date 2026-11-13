import { Hono } from 'hono';
import { connectDatabase } from './db.js';
import { UpcomingItem, UpcomingWaitlist, UpcomingRead } from './models.js';
import { getAuthenticatedSession, isSameOriginRequest, enforceRateLimit } from './auth.js';

const router = new Hono();
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const MEDIA_TYPES = new Set(['movie', 'tv', 'anime']);

function serializeUpcoming(item, waitlistCount = 0, isWaiting = false) {
  const id = String(item._id);
  return {
    id,
    type: item.type,
    title: item.title,
    posterMode: item.posterMode,
    posterUrl: item.posterUrl || '',
    posterImageUrl: item.posterContentType ? '/api/upcoming/' + id + '/poster' : '',
    releaseAt: item.releaseAt,
    rating: Number(item.rating || 0),
    isPopular: Boolean(item.isPopular),
    isHot: Boolean(item.isHot),
    isFeatured: Boolean(item.isFeatured),
    isPremium: Boolean(item.isPremium),
    countdownEnabled: item.countdownEnabled !== false,
    waitlistCount,
    isWaiting,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

async function getOptionalUser(c) {
  try {
    return await getAuthenticatedSession(c);
  } catch {
    return null;
  }
}

router.get('/', async (c) => {
  try {
    await connectDatabase();
    const type = String(c.req.query('type') || 'all').toLowerCase();
    if (type !== 'all' && !MEDIA_TYPES.has(type)) {
      return c.json({ error: 'Choose Movies, TV Series or Anime.', items: [] }, 400);
    }

    const authenticated = await getOptionalUser(c);
    const myOnly = c.req.query('mine') === '1';
    if (myOnly && !authenticated) return c.json({ error: 'Sign in to view your waiting list.', code: 'UNAUTHENTICATED' }, 401);

    const now = new Date();
    const filter = { status: 'published', releaseAt: { $gt: now } };
    if (type !== 'all') filter.type = type;

    let myIds = [];
    if (myOnly) {
      const rows = await UpcomingWaitlist.find({ userId: authenticated.user._id }).select('upcomingId').lean();
      myIds = rows.map((row) => row.upcomingId);
      filter._id = { $in: myIds };
    }

    const items = await UpcomingItem.find(filter).select('-posterData').sort({ releaseAt: 1, _id: 1 }).limit(100).lean();
    if (!items.length) return c.json({ items: [], total: 0 });

    const ids = items.map((item) => item._id);
    const [countRows, waitingRows] = await Promise.all([
      UpcomingWaitlist.aggregate([
        { $match: { upcomingId: { $in: ids } } },
        { $group: { _id: '$upcomingId', count: { $sum: 1 } } }
      ]),
      authenticated
        ? UpcomingWaitlist.find({ userId: authenticated.user._id, upcomingId: { $in: ids } }).select('upcomingId').lean()
        : Promise.resolve([])
    ]);
    const counts = new Map(countRows.map((row) => [String(row._id), row.count]));
    const waitingSet = new Set(waitingRows.map((row) => String(row.upcomingId)));
    return c.json({
      items: items.map((item) => serializeUpcoming(item, counts.get(String(item._id)) || 0, waitingSet.has(String(item._id)))),
      total: items.length
    });
  } catch (error) {
    console.error('Upcoming feed failed:', error?.message || 'Unknown error');
    return c.json({ error: 'Upcoming titles are temporarily unavailable.', items: [] }, 503);
  }
});

router.get('/status', async (c) => {
  try {
    await connectDatabase();
    const authenticated = await getOptionalUser(c);
    if (!authenticated) return c.json({ hasUnread: false, authenticated: false });
    const read = await UpcomingRead.findOne({ userId: authenticated.user._id }).select('lastSeenAt').lean();
    const lastSeenAt = read?.lastSeenAt || new Date(0);
    const hasUnread = await UpcomingItem.exists({
      status: 'published',
      releaseAt: { $gt: new Date() },
      updatedAt: { $gt: lastSeenAt }
    });
    return c.json({ hasUnread: Boolean(hasUnread), authenticated: true });
  } catch (error) {
    console.error('Upcoming notification status failed:', error?.message || 'Unknown error');
    return c.json({ hasUnread: false, authenticated: false }, 503);
  }
});

router.post('/read', async (c) => {
  if (!isSameOriginRequest(c)) return c.json({ error: 'A same-origin request is required.' }, 403);
  try {
    await connectDatabase();
    const authenticated = await getOptionalUser(c);
    if (!authenticated) return c.json({ read: false, authenticated: false });
    const now = new Date();
    await UpcomingRead.updateOne(
      { userId: authenticated.user._id },
      { $set: { lastSeenAt: now } },
      { upsert: true }
    );
    return c.json({ read: true, authenticated: true });
  } catch (error) {
    console.error('Upcoming read receipt failed:', error?.message || 'Unknown error');
    return c.json({ error: 'Could not update Upcoming notifications.' }, 503);
  }
});

router.post('/:upcomingId/waitlist', async (c) => {
  if (!isSameOriginRequest(c)) return c.json({ error: 'A same-origin request is required.' }, 403);
  const id = String(c.req.param('upcomingId') || '');
  if (!OBJECT_ID.test(id)) return c.json({ error: 'Invalid upcoming item.' }, 400);

  try {
    await connectDatabase();
    const authenticated = await getOptionalUser(c);
    if (!authenticated) return c.json({ error: 'Sign in to join the waiting list.', code: 'UNAUTHENTICATED' }, 401);
    const item = await UpcomingItem.findOne({ _id: id, status: 'published', releaseAt: { $gt: new Date() } }).select('_id').lean();
    if (!item) return c.json({ error: 'This upcoming title is no longer available.' }, 404);

    const key = 'upcoming-waitlist:' + String(authenticated.user._id);
    if (!await enforceRateLimit(key, 30, 60)) {
      return c.json({ error: 'Too many waiting-list changes. Please try again shortly.', code: 'RATE_LIMITED' }, 429);
    }

    const existing = await UpcomingWaitlist.findOne({ upcomingId: item._id, userId: authenticated.user._id }).select('_id').lean();
    let isWaiting;
    if (existing) {
      await UpcomingWaitlist.deleteOne({ _id: existing._id });
      isWaiting = false;
    } else {
      try {
        await UpcomingWaitlist.create({ upcomingId: item._id, userId: authenticated.user._id });
        isWaiting = true;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        isWaiting = true;
      }
    }

    const waitlistCount = await UpcomingWaitlist.countDocuments({ upcomingId: item._id });
    return c.json({ isWaiting, waitlistCount, upcomingId: id });
  } catch (error) {
    console.error('Upcoming waitlist update failed:', error?.message || 'Unknown error');
    return c.json({ error: 'The waiting list could not be updated.' }, 503);
  }
});

router.get('/:upcomingId/poster', async (c) => {
  const id = String(c.req.param('upcomingId') || '');
  if (!OBJECT_ID.test(id)) return c.json({ error: 'Invalid upcoming poster.' }, 400);
  try {
    await connectDatabase();
    const item = await UpcomingItem.findOne({ _id: id, status: 'published', releaseAt: { $gt: new Date() } })
      .select('+posterData posterContentType').lean();
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
    if (!item?.posterData || !allowed.has(item.posterContentType)) return c.json({ error: 'Upcoming poster not found.' }, 404);
    return c.body(item.posterData, 200, {
      'Content-Type': item.posterContentType,
      'Content-Length': String(item.posterData.length),
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox"
    });
  } catch (error) {
    console.error('Upcoming poster read failed:', error?.message || 'Unknown error');
    return c.json({ error: 'Upcoming poster is temporarily unavailable.' }, 503);
  }
});

export default router;
