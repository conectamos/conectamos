import "server-only";

function configuredOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function payJoyExtensionRequestHasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null" || request.headers.get("sec-fetch-site") === "cross-site") return false;

  // Standalone Next.js may expose its internal host in request.url behind Railway.
  // Only deployment configuration defines public origins; request headers cannot add one.
  const appUrl = process.env.APP_URL?.trim();
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (appUrl || railwayDomain) {
    const trusted = [appUrl ? configuredOrigin(appUrl) : null];
    if (railwayDomain && /^[a-z0-9.-]+(?::\d+)?$/i.test(railwayDomain)) {
      trusted.push(configuredOrigin(`https://${railwayDomain}`));
    }
    return trusted.includes(origin);
  }

  // Local development only. Production must declare its public origin explicitly.
  if (process.env.NODE_ENV === "production") return false;
  try {
    const local = new URL(request.url);
    return ["localhost", "127.0.0.1", "[::1]"].includes(local.hostname)
      && ["http:", "https:"].includes(local.protocol) && origin === local.origin;
  } catch {
    return false;
  }
}
