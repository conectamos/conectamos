import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { normalizarTipoProducto } from "@/lib/product-types";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import { enriquecerRegistrosConCatalogo } from "@/lib/record-catalog-media";
import { InventoryIntakeError, leerClaveCarga, leerImeisCarga, registrarCargaInventarioUnaVez } from "@/lib/inventory-intake-registration";
import {
  buscarReferenciaInventarioActiva,
  normalizarReferenciaInventario,
} from "@/lib/inventory-references";

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    const esAdmin = ["ADMIN", "AUDITOR"].includes(user.rolNombre?.toUpperCase() || "");

    if (!esAdmin) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 403 }
      );
    }

    await ensureVendorProfilesSchema();

const inventario = await prisma.inventarioPrincipal.findMany({
      orderBy: { id: "desc" },
      select: {
        id: true,
        imei: true,
        referencia: true,
        tipoProducto: true,
        color: true,
        costo: true,
        numeroFactura: true,
        distribuidor: true,

        // 🔥 IMPORTANTE
        estado: true,
        sedeDestinoId: true,
        estadoCobro: true,
      },
    });

    const enriquecido = await enriquecerRegistrosConCatalogo(inventario.map((item) => ({
      ...item, referenciaEquipo: item.referencia,
    })));
    const sedeIds = [...new Set(inventario.flatMap((item) => item.sedeDestinoId ? [item.sedeDestinoId] : []))];
    const sedesDestino = sedeIds.length ? await prisma.sede.findMany({
      where: { id: { in: sedeIds } },
      select: { id: true, nombre: true },
    }) : [];
    const nombresDestino = new Map(sedesDestino.map((sede) => [sede.id, sede.nombre]));
    return NextResponse.json(enriquecido.map((item, index) => ({
      ...inventario[index], catalogoEquipo: item.catalogoEquipo,
      sedeDestinoNombre: item.sedeDestinoId ? nombresDestino.get(item.sedeDestinoId) || null : null,
    })));
  } catch (error) {
    console.error("ERROR GET INVENTARIO PRINCIPAL:", error);

    return NextResponse.json(
      { error: "Error cargando inventario principal" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const esAdmin = ["ADMIN", "AUDITOR"].includes(user.rolNombre?.toUpperCase() || "");
    if (!esAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch { return NextResponse.json({ error: "La solicitud de carga no es válida." }, { status: 400 }); }
    const clave = leerClaveCarga(req, body);
    const imeis = leerImeisCarga(body);
    const referencia = normalizarReferenciaInventario(body.referencia);
    const tipoProducto = normalizarTipoProducto(body.tipoProducto);
    const color = String(body.color ?? "").trim();
    const costo = typeof body.costo === "number" || typeof body.costo === "string" ? Number(body.costo) : NaN;
    const numeroFactura = String(body.numeroFactura ?? "").trim();
    const distribuidor = String(body.distribuidor ?? "").trim();
    if (!referencia) throw new InventoryIntakeError("La referencia es obligatoria.");
    if (!Number.isFinite(costo) || costo <= 0) throw new InventoryIntakeError("El costo debe ser mayor a 0.");
    if (!numeroFactura) throw new InventoryIntakeError("El número de factura es obligatorio.");
    if (!distribuidor) throw new InventoryIntakeError("El distribuidor es obligatorio.");
    await ensureVendorProfilesSchema();
    const resultado = await registrarCargaInventarioUnaVez({
      usuarioId: user.id, destino: "PRINCIPAL", clave, imeis,
      solicitud: { imeis, referencia, tipoProducto, color, costo, numeroFactura, distribuidor },
      registrar: async (tx) => {
        // Catalog changes must not prevent recovery of a previously committed response.
        const referenciaCatalogo = await buscarReferenciaInventarioActiva(referencia);
        if (!referenciaCatalogo) throw new InventoryIntakeError("Selecciona una referencia activa del catálogo.");
        const referenciaGuardar = referenciaCatalogo.nombre;
        const created = await tx.inventarioPrincipal.createMany({
          data: imeis.map((imei) => ({ imei, referencia: referenciaGuardar, tipoProducto, color: color || null, costo, numeroFactura, distribuidor })),
        });
        if (created.count !== imeis.length) throw new Error("La carga no se pudo completar.");
        await tx.movimientoInventario.createMany({
          data: imeis.map((imei) => ({
            imei, tipoMovimiento: "INGRESO_PRINCIPAL", referencia: referenciaGuardar,
            color: color || null, costo, origen: "PRINCIPAL",
            observacion: `Ingreso a bodega principal. Factura: ${numeroFactura}. Distribuidor: ${distribuidor}`,
          })),
        });
        return { ok: true, insertados: created.count, omitidos: 0, imeisOmitidos: [] as string[] };
      },
    });
    return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InventoryIntakeError) {
      return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status });
    }
    console.error("ERROR POST INVENTARIO PRINCIPAL:", error);
    return NextResponse.json({ error: "No se pudo confirmar la carga. Conserva los datos y reintenta para recuperar el resultado sin duplicar equipos." }, { status: 500 });
  }
}
