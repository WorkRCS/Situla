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
    let suspendedRedirected = false;
    const markInteraction = () => { lastInteractionAt = Date.now(); };

    async function sendHeartbeat(stop = false) {
      const active = !stop && document.visibilityState === "visible" &&
        Date.now() - lastInteractionAt <= 2 * 60 * 1000;
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
        }
      } catch {}
    }

    const interactionEvents = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"];
    interactionEvents.forEach((eventName) => window.addEventListener(eventName, markInteraction, { passive: true }));
    const onVisibility = () => sendHeartbeat(false);
    const onPageHide = () => {
      sendHeartbeat(true);
      try { sessionStorage.removeItem("situla:activity-id:v1"); } catch {}
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    sendHeartbeat(false);
    const interval = window.setInterval(() => sendHeartbeat(false), 60 * 1000);

    return () => {
      window.clearInterval(interval);
      interactionEvents.forEach((eventName) => window.removeEventListener(eventName, markInteraction));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
