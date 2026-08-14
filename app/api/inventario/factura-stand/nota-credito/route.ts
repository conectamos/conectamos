import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import {
  createSiigoCreditNoteForRegistro,
  findSiigoCreditNoteForInvoice,
  getSiigoCreditNoteLabel,
  getSiigoErrorMessage,
  getSiigoErrorStatus,
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

function texto(value: unknown) {
  return String(value || "").trim();
}

function normalizarFactura(value: unknown) {
  return texto(value).toUpperCase();
}

function pausa(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buscarNotaCreditoVerificada(input: {
  invoiceId: string;
  invoiceName: string;
  invoiceCreatedAt: Date;
}) {
  for (let intento = 0; intento < 4; intento += 1) {
    const notaCredito = await findSiigoCreditNoteForInvoice({
      invoiceId: input.invoiceId,
      invoiceName: input.invoiceName,
      invoiceCreatedAt: input.invoiceCreatedAt,
    });

    if (notaCredito) {
      return notaCredito;
    }

    if (intento < 3) {
      await pausa(2500);
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const rol = texto(user.rolNombre).toUpperCase();
    if (!['ADMIN', 'AUDITOR'].includes(rol)) {
      return NextResponse.json(
        { error: "Solo Administrador o Auditor pueden emitir esta nota credito" },
        { status: 403 }
      );
    }

    await ensureVendorProfilesSchema();

    const body = await req.json();
    const facturaNombre = normalizarFactura(body.facturaNombre);
    const invoiceIdEsperado = texto(body.siigoInvoiceIdEsperado);
    const cantidadEsperada = Number(body.cantidadEsperada);
    const usarConfiguracionOriginalOnline =
      body.usarConfiguracionOriginalOnline === true;

    if (!/^FV-\d+-\d+$/.test(facturaNombre)) {
      return NextResponse.json(
        { error: "Indica el numero exacto de la factura Siigo" },
        { status: 400 }
      );
    }

    if (!invoiceIdEsperado) {
      return NextResponse.json(
        { error: "Indica el identificador interno exacto de la factura Siigo" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(cantidadEsperada) || cantidadEsperada <= 0) {
      return NextResponse.json(
        { error: "Indica la cantidad exacta de IMEI que debe contener el lote" },
        { status: 400 }
      );
    }

    const lotes = await prisma.facturaInventarioStand.findMany({
      where: {
        siigoInvoiceName: { equals: facturaNombre, mode: "insensitive" },
      },
      include: {
        sede: {
          select: {
            id: true,
            nombre: true,
            facturacionNombre: true,
            facturacionTipoDocumento: true,
            facturacionDocumento: true,
            facturacionCorreo: true,
            facturacionTelefono: true,
            facturacionDireccion: true,
          },
        },
        items: { orderBy: { id: "asc" } },
      },
    });

    if (lotes.length !== 1) {
      return NextResponse.json(
        {
          error:
            lotes.length === 0
              ? `No existe el lote de la factura ${facturaNombre}`
              : `Hay mas de un lote asociado a ${facturaNombre}; no se realizo ningun cambio`,
        },
        { status: lotes.length === 0 ? 404 : 409 }
      );
    }

    const lote = lotes[0];

    if (lote.estado === "ANULADA" && lote.siigoCreditNoteId) {
      return NextResponse.json({
        ok: true,
        yaProcesada: true,
        factura: lote.siigoInvoiceName,
        notaCredito: lote.siigoCreditNoteName,
        cantidadLiberada: lote.cantidad,
      });
    }

    if (lote.estado !== "EMITIDA") {
      return NextResponse.json(
        {
          error: `La factura ${facturaNombre} esta en estado ${lote.estado}; no se genero una NC`,
        },
        { status: 409 }
      );
    }

    const invoiceId = texto(lote.siigoInvoiceId);
    if (invoiceId !== invoiceIdEsperado) {
      return NextResponse.json(
        {
          error:
            "El identificador de Siigo no coincide con la factura confirmada; no se realizo ningun cambio",
        },
        { status: 409 }
      );
    }

    if (
      lote.items.length !== cantidadEsperada ||
      lote.cantidad !== cantidadEsperada
    ) {
      return NextResponse.json(
        {
          error: `El lote contiene ${lote.items.length} IMEI y se esperaban ${cantidadEsperada}; no se realizo ningun cambio`,
        },
        { status: 409 }
      );
    }

    const totalItems = lote.items.reduce(
      (acumulado, item) => acumulado + Number(item.costo),
      0
    );
    const totalLote = Number(lote.total);

    if (Math.abs(totalItems - totalLote) > 0.01) {
      return NextResponse.json(
        {
          error: `El total del lote (${totalLote}) no coincide con sus IMEI (${totalItems}); no se realizo ningun cambio`,
        },
        { status: 409 }
      );
    }

    const fiscal = {
      nombre: texto(lote.sede.facturacionNombre),
      tipoDocumento: texto(lote.sede.facturacionTipoDocumento).toUpperCase(),
      documento: texto(lote.sede.facturacionDocumento),
      correo: texto(lote.sede.facturacionCorreo),
      telefono: texto(lote.sede.facturacionTelefono),
      direccion: texto(lote.sede.facturacionDireccion),
    };

    if (
      !fiscal.nombre ||
      !['NIT', 'CC', 'CE', 'PPT'].includes(fiscal.tipoDocumento) ||
      !fiscal.documento ||
      !fiscal.correo ||
      !fiscal.telefono ||
      !fiscal.direccion
    ) {
      return NextResponse.json(
        {
          error: `Los datos fiscales de ${lote.sede.nombre} estan incompletos; no se genero una NC`,
        },
        { status: 409 }
      );
    }

    const sedeSiigo = usarConfiguracionOriginalOnline
      ? await prisma.sede.findFirst({
          where: {
            OR: [
              { nombre: { equals: "ONLINE", mode: "insensitive" } },
              { codigo: { equals: "ONLINE", mode: "insensitive" } },
            ],
          },
          select: SIIGO_SEDE_SELECT,
        })
      : await prisma.sede.findUnique({
          where: { id: lote.sedeId },
          select: SIIGO_SEDE_SELECT,
        });

    if (!sedeSiigo) {
      return NextResponse.json(
        { error: "No fue posible cargar la configuracion Siigo original" },
        { status: 409 }
      );
    }

    const invoiceCreatedAt = lote.siigoInvoiceCreatedAt || lote.createdAt;
    let notaCredito = await buscarNotaCreditoVerificada({
      invoiceId,
      invoiceName: facturaNombre,
      invoiceCreatedAt,
    });
    let notaCreadaEnEstaSolicitud = false;

    if (!notaCredito) {
      const creada = await createSiigoCreditNoteForRegistro(
        {
          id: lote.id,
          createdAt: lote.createdAt,
          puntoVenta: lote.sede.nombre,
          clienteNombre: fiscal.nombre,
          tipoDocumento: fiscal.tipoDocumento,
          documentoNumero: fiscal.documento,
          correo: fiscal.correo,
          whatsapp: fiscal.telefono,
          direccion: fiscal.direccion,
          plataformaCredito: "FACTURA INVENTARIO STAND",
          creditoAutorizado: totalLote,
          cuotaInicial: 0,
          medioPago1Tipo: "CREDITO",
          medioPago1Valor: totalLote,
          referenciaEquipo: `${lote.cantidad} equipos para ${lote.sede.nombre}`,
          tipoEquipo: "NUEVO",
          tipoProducto: "MIXTO",
          siigoItems: lote.items.map((item) => ({
            referencia: item.referencia,
            imei: item.imei,
            price: Number(item.costo),
            tipoProducto: item.tipoProducto,
          })),
          siigoIdempotencyKey: `CSTANDNC${lote.id}N1`,
          siigoObservaciones: [
            `Nota credito total de ${facturaNombre}`,
            `Lote CONECTAMOS #${lote.id}`,
            `${lote.cantidad} equipos para ${lote.sede.nombre}`,
          ].join(" | "),
          sede: sedeSiigo,
        },
        invoiceId,
        facturaNombre
      );
      const label = getSiigoCreditNoteLabel(creada);

      if (!creada.id || !label) {
        throw new Error(
          "Siigo creo la nota credito, pero no retorno identificador suficiente"
        );
      }

      notaCreadaEnEstaSolicitud = true;
      notaCredito = await buscarNotaCreditoVerificada({
        invoiceId,
        invoiceName: facturaNombre,
        invoiceCreatedAt,
      });

      if (!notaCredito) {
        return NextResponse.json(
          {
            ok: true,
            pendienteVerificacion: true,
            factura: facturaNombre,
            notaCredito: label,
            mensaje:
              "Siigo creo la nota credito. Los IMEI siguen bloqueados hasta que Siigo permita verificarla; reintenta esta misma operacion.",
          },
          { status: 202 }
        );
      }
    }

    const notaCreditoVerificada = notaCredito;
    const itemsAnulados = lote.items.map((item) => ({
      inventarioSedeId: item.inventarioSedeId,
      imei: item.imei,
      referencia: item.referencia,
      tipoProducto: item.tipoProducto,
      color: item.color,
      costo: Number(item.costo),
      createdAt: item.createdAt.toISOString(),
    }));
    const liberadoPor = `${user.nombre} (${rol})`;

    await prisma.$transaction(async (tx) => {
      const actualizado = await tx.facturaInventarioStand.updateMany({
        where: { id: lote.id, estado: "EMITIDA" },
        data: {
          estado: "ANULADA",
          siigoCreditNoteId: notaCreditoVerificada.id,
          siigoCreditNoteName: notaCreditoVerificada.name,
          siigoCreditNoteStatus: notaCreditoVerificada.status,
          siigoCreditNoteUrl: notaCreditoVerificada.url,
          siigoCreditNoteCreatedAt: notaCreditoVerificada.createdAt || new Date(),
          itemsAnulados,
          itemsLiberadosAt: new Date(),
          itemsLiberadosPor: liberadoPor,
        },
      });

      if (actualizado.count !== 1) {
        throw new Error(
          "El lote cambio de estado durante la operacion; no se liberaron los IMEI"
        );
      }

      const liberados = await tx.facturaInventarioStandItem.deleteMany({
        where: { facturaId: lote.id },
      });

      if (liberados.count !== cantidadEsperada) {
        throw new Error(
          `Se esperaban ${cantidadEsperada} vinculos y se encontraron ${liberados.count}; la operacion fue revertida`
        );
      }
    });

    return NextResponse.json({
      ok: true,
      yaProcesada: !notaCreadaEnEstaSolicitud,
      factura: facturaNombre,
      total: totalLote,
      cantidadLiberada: cantidadEsperada,
      notaCredito: {
        id: notaCreditoVerificada.id,
        nombre: notaCreditoVerificada.name,
        estado: notaCreditoVerificada.status,
        url: notaCreditoVerificada.url,
      },
      mensaje: `Nota credito ${notaCreditoVerificada.name || notaCreditoVerificada.id} verificada. Los ${cantidadEsperada} IMEI quedaron disponibles para una nueva factura.`,
    });
  } catch (error) {
    console.error("ERROR NOTA CREDITO FACTURA STAND:", error);

    return NextResponse.json(
      { error: getSiigoErrorMessage(error) },
      { status: getSiigoErrorStatus(error) }
    );
  }
}
