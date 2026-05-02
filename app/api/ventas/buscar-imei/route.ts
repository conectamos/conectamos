import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  esPerfilAdministrador,
  esRolAdmin,
  puedeAccederModulosOperativos,
} from "@/lib/access-control";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";

function puedeVerTodasLasSedes(session: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!session) {
    return false;
  }

  return esPerfilAdministrador(session.perfilTipo) || esRolAdmin(session.rolNombre);
}

function registroScopeWhere(
  session: Awaited<ReturnType<typeof getSessionUser>>
) {
  if (!session || puedeVerTodasLasSedes(session)) {
    return {};
  }

  return {
    OR: [
      { sedeId: session.sedeId },
      {
        puntoVenta: {
          equals: session.sedeNombre,
          mode: "insensitive" as const,
        },
      },
    ],
  };
}

const REGISTRO_VENTA_SELECT = {
  id: true,
  sedeId: true,
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
  plataformaCredito: true,
  creditoAutorizado: true,
  cuotaInicial: true,
  medioPago1Tipo: true,
  medioPago1Valor: true,
  medioPago2Tipo: true,
  medioPago2Valor: true,
  financierasDetalle: true,
  createdAt: true,
} as const;

function normalizarFinancierasRegistro(registro: {
  financierasDetalle: unknown;
  plataformaCredito?: unknown;
  creditoAutorizado?: unknown;
  cuotaInicial?: unknown;
  medioPago1Tipo?: unknown;
}) {
  const plataformaCredito = String(registro.plataformaCredito || "").trim();
  const plataformaNormalizada = plataformaCredito.toUpperCase();

  if (
    plataformaNormalizada === "CONTADO" ||
    plataformaNormalizada === "CONTADO CLARO" ||
    plataformaNormalizada === "CONTADO LIBRES"
  ) {
    return [];
  }

  if (Array.isArray(registro.financierasDetalle) && registro.financierasDetalle.length) {
    return registro.financierasDetalle;
  }

  return plataformaCredito
    ? [
        {
          plataformaCredito,
          creditoAutorizado: registro.creditoAutorizado ?? null,
          cuotaInicial: registro.cuotaInicial ?? null,
          tipoPagoInicial:
            typeof registro.medioPago1Tipo === "string"
              ? registro.medioPago1Tipo
              : null,
          valorCuota: null,
          numeroCuotas: null,
          frecuenciaCuota: null,
        },
      ]
    : [];
}

function serializarRegistroVenta<T extends { financierasDetalle: unknown }>(
  registro: T
) {
  return {
    ...registro,
    financierasDetalle: normalizarFinancierasRegistro(registro),
  };
}

async function buscarRegistroVentaAbierto(
  serial: string,
  session: Awaited<ReturnType<typeof getSessionUser>>,
  registroId?: number | null
) {
  await ensureVendorProfilesSchema();

  if (registroId) {
    const registro = await prisma.registroVendedorVenta.findFirst({
      where: {
        id: registroId,
        serialImei: serial,
        eliminadoEn: null,
        ventaIdRelacionada: null,
        ...registroScopeWhere(session),
      },
      select: REGISTRO_VENTA_SELECT,
    });

    if (!registro) {
      return null;
    }

    const estadoVentaRegistro = String(registro.estadoVentaRegistro || "")
      .trim()
      .toUpperCase();

    return estadoVentaRegistro !== "CANCELADO" &&
      estadoVentaRegistro !== "CONVERTIDO_EN_VENTA"
      ? serializarRegistroVenta(registro)
      : null;
  }

  if (!session) {
    return null;
  }

  const registros = await prisma.registroVendedorVenta.findMany({
    where: {
      serialImei: serial,
      eliminadoEn: null,
      ventaIdRelacionada: null,
      ...registroScopeWhere(session),
    },
    select: REGISTRO_VENTA_SELECT,
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
    ? serializarRegistroVenta(registro)
    : null;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede consultar IMEI para ventas" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const serial = String(body.serial ?? "").replace(/\D/g, "").slice(0, 15);
    const registroVendedorId = Number(body.registroVendedorId);
    const registroId =
      Number.isInteger(registroVendedorId) && registroVendedorId > 0
        ? registroVendedorId
        : null;

    if (!serial) {
      return NextResponse.json({ error: "IMEI invalido" }, { status: 400 });
    }

    const registroVenta = await buscarRegistroVentaAbierto(
      serial,
      user,
      registroId
    );
    const sedeVentaId = registroVenta?.sedeId ?? user.sedeId;

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
      const itemActual = inventarioSedes.find((item) => item.sedeId === sedeVentaId);

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
              "El equipo pertenece a otra sede. Solo se puede completar la venta si el IMEI existe en la sede donde se esta guardando la venta.",
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
