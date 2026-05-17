import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederPanelVendedor, esRolAdministrativo } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import {
  normalizarImei,
  normalizarTextoCorto,
} from "@/lib/vendor-sale-records";

const DUPLICADO_SELECT = {
  id: true,
  clienteNombre: true,
  documentoNumero: true,
  serialImei: true,
  plataformaCredito: true,
  puntoVenta: true,
  estadoVentaRegistro: true,
  createdAt: true,
  perfilVendedor: {
    select: {
      nombre: true,
    },
  },
  sede: {
    select: {
      nombre: true,
    },
  },
} as const;

async function requireVendorAccess() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (
    !puedeAccederPanelVendedor(session.perfilTipo, session.rolNombre) ||
    (!session.perfilId && !esRolAdministrativo(session.rolNombre))
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "No tienes permiso para consultar registros" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireVendorAccess();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const { searchParams } = new URL(req.url);
    const documentoNumero = normalizarTextoCorto(searchParams.get("documento"));
    const serialImei = normalizarImei(searchParams.get("imei"));
    const excluirId = Number(searchParams.get("excluirId") || 0);

    if (!documentoNumero || !serialImei) {
      return NextResponse.json({ ok: true, duplicado: null });
    }

    const duplicado = await prisma.registroVendedorVenta.findFirst({
      where: {
        documentoNumero,
        serialImei,
        eliminadoEn: null,
        ...(Number.isInteger(excluirId) && excluirId > 0
          ? { id: { not: excluirId } }
          : {}),
      },
      select: DUPLICADO_SELECT,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      ok: true,
      duplicado: duplicado
        ? {
            id: duplicado.id,
            clienteNombre: duplicado.clienteNombre,
            documentoNumero: duplicado.documentoNumero,
            serialImei: duplicado.serialImei,
            plataformaCredito: duplicado.plataformaCredito,
            puntoVenta: duplicado.puntoVenta,
            estadoVentaRegistro: duplicado.estadoVentaRegistro,
            createdAt: duplicado.createdAt.toISOString(),
            perfilVendedorNombre: duplicado.perfilVendedor?.nombre ?? null,
            sedeNombre: duplicado.sede?.nombre ?? null,
          }
        : null,
    });
  } catch (error) {
    console.error("ERROR GET REGISTRO DUPLICADO:", error);
    return NextResponse.json(
      { error: "Error consultando duplicados del registro" },
      { status: 500 }
    );
  }
}
