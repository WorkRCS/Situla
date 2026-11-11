"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const COPYRIGHT_EMAIL = "an0-my1@proton.me";

export default function SiteFooter() {
  const pathname = usePathname();

  // Keep immersive playback pages free of page chrome and scroll traps.
  if (pathname === "/watch" || pathname?.startsWith("/watch/")) return null;

  return (
    <footer className="site-footer" aria-label="Situla site information">
      <div className="site-footer-inner">
        <div className="site-footer-top">
          <Link className="site-footer-brand" href="/" aria-label="Situla home">
            <span className="site-footer-mark" aria-hidden="true">S</span>
            <span>
              <strong>SITULA</strong>
              <small>Movies · TV · Anime</small>
            </span>
          </Link>
          <nav className="site-footer-links" aria-label="Footer navigation">
            <Link href="/">Home</Link>
            <Link href="/copyright">Copyright &amp; Content Policy</Link>
            <a href={"mailto:" + COPYRIGHT_EMAIL}>Copyright contact</a>
          </nav>
        </div>
        <p className="site-footer-disclaimer">
          Situla does not host or store full-length movie, TV-series, or anime video files on its own servers.
          Playback is provided through embedded third-party services. All rights to third-party works remain
          with their respective owners and licensees.
        </p>
        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} Situla.</span>
          <span>For copyright concerns: <a href={"mailto:" + COPYRIGHT_EMAIL}>{COPYRIGHT_EMAIL}</a></span>
        </div>
      </div>
    </footer>
  );
}
