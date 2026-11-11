import { NextResponse } from "next/server";
import {
  BRAVE_ACCESS_COOKIE_NAME,
  BRAVE_ACCESS_COOKIE_VALUE,
  isAllowedBrowserRequest
} from "./src/browser-access.js";

export function proxy(request) {
  const pathname = request.nextUrl.pathname;

  // The verification page must be reachable before access is granted.
  if (pathname === "/browser-check") {
    return NextResponse.next();
  }

  const hasVerifiedBraveCookie =
    request.cookies.get(BRAVE_ACCESS_COOKIE_NAME)?.value === BRAVE_ACCESS_COOKIE_VALUE;
  const allowedByBrowser =
    isAllowedBrowserRequest({
      userAgent: request.headers.get("user-agent") || "",
      secChUa: request.headers.get("sec-ch-ua") || ""
    });

  // Includes page requests and API routes: unsupported browsers receive no app data.
  if (hasVerifiedBraveCookie || allowedByBrowser) {
    return NextResponse.next();
  }

  const challengeUrl = new URL("/browser-check", request.url);
  challengeUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  return NextResponse.redirect(challengeUrl, 307);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"
  ]
};
