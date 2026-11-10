import test from "node:test";
import assert from "node:assert/strict";
import {
  hasBraveClientHint,
  hasBraveIOSUserAgent,
  isAllowedBrowserRequest
} from "../src/browser-access.js";

test("recognizes Brave desktop and Android using the documented client hint", () => {
  const hints = '"Chromium";v="138", "Not=A?Brand";v="24", "Brave";v="138"';
  assert.equal(hasBraveClientHint(hints), true);
  assert.equal(isAllowedBrowserRequest({ secChUa: hints }), true);
});

test("recognizes Brave iOS user-agent branding", () => {
  const braveIos =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 Brave/1";
  assert.equal(hasBraveIOSUserAgent(braveIos), true);
  assert.equal(isAllowedBrowserRequest({ userAgent: braveIos }), true);
});

test("blocks Android WebView including the old Situla app user-agent", () => {
  const androidWebView =
    "Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/AB1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.179 Mobile Safari/537.36";
  assert.equal(isAllowedBrowserRequest({ userAgent: androidWebView }), false);
});

test("blocks ordinary Chrome, Safari, and Firefox user-agents", () => {
  assert.equal(isAllowedBrowserRequest({ userAgent: "Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36" }), false);
  assert.equal(isAllowedBrowserRequest({ userAgent: "Mozilla/5.0 Version/18.0 Safari/605.1.15" }), false);
  assert.equal(isAllowedBrowserRequest({ userAgent: "Mozilla/5.0 Firefox/139.0" }), false);
});
