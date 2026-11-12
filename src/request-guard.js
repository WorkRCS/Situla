export function createRequestConcurrencyGuard({
  maxConcurrent = 8,
  maxQueued = 48,
  queueTimeoutMs = 800,
  retryAfterSeconds = 1
} = {}) {
  const limit = Number.isSafeInteger(maxConcurrent) && maxConcurrent > 0 ? maxConcurrent : 8;
  const queueLimit = Number.isSafeInteger(maxQueued) && maxQueued >= 0 ? maxQueued : 48;
  const waitMs = Number.isSafeInteger(queueTimeoutMs) && queueTimeoutMs > 0 ? queueTimeoutMs : 800;
  const retryAfter = Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds : 1;
  let activeRequests = 0;
  const queue = [];

  function removeQueued(entry) {
    const index = queue.indexOf(entry);
    if (index >= 0) queue.splice(index, 1);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.signal && entry.onAbort) entry.signal.removeEventListener('abort', entry.onAbort);
  }

  function acquire(signal) {
    if (signal?.aborted) return Promise.resolve('aborted');
    if (activeRequests < limit) {
      activeRequests += 1;
      return Promise.resolve('acquired');
    }
    if (queue.length >= queueLimit) return Promise.resolve('busy');

    return new Promise((resolve) => {
      const entry = { resolve, signal, timer: null, onAbort: null };
      entry.timer = setTimeout(() => {
        removeQueued(entry);
        resolve('busy');
      }, waitMs);
      if (signal) {
        entry.onAbort = () => {
          removeQueued(entry);
          resolve('aborted');
        };
        signal.addEventListener('abort', entry.onAbort, { once: true });
      }
      queue.push(entry);
    });
  }

  function release() {
    while (queue.length) {
      const next = queue.shift();
      if (next.signal?.aborted) {
        removeQueued(next);
        next.resolve('aborted');
        continue;
      }
      removeQueued(next);
      next.resolve('acquired');
      return;
    }
    activeRequests = Math.max(0, activeRequests - 1);
  }

  return async (context, next) => {
    const admission = await acquire(context.req.raw.signal);
    if (admission !== 'acquired') {
      context.header('Retry-After', String(retryAfter));
      context.header('Cache-Control', 'no-store');
      if (admission === 'aborted') {
        return context.json({ error: 'Request cancelled.', code: 'REQUEST_CANCELLED' }, 408);
      }
      return context.json({
        error: 'The service is handling a traffic spike. Please retry shortly.',
        code: 'SERVER_BUSY'
      }, 503);
    }

    try {
      await next();
    } finally {
      release();
    }
  };
}
