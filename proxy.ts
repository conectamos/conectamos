import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LEGACY_HOSTS = new Set(["conectamos-production.up.railway.app"]);
const PRIMARY_HOST = "conectamos.app";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase();

  if (!host || !LEGACY_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.protocol = "https";
  url.host = PRIMARY_HOST;

  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: "/:path*",
};
