import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { esRolBodega } from "@/lib/access-control";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { BODEGA_HOME_PATH, esRutaPublicaBodega, puedeAccederRutaBodega } from "@/lib/bodega-route-access";

const LEGACY_HOSTS = new Set(["conectamos-production.up.railway.app"]);
const PRIMARY_HOST = "conectamos.app";

export async function proxy(request: NextRequest) {
  const rawHost = request.headers.get("host")?.toLowerCase();
  const host = rawHost?.split(":")[0];

  if (host && LEGACY_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.hostname = PRIMARY_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const pathname = request.nextUrl.pathname;
  if (
    !request.cookies.has(SESSION_COOKIE_NAME) ||
    esRutaPublicaBodega(pathname) ||
    puedeAccederRutaBodega(pathname, request.method)
  ) {
    return NextResponse.next();
  }

  // Resolve the effective role from the database and active profile, rather
  // than trusting a role, profile ID or sede supplied by the browser.
  const user = await getSessionUser(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (user && esRolBodega(user.rolNombre)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "El rol BODEGA solo tiene acceso a las operaciones de bodega principal" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.redirect(new URL(BODEGA_HOME_PATH, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
