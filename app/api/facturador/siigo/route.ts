import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getSiigoErrorMessage,
  getSiigoErrorStatus,
  getSiigoInvoiceLabel,
  SiigoConfigurationError,
  createSiigoInvoiceForRegistro,
} from "@/lib/siigo";
import {
  puedeAccederPanelFacturador,
} from "@/lib/access-control";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import prisma from "@/lib/prisma";

async function requireFacturador() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!puedeAccederPanelFacturador(session.perfilTipo, session.rolNombre)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo el perfil facturador o administrador puede usar este modulo" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, session };
}

function serializarRegistro(
  registro: {
    creditoAutorizado: unknown;
    cuotaInicial: unknown;
    medioPago1Valor?: unknown;
    medioPago2Valor?: unknown;
  } & Record<string, unknown>
) {
  return {
    ...registro,
    creditoAutorizado: registro.creditoAutorizado
      ? Number(registro.creditoAutorizado)
      : null,
    cuotaInicial: registro.cuotaInicial ? Number(registro.cuotaInicial) : null,
    medioPago1Valor: registro.medioPago1Valor
      ? Number(registro.medioPago1Valor)
      : null,
    medioPago2Valor: registro.medioPago2Valor
      ? Number(registro.medioPago2Valor)
      : null,
  };
}

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

const REGISTRO_FACTURADOR_SELECT = {
  id: true,
  createdAt: true,
  ciudad: true,
  puntoVenta: true,
  clienteNombre: true,
  tipoDocumento: true,
  documentoNumero: true,
  correo: true,
  whatsapp: true,
  direccion: true,
  barrio: true,
  plataformaCredito: true,
  creditoAutorizado: true,
  cuotaInicial: true,
  medioPago1Tipo: true,
  medioPago1Valor: true,
  medioPago2Tipo: true,
  medioPago2Valor: true,
  referenciaEquipo: true,
  serialImei: true,
  tipoEquipo: true,
  jaladorNombre: true,
  numeroFactura: true,
  estadoFacturacion: true,
  estadoVentaRegistro: true,
  ventaIdRelacionada: true,
  financierasDetalle: true,
  siigoInvoiceId: true,
  siigoInvoiceName: true,
  siigoInvoiceStatus: true,
  siigoInvoiceUrl: true,
  siigoInvoiceError: true,
  siigoInvoiceCreatedAt: true,
  sede: {
    select: SIIGO_SEDE_SELECT,
  },
} as const;

function esSedeOnline(sede: { nombre?: string | null; codigo?: string | null }) {
  const nombre = String(sede.nombre || "").trim().toUpperCase();
  const codigo = String(sede.codigo || "").trim().toUpperCase();

  return nombre === "ONLINE" || codigo === "ONLINE";
}

function usaResolucionOnline(sede: {
  nombre?: string | null;
  codigo?: string | null;
}) {
  const nombre = String(sede.nombre || "").trim().toUpperCase();
  const codigo = String(sede.codigo || "").trim().toUpperCase();

  return (
    esSedeOnline(sede) ||
    nombre.startsWith("STAND ") ||
    codigo.startsWith("STAND-")
  );
}

function describirConfiguracionSiigo(sede: {
  nombre?: string | null;
  codigo?: string | null;
  siigoInvoiceDocumentId?: number | null;
} | null) {
  if (!sede) {
    return "";
  }

  const partes = [
    `sede ${String(sede.nombre || "-").trim()}`,
    sede.codigo ? `codigo ${sede.codigo}` : null,
    sede.siigoInvoiceDocumentId
      ? `document.id ${sede.siigoInvoiceDocumentId}`
      : "sin document.id",
  ].filter(Boolean);

  return partes.join(" / ");
}

async function aplicarResolucionOnlineParaStands<
  T extends { sede: null | { nombre?: string | null; codigo?: string | null } },
