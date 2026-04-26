import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  createPendingPinChangeToken,
  createSessionToken,
  getSessionCookieOptions,
  PENDING_PIN_CHANGE_COOKIE_NAME,
  PENDING_PROFILE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  verifyPendingPinChangeToken,
  verifyPendingProfileToken,
} from "@/lib/session";
import { createProfileSession, ensureSessionStateSchema } from "@/lib/session-state";
import {
  obtenerPerfilesAccesoPorSede,
  validarPerfilAccesoPorSede,
} from "@/lib/vendor-profiles";

async function getPendingUser() {
  await ensureSessionStateSchema();

  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(PENDING_PROFILE_COOKIE_NAME)?.value;
  const pending = verifyPendingProfileToken(pendingToken);

  if (!pending) {
    return null;
  }

  const user = await prisma.usuario.findUnique({
    where: { id: pending.userId },
    select: {
      id: true,
      nombre: true,
      usuario: true,
      activo: true,
      sedeId: true,
      sede: {
        select: {
          nombre: true,
        },
      },
    },
  });

  if (!user || !user.activo) {
    return null;
  }

  return user;
}

export async function GET() {
  try {
    const user = await getPendingUser();

    if (!user) {
      return NextResponse.json(
        { error: "No hay una autenticacion pendiente" },
        { status: 401 }
      );
    }

    const perfiles = await obtenerPerfilesAccesoPorSede(user.sedeId);

    return NextResponse.json({
      ok: true,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        usuario: user.usuario,
        sedeId: user.sedeId,
        sedeNombre: user.sede?.nombre ?? `SEDE ${user.sedeId}`,
      },
      perfiles,
      pendingPinChange:
        verifyPendingPinChangeToken(
          (await cookies()).get(PENDING_PIN_CHANGE_COOKIE_NAME)?.value
        )?.profileId ?? null,
    });
  } catch (error) {
    console.error("ERROR GET LOGIN PERFIL:", error);
    return NextResponse.json(
      { error: "Error consultando perfiles de acceso" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureSessionStateSchema();

    const user = await getPendingUser();

    if (!user) {
      return NextResponse.json(
        { error: "No hay una autenticacion pendiente" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const perfilId = Number(body.perfilId || 0);
    const pin = String(body.pin || "").trim();

    if (!Number.isInteger(perfilId) || perfilId <= 0) {
      return NextResponse.json(
        { error: "Debes seleccionar un perfil valido" },
        { status: 400 }
      );
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { error: "El PIN debe tener entre 4 y 6 digitos" },
        { status: 400 }
      );
    }

    const perfil = await validarPerfilAccesoPorSede({
      perfilId,
      pin,
      sedeId: user.sedeId,
    });

    if (!perfil) {
      return NextResponse.json(
        { error: "PIN invalido o perfil no disponible para esta sede" },
        { status: 401 }
      );
    }

    if (perfil.debeCambiarPin) {
      const response = NextResponse.json({
        ok: true,
        requiresPinChange: true,
        mensaje: "Debes cambiar tu PIN para continuar",
        perfil,
      });

      response.cookies.set(
        PENDING_PIN_CHANGE_COOKIE_NAME,
        createPendingPinChangeToken(user.id, perfil.id),
        getSessionCookieOptions()
      );
      response.cookies.set(SESSION_COOKIE_NAME, "", {
        ...getSessionCookieOptions(),
        expires: new Date(0),
        maxAge: 0,
      });

      return response;
    }

    const response = NextResponse.json({
      ok: true,
      requiresPinChange: false,
      mensaje: `Bienvenido ${perfil.nombre}`,
      perfil,
    });

    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(
        user.id,
        perfil.id,
        await createProfileSession(perfil.id)
      ),
      getSessionCookieOptions()
    );
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

    return response;
  } catch (error) {
    console.error("ERROR POST LOGIN PERFIL:", error);
    return NextResponse.json(
      { error: "Error validando el perfil" },
      { status: 500 }
    );
  }
}
