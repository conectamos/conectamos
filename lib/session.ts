import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "session";
export const PENDING_PROFILE_COOKIE_NAME = "pending_profile_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  exp: number;
  profileId?: number;
  userId: number;
};

type PendingProfilePayload = {
  exp: number;
  userId: number;
};

function getSessionSecret() {
  const secret =
    process.env.SESSION_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV !== "production" ? process.env.DATABASE_URL : undefined);

  if (!secret) {
    throw new Error("SESSION_SECRET no configurado");
  }

  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function createSignedToken(payload: SessionPayload | PendingProfilePayload) {
  const serializedPayload = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(serializedPayload);

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function createSessionToken(userId: number, profileId?: number | null) {
  const payload: SessionPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    ...(profileId ? { profileId } : {}),
  };

  return createSignedToken(payload);
}

export function createPendingProfileToken(userId: number) {
  const payload: PendingProfilePayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };

  return createSignedToken(payload);
}

function verifySignedToken(token?: string | null) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== signatureBuffer.length) {
    return null;
  }

    if (!timingSafeEqual(expectedBuffer, signatureBuffer)) {
      return null;
    }

    try {
      const payload = JSON.parse(base64UrlDecode(encodedPayload)) as
        | SessionPayload
        | PendingProfilePayload;

      if (!payload?.userId || !payload?.exp) {
        return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

      return payload;
    } catch {
      return null;
    }
}

export function verifySessionToken(token?: string | null) {
  const payload = verifySignedToken(token);

  if (!payload) {
    return null;
  }

  return payload as SessionPayload;
}

export function verifyPendingProfileToken(token?: string | null) {
  const payload = verifySignedToken(token);

  if (!payload) {
    return null;
  }

  return payload as PendingProfilePayload;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
