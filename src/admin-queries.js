const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function memberFilter(segment = 'all', now = new Date()) {
  // $ne also matches documents where role is missing, preserving older member records.
  const filter = { role: { $ne: 'admin' } };
  if (segment === 'premium') {
    return {
      ...filter,
      planId: 'premium',
      'membership.status': 'active',
      $or: [
        { 'membership.expiresAt': null },
        { 'membership.expiresAt': { $gt: now } }
      ]
    };
  }
  if (segment === 'free') {
    return {
      ...filter,
      $or: [
        { planId: { $ne: 'premium' } },
        { 'membership.status': { $ne: 'active' } },
        { 'membership.expiresAt': { $lte: now } }
      ]
    };
  }
  return filter;
}

export function onlineActivityFilter(ownerType, now = new Date(), ownerIds) {
  const filter = {
    ownerType,
    isActive: true,
    endedAt: null,
    lastSeenAt: { $gte: new Date(now.getTime() - ONLINE_WINDOW_MS) },
    expiresAt: { $gt: now }
  };
  if (Array.isArray(ownerIds)) filter.ownerId = { $in: ownerIds };
  return filter;
}
