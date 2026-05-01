import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
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
  etiquetaTipoPerfilVendedor,
  obtenerPerfilesAccesoPorSede,
} from "@/lib/vendor-profiles";

async function getPendingPinChangeContext() {
  await ensureSessionStateSchema();

  const cookieStore = await cookies();
  const pendingProfile = verifyPendingProfileToken(
    cookieStore.get(PENDING_PROFILE_COOKIE_NAME)?.value
  );
  const pendingPinChange = verifyPendingPinChangeToken(
    cookieStore.get(PENDING_PIN_CHANGE_COOKIE_NAME)?.value
  );

  if (!pendingProfile || !pendingPinChange) {
    return null;
  }

  if (pendingProfile.userId !== pendingPinChange.userId) {
    return null;
  }

  const user = await prisma.usuario.findUnique({
    where: { id: pendingProfile.userId },
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

  const perfil = await prisma.perfilVendedor.findFirst({
    where: {
      id: pendingPinChange.profileId,
      activo: true,
      OR: [
        { tipo: "ADMINISTRADOR" },
        {
          sedes: {
            some: {
              sedeId: user.sedeId,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      nombre: true,
      tipo: true,
      debeCambiarPin: true,
      pinHash: true,
    },
  });

  if (!perfil || !perfil.debeCambiarPin) {
    return null;
  }

  return {
    user,
    perfil,
  };
}

export async function GET() {
  try {
    const context = await getPendingPinChangeContext();

    if (!context) {
      return NextResponse.json(
        { error: "No hay un cambio de PIN pendiente" },
        { status: 401 }
      );
    }

    const perfiles = await obtenerPerfilesAccesoPorSede(context.user.sedeId);

    return NextResponse.json({
      ok: true,
      usuario: {
        id: context.user.id,
        nombre: context.user.nombre,
        usuario: context.user.usuario,
        sedeId: context.user.sedeId,
        sedeNombre: context.user.sede?.nombre ?? "Sede sin configurar",
      },
      perfil: {
        id: context.perfil.id,
        nombre: context.perfil.nombre,
        tipo: context.perfil.tipo,
        tipoLabel: etiquetaTipoPerfilVendedor(
          context.perfil.tipo as Parameters<typeof etiquetaTipoPerfilVendedor>[0]
        ),
        debeCambiarPin: context.perfil.debeCambiarPin,
      },
      perfiles,
    });
  } catch (error) {
    console.error("ERROR GET CAMBIO PIN PERFIL:", error);
    return NextResponse.json(
      { error: "Error consultando el cambio de PIN" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureSessionStateSchema();

    const context = await getPendingPinChangeContext();

    if (!context) {
      return NextResponse.json(
        { error: "No hay un cambio de PIN pendiente" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const nuevoPin = String(body.nuevoPin || "").trim();
    const confirmarPin = String(body.confirmarPin || "").trim();

    if (!/^\d{4,6}$/.test(nuevoPin)) {
      return NextResponse.json(
        { error: "El nuevo PIN debe tener entre 4 y 6 digitos" },
        { status: 400 }
      );
    }

    if (nuevoPin !== confirmarPin) {
      return NextResponse.json(
        { error: "La confirmacion del PIN no coincide" },
        { status: 400 }
      );
    }

    if (verifyPassword(nuevoPin, context.perfil.pinHash)) {
      return NextResponse.json(
        { error: "El nuevo PIN debe ser diferente al PIN actual" },
        { status: 400 }
      );
    }

    await prisma.perfilVendedor.update({
      where: { id: context.perfil.id },
      data: {
        pinHash: hashPassword(nuevoPin),
        debeCambiarPin: false,
      },
    });

    const response = NextResponse.json({
      ok: true,
      mensaje: "PIN actualizado correctamente",
    });

    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(
        context.user.id,
        context.perfil.id,
        await createProfileSession(context.perfil.id)
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
    console.error("ERROR POST CAMBIO PIN PERFIL:", error);
    return NextResponse.json(
      { error: "Error actualizando el PIN" },
      { status: 500 }
    );
  }
}
