import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { esPerfilFacturador } from "@/lib/access-control";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import { normalizarTextoCorto } from "@/lib/vendor-sale-records";

async function requireFacturador() {
  const session = await getSessionUser();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!esPerfilFacturador(session.perfilTipo)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo el perfil facturador puede usar este modulo" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, session };
}

export async function GET() {
  try {
    const access = await requireFacturador();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const registros = await prisma.registroVendedorVenta.findMany({
      where: {
        sedeId: access.session.sedeId,
      },
      select: {
        id: true,
        createdAt: true,
        puntoVenta: true,
        clienteNombre: true,
        tipoDocumento: true,
        documentoNumero: true,
        plataformaCredito: true,
        referenciaEquipo: true,
        serialImei: true,
        tipoEquipo: true,
        jaladorNombre: true,
        numeroFactura: true,
        financierasDetalle: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      ok: true,
      registros,
    });
  } catch (error) {
    console.error("ERROR GET REGISTROS FACTURADOR:", error);
    return NextResponse.json(
      { error: "Error cargando registros para facturacion" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const access = await requireFacturador();

    if (!access.ok) {
      return access.response;
    }

    await ensureVendorProfilesSchema();

    const body = (await req.json()) as Record<string, unknown>;
    const id = Number(body.id);
    const numeroFactura = normalizarTextoCorto(body.numeroFactura);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Registro invalido" }, { status: 400 });
    }

    if (!numeroFactura) {
      return NextResponse.json(
        { error: "Debes ingresar el numero de factura" },
        { status: 400 }
      );
    }

    const existente = await prisma.registroVendedorVenta.findFirst({
      where: {
        id,
        sedeId: access.session.sedeId,
      },
      select: {
        id: true,
      },
    });

    if (!existente) {
      return NextResponse.json(
        { error: "Registro no encontrado en esta sede" },
        { status: 404 }
      );
    }

    const actualizado = await prisma.registroVendedorVenta.update({
      where: { id },
      data: { numeroFactura },
      select: {
        id: true,
        numeroFactura: true,
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Numero de factura actualizado",
      registro: actualizado,
    });
  } catch (error) {
    console.error("ERROR PATCH REGISTROS FACTURADOR:", error);
    return NextResponse.json(
      { error: "Error actualizando numero de factura" },
      { status: 500 }
    );
  }
}
