import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { esRolAdmin } from "@/lib/access-control";
import {
  buscarReferenciaInventarioActiva,
  normalizarReferenciaInventario,
} from "@/lib/inventory-references";
import prisma from "@/lib/prisma";
import { NOMBRE_SEDE_BODEGA } from "@/lib/prestamos";

type UpdateData = {
  referencia?: string;
  color?: string | null;
  costo?: number;
  numeroFactura?: string | null;
  distribuidor?: string | null;
};

function parseIds(value: unknown) {
  const raw = Array.isArray(value) ? value : [value];

  return [
    ...new Set(
      raw
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    ),
  ];
}

function normalizeNullableText(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!esRolAdmin(user.rolNombre)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const ids = parseIds(body.ids ?? body.id);

    if (ids.length === 0) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const data: UpdateData = {};

    if ("referencia" in body && normalizarReferenciaInventario(body.referencia)) {
      const referenciaCatalogo = await buscarReferenciaInventarioActiva(
        String(body.referencia)
      );

      if (!referenciaCatalogo) {
        return NextResponse.json(
          { error: "Selecciona una referencia activa del catalogo" },
          { status: 400 }
        );
      }

      data.referencia = referenciaCatalogo.nombre;
    }

    if ("color" in body && String(body.color ?? "").trim()) {
      data.color = normalizeNullableText(body.color);
    }

    if ("costo" in body && String(body.costo ?? "").trim()) {
      const costo = Number(body.costo);

      if (!Number.isFinite(costo) || costo <= 0) {
        return NextResponse.json(
          { error: "El costo debe ser mayor a 0" },
          { status: 400 }
        );
      }

      data.costo = costo;
    }

    if ("numeroFactura" in body && String(body.numeroFactura ?? "").trim()) {
      data.numeroFactura = normalizeNullableText(body.numeroFactura);
    }

    if ("distribuidor" in body && String(body.distribuidor ?? "").trim()) {
      data.distribuidor = normalizeNullableText(body.distribuidor);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Debes completar al menos un campo para editar" },
        { status: 400 }
      );
    }

    const items = await prisma.inventarioPrincipal.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        numeroFactura: true,
        distribuidor: true,
      },
    });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Equipos no encontrados" },
        { status: 404 }
      );
    }

    const sedeBodega = await prisma.sede.findFirst({
      where: {
        nombre: {
          equals: NOMBRE_SEDE_BODEGA,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.inventarioPrincipal.updateMany({
        where: { id: { in: items.map((item) => item.id) } },
        data,
      });

      const dataSede: {
        referencia?: string;
        color?: string | null;
        costo?: number;
        distribuidor?: string | null;
      } = {};

      if (data.referencia !== undefined) dataSede.referencia = data.referencia;
      if (data.color !== undefined) dataSede.color = data.color;
      if (data.costo !== undefined) dataSede.costo = data.costo;
      if (data.distribuidor !== undefined) dataSede.distribuidor = data.distribuidor;

      if (Object.keys(dataSede).length > 0) {
        await tx.inventarioSede.updateMany({
          where: { inventarioPrincipalId: { in: items.map((item) => item.id) } },
          data: dataSede,
        });
      }

      const dataPrestamo: {
        referencia?: string;
        color?: string | null;
        costo?: number;
      } = {};

      if (data.referencia !== undefined) dataPrestamo.referencia = data.referencia;
      if (data.color !== undefined) dataPrestamo.color = data.color;
      if (data.costo !== undefined) dataPrestamo.costo = data.costo;

      if (Object.keys(dataPrestamo).length > 0 && sedeBodega) {
        await tx.prestamoSede.updateMany({
          where: {
            imei: { in: items.map((item) => item.imei) },
            sedeOrigenId: sedeBodega.id,
            estado: {
              in: ["PENDIENTE", "APROBADO", "PAGO_PENDIENTE_APROBACION"],
            },
          },
          data: dataPrestamo,
        });
      }

      await tx.movimientoInventario.createMany({
        data: items.map((item) => ({
          imei: item.imei,
          tipoMovimiento: "EDICION_PRINCIPAL",
          referencia: data.referencia ?? item.referencia,
          color: data.color !== undefined ? data.color : item.color || null,
          costo: data.costo ?? item.costo,
          sedeId: null,
          origen: "PRINCIPAL",
          observacion:
            "Edicion de inventario principal realizada por administrador",
        })),
      });
    });

    return NextResponse.json({
      ok: true,
      mensaje:
        items.length === 1
          ? "Equipo actualizado correctamente"
          : `${items.length} equipos actualizados correctamente`,
      actualizados: items.length,
    });
  } catch (error) {
    console.error("ERROR ACTUALIZAR INVENTARIO PRINCIPAL:", error);
    return NextResponse.json(
      { error: "Error actualizando inventario principal" },
      { status: 500 }
    );
  }
}
