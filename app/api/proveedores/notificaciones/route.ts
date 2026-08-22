import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  crearPayloadAvisoFacturaProveedor,
  enviarPushProveedor,
  esSuscripcionPushExpirada,
  pushProveedorConfigurado,
  resumirErrorPushProveedor,
} from "@/lib/proveedores-push";
import {
  dateKeyToDatabaseDate,
  DIAS_ANTICIPACION_AVISO_PROVEEDOR,
  ESTADO_FACTURA_PROVEEDOR,
  obtenerTipoAvisoFacturaProveedor,
} from "@/lib/proveedores";
import {
  getDateKeyInColombia,
  shiftDateKey,
} from "@/lib/credit-date-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FacturaPendiente = Awaited<
  ReturnType<typeof cargarContextoNotificaciones>
>["facturas"][number];
type SuscripcionActiva = Awaited<
  ReturnType<typeof cargarContextoNotificaciones>
>["suscripciones"][number];

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function secretEquals(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function requireCronSecret(req: Request) {
  const expected = String(process.env.CRON_SECRET || "").trim();

  if (!expected) {
    return {
      ok: false as const,
      response: jsonNoStore(
        { error: "CRON_SECRET no esta configurado" },
        { status: 503 }
      ),
    };
  }

  const authorization = String(req.headers.get("authorization") || "");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const headerSecret = String(
    req.headers.get("x-cron-secret") || ""
  ).trim();
  const provided = bearer || headerSecret;

  if (!provided || !secretEquals(provided, expected)) {
    return {
      ok: false as const,
      response: jsonNoStore(
        { error: "Credencial de cron invalida" },
        { status: 401 }
      ),
    };
  }

  return { ok: true as const };
}

function isUniqueConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;

  return (
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function cargarContextoNotificaciones(
  fechaClave: string,
  desactivarExpiradas = false
) {
  const fechaLimiteKey = shiftDateKey(
    fechaClave,
    DIAS_ANTICIPACION_AVISO_PROVEEDOR
  );
  const fechaLimite = dateKeyToDatabaseDate(fechaLimiteKey);

  if (!fechaLimite) {
    throw new Error("No se pudo calcular la ventana de vencimientos");
  }

  const ahora = new Date();

  if (desactivarExpiradas) {
    await prisma.pushSubscriptionProveedor.updateMany({
      where: {
        activo: true,
        expirationTime: {
          lte: ahora,
        },
      },
      data: {
        activo: false,
      },
    });
  }

  const [facturas, suscripciones] = await Promise.all([
    prisma.facturaProveedor.findMany({
      where: {
        estado: ESTADO_FACTURA_PROVEEDOR.PENDIENTE,
        fechaVencimiento: {
          lte: fechaLimite,
        },
      },
      select: {
        id: true,
        aliado: true,
        numeroFactura: true,
        fechaVencimiento: true,
        valorPagar: true,
        estado: true,
      },
      orderBy: [{ fechaVencimiento: "asc" }, { id: "asc" }],
    }),
    prisma.pushSubscriptionProveedor.findMany({
      where: {
        activo: true,
        OR: [
          { expirationTime: null },
          { expirationTime: { gt: ahora } },
        ],
      },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    facturas,
    suscripciones,
    fechaLimiteKey,
  };
}

async function reservarAviso(
  factura: FacturaPendiente,
  subscription: SuscripcionActiva,
  fechaClave: string
) {
  const tipo = obtenerTipoAvisoFacturaProveedor(
    factura.estado,
    factura.fechaVencimiento.toISOString().slice(0, 10),
    fechaClave
  );

  if (!tipo) return null;

  try {
    const aviso = await prisma.avisoFacturaProveedor.create({
      data: {
        facturaId: factura.id,
        pushSubscriptionId: subscription.id,
        fechaClave,
        tipo,
      },
      select: { id: true },
    });

    return { avisoId: aviso.id, tipo };
  } catch (error) {
    if (isUniqueConflict(error)) return "DUPLICADO" as const;
    throw error;
  }
}

export async function GET(req: Request) {
  try {
    const access = requireCronSecret(req);
    if (!access.ok) return access.response;

    const fechaClave = getDateKeyInColombia();
    const contexto = await cargarContextoNotificaciones(fechaClave);

    return jsonNoStore({
      ok: true,
      fechaClave,
      fechaLimite: contexto.fechaLimiteKey,
      diasAnticipacion: DIAS_ANTICIPACION_AVISO_PROVEEDOR,
      facturasPorNotificar: contexto.facturas.length,
      suscripcionesActivas: contexto.suscripciones.length,
      entregasPotenciales:
        contexto.facturas.length * contexto.suscripciones.length,
      pushConfigurado: pushProveedorConfigurado(),
    });
  } catch (error) {
    console.error("ERROR PREVISUALIZANDO AVISOS PROVEEDORES:", error);
    return jsonNoStore(
      { error: "No se pudo preparar el resumen de notificaciones" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = requireCronSecret(req);
    if (!access.ok) return access.response;

    if (!pushProveedorConfigurado()) {
      return jsonNoStore(
        {
          error:
            "Las variables WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY y WEB_PUSH_SUBJECT son obligatorias",
        },
        { status: 503 }
      );
    }

    const fechaClave = getDateKeyInColombia();
    const contexto = await cargarContextoNotificaciones(fechaClave, true);
    const pares = contexto.facturas.flatMap((factura) =>
      contexto.suscripciones.map((subscription) => ({
        factura,
        subscription,
      }))
    );
    const resultado = {
      candidatas: contexto.facturas.length,
      suscripciones: contexto.suscripciones.length,
      procesadas: 0,
      enviadas: 0,
      fallidas: 0,
      omitidasDuplicadas: 0,
      suscripcionesDesactivadas: 0,
    };
    let cursor = 0;

    const worker = async () => {
      while (cursor < pares.length) {
        const pair = pares[cursor];
        cursor += 1;

        const reserva = await reservarAviso(
          pair.factura,
          pair.subscription,
          fechaClave
        );

        if (!reserva) continue;
        if (reserva === "DUPLICADO") {
          resultado.omitidasDuplicadas += 1;
          continue;
        }

        resultado.procesadas += 1;
        const intentoEn = new Date();

        try {
          const payload = crearPayloadAvisoFacturaProveedor(
            pair.factura,
            reserva.tipo,
            fechaClave
          );
          await enviarPushProveedor(pair.subscription, payload);

          await prisma.$transaction([
            prisma.avisoFacturaProveedor.update({
              where: { id: reserva.avisoId },
              data: {
                estado: "ENVIADO",
                intentos: { increment: 1 },
                ultimoIntentoEn: intentoEn,
                enviadoEn: new Date(),
                error: null,
              },
            }),
            prisma.pushSubscriptionProveedor.update({
              where: { id: pair.subscription.id },
              data: {
                fallosConsecutivos: 0,
                ultimoExitoEn: new Date(),
                ultimoErrorEn: null,
              },
            }),
          ]);

          resultado.enviadas += 1;
        } catch (error) {
          const expirada = esSuscripcionPushExpirada(error);

          await prisma.$transaction([
            prisma.avisoFacturaProveedor.update({
              where: { id: reserva.avisoId },
              data: {
                estado: "FALLIDO",
                intentos: { increment: 1 },
                ultimoIntentoEn: intentoEn,
                error: resumirErrorPushProveedor(error),
              },
            }),
            prisma.pushSubscriptionProveedor.update({
              where: { id: pair.subscription.id },
              data: {
                ...(expirada ? { activo: false } : {}),
                fallosConsecutivos: { increment: 1 },
                ultimoErrorEn: new Date(),
              },
            }),
          ]);

          resultado.fallidas += 1;
          if (expirada) resultado.suscripcionesDesactivadas += 1;
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(8, pares.length) },
      () => worker()
    );
    await Promise.all(workers);

    return jsonNoStore({
      ok: resultado.fallidas === 0,
      fechaClave,
      ...resultado,
    });
  } catch (error) {
    console.error("ERROR ENVIANDO AVISOS PROVEEDORES:", error);
    return jsonNoStore(
      { error: "No se pudieron procesar las notificaciones de proveedores" },
      { status: 500 }
    );
  }
}
