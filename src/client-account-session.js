let cachedAccountUser = null;

export function getCachedAccountUser() {
  return cachedAccountUser;
}

export function setCachedAccountUser(user) {
  cachedAccountUser = user && typeof user === "object" ? user : null;
  return cachedAccountUser;
}

export function resolveAccountUserRefresh(response, payload, previousUser) {
  if (response?.ok && payload?.user && typeof payload.user === "object") {
    return payload.user;
  }
  if (response?.status === 401 &&
      ["UNAUTHENTICATED", "AUTH_SESSION_INVALID"].includes(String(payload?.code || ""))) {
    return null;
  }
  return previousUser || null;
}
