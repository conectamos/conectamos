import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeGestionarProveedores } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import { numeroReciboAbonoProveedor } from "@/lib/proveedores";
import { generarReciboAbonoProveedorPdf } from "@/lib/proveedores-recibo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ abonoId: string; id: string }> },
) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return jsonNoStore({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeGestionarProveedores(session.perfilTipo, session.rolNombre)) {
      return jsonNoStore(
        { error: "No autorizado para consultar recibos de proveedores" },
        { status: 403 },
      );
    }

    const params = await context.params;
    const facturaId = Number(params.id);
    const abonoId = Number(params.abonoId);

    if (
      !Number.isInteger(facturaId) ||
      facturaId <= 0 ||
      !Number.isInteger(abonoId) ||
      abonoId <= 0
    ) {
      return jsonNoStore({ error: "Recibo de proveedor invalido" }, { status: 400 });
    }

    const abono = await prisma.abonoFacturaProveedor.findFirst({
      where: {
        id: abonoId,
        facturaId,
      },
      select: {
        id: true,
        facturaId: true,
        valor: true,
        saldoAnterior: true,
        saldoPosterior: true,
        aliadoSnapshot: true,
        numeroFacturaSnapshot: true,
        valorFacturaSnapshot: true,
        referencia: true,
        observacion: true,
        aprobadoPorNombre: true,
        aprobadoEn: true,
        factura: {
          select: {
            fechaVencimiento: true,
          },
        },
      },
    });

    if (!abono) {
      return jsonNoStore(
        { error: "Recibo de proveedor no encontrado" },
        { status: 404 },
      );
    }

    const numeroRecibo = numeroReciboAbonoProveedor(abono.id);
    const buffer = await generarReciboAbonoProveedorPdf({
      aliado: abono.aliadoSnapshot,
      aprobadoEn: abono.aprobadoEn,
      aprobadoPorNombre: abono.aprobadoPorNombre,
      facturaId: abono.facturaId,
      fechaVencimiento: abono.factura.fechaVencimiento,
      id: abono.id,
      numeroFactura: abono.numeroFacturaSnapshot,
      observacion: abono.observacion,
      referencia: abono.referencia,
      saldoAnterior: abono.saldoAnterior,
      saldoPosterior: abono.saldoPosterior,
      valor: abono.valor,
      valorFactura: abono.valorFacturaSnapshot,
    });

    return new Response(Uint8Array.from(buffer), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `inline; filename="recibo-proveedor-${numeroRecibo}.pdf"`,
        "Content-Length": String(buffer.length),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("ERROR RECIBO ABONO PROVEEDOR:", error);
    return jsonNoStore(
      { error: "Error generando el recibo del abono" },
      { status: 500 },
    );
  }
}
