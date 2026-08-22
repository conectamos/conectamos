import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeGestionarProveedores } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import {
  ESTADO_FACTURA_PROVEEDOR,
  serializarFacturaProveedor,
} from "@/lib/proveedores";

export const runtime = "nodejs";

function jsonNoStore(
  data: unknown,
  init?: ConstructorParameters<typeof NextResponse>[1]
) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return jsonNoStore({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeGestionarProveedores(session.perfilTipo, session.rolNombre)) {
      return jsonNoStore(
        { error: "No autorizado para aprobar pagos de proveedores" },
        { status: 403 }
      );
    }

    const { id: rawId } = await context.params;
    const id = Number(rawId);

    if (!Number.isInteger(id) || id <= 0) {
      return jsonNoStore(
        { error: "Factura de proveedor invalida" },
        { status: 400 }
      );
    }

    const actor =
      session.perfilNombre ||
      session.nombre ||
      session.usuario ||
      "Usuario";
    const resultado = await prisma.$transaction(async (tx) => {
      const existente = await tx.facturaProveedor.findUnique({
        where: { id },
      });

      if (!existente) {
        return { tipo: "NO_ENCONTRADA" as const };
      }

      if (existente.estado === ESTADO_FACTURA_PROVEEDOR.PAGADO) {
        return {
          tipo: "YA_PAGADA" as const,
          factura: existente,
        };
      }

      const actualizado = await tx.facturaProveedor.updateMany({
        where: {
          id,
          estado: ESTADO_FACTURA_PROVEEDOR.PENDIENTE,
        },
        data: {
          estado: ESTADO_FACTURA_PROVEEDOR.PAGADO,
          pagoAprobadoEn: new Date(),
          pagoAprobadoPorId: session.id,
          pagoAprobadoPorNombre: actor,
        },
      });

      const factura = await tx.facturaProveedor.findUnique({
        where: { id },
      });

      if (!factura) {
        return { tipo: "NO_ENCONTRADA" as const };
      }

      return {
        tipo:
          actualizado.count === 1
            ? ("APROBADA" as const)
            : ("YA_PAGADA" as const),
        factura,
      };
    });

    if (resultado.tipo === "NO_ENCONTRADA") {
      return jsonNoStore(
        { error: "Factura de proveedor no encontrada" },
        { status: 404 }
      );
    }

    return jsonNoStore({
      ok: true,
      mensaje:
        resultado.tipo === "APROBADA"
          ? "Pago aprobado correctamente"
          : "El pago ya estaba aprobado",
      item: serializarFacturaProveedor(resultado.factura),
    });
  } catch (error) {
    console.error("ERROR APROBAR PAGO PROVEEDOR:", error);
    return jsonNoStore(
      { error: "Error interno al aprobar el pago" },
      { status: 500 }
    );
  }
}
