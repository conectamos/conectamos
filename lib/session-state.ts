import prisma from "@/lib/prisma";
import { SESSION_IDLE_TIMEOUT_SECONDS, createOpaqueSessionKey } from "@/lib/session";

export function isSessionIdle(lastSeenAt?: Date | string | null) {
  if (!lastSeenAt) {
    return true;
  }

  const lastSeenMs =
    lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();

  if (Number.isNaN(lastSeenMs)) {
    return true;
  }

  return Date.now() - lastSeenMs >= SESSION_IDLE_TIMEOUT_SECONDS * 1000;
}

export async function createUserSession(userId: number) {
  const sessionKey = createOpaqueSessionKey();

  await prisma.usuario.update({
    where: { id: userId },
    data: {
      activeSessionKey: sessionKey,
      activeSessionLastSeenAt: new Date(),
    },
  });

  return sessionKey;
}

export async function createProfileSession(profileId: number) {
  const sessionKey = createOpaqueSessionKey();

  await prisma.perfilVendedor.update({
    where: { id: profileId },
    data: {
      activeSessionKey: sessionKey,
      activeSessionLastSeenAt: new Date(),
    },
  });

  return sessionKey;
}

export async function touchUserSession(userId: number, sessionKey: string) {
  const result = await prisma.usuario.updateMany({
    where: {
      id: userId,
      activeSessionKey: sessionKey,
    },
    data: {
      activeSessionLastSeenAt: new Date(),
    },
  });

  return result.count > 0;
}

export async function touchProfileSession(profileId: number, sessionKey: string) {
  const result = await prisma.perfilVendedor.updateMany({
    where: {
      id: profileId,
      activeSessionKey: sessionKey,
    },
    data: {
      activeSessionLastSeenAt: new Date(),
    },
  });

  return result.count > 0;
}

export async function clearUserSession(userId: number, sessionKey?: string | null) {
  await prisma.usuario.updateMany({
    where: {
      id: userId,
      ...(sessionKey ? { activeSessionKey: sessionKey } : {}),
    },
    data: {
      activeSessionKey: null,
      activeSessionLastSeenAt: null,
    },
  });
}

export async function clearProfileSession(
  profileId: number,
  sessionKey?: string | null
) {
  await prisma.perfilVendedor.updateMany({
    where: {
      id: profileId,
      ...(sessionKey ? { activeSessionKey: sessionKey } : {}),
    },
    data: {
      activeSessionKey: null,
      activeSessionLastSeenAt: null,
    },
  });
}
