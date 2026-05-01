import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

const ESTADOS_PRESTAMO_ACTIVOS = [
  "PENDIENTE",
  "APROBADO",
  "PAGO_PENDIENTE_APROBACION",
  "DEVOLUCION_PENDIENTE",
];

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";

    if (!esAdmin) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 403 }
      );
    }

    const body = await req.json();

    const id = Number(body.id);
    const referencia = String(body.referencia ?? "").trim();
    const color = String(body.color ?? "").trim();
    const costo = Number(body.costo ?? 0);
    const distribuidor = String(body.distribuidor ?? "").trim();
    const estadoFinanciero = String(body.estadoFinanciero ?? "").trim().toUpperCase();
    const deboA = body.deboA ? String(body.deboA).trim() : null;

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "ID invalido" },
        { status: 400 }
      );
    }

    if (!referencia) {
      return NextResponse.json(
        { error: "La referencia es obligatoria" },
        { status: 400 }
      );
    }

    if (!costo || costo <= 0) {
      return NextResponse.json(
        { error: "El costo debe ser mayor a 0" },
        { status: 400 }
      );
    }

    if (!distribuidor) {
      return NextResponse.json(
        { error: "Debes seleccionar un distribuidor" },
        { status: 400 }
      );
    }

    if (!estadoFinanciero) {
      return NextResponse.json(
        { error: "Debes seleccionar el estado financiero" },
        { status: 400 }
      );
    }

    if (estadoFinanciero === "DEUDA" && !deboA) {
      return NextResponse.json(
        { error: "Debes seleccionar 'Debe a'" },
        { status: 400 }
      );
    }

    const item = await prisma.inventarioSede.findUnique({
      where: { id },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        sedeId: true,
        distribuidor: true,
        deboA: true,
        estadoFinanciero: true,
        estadoActual: true,
        ventas: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Equipo no encontrado" },
        { status: 404 }
      );
    }

    const estadoActual = String(item.estadoActual || "").trim().toUpperCase();

    if (item.ventas.length > 0 || estadoActual === "VENDIDO") {
      return NextResponse.json(
        { error: "No se puede editar un equipo ya vendido" },
        { status: 400 }
      );
    }

    const prestamoActivo = await prisma.prestamoSede.findFirst({
      where: {
        imei: item.imei,
        estado: { in: ESTADOS_PRESTAMO_ACTIVOS },
      },
      select: { id: true },
    });

    if (prestamoActivo || estadoActual === "PRESTAMO") {
      return NextResponse.json(
        { error: "No se puede editar un equipo con prestamo activo" },
        { status: 400 }
      );
    }

    const cambios: string[] = [];

    if (item.referencia !== referencia) {
      cambios.push(`referencia: ${item.referencia} -> ${referencia}`);
    }

    if ((item.color || "") !== color) {
      cambios.push(`color: ${item.color || "-"} -> ${color || "-"}`);
    }

    if (Number(item.costo) !== costo) {
      cambios.push(`costo: ${item.costo} -> ${costo}`);
    }

    if ((item.distribuidor || "") !== distribuidor) {
      cambios.push(`distribuidor: ${item.distribuidor || "-"} -> ${distribuidor}`);
    }

    if ((item.estadoFinanciero || "") !== estadoFinanciero) {
      cambios.push(
        `estado financiero: ${item.estadoFinanciero || "-"} -> ${estadoFinanciero}`
      );
    }

    if ((item.deboA || "") !== (deboA || "")) {
      cambios.push(`debo a: ${item.deboA || "-"} -> ${deboA || "-"}`);
    }

    const actualizado = await prisma.inventarioSede.update({
      where: { id },
      data: {
        referencia,
        color: color || null,
        costo,
        distribuidor,
        estadoFinanciero,
        deboA: estadoFinanciero === "DEUDA" ? deboA : null,
        observacion:
          cambios.length > 0
            ? `Editado por admin ${user.usuario}: ${cambios.join(" | ")}`
            : `Revision administrativa por ${user.usuario} sin cambios visibles.`,
      },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        distribuidor: true,
        deboA: true,
        estadoFinanciero: true,
        estadoActual: true,
      },
    });

    await prisma.movimientoInventario.create({
      data: {
        imei: item.imei,
        tipoMovimiento: "EDICION_ADMIN",
        referencia,
        color: color || null,
        costo,
        sedeId: item.sedeId,
        deboA: estadoFinanciero === "DEUDA" ? deboA : null,
        estadoFinanciero,
        origen: "ADMIN",
        observacion:
          cambios.length > 0
            ? `Admin ${user.usuario} actualizo: ${cambios.join(" | ")}`
            : `Admin ${user.usuario} abrio y guardo la ficha sin cambios.`,
      },
    });

    return NextResponse.json({
      ok: true,
      item: actualizado,
    });
  } catch (error) {
    console.error("ERROR ACTUALIZAR INVENTARIO:", error);
    return NextResponse.json(
      { error: "Error actualizando equipo" },
      { status: 500 }
    );
  }
}
