import { getCookie, setCookie } from 'hono/cookie';
import { randomToken, hashToken, keyedHash, getClientIp, GUEST_COOKIE, getAuthenticatedSession, getSuspendedSession } from './auth.js';
import { GuestAccess, GuestSession, UsageState, PlaybackSession } from './models.js';
import { getWatchPolicy, getAccessSnapshot } from './membership-policy.js';

const HEARTBEAT_MAX_SECONDS = 45;
const ACTIVE_SESSION_LEASE_MS = 90 * 1000;
const GUEST_SESSION_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function resolvePlaybackPrincipal(c) {
  const authenticated = await getAuthenticatedSession(c);
  if (authenticated) {
    return { ownerType: 'user', ownerId: authenticated.user._id, user: authenticated.user, device: authenticated.device, session: authenticated.session };
  }
  const suspended = await getSuspendedSession(c);
  if (suspended) {
    const error = new Error('This account is suspended.');
    error.status = 403;
    error.code = 'ACCOUNT_SUSPENDED';
    error.suspendedUntil = suspended.user.suspendedUntil || null;
    throw error;
  }
  const ip = getClientIp(c);
  if (!ip) {
    const error = new Error('A trusted client IP could not be determined for guest access.');
    error.status = 503;
    error.code = 'CLIENT_IP_UNAVAILABLE';
    throw error;
  }
  const ipHash = keyedHash('guest-ip:' + ip);
  let access = await GuestAccess.findOne({ ipHash });
  if (!access) {
    try {
      access = await GuestAccess.create({ ipHash, firstSeenAt: new Date(), lastSeenAt: new Date() });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      access = await GuestAccess.findOne({ ipHash });
    }
  }
  if (!access) throw new Error('Guest access record could not be initialized.');
  await GuestAccess.updateOne({ _id: access._id }, { $set: { lastSeenAt: new Date() } });

  const guestToken = getCookie(c, GUEST_COOKIE);
  let guestSession = guestToken ? await GuestSession.findOne({
    tokenHash: hashToken(guestToken), ipHash, expiresAt: { $gt: new Date() }
  }) : null;
  if (!guestSession) {
    const token = randomToken();
    const now = new Date();
    guestSession = await GuestSession.create({
      tokenHash: hashToken(token),
      ipHash,
      guestAccessId: access._id,
      expiresAt: new Date(now.getTime() + GUEST_SESSION_AGE_SECONDS * 1000)
    });
    setCookie(c, GUEST_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax', path: '/', maxAge: GUEST_SESSION_AGE_SECONDS
    });
  }
  return { ownerType: 'guest', ownerId: access._id, guestAccess: access, guestSession };
}

async function ensureUsageState(principal) {
  const filter = { ownerType: principal.ownerType, ownerId: principal.ownerId };
  let state = await UsageState.findOne(filter);
  if (!state) {
    try {
      state = await UsageState.create({ ...filter, usedSeconds: 0, cooldownUntil: null, cycleStartedAt: new Date() });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      state = await UsageState.findOne(filter);
    }
  }
  return state;
}

export async function readAccessStatus(principal, now = new Date()) {
  const policy = getWatchPolicy(principal.user || null, now);
  let state = await ensureUsageState(principal);
  if (policy.allowanceSeconds === null) {
    if (Number(state.usedSeconds || 0) !== 0 || state.cooldownUntil) {
      state = await UsageState.findOneAndUpdate(
        { _id: state._id },
        { $set: { usedSeconds: 0, cooldownUntil: null, cycleStartedAt: now } },
        { new: true }
      ) || await UsageState.findById(state._id);
    }
    return getAccessSnapshot(policy, state, now);
  }
  if (state.cooldownUntil && new Date(state.cooldownUntil) <= now) {
    state = await UsageState.findOneAndUpdate(
      { _id: state._id, cooldownUntil: { $lte: now } },
      { $set: { usedSeconds: 0, cooldownUntil: null, cycleStartedAt: now } },
      { new: true }
    ) || await UsageState.findById(state._id);
  }
  if (policy.allowanceSeconds !== null && state.usedSeconds >= policy.allowanceSeconds && !state.cooldownUntil) {
    state = await UsageState.findOneAndUpdate(
      { _id: state._id, cooldownUntil: null },
      { $set: { cooldownUntil: new Date(now.getTime() + policy.cooldownSeconds * 1000) } },
      { new: true }
    ) || await UsageState.findById(state._id);
  }
  return getAccessSnapshot(policy, state, now);
}

async function addWatchedSeconds(principal, seconds, now) {
  if (!seconds || seconds <= 0) return readAccessStatus(principal, now);
  const policy = getWatchPolicy(principal.user || null, now);
  if (policy.allowanceSeconds === null) return readAccessStatus(principal, now);
  const state = await ensureUsageState(principal);
  const remaining = Math.max(0, policy.allowanceSeconds - Number(state.usedSeconds || 0));
  const creditedSeconds = Math.min(seconds, remaining);
  if (creditedSeconds <= 0) return readAccessStatus(principal, now);
  const updated = await UsageState.findOneAndUpdate(
    {
      _id: state._id,
      usedSeconds: { $lt: policy.allowanceSeconds },
      $or: [{ cooldownUntil: null }, { cooldownUntil: { $exists: false } }]
    },
    { $inc: { usedSeconds: creditedSeconds }, $set: { lastUsedAt: now } },
    { new: true }
  );
  if (updated && updated.usedSeconds >= policy.allowanceSeconds) {
    await UsageState.updateOne(
      { _id: updated._id, cooldownUntil: null },
      { $set: { cooldownUntil: new Date(now.getTime() + policy.cooldownSeconds * 1000) } }
    );
  }
  return readAccessStatus(principal, now);
}

