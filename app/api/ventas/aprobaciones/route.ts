import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  esPerfilFacturador,
  esPerfilAdministrador,
  esPerfilVendedor,
  esRolAdmin,
} from "@/lib/access-control";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";

async function requireSalesApprovalAccess() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (esPerfilVendedor(session.perfilTipo) || esPerfilFacturador(session.perfilTipo)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Este panel es solo para supervisores y administradores" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, session };
}

function estadoVentaAbierto(estadoVentaRegistro: unknown) {
  const estado = String(estadoVentaRegistro || "").trim().toUpperCase();
  return estado !== "CONVERTIDO_EN_VENTA" && estado !== "CANCELADO";
}

function financierasRegistro(registro: {
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

function serializarRegistro<T extends { financierasDetalle: unknown }>(
  registro: T
) {
  return {
    ...registro,
    financierasDetalle: financierasRegistro(registro),
  };
}

function buildScopeWhere(session: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!session) {
    return {};
  }

  if (
    esPerfilAdministrador(session.perfilTipo) ||
    (!session.perfilId && esRolAdmin(session.rolNombre))
  ) {
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

export async function GET(req: Request) {
  try {
    const access = await requireSalesApprovalAccess();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const requestUrl = new URL(req.url);
    const id = Number(requestUrl.searchParams.get("id"));
    const busqueda = String(requestUrl.searchParams.get("q") || "").trim();
    const scopeWhere = buildScopeWhere(access.session);

    if (Number.isInteger(id) && id > 0) {
      const registro = await prisma.registroVendedorVenta.findFirst({
        where: {
          id,
          eliminadoEn: null,
          ventaIdRelacionada: null,
          ...scopeWhere,
        },
        select: {
          id: true,
          createdAt: true,
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
          serialImei: true,
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
        },
      });

      if (!registro || !estadoVentaAbierto(registro.estadoVentaRegistro)) {
        return NextResponse.json(
          { error: "Registro no disponible para aprobacion" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        registro: serializarRegistro(registro),
      });
    }

    const filtrosAnd: Array<Record<string, unknown>> = [
      {
        eliminadoEn: null,
        ventaIdRelacionada: null,
      },
    ];

    if ("OR" in scopeWhere) {
      filtrosAnd.push(scopeWhere);
    }

    if (busqueda) {
      filtrosAnd.push({
        OR: [
          {
            documentoNumero: {
              contains: busqueda,
              mode: "insensitive" as const,
            },
          },
          {
            serialImei: {
              contains: busqueda,
              mode: "insensitive" as const,
            },
          },
          {
            clienteNombre: {
              contains: busqueda,
              mode: "insensitive" as const,
            },
          },
        ],
      });
    }

    const registros = await prisma.registroVendedorVenta.findMany({
      where: {
        AND: filtrosAnd,
      },
      select: {
        id: true,
        createdAt: true,
        sedeId: true,
        puntoVenta: true,
        clienteNombre: true,
        tipoDocumento: true,
        documentoNumero: true,
        referenciaEquipo: true,
        serialImei: true,
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
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    const abiertos = registros
      .filter((registro) => estadoVentaAbierto(registro.estadoVentaRegistro))
      .map((registro) => serializarRegistro(registro));

    return NextResponse.json({
      ok: true,
      registros: abiertos,
    });
  } catch (error) {
    console.error("ERROR GET APROBACIONES VENTAS:", error);
    return NextResponse.json(
      { error: "Error cargando las aprobaciones de ventas" },
      { status: 500 }
    );
  }
}
