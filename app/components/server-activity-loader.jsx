"use client";

import { useEffect, useState } from "react";

const IGNORED_MUTATIONS = new Set([
  "/api/presence",
  "/api/playback/heartbeat",
  "/api/playback/stop"
]);

function getTrackedMutation(input, init) {
  if (typeof window === "undefined") return false;

  const requestUrl = typeof input === "string"
    ? input
    : input && typeof input.url === "string"
      ? input.url
      : String(input || "");
  const requestMethod = String(
    init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
  ).toUpperCase();

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(requestMethod)) return false;

  try {
    const url = new URL(requestUrl, window.location.href);
    return url.origin === window.location.origin &&
      url.pathname.startsWith("/api/") &&
      !IGNORED_MUTATIONS.has(url.pathname);
  } catch {
    return false;
  }
}

export default function ServerActivityLoader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const originalFetch = window.fetch;
    let pendingRequests = 0;
    let showTimer = null;
    let disposed = false;

    async function trackedFetch(input, init) {
      if (!getTrackedMutation(input, init)) {
        return originalFetch.apply(this, arguments);
      }

      pendingRequests += 1;
      if (pendingRequests === 1 && !showTimer) {
        showTimer = window.setTimeout(() => {
          showTimer = null;
          if (!disposed && pendingRequests > 0) setVisible(true);
        }, 140);
      }

      try {
        return await originalFetch.apply(this, arguments);
      } finally {
        pendingRequests = Math.max(0, pendingRequests - 1);
        if (pendingRequests === 0) {
          if (showTimer) {
            window.clearTimeout(showTimer);
            showTimer = null;
          }
          if (!disposed) setVisible(false);
        }
      }
    }

    window.fetch = trackedFetch;
    return () => {
      disposed = true;
      if (showTimer) window.clearTimeout(showTimer);
      if (window.fetch === trackedFetch) window.fetch = originalFetch;
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="site-server-activity" role="status" aria-live="polite" aria-atomic="true">
      <span className="site-server-activity-spinner" aria-hidden="true" />
      <span className="site-server-activity-copy">
        <strong>SERVER</strong>
        <small>Processing request</small>
      </span>
    </div>
  );
}
