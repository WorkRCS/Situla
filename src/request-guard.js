export function createRequestConcurrencyGuard({ maxConcurrent = 12, retryAfterSeconds = 1 } = {}) {
  const limit = Number.isSafeInteger(maxConcurrent) && maxConcurrent > 0 ? maxConcurrent : 12;
  const retryAfter = Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds : 1;
  let activeRequests = 0;

  return async (context, next) => {
    if (activeRequests >= limit) {
      context.header('Retry-After', String(retryAfter));
      context.header('Cache-Control', 'no-store');
      return context.json({
        error: 'The service is busy. Please retry shortly.',
        code: 'SERVER_BUSY'
      }, 503);
    }

    activeRequests += 1;
    try {
      await next();
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
    }
  };
}
