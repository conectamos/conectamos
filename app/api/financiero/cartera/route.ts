import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  esRolAdmin,
  puedeAccederModulosOperativos,
} from "@/lib/access-control";
import { requireFinancialAccess } from "@/lib/financial-access";
import {
  CarteraRequestConflictError,
  registrarGastoCarteraUnaVez,
} from "@/lib/cartera-expense-registration";
import prisma from "@/lib/prisma";

const CONCEPTO_GASTO_CARTERA = "GASTO CARTERA";
const VENTANA_BUSQUEDA_MS = 1000 * 60 * 10;

type GastoBase = {
  createdAt: Date;
  id: number;
  observacion: string | null;
  sedeId: number;
  valor: number;
};

type MovimientoLookupTx = Pick<typeof prisma, "cajaMovimiento">;

function normalizarNumero(valor: unknown) {
  return Number(valor || 0);
}

function numeroValido(valor: unknown) {
  return typeof valor === "number" || typeof valor === "string"
    ? Number(valor)
    : NaN;
}

function idValido(valor: unknown) {
  const numero = numeroValido(valor);
  return Number.isSafeInteger(numero) && numero > 0;
}

async function leerObjeto(req: Request) {
  try {
    const parsed: unknown = await req.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

class MovimientoCarteraAmbiguoError extends Error {}

async function buscarMovimientoCajaRelacionado(
  tx: MovimientoLookupTx,
  gasto: GastoBase
) {
  const marcador = `${CONCEPTO_GASTO_CARTERA} #${gasto.id}`;

  const movimientoMarcado = await tx.cajaMovimiento.findFirst({
    where: {
      concepto: CONCEPTO_GASTO_CARTERA,
      OR: [
        { descripcion: marcador },
        ...[" ", ":", "|", "·", "\n", "\r", "\t"].map(separador => ({
          descripcion: { startsWith: `${marcador}${separador}` },
        })),
      ],
    },
    select: {
      id: true,
      descripcion: true,
      createdAt: true,
    },
    orderBy: {
      id: "desc",
    },
  });

  if (movimientoMarcado) {
    return movimientoMarcado;
  }

  const ventanaInicio = new Date(gasto.createdAt.getTime() - VENTANA_BUSQUEDA_MS);
  const ventanaFin = new Date(gasto.createdAt.getTime() + VENTANA_BUSQUEDA_MS);

  const descripcionEsperada = String(gasto.observacion || "").trim();

  const afinidad = (item: { createdAt: Date; descripcion: string | null }) => {
    const diffTiempo = Math.abs(item.createdAt.getTime() - gasto.createdAt.getTime());
    return diffTiempo + (String(item.descripcion || "").trim() === descripcionEsperada ? -1000000 : 0);
  };
  const elegirCandidato = <T extends { createdAt: Date; descripcion: string | null }>(items: T[]) => {
    const candidatos = items.filter(item => {
      const idMarcado = /^GASTO CARTERA #(\d+)/.exec(String(item.descripcion || "").trimStart());
      return !idMarcado || Number(idMarcado[1]) === gasto.id;
    }).sort((a, b) => afinidad(a) - afinidad(b));
    if (candidatos.length > 1 && afinidad(candidatos[0]) === afinidad(candidatos[1])) {
      throw new MovimientoCarteraAmbiguoError("El movimiento de caja asociado requiere revisión antes de modificar este gasto");
    }
    return candidatos[0] ?? null;
  };

  const candidatos = await tx.cajaMovimiento.findMany({
    where: {
      tipo: "EGRESO",
      concepto: CONCEPTO_GASTO_CARTERA,
      sedeId: gasto.sedeId,
      valor: gasto.valor,
      createdAt: {
        gte: ventanaInicio,
        lte: ventanaFin,
      },
    },
    select: {
      id: true,
      descripcion: true,
      createdAt: true,
    },
    orderBy: {
      id: "desc",
    },
    take: 25,
  });

  const candidato = elegirCandidato(candidatos);
  if (candidato) {
    return candidato;
  }

  const candidatosAmplios = await tx.cajaMovimiento.findMany({
    where: {
      tipo: "EGRESO",
      concepto: CONCEPTO_GASTO_CARTERA,
      sedeId: gasto.sedeId,
      valor: gasto.valor,
    },
    select: {
      id: true,
      descripcion: true,
      createdAt: true,
    },
    orderBy: {
      id: "desc",
    },
    take: 50,
  });

  return elegirCandidato(candidatosAmplios);
}

export async function GET(req: Request) {
  try {
    const access = await requireFinancialAccess();

    if (!access.ok) {
      access.response.headers.set("Cache-Control", "no-store");
      return access.response;
    }

    const { user, esAdmin } = access;

    const url = new URL(req.url);
    const sedeIdParam = url.searchParams.get("sedeId");

    let where: { sedeId?: number } = {};

    if (esAdmin) {
      if (sedeIdParam && !idValido(sedeIdParam)) {
        return NextResponse.json({ error: "Sede invalida" }, { status: 400, headers: { "Cache-Control": "no-store" } });
      }
      if (sedeIdParam) {
        where = { sedeId: Number(sedeIdParam) };
      }
    } else {
      if (!idValido(user.sedeId)) {
        return NextResponse.json({ error: "No tienes una sede autorizada" }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      where = { sedeId: user.sedeId };
    }

    const gastos = await prisma.gastoCartera.findMany({
      where,
      select: {
        id: true,
        valor: true,
        observacion: true,
        sedeId: true,
        createdAt: true,
        sede: {
          select: {
            nombre: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    const totalGastosCartera = gastos.reduce(
      (acc, item) => acc + normalizarNumero(item.valor),
      0
    );

    return NextResponse.json({
      ok: true,
      total: totalGastosCartera,
      items: gastos,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("ERROR LISTANDO GASTOS DE CARTERA:", error);
    return NextResponse.json(
      { error: "Error cargando gastos de cartera" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(req: Request) {
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
        { error: "Este perfil no puede registrar cartera" },
        { status: 403 }
      );
    }

    const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").trim().toUpperCase());
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON invalido");
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Los datos del gasto no son validos" }, { status: 400 });
    }

    const valor = (typeof body.valor === "number" || typeof body.valor === "string")
      ? normalizarNumero(body.valor)
      : NaN;
    const observacion = String(body.observacion || "").trim();
    const sedeIdBody = normalizarNumero(body.sedeId);

    if (body.sedeId != null && body.sedeId !== "" && (
      !["string", "number"].includes(typeof body.sedeId) || !Number.isSafeInteger(sedeIdBody) || sedeIdBody <= 0
    )) {
      return NextResponse.json({ error: "Sede invalida" }, { status: 400 });
    }
    if (!esAdmin && sedeIdBody > 0 && sedeIdBody !== user.sedeId) {
      return NextResponse.json({ error: "No tienes permiso para registrar gastos en esa sede" }, { status: 403 });
    }

    let sedeId = user.sedeId;

    if (esAdmin && sedeIdBody > 0) {
      sedeId = sedeIdBody;
    }

    if (!Number.isSafeInteger(sedeId) || sedeId <= 0) {
      return NextResponse.json(
        { error: "Sede invalida" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json(
        { error: "El valor debe ser mayor que 0" },
        { status: 400 }
      );
    }

    const headerKey = String(req.headers.get("idempotency-key") || "").trim();
    const bodyKey = String(body.idempotencyKey || "").trim();
    if (headerKey && bodyKey && headerKey !== bodyKey) {
      return NextResponse.json({ error: "La clave del intento no coincide", codigo: "IDEMPOTENCIA_CONFLICTO" }, { status: 409 });
    }
    const clave = headerKey || bodyKey;
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(clave)) {
      return NextResponse.json({ error: "El intento de registro no es valido. Actualiza la pagina e intenta de nuevo." }, { status: 400 });
    }

    const sedeExiste = await prisma.sede.findUnique({
      where: { id: sedeId },
      select: { id: true },
    });

    if (!sedeExiste) {
      return NextResponse.json(
        { error: "La sede no existe" },
        { status: 404 }
      );
    }

    const resultado = await registrarGastoCarteraUnaVez({
      usuarioId: user.id,
      clave,
      valor,
      observacion: observacion || null,
      sedeId,
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Gasto de cartera registrado correctamente",
      item: resultado.item,
      replayed: resultado.replayed,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CarteraRequestConflictError) {
      return NextResponse.json({ error: error.message, codigo: "IDEMPOTENCIA_CONFLICTO" }, { status: 409 });
    }
    console.error("ERROR REGISTRANDO GASTO DE CARTERA:", error);
    return NextResponse.json(
      { error: "Error registrando gasto de cartera" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const access = await requireFinancialAccess();

    if (!access.ok) {
      return access.response;
    }

    if (!access.esAdmin) {
      return NextResponse.json(
        { error: "Solo el administrador puede editar cartera" },
        { status: 403 }
      );
    }

    const body = await leerObjeto(req);
    if (!body) {
      return NextResponse.json({ error: "Los datos del gasto no son validos" }, { status: 400 });
    }
    if (body.observacion != null && typeof body.observacion !== "string") {
      return NextResponse.json({ error: "La observacion no es valida" }, { status: 400 });
    }
    const id = numeroValido(body.id);
    const valor = numeroValido(body.valor);
    const observacion = String(body.observacion || "").trim();
    const sedeId = numeroValido(body.sedeId);

    if (!idValido(body.id)) {
      return NextResponse.json(
        { error: "ID invalido" },
        { status: 400 }
      );
    }

    if (!idValido(body.sedeId)) {
      return NextResponse.json(
        { error: "Sede invalida" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(valor) || valor === 0) {
      return NextResponse.json(
        { error: "El valor debe ser diferente de 0" },
        { status: 400 }
      );
    }

    const sedeExiste = await prisma.sede.findUnique({
      where: { id: sedeId },
      select: { id: true },
    });

    if (!sedeExiste) {
      return NextResponse.json(
        { error: "La sede no existe" },
        { status: 404 }
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GastoCartera" WHERE id = ${id} FOR UPDATE`;
      const gastoExistente = await tx.gastoCartera.findUnique({
        where: { id },
        select: {
          id: true,
          valor: true,
          observacion: true,
          sedeId: true,
          createdAt: true,
        },
      });

      if (!gastoExistente) {
        return null;
      }

      const movimientoRelacionado = await buscarMovimientoCajaRelacionado(
        tx,
        gastoExistente
      );

      const gastoActualizado = await tx.gastoCartera.update({
        where: { id },
        data: {
          valor,
          observacion: observacion || null,
          sedeId,
        },
        select: {
          id: true,
          valor: true,
          observacion: true,
          sedeId: true,
          updatedAt: true,
        },
      });

      if (movimientoRelacionado) {
        await tx.cajaMovimiento.delete({
          where: { id: movimientoRelacionado.id },
        });
      }

      return gastoActualizado;
    });

    if (!resultado) {
      return NextResponse.json(
        { error: "Gasto de cartera no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Gasto de cartera actualizado correctamente",
      item: resultado,
    });
  } catch (error) {
    if (error instanceof MovimientoCarteraAmbiguoError) {
      return NextResponse.json({ error: error.message, codigo: "MOVIMIENTO_AMBIGUO" }, { status: 409 });
    }
    console.error("ERROR ACTUALIZANDO GASTO DE CARTERA:", error);
    return NextResponse.json(
      { error: "Error actualizando gasto de cartera" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const access = await requireFinancialAccess();

    if (!access.ok) {
      return access.response;
    }

    if (!esRolAdmin(access.user.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el administrador puede eliminar cartera" },
        { status: 403 }
      );
    }

    const body = await leerObjeto(req);
    if (!body) {
      return NextResponse.json({ error: "Los datos del gasto no son validos" }, { status: 400 });
    }
    const id = numeroValido(body.id);

    if (!idValido(body.id)) {
      return NextResponse.json(
        { error: "ID invalido" },
        { status: 400 }
      );
    }

    const eliminado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GastoCartera" WHERE id = ${id} FOR UPDATE`;
      const gastoExistente = await tx.gastoCartera.findUnique({
        where: { id },
        select: {
          id: true,
          valor: true,
          observacion: true,
          sedeId: true,
          createdAt: true,
        },
      });

      if (!gastoExistente) {
        return false;
      }

      const movimientoRelacionado = await buscarMovimientoCajaRelacionado(
        tx,
        gastoExistente
      );

      await tx.gastoCartera.delete({
        where: { id },
      });

      if (movimientoRelacionado) {
        await tx.cajaMovimiento.delete({
          where: { id: movimientoRelacionado.id },
        });
      }

      return true;
    });

    if (!eliminado) {
      return NextResponse.json(
        { error: "Gasto de cartera no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Gasto de cartera eliminado correctamente",
    });
  } catch (error) {
    if (error instanceof MovimientoCarteraAmbiguoError) {
      return NextResponse.json({ error: error.message, codigo: "MOVIMIENTO_AMBIGUO" }, { status: 409 });
    }
    console.error("ERROR ELIMINANDO GASTO DE CARTERA:", error);
    return NextResponse.json(
      { error: "Error eliminando gasto de cartera" },
      { status: 500 }
    );
  }
}
