import { NextResponse } from "next/server";

export function proxy() {
  // Situla is available in every modern browser. No user-agent or browser-brand gate.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"
  ]
};
