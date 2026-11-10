export const BRAVE_ACCESS_COOKIE_NAME = "situla_brave_access";
export const BRAVE_ACCESS_COOKIE_VALUE = "1";

/**
 * The existing Situla Android WebView removes the "; wv" token from its
 * default user-agent, but retains Android WebView's Version/4.0 signature.
 * This is a compatibility check, not cryptographic app authentication.
 */
export function isSitulaAndroidWebView(userAgent = "") {
  const value = String(userAgent);
  return (
    /\\bAndroid\\b/i.test(value) &&
    /\\bVersion\\/4\\.0\\b/i.test(value) &&
    /\\bChrome\\/[\\d.]+/i.test(value) &&
    /\\bMobile Safari\\/[\\d.]+/i.test(value)
  );
}

export function hasBraveClientHint(secChUa = "") {
  return /"Brave"\\s*;\\s*v=/i.test(String(secChUa));
}

export function hasBraveIOSUserAgent(userAgent = "") {
  return /\\bBrave\\/1\\b/i.test(String(userAgent));
}

export function isAllowedBrowserRequest({ userAgent = "", secChUa = "" } = {}) {
  return (
    isSitulaAndroidWebView(userAgent) ||
    hasBraveClientHint(secChUa) ||
    hasBraveIOSUserAgent(userAgent)
  );
}
