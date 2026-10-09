import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  puedeAccederModulosOperativos,
  puedeEliminarRegistros,
} from "@/lib/access-control";
import {
  buildCajaWhere,
  CAJA_MOVIMIENTO_SELECT,
  esMovimientoEditable,
  normalizarConcepto,
  parseCajaPagination,
  parseLimit,
  parseMovimientoId,
  parseSedeId,
} from "@/lib/caja-movimientos";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no tiene acceso a caja" },
        { status: 403 }
      );
    }

    const esAdmin = ["ADMIN", "AUDITOR"].includes(user.rolNombre.toUpperCase());
    const requestUrl = new URL(req.url);
    const sedeIdFiltro = parseSedeId(requestUrl.searchParams.get("sedeId"));
    const limit = parseLimit(requestUrl.searchParams.get("limit"));
    const paginado = requestUrl.searchParams.get("paginated") === "1";
    const incluirGestion = requestUrl.searchParams.get("resumenGestion") === "1";
    const incluirResumen = ["1", "true", "si"].includes(
      String(requestUrl.searchParams.get("resumen") || "").trim().toLowerCase()
    );
    const filtros = buildCajaWhere({
      esAdmin,
      sedeIdUsuario: user.sedeId,
      sedeIdFiltro,
      fechaDesde: requestUrl.searchParams.get("fechaDesde"),
      fechaHasta: requestUrl.searchParams.get("fechaHasta"),
      ...(paginado ? { busqueda: requestUrl.searchParams.get("q") } : {}),
    });

    if ("error" in filtros) {
      return NextResponse.json({ error: filtros.error }, { status: 400 });
    }

    if (paginado) {
      const pagination = parseCajaPagination(
        requestUrl.searchParams.get("page"),
        requestUrl.searchParams.get("pageSize")
      );
      const [total, resumenes, ultimoMovimiento, conceptosGestion] = await Promise.all([
        prisma.cajaMovimiento.count({ where: filtros.where }),
        prisma.cajaMovimiento.groupBy({
          by: ["tipo"],
          where: filtros.where,
          _sum: { valor: true },
        }),
        prisma.cajaMovimiento.findFirst({
          where: filtros.where,
          orderBy: { id: "desc" },
          select: CAJA_MOVIMIENTO_SELECT,
        }),
        incluirGestion
          ? prisma.cajaMovimiento.groupBy({
              by: ["concepto"],
              where: filtros.where,
              _count: { _all: true },
            })
          : Promise.resolve([]),
      ]);
      const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
      const page = Math.min(pagination.page, totalPages);
      const movimientos = await prisma.cajaMovimiento.findMany({
        where: filtros.where,
        orderBy: { id: "desc" },
        skip: (page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        select: CAJA_MOVIMIENTO_SELECT,
      });
      const totalIngresos = Number(
        resumenes.find((item) => item.tipo === "INGRESO")?._sum.valor || 0
      );
      const totalEgresos = Number(
        resumenes.find((item) => item.tipo === "EGRESO")?._sum.valor || 0
      );
      const gestion = conceptosGestion.reduce(
        (totales, grupo) => {
          const cantidad = grupo._count._all;
          totales.totalMovimientos += cantidad;
          if (esMovimientoEditable(grupo.concepto)) {
            totales.totalManuales += cantidad;
          } else {
            totales.totalAutomaticos += cantidad;
          }
          return totales;
        },
        { totalMovimientos: 0, totalManuales: 0, totalAutomaticos: 0 }
      );

      return NextResponse.json({
        movimientos: movimientos.map((movimiento) => ({
          ...movimiento,
          editable: esMovimientoEditable(movimiento.concepto),
        })),
        resumen: {
          totalIngresos,
          totalEgresos,
          saldo: totalIngresos - totalEgresos,
          totalMovimientos: total,
        },
        ultimoMovimiento: ultimoMovimiento
          ? {
              ...ultimoMovimiento,
              editable: esMovimientoEditable(ultimoMovimiento.concepto),
            }
          : null,
        total,
        page,
        pageSize: pagination.pageSize,
        totalPages,
        rango: filtros.rango,
        ...(incluirGestion ? { gestion } : {}),
      });
    }

    const movimientosQuery =
      limit === 0
        ? Promise.resolve([])
        : prisma.cajaMovimiento.findMany({
            where: filtros.where,
            orderBy: { id: "desc" },
            take: limit,
            select: CAJA_MOVIMIENTO_SELECT,
          });

    if (incluirResumen) {
      const [movimientos, resumenes, totalMovimientos] = await Promise.all([
        movimientosQuery,
        prisma.cajaMovimiento.groupBy({
          by: ["tipo"],
          where: filtros.where,
          _sum: {
            valor: true,
          },
        }),
        prisma.cajaMovimiento.count({ where: filtros.where }),
      ]);
      const totalIngresos = Number(
        resumenes.find((item) => item.tipo === "INGRESO")?._sum.valor || 0
      );
      const totalEgresos = Number(
        resumenes.find((item) => item.tipo === "EGRESO")?._sum.valor || 0
      );

      return NextResponse.json({
        movimientos: movimientos.map((movimiento) => ({
          ...movimiento,
          editable: esMovimientoEditable(movimiento.concepto),
        })),
        resumen: {
          totalIngresos,
          totalEgresos,
          saldo: totalIngresos - totalEgresos,
          totalMovimientos,
        },
      });
    }

    const movimientos = await movimientosQuery;

    return NextResponse.json(
      movimientos.map((movimiento) => ({
        ...movimiento,
        editable: esMovimientoEditable(movimiento.concepto),
      }))
    );
  } catch (error) {
    console.error("ERROR GET CAJA:", error);
    return NextResponse.json(
      { error: "Error cargando caja" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede editar caja" },
        { status: 403 }
      );
    }

    if (!["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").toUpperCase())) {
      return NextResponse.json(
        { error: "Solo el administrador puede editar movimientos" },
        { status: 403 }
      );
    }

    const requestUrl = new URL(req.url);
    const queryId = parseMovimientoId(requestUrl.searchParams.get("id"));
    const body = (await req.json()) as Record<string, unknown>;
    const id = queryId ?? parseMovimientoId(String(body.id ?? ""));
    const tipo = String(body.tipo ?? "").trim().toUpperCase();
    const concepto = normalizarConcepto(body.concepto);
    const valor = Number(body.valor ?? 0);
    const descripcion = String(body.descripcion ?? "").trim();
    const sedeId = parseSedeId(String(body.sedeId ?? ""));

    if (!id) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    if (!["INGRESO", "EGRESO"].includes(tipo)) {
      return NextResponse.json(
        { error: "Tipo invalido. Debe ser INGRESO o EGRESO" },
        { status: 400 }
      );
    }

    if (!concepto) {
      return NextResponse.json(
        { error: "El concepto es obligatorio" },
        { status: 400 }
      );
    }

    if (!valor || valor <= 0) {
      return NextResponse.json(
        { error: "El valor debe ser mayor a 0" },
        { status: 400 }
      );
    }

    if (!sedeId) {
      return NextResponse.json({ error: "Sede invalida" }, { status: 400 });
    }

    const movimientoExistente = await prisma.cajaMovimiento.findUnique({
      where: { id },
      select: {
        id: true,
        concepto: true,
      },
    });

    if (!movimientoExistente) {
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      );
    }

    if (!esMovimientoEditable(movimientoExistente.concepto)) {
      return NextResponse.json(
        {
          error:
            "Este movimiento es automatico del sistema y no puede editarse desde Ingresos / Gastos",
        },
        { status: 403 }
      );
    }

    const movimiento = await prisma.cajaMovimiento.update({
      where: { id },
      data: {
        tipo,
        concepto,
        valor,
        descripcion: descripcion || null,
        sedeId,
      },
      include: {
        sede: {
          select: {
            nombre: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Movimiento actualizado correctamente",
      movimiento: {
        ...movimiento,
        editable: true,
      },
    });
  } catch (error) {
    console.error("ERROR PUT CAJA:", error);
    return NextResponse.json(
      { error: "Error actualizando movimiento de caja" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!puedeAccederModulosOperativos(user.perfilTipo)) {
      return NextResponse.json(
        { error: "Este perfil no puede eliminar movimientos de caja" },
        { status: 403 }
      );
    }

    if (!puedeEliminarRegistros(user.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el administrador puede eliminar movimientos" },
        { status: 403 }
      );
    }

    const requestUrl = new URL(req.url);
    const id = parseMovimientoId(requestUrl.searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const movimientoExistente = await prisma.cajaMovimiento.findUnique({
      where: { id },
      select: {
        id: true,
        concepto: true,
      },
    });

    if (!movimientoExistente) {
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      );
    }

    if (!esMovimientoEditable(movimientoExistente.concepto)) {
      return NextResponse.json(
        {
          error:
            "Este movimiento es automatico del sistema y no puede eliminarse desde Ingresos / Gastos",
        },
        { status: 403 }
      );
    }

    await prisma.cajaMovimiento.delete({
      where: { id },
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Movimiento eliminado correctamente",
    });
  } catch (error) {
    console.error("ERROR DELETE CAJA:", error);
    return NextResponse.json(
      { error: "Error eliminando movimiento de caja" },
      { status: 500 }
    );
  }
}
