import { NextResponse } from "next/server";

export function proxy() {
  // Pass every page and API request through without access checks.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"
  ]
};
