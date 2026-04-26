import { NextResponse } from "next/server";
import { clearFinancialAccessCookie } from "@/lib/financial-access";
import {
  getSessionCookieOptions,
  PENDING_PIN_CHANGE_COOKIE_NAME,
  PENDING_PROFILE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import {
  clearProfileSession,
  clearUserSession,
  ensureSessionStateSchema,
} from "@/lib/session-state";
import { cookies } from "next/headers";

export async function POST() {
  await ensureSessionStateSchema();

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(sessionToken);

  if (session?.profileId) {
    await clearProfileSession(session.profileId, session.sessionKey);
  } else if (session?.userId) {
    await clearUserSession(session.userId, session.sessionKey);
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
  response.cookies.set(PENDING_PROFILE_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
  response.cookies.set(PENDING_PIN_CHANGE_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
  response.cookies.delete("userId");
  clearFinancialAccessCookie(response);

  return response;
}
