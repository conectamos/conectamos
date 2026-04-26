import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LEGACY_HOSTS = new Set(["conectamos-production.up.railway.app"]);
const PRIMARY_HOST = "conectamos.app";

export function proxy(request: NextRequest) {
  const rawHost = request.headers.get("host")?.toLowerCase();
  const host = rawHost?.split(":")[0];

  if (!host || !LEGACY_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.protocol = "https";
  url.hostname = PRIMARY_HOST;
  url.port = "";

  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: "/:path*",
};
