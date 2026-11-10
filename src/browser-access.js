export const BRAVE_ACCESS_COOKIE_NAME = "situla_brave_access";
export const BRAVE_ACCESS_COOKIE_VALUE = "1";

export function hasBraveClientHint(secChUa = "") {
  return /"Brave"\s*;\s*v=/i.test(String(secChUa));
}

export function hasBraveIOSUserAgent(userAgent = "") {
  return /\bBrave\/1\b/i.test(String(userAgent));
}

export function isAllowedBrowserRequest({ userAgent = "", secChUa = "" } = {}) {
  return hasBraveClientHint(secChUa) || hasBraveIOSUserAgent(userAgent);
}
