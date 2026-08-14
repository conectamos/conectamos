import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import {
  createSiigoInvoiceForRegistro,
  findSiigoCreditNoteForInvoice,
  getSiigoErrorMessage,
  getSiigoErrorStatus,
  getSiigoInvoiceLabel,
} from "@/lib/siigo";

const SIIGO_SEDE_SELECT = {
  id: true,
  nombre: true,
  codigo: true,
  siigoEnabled: true,
  siigoInvoiceDocumentId: true,
  siigoSellerId: true,
  siigoPaymentTypeId: true,
  siigoItemCode: true,
  siigoCostCenterId: true,
  siigoDefaultCountryCode: true,
  siigoDefaultStateCode: true,
  siigoDefaultCityCode: true,
  siigoDefaultPostalCode: true,
  siigoStampSend: true,
  siigoMailSend: true,
  siigoPaymentDueDays: true,
} as const;

const MAX_EQUIPOS_POR_FACTURA = 500;
const MINUTOS_PROCESANDO = 10;

function idsPositivosUnicos(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
}

function texto(value: unknown) {
  return String(value || "").trim();
}

function mismoConjunto(actual: string[], esperado: string[]) {
  if (actual.length !== esperado.length) return false;

  const conjunto = new Set(actual);
  return esperado.every((item) => conjunto.has(item));
}

function errorDuplicado(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
  );
}

