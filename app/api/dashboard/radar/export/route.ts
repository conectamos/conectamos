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

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!canAccessRadar(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const search = new URL(request.url).searchParams.get("q")?.slice(0, 100) ?? "";
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
