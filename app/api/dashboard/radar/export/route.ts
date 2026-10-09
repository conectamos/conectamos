import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import {
  esPerfilApoyoOperativo,
  esPerfilSupervisor,
  esRolAdministrativo,
  normalizarRolNombre,
} from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildPrincipalWarehouseAvailability } from "@/lib/radar-inventory-export";
import { getAdminInventorySummary } from "@/lib/dashboard-inventory-summary";
import { buildRadarView, type RadarLocationFilter } from "@/lib/radar-inventory-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canAccessRadar(session: {
  rolNombre?: string | null;
  perfilTipo?: string | null;
}) {
  return (
    esRolAdministrativo(session.rolNombre) ||
    esPerfilSupervisor(session.perfilTipo) ||
    esPerfilApoyoOperativo(session.perfilTipo) ||
    normalizarRolNombre(session.rolNombre) === "SUPERVISOR"
  );
}

function bogotaDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function styleConsultationWorksheet(worksheet: ExcelJS.Worksheet) {
  const header = worksheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF11161D" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FFE30613" } },
      right: { style: "thin", color: { argb: "FF64748B" } },
    };
  });
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 24;
    row.eachCell((cell, columnNumber) => {
      cell.alignment = {
        vertical: "middle",
        horizontal: columnNumber > 2 && typeof cell.value === "number" ? "right" : "left",
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  };
}

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!canAccessRadar(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const search = params.get("q")?.slice(0, 100) ?? "";

    if (params.get("alcance") === "consulta") {
      const requestedLocation = params.get("ubicacion");
      const location: RadarLocationFilter = requestedLocation === "PRINCIPAL" || requestedLocation === "SEDES"
        ? requestedLocation
        : "TODAS";
      const esAdmin = esRolAdministrativo(session.rolNombre);
      const esSupervisor = esPerfilSupervisor(session.perfilTipo) || normalizarRolNombre(session.rolNombre) === "SUPERVISOR";
      const summary = await getAdminInventorySummary({
        ocultarPuntosRetiradosSupervisor: !esAdmin && esSupervisor,
      });
      const view = buildRadarView(summary, {
        search,
        location,
        brand: params.get("marca")?.slice(0, 100) || "TODAS",
      });
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "CONECTAMOS.APP";
      workbook.created = new Date();
      workbook.modified = new Date();
      const worksheet = workbook.addWorksheet("Disponibilidad", {
        views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
      });
      worksheet.columns = [
        { header: "MARCA", key: "marca", width: 22 },
        { header: "REFERENCIA", key: "referencia", width: 46 },
        { header: "BODEGA PRINCIPAL", key: "bodegaPrincipal", width: 24, style: { numFmt: "#,##0" } },
        { header: "UNIDADES EN SEDES", key: "sedes", width: 24, style: { numFmt: "#,##0" } },
        { header: "TOTAL DISPONIBLE", key: "total", width: 24, style: { numFmt: "#,##0" } },
      ];
      view.references.forEach((reference) => worksheet.addRow(reference));
      styleConsultationWorksheet(worksheet);

      const distribution = workbook.addWorksheet("Distribución", {
        views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
      });
      distribution.columns = [
        { header: "MARCA", key: "marca", width: 22 },
        { header: "REFERENCIA", key: "referencia", width: 46 },
        { header: "UBICACIÓN", key: "ubicacion", width: 34 },
        { header: "UNIDADES DISPONIBLES", key: "cantidad", width: 26, style: { numFmt: "#,##0" } },
      ];
      for (const reference of view.references) {
        if (reference.bodegaPrincipal > 0) {
          distribution.addRow({
            marca: reference.marca,
            referencia: reference.referencia,
            ubicacion: "Bodega principal",
            cantidad: reference.bodegaPrincipal,
          });
        }
        for (const sede of reference.sedesDetalle) {
          distribution.addRow({
            marca: reference.marca,
            referencia: reference.referencia,
            ubicacion: sede.sede,
            cantidad: sede.total,
          });
        }
      }
      styleConsultationWorksheet(distribution);
      const buffer = await workbook.xlsx.writeBuffer();

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="radar-inventario-${bogotaDateKey()}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const inventory = await prisma.inventarioPrincipal.findMany({
      where: {
        estado: "BODEGA",
      },
      select: {
        referencia: true,
      },
    });
    const rows = buildPrincipalWarehouseAvailability(inventory, search);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CONECTAMOS.APP";
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet("Bodega principal", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    });
    worksheet.columns = [
      { header: "REFERENCIA", key: "referencia", width: 44 },
      {
        header: "CANTIDAD DISPONIBLE",
        key: "cantidad",
        width: 24,
        style: { numFmt: "#,##0" },
      },
    ];
    rows.forEach((row) => worksheet.addRow(row));

    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF11161D" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FFE30613" } },
      };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.height = 22;
      row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
      row.getCell(2).alignment = { vertical: "middle", horizontal: "right" };
      row.eachCell((cell) => {
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    worksheet.autoFilter = "A1:B1";
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="disponibilidad-bodega-principal-${bogotaDateKey()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exportando disponibilidad de bodega principal", error);
    return NextResponse.json(
      { error: "No se pudo generar el archivo de bodega principal" },
      { status: 500 }
    );
  }
}