export async function POST(req: Request) {
  let loteId: number | null = null;
  let facturaAnteriorAnulada: {
    factura: string;
    notaCredito: string | null;
  } | null = null;

  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const rol = texto(user.rolNombre).toUpperCase();
    if (!["ADMIN", "AUDITOR"].includes(rol)) {
      return NextResponse.json(
        { error: "Solo Administrador o Auditor pueden emitir esta factura" },
        { status: 403 }
      );
    }

    await ensureVendorProfilesSchema();

    const body = await req.json();
    const inventarioIds = idsPositivosUnicos(body.inventarioIds);
    if (inventarioIds.length === 0) {
      return NextResponse.json(
        { error: "Selecciona al menos un equipo para facturar" },
        { status: 400 }
      );
    }

    if (inventarioIds.length > MAX_EQUIPOS_POR_FACTURA) {
      return NextResponse.json(
        {
          error: `Una factura admite hasta ${MAX_EQUIPOS_POR_FACTURA} equipos seleccionados`,
        },
        { status: 400 }
      );
    }

    const equipos = await prisma.inventarioSede.findMany({
      where: { id: { in: inventarioIds } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        imei: true,
        referencia: true,
        tipoProducto: true,
        color: true,
        costo: true,
        sedeId: true,
        sede: {
          select: {
            id: true,
            nombre: true,
            soloInventarioPorCobrar: true,
            facturacionNombre: true,
            facturacionTipoDocumento: true,
            facturacionDocumento: true,
            facturacionCorreo: true,
            facturacionTelefono: true,
            facturacionDireccion: true,
          },
        },
      },
    });

    if (equipos.length !== inventarioIds.length) {
      return NextResponse.json(
        { error: "Uno o mas equipos seleccionados ya no existen" },
        { status: 409 }
      );
    }

    const sedeIds = new Set(equipos.map((item) => item.sedeId));
    if (sedeIds.size !== 1) {
      return NextResponse.json(
        { error: "La factura debe contener equipos de un solo stand" },
        { status: 400 }
      );
    }

    const sede = equipos[0].sede;
    if (!sede?.soloInventarioPorCobrar) {
      return NextResponse.json(
        {
          error:
            "La sede seleccionada no esta configurada como stand de solo inventario",
        },
        { status: 400 }
      );
    }

    const sedeSiigo = await prisma.sede.findUnique({
      where: { id: sede.id },
      select: SIIGO_SEDE_SELECT,
    });

    if (!sedeSiigo) {
      return NextResponse.json(
        { error: "No fue posible cargar la configuracion Siigo del stand" },
        { status: 409 }
      );
    }

    const diasVencimiento = Number(sedeSiigo.siigoPaymentDueDays ?? 0);
    if (!Number.isInteger(diasVencimiento) || diasVencimiento < 0) {
      return NextResponse.json(
        { error: `El plazo Siigo configurado para ${sede.nombre} no es valido` },
        { status: 400 }
      );
    }

    const fiscal = {
      nombre: texto(sede.facturacionNombre),
      tipoDocumento: texto(sede.facturacionTipoDocumento).toUpperCase(),
      documento: texto(sede.facturacionDocumento),
      correo: texto(sede.facturacionCorreo),
      telefono: texto(sede.facturacionTelefono),
      direccion: texto(sede.facturacionDireccion),
    };
    const faltantes = [
      !fiscal.nombre ? "nombre o razon social" : null,
      !["NIT", "CC", "CE", "PPT"].includes(fiscal.tipoDocumento)
        ? "tipo de documento"
        : null,
      !fiscal.documento ? "documento" : null,
      !fiscal.correo ? "correo" : null,
      !fiscal.telefono ? "telefono" : null,
      !fiscal.direccion ? "direccion" : null,
    ].filter(Boolean);

    if (faltantes.length > 0) {
      return NextResponse.json(
        {
          error: `Completa los datos de facturacion de ${sede.nombre}: ${faltantes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const equipoSinCosto = equipos.find(
      (item) => Number(item.costo || 0) <= 0
    );
    if (equipoSinCosto) {
      return NextResponse.json(
        {
          error: `El IMEI ${equipoSinCosto.imei} no tiene un costo valido para facturar`,
        },
        { status: 400 }
      );
    }

    const imeis = equipos.map((item) => item.imei);
    const itemsExistentes = await prisma.facturaInventarioStandItem.findMany({
      where: { imei: { in: imeis } },
      select: {
        imei: true,
        factura: {
          select: {
            id: true,
            estado: true,
            siigoInvoiceId: true,
            siigoInvoiceName: true,
            siigoInvoiceUrl: true,
            siigoInvoiceCreatedAt: true,
            diasVencimiento: true,
            createdAt: true,
            updatedAt: true,
            items: {
              select: {
                inventarioSedeId: true,
                imei: true,
                referencia: true,
                tipoProducto: true,
                color: true,
                costo: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (itemsExistentes.length > 0) {
      const facturas = Array.from(
        new Map(
          itemsExistentes.map((item) => [item.factura.id, item.factura])
        ).values()
      );

      if (
        facturas.length !== 1 ||
        !mismoConjunto(
          facturas[0].items.map((item) => item.imei),
          imeis
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Uno o mas IMEI ya pertenecen a otra factura de stand. Revisa la seleccion.",
          },
          { status: 409 }
        );
      }

      const factura = facturas[0];
      if (factura.estado === "EMITIDA") {
        const notaCredito = await findSiigoCreditNoteForInvoice({
          invoiceId: factura.siigoInvoiceId,
          invoiceName: factura.siigoInvoiceName,
          invoiceCreatedAt:
            factura.siigoInvoiceCreatedAt || factura.createdAt,
        });

        if (!notaCredito) {
          return NextResponse.json(
            {
              error: `La factura ${factura.siigoInvoiceName || `lote #${factura.id}`} sigue bloqueada porque Siigo no devolvio una nota credito valida que la relacione. Verifica que la NC este emitida y vuelve a intentar.`,
              facturaUrl: factura.siigoInvoiceUrl,
            },
            { status: 409 }
          );
        }

        const liberadoPor = `${user.nombre} (${rol})`;
        const itemsAnulados = factura.items.map((item) => ({
          inventarioSedeId: item.inventarioSedeId,
          imei: item.imei,
          referencia: item.referencia,
          tipoProducto: item.tipoProducto,
          color: item.color,
          costo: Number(item.costo),
          createdAt: item.createdAt.toISOString(),
        }));

        await prisma.$transaction([
          prisma.facturaInventarioStand.update({
            where: { id: factura.id },
            data: {
              estado: "ANULADA",
              siigoCreditNoteId: notaCredito.id,
              siigoCreditNoteName: notaCredito.name,
              siigoCreditNoteStatus: notaCredito.status,
              siigoCreditNoteUrl: notaCredito.url,
              siigoCreditNoteCreatedAt:
                notaCredito.createdAt || new Date(),
              itemsAnulados,
              itemsLiberadosAt: new Date(),
              itemsLiberadosPor: liberadoPor,
            },
          }),
          prisma.facturaInventarioStandItem.deleteMany({
            where: { facturaId: factura.id },
          }),
        ]);

        facturaAnteriorAnulada = {
          factura:
            factura.siigoInvoiceName || `lote #${factura.id}`,
          notaCredito: notaCredito.name,
        };
      }

      if (factura.estado !== "EMITIDA") {
        if (factura.diasVencimiento !== diasVencimiento) {
          const condicionOriginal =
            factura.diasVencimiento === 30
              ? "credito a 30 dias"
              : "pago inmediato";
          return NextResponse.json(
            {
              error: `Este lote ya fue creado con ${condicionOriginal}. La configuracion actual del stand es diferente.`,
            },
            { status: 409 }
          );
        }

        const procesandoReciente =
          factura.estado === "PROCESANDO" &&
          Date.now() - factura.updatedAt.getTime() <
            MINUTOS_PROCESANDO * 60_000;
        if (procesandoReciente) {
          return NextResponse.json(
            {
              error:
                "Este lote ya se esta enviando a Siigo. Espera unos minutos.",
            },
            { status: 409 }
          );
        }

        loteId = factura.id;
        await prisma.facturaInventarioStand.update({
          where: { id: loteId },
          data: {
            estado: "PROCESANDO",
            siigoInvoiceError: null,
            siigoInvoiceAttempt: { increment: 1 },
          },
        });
      }
    }

    if (!loteId) {
      const total = equipos.reduce(
        (acumulado, item) => acumulado + Number(item.costo || 0),
        0
      );
      const lote = await prisma.facturaInventarioStand.create({
        data: {
          sedeId: sede.id,
          estado: "PROCESANDO",
          total,
          cantidad: equipos.length,
          diasVencimiento,
          creadoPor: `${user.nombre} (${rol})`,
          siigoInvoiceAttempt: 1,
          items: {
            create: equipos.map((item) => ({
              inventarioSedeId: item.id,
              imei: item.imei,
              referencia: item.referencia,
              tipoProducto: item.tipoProducto || "TELEFONIA",
              color: item.color,
              costo: Number(item.costo || 0),
            })),
          },
        },
        select: { id: true },
      });
      loteId = lote.id;
    }

    const lote = await prisma.facturaInventarioStand.findUniqueOrThrow({
      where: { id: loteId },
      include: {
        items: { orderBy: { id: "asc" } },
      },
    });

    const invoice = await createSiigoInvoiceForRegistro({
      id: lote.id,
      createdAt: lote.createdAt,
      puntoVenta: sede.nombre,
      clienteNombre: fiscal.nombre,
      tipoDocumento: fiscal.tipoDocumento,
      documentoNumero: fiscal.documento,
      correo: fiscal.correo,
      whatsapp: fiscal.telefono,
      direccion: fiscal.direccion,
      plataformaCredito: "FACTURA INVENTARIO STAND",
      creditoAutorizado: Number(lote.total),
      cuotaInicial: 0,
      medioPago1Tipo: "CREDITO",
      medioPago1Valor: Number(lote.total),
      referenciaEquipo: `${lote.cantidad} equipos para ${sede.nombre}`,
      tipoEquipo: "NUEVO",
      tipoProducto: "MIXTO",
      siigoItems: lote.items.map((item) => ({
        referencia: item.referencia,
        imei: item.imei,
        price: Number(item.costo),
        tipoProducto: item.tipoProducto,
      })),
      siigoIdempotencyKey: `CSTAND${lote.id}N1`,
      siigoPaymentDueDays: lote.diasVencimiento,
      siigoObservaciones: [
        `Factura de inventario para ${sede.nombre}`,
        `Lote CONECTAMOS #${lote.id}`,
        `${lote.cantidad} equipos seleccionados`,
        lote.diasVencimiento === 30
          ? "Condicion de pago: credito a 30 dias"
          : "Condicion de pago: inmediato",
        `IMEI: ${lote.items.map((item) => item.imei).join(", ")}`,
      ].join(" | "),
      sede: sedeSiigo,
    });
    const invoiceLabel = getSiigoInvoiceLabel(invoice);

    if (!invoice.id || !invoiceLabel) {
      throw new Error(
        "Siigo creo la factura, pero no retorno su identificador"
      );
    }

    await prisma.facturaInventarioStand.update({
      where: { id: lote.id },
      data: {
        estado: "EMITIDA",
        siigoInvoiceId: invoice.id,
        siigoInvoiceName: invoiceLabel,
        siigoInvoiceStatus: invoice.status || null,
        siigoInvoiceUrl: invoice.public_url || null,
        siigoInvoiceError: null,
        siigoInvoiceCreatedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Factura ${invoiceLabel} emitida correctamente`,
      factura: {
        id: lote.id,
        estado: "EMITIDA",
        nombre: invoiceLabel,
        url: invoice.public_url || null,
        total: Number(lote.total),
        cantidad: lote.cantidad,
        sedeNombre: sede.nombre,
        diasVencimiento: lote.diasVencimiento,
      },
      facturaAnteriorAnulada,
    });
  } catch (error) {
    console.error("ERROR FACTURA INVENTARIO STAND:", error);

    if (loteId) {
      try {
        await prisma.facturaInventarioStand.update({
          where: { id: loteId },
          data: {
            estado: "ERROR",
            siigoInvoiceError: getSiigoErrorMessage(error).slice(0, 4000),
          },
        });
      } catch (updateError) {
        console.error("ERROR GUARDANDO FALLA FACTURA STAND:", updateError);
      }
    }

    if (errorDuplicado(error)) {
      return NextResponse.json(
        { error: "Uno de los IMEI seleccionados ya pertenece a una factura" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: getSiigoErrorMessage(error) },
      { status: getSiigoErrorStatus(error) }
    );
  }
}
