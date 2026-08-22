import { NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { getSessionUser } from "@/lib/auth";
import { puedeGestionarProveedores } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import {
  DIAS_ANTICIPACION_AVISO_PROVEEDOR,
  ESTADO_FACTURA_PROVEEDOR,
  parseFechaVencimientoProveedor,
  resumirFacturasProveedor,
  serializarFacturaProveedor,
  validarNuevaFacturaProveedor,
} from "@/lib/proveedores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(
  data: unknown,
  init?: ConstructorParameters<typeof NextResponse>[1]
) {
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

  if (
    !puedeGestionarProveedores(session.perfilTipo, session.rolNombre)
  ) {
    return {
      ok: false as const,
      response: jsonNoStore(
        { error: "No autorizado para gestionar proveedores" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, session };
}

function isUniqueConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;

  return (
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function GET(req: Request) {
  try {
    const access = await requireProveedorAccess();
    if (!access.ok) return access.response;

    const url = new URL(req.url);
    const estado = String(url.searchParams.get("estado") || "")
      .trim()
      .toUpperCase();
    const busqueda = String(url.searchParams.get("busqueda") || "").trim();
    const desde = parseFechaVencimientoProveedor(
      url.searchParams.get("desde")
    );
    const hasta = parseFechaVencimientoProveedor(
      url.searchParams.get("hasta")
    );
    const where: Prisma.FacturaProveedorWhereInput = {};

    if (
      estado === ESTADO_FACTURA_PROVEEDOR.PENDIENTE ||
      estado === ESTADO_FACTURA_PROVEEDOR.PAGADO
    ) {
      where.estado = estado;
    }

    if (busqueda) {
      where.OR = [
        { aliado: { contains: busqueda, mode: "insensitive" } },
        { numeroFactura: { contains: busqueda, mode: "insensitive" } },
      ];
    }

    if (desde || hasta) {
      where.fechaVencimiento = {
        ...(desde?.date ? { gte: desde.date } : {}),
        ...(hasta?.date ? { lte: hasta.date } : {}),
      };
    }

    const facturas = await prisma.facturaProveedor.findMany({
      where,
      orderBy: [
        { estado: "asc" },
        { fechaVencimiento: "asc" },
        { createdAt: "desc" },
      ],
    });
    const hoy = getDateKeyInColombia();
    const items = facturas.map((factura) =>
      serializarFacturaProveedor(factura, hoy)
    );

    return jsonNoStore({
      items,
      resumen: resumirFacturasProveedor(items),
      puedeGestionar: true,
      hoy,
      diasAnticipacion: DIAS_ANTICIPACION_AVISO_PROVEEDOR,
    });
  } catch (error) {
    console.error("ERROR GET PROVEEDORES:", error);
    return jsonNoStore(
      { error: "Error cargando las facturas de proveedores" },
      { status: 500 }
    );
  }
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

    const validation = validarNuevaFacturaProveedor(body);
    if (!validation.ok) {
      return jsonNoStore(
        { error: validation.error },
        { status: 400 }
      );
    }

    const actor =
      access.session.perfilNombre ||
      access.session.nombre ||
      access.session.usuario ||
      "Usuario";
    const factura = await prisma.facturaProveedor.create({
      data: {
        aliado: validation.data.aliado,
        aliadoNormalizado: validation.data.aliadoNormalizado,
        numeroFactura: validation.data.numeroFactura,
        numeroFacturaNormalizado:
          validation.data.numeroFacturaNormalizado,
        fechaVencimiento: validation.data.fechaVencimiento,
        valorPagar: validation.data.valorPagar,
        creadoPorId: access.session.id,
        creadoPorNombre: actor,
      },
    });

    return jsonNoStore(
      {
        ok: true,
        mensaje: "Factura de proveedor registrada correctamente",
        item: serializarFacturaProveedor(factura),
      },
      { status: 201 }
    );
  } catch (error) {
    if (isUniqueConflict(error)) {
      return jsonNoStore(
        {
          error:
            "Ya existe una factura con ese numero para el aliado indicado",
        },
        { status: 409 }
      );
    }

    console.error("ERROR POST PROVEEDORES:", error);
    return jsonNoStore(
      { error: "Error guardando la factura de proveedor" },
      { status: 500 }
    );
  }
}
