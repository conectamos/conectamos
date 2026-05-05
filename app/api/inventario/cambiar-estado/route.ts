import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";

const ESTADOS_VALIDOS = ["BODEGA", "PENDIENTE", "GARANTIA"];

function describirActor(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  const nombre = String(user.perfilNombre || user.nombre || user.usuario).trim();
  const usuario = String(user.usuario || "").trim();
  const sede = String(user.sedeNombre || "").trim();
  const partes = [nombre];

  if (usuario && usuario !== nombre) {
    partes.push(`usuario ${usuario}`);
  }

  if (sede) {
    partes.push(sede);
  }

  return partes.join(" - ");
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede cambiar estados de inventario" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const id = Number(body.id);
    const estadoActual = String(body.estadoActual || "").trim().toUpperCase();

    if (!id) {
      return NextResponse.json(
        { error: "ID invalido" },
        { status: 400 }
      );
    }

    if (!ESTADOS_VALIDOS.includes(estadoActual)) {
      return NextResponse.json(
        { error: "Estado no permitido" },
        { status: 400 }
      );
    }

    const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").toUpperCase());

    const item = await prisma.inventarioSede.findUnique({
      where: { id },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        sedeId: true,
        estadoActual: true,
        estadoFinanciero: true,
        origen: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Equipo no encontrado" },
        { status: 404 }
      );
    }

    if (!esAdmin && item.sedeId !== user.sedeId) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 403 }
      );
    }

    const estadoAnterior = String(item.estadoActual || "").toUpperCase();
    const actor = describirActor(user);
    const observacion = `Cambio manual de estado por ${actor}: ${estadoAnterior} -> ${estadoActual}`;

    // Solo permitir:
    // BODEGA -> GARANTIA / PENDIENTE
    // GARANTIA / PENDIENTE -> BODEGA
    const permitido =
      (estadoAnterior === "BODEGA" &&
        (estadoActual === "GARANTIA" || estadoActual === "PENDIENTE")) ||
      ((estadoAnterior === "GARANTIA" || estadoAnterior === "PENDIENTE") &&
        estadoActual === "BODEGA");

    if (!permitido) {
      return NextResponse.json(
        { error: `No se permite cambiar de ${estadoAnterior} a ${estadoActual}` },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.inventarioSede.update({
        where: { id: item.id },
        data: {
          estadoAnterior: item.estadoActual || null,
          estadoActual,
          fechaMovimiento: new Date(),
          observacion,
        },
      });

      await tx.movimientoInventario.create({
        data: {
          imei: item.imei,
          tipoMovimiento: "CAMBIO_ESTADO_INVENTARIO",
          referencia: item.referencia,
          color: item.color || null,
          costo: item.costo,
          sedeId: item.sedeId,
          estadoFinanciero: item.estadoFinanciero || null,
          origen: item.origen || "INVENTARIO",
          observacion,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Estado actualizado correctamente",
    });
  } catch (error) {
    console.error("ERROR CAMBIAR ESTADO INVENTARIO:", error);
    return NextResponse.json(
      { error: "Error interno cambiando estado" },
      { status: 500 }
    );
  }
}