>(registro: T): Promise<T> {
  if (!registro.sede || !usaResolucionOnline(registro.sede) || esSedeOnline(registro.sede)) {
    return registro;
  }

  const sedeOnline = await prisma.sede.findFirst({
    where: {
      OR: [
        {
          nombre: {
            equals: "ONLINE",
            mode: "insensitive",
          },
        },
        {
          codigo: {
            equals: "ONLINE",
            mode: "insensitive",
          },
        },
      ],
    },
    select: SIIGO_SEDE_SELECT,
  });

  if (!sedeOnline) {
    throw new SiigoConfigurationError([
      "crear o configurar la sede ONLINE para facturar stands",
    ]);
  }

  return {
    ...registro,
    sede: sedeOnline,
  };
}

export async function POST(req: Request) {
  let registroId: number | null = null;
  let contextoSiigo = "";

  try {
    const access = await requireFacturador();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const body = (await req.json()) as Record<string, unknown>;
    const id = Number(body.id);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Registro invalido" }, { status: 400 });
    }

    registroId = id;

    const registro = await prisma.registroVendedorVenta.findFirst({
      where: {
        id,
        eliminadoEn: null,
      },
      select: REGISTRO_FACTURADOR_SELECT,
    });

    if (!registro) {
      return NextResponse.json(
        { error: "Registro no encontrado" },
        { status: 404 }
      );
    }

    if (registro.siigoInvoiceId) {
      return NextResponse.json({
        ok: true,
        mensaje: "La factura ya fue emitida en Siigo",
        registro: serializarRegistro(registro),
      });
    }

    if (registro.numeroFactura) {
      return NextResponse.json(
        {
          error:
            "Este registro ya tiene numero de factura manual. Limpia o ajusta el registro antes de emitir en Siigo.",
        },
        { status: 400 }
      );
    }

    const registroParaSiigo = await aplicarResolucionOnlineParaStands(registro);
    contextoSiigo = describirConfiguracionSiigo(registroParaSiigo.sede);
    const invoice = await createSiigoInvoiceForRegistro(registroParaSiigo);
    const invoiceLabel = getSiigoInvoiceLabel(invoice);

    if (!invoice.id || !invoiceLabel) {
      return NextResponse.json(
        { error: "Siigo creo la factura, pero no retorno identificador suficiente" },
        { status: 502 }
      );
    }

    const actualizado = await prisma.registroVendedorVenta.update({
      where: { id },
      data: {
        numeroFactura: invoiceLabel,
        estadoFacturacion: "FACTURADO",
        siigoInvoiceId: invoice.id,
        siigoInvoiceName: invoiceLabel,
        siigoInvoiceStatus: invoice.status ?? null,
        siigoInvoiceUrl: invoice.public_url ?? null,
        siigoInvoiceError: null,
        siigoInvoiceCreatedAt: new Date(),
      },
      select: REGISTRO_FACTURADOR_SELECT,
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Factura emitida correctamente en Siigo",
      registro: serializarRegistro(actualizado),
      siigo: {
        id: invoice.id,
        name: invoiceLabel,
        status: invoice.status ?? null,
        publicUrl: invoice.public_url ?? null,
      },
    });
  } catch (error) {
    const baseMessage = getSiigoErrorMessage(error);
    const message = contextoSiigo
      ? `${baseMessage} Configuracion enviada: ${contextoSiigo}.`
      : baseMessage;
    let registroConError: unknown = null;

    console.error("ERROR POST FACTURADOR SIIGO:", error);

    if (registroId) {
      try {
        registroConError = await prisma.registroVendedorVenta.update({
          where: { id: registroId },
          data: {
            siigoInvoiceError: message.slice(0, 2000),
          },
          select: REGISTRO_FACTURADOR_SELECT,
        });
      } catch (updateError) {
        console.error("ERROR GUARDANDO ERROR SIIGO:", updateError);
      }
    }

    return NextResponse.json(
      {
        error: message,
        registro: registroConError
          ? serializarRegistro(
              registroConError as Parameters<typeof serializarRegistro>[0]
            )
          : null,
      },
      { status: getSiigoErrorStatus(error) }
    );
  }
}
