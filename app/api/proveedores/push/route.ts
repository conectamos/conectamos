import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeGestionarProveedores } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import {
  obtenerClavePublicaPushProveedor,
  pushProveedorConfigurado,
} from "@/lib/proveedores-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

async function requireProveedorAccess() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: jsonNoStore({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!puedeGestionarProveedores(session.perfilTipo, session.rolNombre)) {
    return {
      ok: false as const,
      response: jsonNoStore(
        { error: "No autorizado para configurar estas notificaciones" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, session };
}

function parseExpirationTime(value: unknown) {
  if (value === null || value === undefined) return null;

  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;

  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePushSubscription(body: Record<string, unknown>) {
  const subscription =
    body.subscription &&
    typeof body.subscription === "object" &&
    !Array.isArray(body.subscription)
      ? (body.subscription as Record<string, unknown>)
      : body;
  const keys =
    subscription.keys &&
    typeof subscription.keys === "object" &&
    !Array.isArray(subscription.keys)
      ? (subscription.keys as Record<string, unknown>)
      : {};
  const endpoint = String(subscription.endpoint || "").trim();
  const p256dh = String(keys.p256dh || "").trim();
  const auth = String(keys.auth || "").trim();

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return {
      ok: false as const,
      error: "La suscripcion push no tiene un endpoint valido",
    };
  }

  if (endpointUrl.protocol !== "https:" || endpoint.length > 4096) {
    return {
      ok: false as const,
      error: "La suscripcion push no tiene un endpoint seguro",
    };
  }

  const base64Url = /^[A-Za-z0-9_-]+={0,2}$/;
  if (
    !base64Url.test(p256dh) ||
    !base64Url.test(auth) ||
    p256dh.length > 1024 ||
    auth.length > 512
  ) {
    return {
      ok: false as const,
      error: "Las claves de la suscripcion push no son validas",
    };
  }

  return {
    ok: true as const,
    data: {
      endpoint,
      p256dh,
      auth,
      expirationTime: parseExpirationTime(subscription.expirationTime),
    },
  };
}

export async function GET() {
  const access = await requireProveedorAccess();
  if (!access.ok) return access.response;

  return jsonNoStore({
    publicKey: obtenerClavePublicaPushProveedor(),
    configurado: pushProveedorConfigurado(),
  });
}

export async function POST(req: Request) {
  try {
    const access = await requireProveedorAccess();
    if (!access.ok) return access.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonNoStore(
        { error: "El cuerpo de la solicitud no es JSON valido" },
        { status: 400 }
      );
    }

    const parsed = parsePushSubscription(body);
    if (!parsed.ok) {
      return jsonNoStore({ error: parsed.error }, { status: 400 });
    }

    await prisma.pushSubscriptionProveedor.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: {
        usuarioId: access.session.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        expirationTime: parsed.data.expirationTime,
        userAgent: String(req.headers.get("user-agent") || "")
          .trim()
          .slice(0, 500) || null,
      },
      update: {
        usuarioId: access.session.id,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        expirationTime: parsed.data.expirationTime,
        userAgent: String(req.headers.get("user-agent") || "")
          .trim()
          .slice(0, 500) || null,
        activo: true,
        fallosConsecutivos: 0,
        ultimoErrorEn: null,
      },
    });

    return jsonNoStore({
      ok: true,
      mensaje: "Notificaciones push activadas",
    });
  } catch (error) {
    console.error("ERROR REGISTRANDO PUSH PROVEEDORES:", error);
    return jsonNoStore(
      { error: "No se pudo guardar la suscripcion push" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const access = await requireProveedorAccess();
    if (!access.ok) return access.response;

    const url = new URL(req.url);
    let endpoint = String(url.searchParams.get("endpoint") || "").trim();

    if (!endpoint) {
      try {
        const body = (await req.json()) as Record<string, unknown>;
        endpoint = String(body.endpoint || "").trim();
      } catch {
        // La ausencia de body se valida abajo.
      }
    }

    if (!endpoint) {
      return jsonNoStore(
        { error: "Debes indicar el endpoint de la suscripcion" },
        { status: 400 }
      );
    }

    await prisma.pushSubscriptionProveedor.updateMany({
      where: {
        usuarioId: access.session.id,
        endpoint,
      },
      data: {
        activo: false,
      },
    });

    return jsonNoStore({
      ok: true,
      mensaje: "Notificaciones push desactivadas",
    });
  } catch (error) {
    console.error("ERROR DESACTIVANDO PUSH PROVEEDORES:", error);
    return jsonNoStore(
      { error: "No se pudo desactivar la suscripcion push" },
      { status: 500 }
    );
  }
}
