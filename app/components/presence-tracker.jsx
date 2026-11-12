"use client";

import { useEffect } from "react";

export default function PresenceTracker() {
  useEffect(() => {
    let activityId = "";
    try {
      activityId = sessionStorage.getItem("situla:activity-id:v1") || "";
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(activityId)) {
        activityId = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID().replace(/-/g, "")
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("situla:activity-id:v1", activityId);
      }
    } catch {
      activityId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    let lastInteractionAt = Date.now();
    let lastHeartbeatAt = 0;
    let heartbeatInFlight = false;
    let heartbeatRetryTimer = null;
    let suspendedRedirected = false;

    const markInteraction = () => {
      lastInteractionAt = Date.now();
      if (document.visibilityState === "visible") sendHeartbeat(false);
    };

    async function sendHeartbeat(stop = false, force = false) {
      const now = Date.now();
      if (force && heartbeatRetryTimer) {
        window.clearTimeout(heartbeatRetryTimer);
        heartbeatRetryTimer = null;
      }
      if (!stop && heartbeatInFlight) {
        if (!heartbeatRetryTimer) {
          heartbeatRetryTimer = window.setTimeout(() => {
            heartbeatRetryTimer = null;
            sendHeartbeat(false, force);
          }, 250);
        }
        return;
      }
      const cooldownRemaining = 15 * 1000 - (now - lastHeartbeatAt);
      if (!stop && !force && cooldownRemaining > 0) {
        if (!heartbeatRetryTimer) {
          heartbeatRetryTimer = window.setTimeout(() => {
            heartbeatRetryTimer = null;
            sendHeartbeat(false);
          }, Math.max(50, cooldownRemaining));
        }
        return;
      }
      if (heartbeatRetryTimer) {
        window.clearTimeout(heartbeatRetryTimer);
        heartbeatRetryTimer = null;
      }
      if (!stop) {
        lastHeartbeatAt = now;
        heartbeatInFlight = true;
      }
      const active = !stop && document.visibilityState === "visible" &&
        now - lastInteractionAt <= 2 * 60 * 1000;
      try {
        const response = await fetch("/api/presence", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          keepalive: stop,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityId, active, stop })
        });
        if (response.status === 403) {
          const payload = await response.json().catch(() => ({}));
          if (payload.code === "ACCOUNT_SUSPENDED" && window.location.pathname !== "/suspended" && !suspendedRedirected) {
            suspendedRedirected = true;
            window.location.replace("/suspended");
          }
        } else if (response.ok && window.location.pathname === "/suspended") {
          window.location.replace("/");
        }
      } catch {
        // Presence is best-effort; the next interaction or periodic heartbeat retries.
      } finally {
        if (!stop) heartbeatInFlight = false;
      }
    }

    const interactionEvents = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"];
    interactionEvents.forEach((eventName) => window.addEventListener(eventName, markInteraction, { passive: true }));
    const onVisibility = () => sendHeartbeat(false, true);
    const onPageHide = () => {
      if (heartbeatRetryTimer) {
        window.clearTimeout(heartbeatRetryTimer);
        heartbeatRetryTimer = null;
      }
      sendHeartbeat(true);
      try { sessionStorage.removeItem("situla:activity-id:v1"); } catch {}
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    sendHeartbeat(false);
    const interval = window.setInterval(() => sendHeartbeat(false), 60 * 1000);

    return () => {
      window.clearInterval(interval);
      if (heartbeatRetryTimer) window.clearTimeout(heartbeatRetryTimer);
      interactionEvents.forEach((eventName) => window.removeEventListener(eventName, markInteraction));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
