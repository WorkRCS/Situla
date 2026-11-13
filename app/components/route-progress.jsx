"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function RouteProgress() {
  const pathname = usePathname() || "/";
  const pendingRef = useRef(null);
  const doneTimerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function start(target) {
      if (doneTimerRef.current) {
        window.clearTimeout(doneTimerRef.current);
        doneTimerRef.current = null;
      }
      pendingRef.current = {
        pathname: target.pathname,
        search: target.search,
        startedAt: Date.now(),
        matchedAt: 0,
        finishing: false
      };
      setVisible(true);
      setProgress((value) => Math.max(value, 12));
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
      start(target);
    }

    function onPopState() {
      start(new URL(window.location.href));
    }

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("popstate", onPopState);
      if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current);
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

      if (urlMatches && routeCommitted) {
        if (!pending.matchedAt) pending.matchedAt = Date.now();
        if (Date.now() - pending.matchedAt >= 180) {
          pending.finishing = true;
          setProgress(100);
          doneTimerRef.current = window.setTimeout(() => {
            if (pendingRef.current === pending) {
              pendingRef.current = null;
              setVisible(false);
              setProgress(0);
            }
            doneTimerRef.current = null;
          }, 220);
          return;
        }
      } else {
        pending.matchedAt = 0;
      }

      if (elapsed >= 30_000) {
        pending.finishing = true;
        setProgress(100);
        doneTimerRef.current = window.setTimeout(() => {
          if (pendingRef.current === pending) {
            pendingRef.current = null;
            setVisible(false);
            setProgress(0);
          }
          doneTimerRef.current = null;
        }, 180);
        return;
      }

      setProgress((value) => Math.min(92, value + (value < 30 ? 7 : value < 70 ? 3 : 1)));
    }, 100);

    return () => window.clearInterval(interval);
  }, [visible, pathname]);

  return (
    <div
      className={"site-route-progress" + (visible ? " is-visible" : "")}
      role="progressbar"
      aria-label="Loading page"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={visible ? progress : 0}
      aria-hidden={!visible}
    >
      <span style={{ width: (visible ? progress : 0) + "%" }} />
    </div>
  );
}
