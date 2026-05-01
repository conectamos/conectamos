import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";

async function buscarRegistroVentaAbierto(
  serial: string,
  sedeId: number,
  sedeNombre: string
) {
  await ensureVendorProfilesSchema();

  const registros = await prisma.registroVendedorVenta.findMany({
    where: {
      serialImei: serial,
      eliminadoEn: null,
      ventaIdRelacionada: null,
      OR: [
        { sedeId },
        {
          puntoVenta: {
            equals: sedeNombre,
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      id: true,
      puntoVenta: true,
      clienteNombre: true,
      tipoDocumento: true,
      documentoNumero: true,
      correo: true,
      whatsapp: true,
      direccion: true,
      barrio: true,
      referenciaContacto: true,
      referenciaEquipo: true,
      asesorNombre: true,
      jaladorNombre: true,
      numeroFactura: true,
      estadoFacturacion: true,
      estadoVentaRegistro: true,
      observacion: true,
      financierasDetalle: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 5,
  });

  const registro = registros.find((item) => {
    const estadoVentaRegistro = String(item.estadoVentaRegistro || "")
      .trim()
      .toUpperCase();

    return (
      estadoVentaRegistro !== "CANCELADO" &&
      estadoVentaRegistro !== "CONVERTIDO_EN_VENTA"
    );
  });

  return registro
    ? {
        ...registro,
        financierasDetalle: Array.isArray(registro.financierasDetalle)
          ? registro.financierasDetalle
          : [],
      }
    : null;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const serial = String(body.serial ?? "").replace(/\D/g, "").slice(0, 15);

    if (!serial) {
      return NextResponse.json({ error: "IMEI invalido" }, { status: 400 });
    }

    const registroVenta = await buscarRegistroVentaAbierto(
      serial,
      user.sedeId,
      user.sedeNombre
    );

    const inventarioSedes = await prisma.inventarioSede.findMany({
      where: { imei: serial },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        sedeId: true,
        estadoActual: true,
        estadoFinanciero: true,
      },
      orderBy: { id: "desc" },
    });

    if (inventarioSedes.length > 0) {
      const itemActual = inventarioSedes.find((item) => item.sedeId === user.sedeId);

      if (!itemActual) {
        const itemOtraSede = inventarioSedes[0];

        return NextResponse.json(
          {
            bloqueado: true,
            referencia: itemOtraSede.referencia,
            color: itemOtraSede.color,
            costo: itemOtraSede.costo,
            sedeId: itemOtraSede.sedeId,
            estadoActual: itemOtraSede.estadoActual,
            mensaje:
              "El equipo pertenece a otra sede. Solo la sede que tiene el equipo puede completar la venta.",
          },
          { status: 400 }
        );
      }

      const estado = String(itemActual.estadoActual ?? "").trim().toUpperCase();

      if (estado !== "BODEGA") {
        return NextResponse.json(
          {
            bloqueado: true,
            referencia: itemActual.referencia,
            color: itemActual.color,
            costo: itemActual.costo,
            sedeId: itemActual.sedeId,
            estadoActual: itemActual.estadoActual,
            mensaje: `El equipo esta en estado ${estado} y no se puede vender`,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        id: itemActual.id,
        imei: itemActual.imei,
        referencia: itemActual.referencia,
        color: itemActual.color,
        costo: itemActual.costo,
        sedeId: itemActual.sedeId,
        estadoActual: itemActual.estadoActual,
        estadoFinanciero: itemActual.estadoFinanciero,
        origen: "SEDE_ACTUAL",
        registroVenta,
        mensaje: "Equipo encontrado en tu sede",
      });
    }

    const principal = await prisma.inventarioPrincipal.findUnique({
      where: { imei: serial },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        estado: true,
        estadoCobro: true,
      },
    });

    if (principal) {
      const estadoPrincipal = String(principal.estado ?? "BODEGA")
        .trim()
        .toUpperCase();

      return NextResponse.json(
        {
          bloqueado: true,
          referencia: principal.referencia,
          color: principal.color,
          costo: principal.costo,
          estadoActual: estadoPrincipal,
          estadoFinanciero: principal.estadoCobro || "PAGO",
          origen: "BODEGA_PRINCIPAL",
          registroVenta,
          mensaje:
            "El equipo esta en Bodega Principal. Debe enviarse a la sede antes de registrar la venta.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "IMEI no encontrado en ninguna sede ni en bodega principal" },
      { status: 404 }
    );
  } catch (error) {
    console.error("ERROR BUSCAR IMEI VENTA:", error);
    return NextResponse.json(
      { error: "Error interno buscando IMEI" },
      { status: 500 }
    );
  }
}
