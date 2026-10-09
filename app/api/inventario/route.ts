import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";
import { esSedeVentas } from "@/lib/sedes";
import { normalizarTipoProducto } from "@/lib/product-types";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import { InventoryIntakeError, leerClaveCarga, leerImeisCarga, registrarCargaInventarioUnaVez } from "@/lib/inventory-intake-registration";
import {
  nombreHistoricoAcreedor,
  obtenerSaldoPendienteInventario,
  resolverIdentidadesAcreedores,
} from "@/lib/inventory-creditors";

function parseSedeId(value: string | null) {
  const sedeId = Number(value);
  return Number.isInteger(sedeId) && sedeId > 0 ? sedeId : null;
}

export async function GET(req: Request) {
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
        { error: "Este perfil no tiene acceso a inventario" },
        { status: 403 }
      );
    }

    await ensureVendorProfilesSchema();

    const esAdmin = ["ADMIN", "AUDITOR"].includes(user.rolNombre.toUpperCase());
    const requestUrl = new URL(req.url);
    const sedeIdFiltro = parseSedeId(requestUrl.searchParams.get("sedeId"));

    const inventario = await prisma.inventarioSede.findMany({
      where: esAdmin
        ? sedeIdFiltro
          ? { sedeId: sedeIdFiltro }
          : {}
        : { sedeId: user.sedeId },
      orderBy: { id: "desc" },
      select: {
        id: true,
        imei: true,
        referencia: true,
        tipoProducto: true,
        color: true,
        costo: true,
        distribuidor: true,
        deboA: true,
        estadoActual: true,
        estadoFinanciero: true,
        origen: true,
        sedeId: true,
        sede: {
          select: {
            id: true,
            nombre: true,
            soloInventarioPorCobrar: true,
          },
        },
        facturaStandItem: {
          select: {
            factura: {
              select: {
                id: true,
                estado: true,
                siigoInvoiceName: true,
                siigoInvoiceUrl: true,
                siigoInvoiceError: true,
              },
            },
          },
        },
      },
    });

    const identidadesAcreedores = await resolverIdentidadesAcreedores(inventario);
    const imeis = [...new Set(inventario.map((item) => item.imei))];
    const sedesOrigenIds = [...new Set(inventario.map((item) => item.sedeId))];

    const prestamosRelacionados =
      imeis.length > 0 && sedesOrigenIds.length > 0
        ? await prisma.prestamoSede.findMany({
            where: {
              imei: {
                in: imeis,
              },
              sedeOrigenId: {
                in: sedesOrigenIds,
              },
              estado: {
                in: [
                  "PENDIENTE",
                  "APROBADO",
                  "PAGO_PENDIENTE_APROBACION",
                  "DEVOLUCION_PENDIENTE",
                  "PAGADO",
                  "FINALIZADO",
                ],
              },
            },
            orderBy: {
              id: "desc",
            },
            select: {
              id: true,
              imei: true,
              estado: true,
              sedeOrigenId: true,
              sedeDestinoId: true,
            },
          })
        : [];

    const sedesDestinoIds = [
      ...new Set(prestamosRelacionados.map((prestamo) => prestamo.sedeDestinoId)),
    ];
    const sedesDestino =
      sedesDestinoIds.length > 0
        ? await prisma.sede.findMany({
            where: {
              id: {
                in: sedesDestinoIds,
              },
            },
            select: {
              id: true,
              nombre: true,
            },
          })
        : [];
    const sedesDestinoPorId = new Map(
      sedesDestino.map((sede) => [sede.id, sede])
    );
    const prestamosPorOrigen = new Map<
      string,
      (typeof prestamosRelacionados)[number]
    >();

    for (const prestamo of prestamosRelacionados) {
      const key = `${prestamo.imei}|${prestamo.sedeOrigenId}`;

      if (!prestamosPorOrigen.has(key)) {
        prestamosPorOrigen.set(key, prestamo);
      }
    }

    const inventarioConPrestamo = inventario.map((item) => {
      const { facturaStandItem, ...inventarioItem } = item;
      const nombreAcreedor = nombreHistoricoAcreedor(item.deboA);
      const acreedor = nombreAcreedor === null
        ? null
        : identidadesAcreedores.get(nombreAcreedor);
      const estadoInventario = String(item.estadoActual || "")
        .trim()
        .toUpperCase();
      const debeMostrarDestinoPrestamo = [
        "PRESTAMO",
        "PRESTAMO_PAGO",
        "PRESTAMO_POR_ACEPTAR",
        "TRASLADO",
      ].includes(estadoInventario);
      const prestamo = debeMostrarDestinoPrestamo
        ? prestamosPorOrigen.get(`${item.imei}|${item.sedeId}`)
        : null;
      const sedeDestino = prestamo
        ? sedesDestinoPorId.get(prestamo.sedeDestinoId)
        : null;
      const destinoEsLaMismaSede =
        prestamo && prestamo.sedeDestinoId === item.sedeId;

      return {
        ...inventarioItem,
        acreedorId: acreedor?.id ?? null,
        acreedorNombre: acreedor?.nombre ?? null,
        deudaPendiente: obtenerSaldoPendienteInventario(item),
        facturaStand: facturaStandItem
          ? {
              id: facturaStandItem.factura.id,
              estado: facturaStandItem.factura.estado,
              nombre: facturaStandItem.factura.siigoInvoiceName,
              url: facturaStandItem.factura.siigoInvoiceUrl,
              error: facturaStandItem.factura.siigoInvoiceError,
            }
          : null,
        prestamoDestino:
          prestamo && sedeDestino && !destinoEsLaMismaSede
            ? {
                id: sedeDestino.id,
                nombre: sedeDestino.nombre,
                prestamoId: prestamo.id,
                estado: prestamo.estado,
              }
            : null,
      };
    });

    return NextResponse.json(inventarioConPrestamo);
  } catch (error) {
    console.error("ERROR GET INVENTARIO:", error);

    return NextResponse.json(
      { error: "Error cargando inventario" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json({ error: "Este perfil no puede ingresar inventario" }, { status: 403 });
    }
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      data = parsed as Record<string, unknown>;
    } catch { return NextResponse.json({ error: "La solicitud de carga no es válida." }, { status: 400 }); }
    const clave = leerClaveCarga(req, data);
    const imeis = leerImeisCarga(data);
    const referencia = String(data.referencia ?? "").trim();
    const tipoProducto = normalizarTipoProducto(data.tipoProducto);
    const color = String(data.color ?? "").trim();
    const costo = typeof data.costo === "number" || typeof data.costo === "string" ? Number(data.costo) : NaN;
    const distribuidor = String(data.distribuidor ?? "").trim();
    const estadoFinanciero = String(data.estadoFinanciero ?? "").trim().toUpperCase();
    const deboA = data.deboA ? String(data.deboA).trim() : null;
    const esAdmin = ["ADMIN", "AUDITOR"].includes(user.rolNombre.toUpperCase());
    const sedeSolicitada = data.sedeId === undefined ? user.sedeId :
      typeof data.sedeId === "number" || typeof data.sedeId === "string" ? Number(data.sedeId) : NaN;
    if (!Number.isInteger(sedeSolicitada) || sedeSolicitada <= 0) throw new InventoryIntakeError("Sede inválida.");
    if (!esAdmin && sedeSolicitada !== user.sedeId) {
      return NextResponse.json({ error: "No tienes permiso para ingresar inventario en esa sede." }, { status: 403 });
    }
    const sedeId = esAdmin ? sedeSolicitada : user.sedeId;
    if (!referencia) throw new InventoryIntakeError("La referencia es obligatoria.");
    if (!Number.isFinite(costo) || costo <= 0) throw new InventoryIntakeError("El costo debe ser mayor a 0.");
    if (!distribuidor) throw new InventoryIntakeError("Debes seleccionar un distribuidor.");
    if (!estadoFinanciero) throw new InventoryIntakeError("Debes seleccionar el estado financiero.");
    if (estadoFinanciero === "DEUDA" && !deboA) throw new InventoryIntakeError("Debes seleccionar 'Debe a'.");
    await ensureVendorProfilesSchema();
    const resultado = await registrarCargaInventarioUnaVez({
      usuarioId: user.id, destino: "SEDE", clave, imeis,
      solicitud: { imeis, referencia, tipoProducto, color, costo, distribuidor, sedeId, estadoFinanciero, deboA },
      registrar: async (tx) => {
        const sede = await tx.sede.findUnique({ where: { id: sedeId }, select: { nombre: true } });
        if (!sede) throw new InventoryIntakeError("Sede inválida.");
        if (esSedeVentas(sede.nombre)) throw new InventoryIntakeError("La sede VENTAS es informativa y no puede recibir equipos de inventario.");
        const created = await tx.inventarioSede.createMany({
          data: imeis.map((imei) => ({
            imei, referencia, tipoProducto, color: color || null, costo, distribuidor, sedeId,
            estadoFinanciero, deboA, estadoActual: "BODEGA", origen: "MANUAL", inventarioPrincipalId: null,
          })),
        });
        if (created.count !== imeis.length) throw new Error("La carga no se pudo completar.");
        await tx.movimientoInventario.createMany({
          data: imeis.map((imei) => ({
            imei, tipoMovimiento: "INGRESO_SEDE", referencia, color: color || null,
            costo, sedeId, deboA, estadoFinanciero, origen: "MANUAL",
            observacion: `Ingreso manual desde ${distribuidor}`,
          })),
        });
        const item = imeis.length === 1 ? await tx.inventarioSede.findFirst({
          where: { sedeId, imei: imeis[0] },
          select: { id: true, imei: true, referencia: true, tipoProducto: true, sedeId: true, estadoActual: true, estadoFinanciero: true },
        }) : null;
        return { ok: true, mensaje: "Guardado correctamente", item, insertados: created.count, omitidos: 0, imeisOmitidos: [] as string[] };
      },
    });
    return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InventoryIntakeError) {
      return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status });
    }
    console.error("ERROR API INVENTARIO:", error);
    return NextResponse.json({ error: "No se pudo confirmar la carga. Conserva los datos y reintenta para recuperar el resultado sin duplicar equipos." }, { status: 500 });
  }
}
