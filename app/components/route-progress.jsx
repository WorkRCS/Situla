"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const IGNORED_MUTATIONS = new Set([
  "/api/presence",
  "/api/playback/heartbeat",
  "/api/playback/stop"
]);

function isUserTriggeredServerRequest(input, init, userActionAt) {
  if (typeof window === "undefined") return false;

  const requestUrl = typeof input === "string"
    ? input
    : input && typeof input.url === "string"
      ? input.url
      : String(input || "");
  const requestMethod = String(
    init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(requestMethod);
  const isRecentUserRead = requestMethod === "GET" &&
    userActionAt > 0 && Date.now() - userActionAt <= 850;

  if (!isMutation && !isRecentUserRead) return false;

  try {
    const url = new URL(requestUrl, window.location.href);
    return url.origin === window.location.origin &&
      url.pathname.startsWith("/api/") &&
      url.pathname !== "/api/upcoming/status" &&
      !IGNORED_MUTATIONS.has(url.pathname);
  } catch {
    return false;
  }
}

export default function RouteProgress() {
  const pathname = usePathname() || "/";
  const pendingRef = useRef(null);
  const activeRequestsRef = useRef(0);
  const userActionAtRef = useRef(0);
  const doneTimerRef = useRef(null);
  const startTimerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const originalFetch = window.fetch;

    function clearDoneTimer() {
      if (doneTimerRef.current) {
        window.clearTimeout(doneTimerRef.current);
        doneTimerRef.current = null;
      }
    }

    function scheduleProgress(pending, deferStateUpdate = false, delay = 0) {
      const showProgress = () => {
        startTimerRef.current = null;
        if (pendingRef.current !== pending) return;
        pending.shown = true;
        setVisible(true);
        setProgress((value) => Math.max(value, 12));
      };

      if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
      if (deferStateUpdate || delay > 0) {
        startTimerRef.current = window.setTimeout(showProgress, delay);
      } else {
        showProgress();
      }
    }

    function startRoute(target, deferStateUpdate = false) {
      const current = pendingRef.current;
      if (current && current.pathname === target.pathname &&
          current.search === target.search && !current.finishing) {
        current.routeExpected = true;
        return;
      }

      clearDoneTimer();
      const pending = {
        pathname: target.pathname,
        search: target.search,
        startedAt: Date.now(),
        matchedAt: 0,
        routeExpected: true,
        finishing: false
      };
      pendingRef.current = pending;
      // Route updates can originate inside Next.js useInsertionEffect via the
      // History API wrapper. Keep every React state update inside the scheduled
      // callback so insertion effects never synchronously schedule React work.
      scheduleProgress(pending, deferStateUpdate);
    }

    function startServerRequest() {
      activeRequestsRef.current += 1;
      const current = pendingRef.current;
      if (current && !current.finishing) return;

      clearDoneTimer();
      const currentUrl = new URL(window.location.href);
      const pending = {
        pathname: currentUrl.pathname,
        search: currentUrl.search,
        startedAt: Date.now(),
        matchedAt: Date.now(),
        routeExpected: false,
        finishing: false
      };
      pendingRef.current = pending;
      setProgress(12);
      // Very short API calls should not flash a progress indicator.
      scheduleProgress(pending, false, 120);
    }

    function finishServerRequest() {
      activeRequestsRef.current = Math.max(0, activeRequestsRef.current - 1);
      const pending = pendingRef.current;
      if (activeRequestsRef.current === 0 && pending && !pending.routeExpected &&
          !pending.finishing && !pending.shown) {
        // A fast API response finishes before the display threshold; discard
        // it instead of flashing the bar after the response has arrived.
        if (startTimerRef.current) {
          window.clearTimeout(startTimerRef.current);
          startTimerRef.current = null;
        }
        pendingRef.current = null;
      }
    }

    function onDocumentClick(event) {
      if (event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") ||
          anchor.getAttribute("target") === "_blank" ||
          anchor.getAttribute("rel")?.split(/\s+/).includes("external") ||
          anchor.closest("[data-route-progress-ignore]")) return;

      let target;
      try {
        target = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (target.origin !== window.location.origin) return;
      if (target.pathname === window.location.pathname &&
          target.search === window.location.search) return;
      startRoute(target);
    }

    function onPopState() {
      startRoute(new URL(window.location.href));
    }

    function markUserAction() {
      userActionAtRef.current = Date.now();
    }

    async function trackedFetch(input, init) {
      if (!isUserTriggeredServerRequest(input, init, userActionAtRef.current)) {
        return originalFetch.apply(this, arguments);
      }

      startServerRequest();
      try {
        return await originalFetch.apply(this, arguments);
      } finally {
        finishServerRequest();
      }
    }

    function wrapHistoryMethod(method, trackSearch) {
      const original = window.history[method];
      function wrappedHistoryMethod(state, title, url) {
        let target = null;
        try {
          if (url !== undefined && url !== null) {
            target = new URL(String(url), window.location.href);
          }
        } catch {}
        const currentUrl = new URL(window.location.href);
        const changed = target && target.origin === currentUrl.origin &&
          (target.pathname !== currentUrl.pathname || (trackSearch && target.search !== currentUrl.search));
        const result = original.apply(this, arguments);
        // Next.js can call history methods from useInsertionEffect. Defer state
        // updates so router transitions never schedule React work in that effect.
        if (changed) startRoute(target, true);
        return result;
      }
      window.history[method] = wrappedHistoryMethod;
      return () => {
        if (window.history[method] === wrappedHistoryMethod) {
          window.history[method] = original;
        }
      };
    }

    const restorePushState = wrapHistoryMethod("pushState", true);
    const restoreReplaceState = wrapHistoryMethod("replaceState", false);
    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("pointerdown", markUserAction, true);
    document.addEventListener("keydown", markUserAction, true);
    document.addEventListener("submit", markUserAction, true);
    window.addEventListener("wheel", markUserAction, { capture: true, passive: true });
    window.addEventListener("touchstart", markUserAction, { capture: true, passive: true });
    window.addEventListener("popstate", onPopState);
    window.fetch = trackedFetch;

    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("pointerdown", markUserAction, true);
      document.removeEventListener("keydown", markUserAction, true);
      document.removeEventListener("submit", markUserAction, true);
      window.removeEventListener("wheel", markUserAction, true);
      window.removeEventListener("touchstart", markUserAction, true);
      window.removeEventListener("popstate", onPopState);
      if (window.fetch === trackedFetch) window.fetch = originalFetch;
      if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
      clearDoneTimer();
    };
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const interval = window.setInterval(() => {
      const pending = pendingRef.current;
      if (!pending || pending.finishing) return;

      const elapsed = Date.now() - pending.startedAt;
      const urlMatches = window.location.pathname === pending.pathname &&
        window.location.search === pending.search;
      const routeCommitted = pathname === pending.pathname;

      let routeReady = !pending.routeExpected;
      if (pending.routeExpected && urlMatches && routeCommitted) {
        if (!pending.matchedAt) pending.matchedAt = Date.now();
        routeReady = Date.now() - pending.matchedAt >= 180;
      } else if (pending.routeExpected) {
        pending.matchedAt = 0;
      }

      const serverReady = activeRequestsRef.current === 0;
      if (routeReady && serverReady) {
        finishPending(pending);
        return;
      }

      // A stalled request or route must not leave the bar stuck forever.
      if (elapsed >= 30_000) {
        finishPending(pending, 180);
        return;
      }

      setProgress((value) => Math.min(92, value + (value < 30 ? 7 : value < 70 ? 3 : 1)));
    }, 100);

    function finishPending(pending, hideDelay = 220) {
      if (pending.finishing) return;
      pending.finishing = true;
      setProgress(100);
      doneTimerRef.current = window.setTimeout(() => {
        if (pendingRef.current === pending) {
          pendingRef.current = null;
          setVisible(false);
          setProgress(0);
        }
        doneTimerRef.current = null;
      }, hideDelay);
    }

    return () => window.clearInterval(interval);
  }, [visible, pathname]);

  return (
    <div
      className={"site-route-progress" + (visible ? " is-visible" : "")}
      role="progressbar"
      aria-label="Loading page and server request"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={visible ? progress : 0}
      aria-hidden={!visible}
    >
      <span style={{ width: (visible ? progress : 0) + "%" }} />
    </div>
  );
}
