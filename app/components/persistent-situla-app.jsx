"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import SitulaApp from "./situla-app.jsx";

const APP_VIEWS = Object.freeze({
  "/": "home",
  "/movies": "movies",
  "/tv": "tv",
  "/anime": "anime",
  "/upcoming": "upcoming",
  "/search": "search",
  "/saved": "saved",
  "/settings": "settings",
  "/cartoons": "cartoons",
  "/cartoons/movies": "cartoonMovies",
  "/cartoons/tv": "cartoonTv"
});

function PersistentSitulaAppContent({ children }) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const normalizedPath = pathname.replace(/\\/+$/, "") || "/";
  const view = APP_VIEWS[normalizedPath];

  if (!view) return children;

  const initialQuery = view === "search"
    ? String(searchParams?.get("q") || "").slice(0, 120)
    : "";

  // This component lives in the root layout, so route changes update only
  // SitulaApp's active view while preserving the app shell and its local state.
  return <SitulaApp view={view} initialQuery={initialQuery} />;
}

export default function PersistentSitulaApp({ children }) {
  return (
    <Suspense fallback={children}>
      <PersistentSitulaAppContent>{children}</PersistentSitulaAppContent>
    </Suspense>
  );
}
