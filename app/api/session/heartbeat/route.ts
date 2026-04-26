import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import {
  ensureSessionStateSchema,
  touchProfileSession,
  touchUserSession,
} from "@/lib/session-state";

export async function POST() {
  await ensureSessionStateSchema();

  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const sessionToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(sessionToken);

  if (!session?.sessionKey) {
    return NextResponse.json({ error: "Sesion invalida" }, { status: 401 });
  }

  const touched = session.profileId
    ? await touchProfileSession(session.profileId, session.sessionKey)
    : await touchUserSession(session.userId, session.sessionKey);

  if (!touched) {
    return NextResponse.json({ error: "Sesion invalida" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
