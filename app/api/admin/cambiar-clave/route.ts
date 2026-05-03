import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { esRolAdmin } from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import { clearFinancialAccessCookie } from "@/lib/financial-access";
import { hashPassword, verifyPassword } from "@/lib/password";
import prisma from "@/lib/prisma";
import {
  getSessionCookieOptions,
  PENDING_PIN_CHANGE_COOKIE_NAME,
  PENDING_PROFILE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import {
  clearUserSession,
  ensureSessionStateSchema,
} from "@/lib/session-state";

function validarNuevaClave(value: unknown) {
  const clave = String(value || "");

  if (clave.length < 6) {
    return {
      error: "La nueva clave debe tener minimo 6 caracteres",
    };
  }

  return { clave };
}

function limpiarCookiesSesion(response: NextResponse) {
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
}

export async function POST(req: Request) {
  try {
    await ensureSessionStateSchema();

    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!esRolAdmin(session.rolNombre) || session.perfilId) {
      return NextResponse.json(
        { error: "Solo el administrador principal puede cambiar esta clave" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const claveActual = String(body.claveActual || "");
    const nuevaClaveResult = validarNuevaClave(body.nuevaClave);
    const confirmarClave = String(body.confirmarClave || "");

    if (!claveActual) {
      return NextResponse.json(
        { error: "Ingresa tu clave actual" },
        { status: 400 }
      );
    }

    if ("error" in nuevaClaveResult) {
      return NextResponse.json(
        { error: nuevaClaveResult.error },
        { status: 400 }
      );
    }

    if (nuevaClaveResult.clave !== confirmarClave) {
      return NextResponse.json(
        { error: "La confirmacion no coincide con la nueva clave" },
        { status: 400 }
      );
    }

    if (claveActual === nuevaClaveResult.clave) {
      return NextResponse.json(
        { error: "La nueva clave debe ser diferente a la actual" },
        { status: 400 }
      );
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        claveHash: true,
      },
    });

    if (!usuario || !verifyPassword(claveActual, usuario.claveHash)) {
      return NextResponse.json(
        { error: "La clave actual no es correcta" },
        { status: 400 }
      );
    }

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        claveHash: hashPassword(nuevaClaveResult.clave),
      },
    });

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const sessionTokenData = verifySessionToken(sessionToken);

    await clearUserSession(usuario.id, sessionTokenData?.sessionKey);

    const response = NextResponse.json({
      ok: true,
      mensaje: "Clave actualizada. Vuelve a iniciar sesion con la nueva clave.",
    });

    limpiarCookiesSesion(response);
    return response;
  } catch (error) {
    console.error("ERROR CAMBIAR CLAVE ADMIN:", error);
    return NextResponse.json(
      { error: "Error cambiando la clave del administrador" },
      { status: 500 }
    );
  }
}