async function applyHeartbeat(session, principal, playing, now) {
  const expectedHeartbeat = new Date(session.lastHeartbeatAt);
  const result = await PlaybackSession.findOneAndUpdate(
    {
      _id: session._id,
      ownerType: principal.ownerType,
      ownerId: principal.ownerId,
      status: 'active',
      lastHeartbeatAt: expectedHeartbeat
    },
    {
      $set: {
        lastHeartbeatAt: now,
        isPlaying: Boolean(playing),
        expiresAt: new Date(now.getTime() + ACTIVE_SESSION_LEASE_MS)
      }
    },
    { new: true }
  );
  if (!result) {
    const error = new Error('Playback session was updated by another request. Retry the heartbeat.');
    error.status = 409;
    error.code = 'PLAYBACK_HEARTBEAT_CONFLICT';
    throw error;
  }
  const elapsed = Math.max(0, (now.getTime() - expectedHeartbeat.getTime()) / 1000);
  const billableSeconds = session.isPlaying ? Math.min(HEARTBEAT_MAX_SECONDS, Math.floor(elapsed)) : 0;
  const access = await addWatchedSeconds(principal, billableSeconds, now);
  if (!access.allowed) {
    await PlaybackSession.updateOne({ _id: session._id, status: 'active' }, {
      $set: { status: 'locked', isPlaying: false, endedAt: now, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) }
    });
  }
  return {
    access,
    billableSeconds,
    sessionId: String(session._id),
    startedPlaying: Boolean(playing) && !Boolean(session.isPlaying),
    mediaType: session.mediaType,
    mediaId: String(session.mediaId)
  };
}

export async function startPlaybackSession(principal, media, now = new Date()) {
  const access = await readAccessStatus(principal, now);
  if (!access.allowed) {
    const error = new Error('Your watch allowance is used. Playback will be available after the cooldown.');
    error.status = 423;
    error.code = 'WATCH_COOLDOWN';
    error.access = access;
    throw error;
  }
  await PlaybackSession.updateMany(
    {
      ownerType: principal.ownerType,
      ownerId: principal.ownerId,
      status: 'active',
      lastHeartbeatAt: { $lt: new Date(now.getTime() - ACTIVE_SESSION_LEASE_MS) }
    },
    { $set: { status: 'expired', isPlaying: false, endedAt: now, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } }
  );
  const active = await PlaybackSession.findOne({ ownerType: principal.ownerType, ownerId: principal.ownerId, status: 'active' });
  if (active) {
    const error = new Error('A watch session is already active for this account or guest IP.');
    error.status = 409;
    error.code = 'PLAYBACK_ALREADY_ACTIVE';
    throw error;
  }
  try {
    const session = await PlaybackSession.create({
      ownerType: principal.ownerType,
      ownerId: principal.ownerId,
      userId: principal.ownerType === 'user' ? principal.ownerId : null,
      guestAccessId: principal.ownerType === 'guest' ? principal.ownerId : null,
      mediaType: media.mediaType,
      mediaId: String(media.mediaId),
      season: media.season ?? null,
      episode: media.episode ?? null,
      audio: media.audio ?? null,
      startedAt: now,
      lastHeartbeatAt: now,
      isPlaying: false,
      status: 'active',
      expiresAt: new Date(now.getTime() + ACTIVE_SESSION_LEASE_MS)
    });
    return { sessionId: String(session._id), access };
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error('A watch session is already active for this account or guest IP.');
      conflict.status = 409;
      conflict.code = 'PLAYBACK_ALREADY_ACTIVE';
      throw conflict;
    }
    throw error;
  }
}

export async function heartbeatPlaybackSession(principal, sessionId, playing, now = new Date()) {
  const session = await PlaybackSession.findOne({
    _id: sessionId,
    ownerType: principal.ownerType,
    ownerId: principal.ownerId,
    status: 'active',
    expiresAt: { $gt: now }
  });
  if (!session) {
    const error = new Error('The playback session is no longer active.');
    error.status = 404;
    error.code = 'PLAYBACK_SESSION_NOT_FOUND';
    throw error;
  }
  return applyHeartbeat(session, principal, playing, now);
}

export async function stopPlaybackSession(principal, sessionId, now = new Date()) {
  const session = await PlaybackSession.findOne({
    _id: sessionId, ownerType: principal.ownerType, ownerId: principal.ownerId, status: 'active'
  });
  if (!session) return { stopped: true };
  const result = await applyHeartbeat(session, principal, false, now);
  await PlaybackSession.updateOne(
    { _id: session._id, status: 'active' },
    { $set: { status: 'ended', isPlaying: false, endedAt: now, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) } }
  );
  return { stopped: true, access: result.access };
}
