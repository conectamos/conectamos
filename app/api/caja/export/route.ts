import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";
import {
  buildCajaWhere,
  CAJA_MOVIMIENTO_SELECT,
  parseSedeId,
} from "@/lib/caja-movimientos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveCoverageLabel(options: {
  esAdmin: boolean;
  sedeIdFiltro: number | null;
  sedeSeleccionadaNombre?: string | null;
  sedeUsuarioNombre: string;
}) {
  if (!options.esAdmin) {
    return options.sedeUsuarioNombre || "Sede actual";
  }

  if (!options.sedeIdFiltro) {
    return "Todas las sedes";
  }

  return options.sedeSeleccionadaNombre || `Sede ${options.sedeIdFiltro}`;
}

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

    const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").toUpperCase());
    const requestUrl = new URL(req.url);
    const sedeIdFiltro = parseSedeId(requestUrl.searchParams.get("sedeId"));
    const filtros = buildCajaWhere({
      esAdmin,
      sedeIdUsuario: user.sedeId,
      sedeIdFiltro,
      fechaDesde: requestUrl.searchParams.get("fechaDesde"),
      fechaHasta: requestUrl.searchParams.get("fechaHasta"),
    });

    if ("error" in filtros) {
      return NextResponse.json({ error: filtros.error }, { status: 400 });
    }

    const sedeSeleccionada =
      esAdmin && sedeIdFiltro
        ? await prisma.sede.findUnique({
            where: { id: sedeIdFiltro },
            select: { nombre: true },
          })
        : null;

    const cobertura = resolveCoverageLabel({
      esAdmin,
      sedeIdFiltro,
      sedeSeleccionadaNombre: sedeSeleccionada?.nombre ?? null,
      sedeUsuarioNombre: user.sedeNombre,
    });

    const movimientos = await prisma.cajaMovimiento.findMany({
      where: filtros.where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: CAJA_MOVIMIENTO_SELECT,
    });

    const totalIngresos = movimientos
      .filter((movimiento) => String(movimiento.tipo || "").toUpperCase() === "INGRESO")
      .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
    const totalEgresos = movimientos
      .filter((movimiento) => String(movimiento.tipo || "").toUpperCase() === "EGRESO")
      .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
    const saldo = totalIngresos - totalEgresos;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CONECTAMOS.APP";
    workbook.created = new Date();
    workbook.modified = new Date();

    const resumen = workbook.addWorksheet("Resumen", {
      views: [{ showGridLines: false }],
    });

    resumen.columns = [
      { key: "label", width: 24 },
      { key: "value", width: 36 },
    ];

    resumen.mergeCells("A1:B1");
    resumen.mergeCells("A2:B2");
    resumen.getCell("A1").value = "CONECTAMOS";
    resumen.getCell("A2").value = "Exportacion de movimientos de caja";
    resumen.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF071122" } };
    resumen.getCell("A2").font = { bold: true, size: 12, color: { argb: "FF0F766E" } };

    const resumenRows = [
      ["Cobertura", cobertura],
      ["Periodo", filtros.rango.label],
      ["Movimientos exportados", movimientos.length],
      ["Total ingresos", totalIngresos],
      ["Total egresos", totalEgresos],
      ["Saldo", saldo],
      [
        "Generado",
        new Intl.DateTimeFormat("es-CO", {
          timeZone: "America/Bogota",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date()),
      ],
    ];

    resumenRows.forEach(([label, value], index) => {
      const rowIndex = index + 4;
      resumen.getCell(`A${rowIndex}`).value = label;
      resumen.getCell(`A${rowIndex}`).font = { bold: true, color: { argb: "FF334155" } };
      resumen.getCell(`B${rowIndex}`).value = value;
      resumen.getCell(`A${rowIndex}`).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
      resumen.getCell(`A${rowIndex}`).border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      resumen.getCell(`B${rowIndex}`).border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });

    ["B7", "B8", "B9"].forEach((cellRef) => {
      resumen.getCell(cellRef).numFmt = '"$" #,##0';
      resumen.getCell(cellRef).font = { bold: true };
    });

    const worksheet = workbook.addWorksheet("Movimientos", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    });

    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "FECHA", key: "fecha", width: 22, style: { numFmt: "dd/mm/yyyy hh:mm" } },
      { header: "SEDE", key: "sede", width: 28 },
      { header: "TIPO", key: "tipo", width: 14 },
      { header: "CONCEPTO", key: "concepto", width: 30 },
      { header: "VALOR", key: "valor", width: 18, style: { numFmt: '"$" #,##0' } },
      { header: "DESCRIPCION", key: "descripcion", width: 46 },
    ];

    movimientos.forEach((movimiento) => {
      worksheet.addRow({
        id: movimiento.id,
        fecha: new Date(movimiento.createdAt),
        sede: movimiento.sede?.nombre ?? "Sede sin configurar",
        tipo: movimiento.tipo,
        concepto: movimiento.concepto,
        valor: Number(movimiento.valor || 0),
        descripcion: movimiento.descripcion ?? "",
      });
    });

    const headerRow = worksheet.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF071122" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      row.height = 22;
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    if (movimientos.length === 0) {
      worksheet.addRow({
        concepto: "Sin movimientos para el filtro seleccionado",
      });
    }

    worksheet.autoFilter = {
      from: "A1",
      to: "G1",
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const coverageSlug = slugify(cobertura) || "cobertura";
    const fileName = `movimientos-caja-${coverageSlug}-${filtros.rango.key}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("ERROR EXPORTANDO CAJA:", error);
    return NextResponse.json(
      {
        error: "Error generando exportacion de caja",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
