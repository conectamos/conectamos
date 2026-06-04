import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { esRolAdministrativo } from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import { extraerFinancierasDetalle } from "@/lib/ventas-financieras";
import {
  getBogotaMonthRangeFromInput,
  getCurrentBogotaMonthInput,
} from "@/lib/ventas-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINANCIAL_FIELDS = [
  "alcanos",
  "payjoy",
  "sistecredito",
  "addi",
  "sumaspay",
  "celya",
  "bogota",
  "alocredit",
  "esmio",
  "kaiowa",
  "finser",
  "gora",
] as const;

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resolveMonth(value: string | null) {
  const requested = value || getCurrentBogotaMonthInput();
  return getBogotaMonthRangeFromInput(requested);
}

function isWithinMonth(value: Date | null | undefined, range: { start: Date; end: Date }) {
  if (!value) return false;
  return value >= range.start && value < range.end;
}

function buildFinanceSource(
  registro: { financierasDetalle: unknown; plataformaCredito: string },
  venta?: Record<string, unknown>
) {
  return {
    financierasDetalle: registro.financierasDetalle ?? venta?.financierasDetalle,
    ...FINANCIAL_FIELDS.reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = venta?.[key];
      return acc;
    }, {}),
  };
}

function resolveFinancieras(
  registro: { financierasDetalle: unknown; plataformaCredito: string },
  venta?: Record<string, unknown>
) {
  const detalle = extraerFinancierasDetalle(buildFinanceSource(registro, venta));
  const names = new Set(
    detalle.map((item) => text(item.nombre).toUpperCase()).filter(Boolean)
  );
  const plataforma = text(registro.plataformaCredito).toUpperCase();

  if (plataforma && plataforma !== "SELECCIONAR") {
    names.add(plataforma);
  }

  return names.size ? Array.from(names).join(", ") : "SIN FINANCIERA";
}

export async function GET(req: Request) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!esRolAdministrativo(session.rolNombre)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const url = new URL(req.url);
    const period = resolveMonth(url.searchParams.get("period"));

    if (!period) {
      return NextResponse.json(
        { error: "Mes invalido. Usa formato YYYY-MM." },
        { status: 400 }
      );
    }

    const registros = await prisma.registroVendedorVenta.findMany({
      where: {
        eliminadoEn: null,
        ventaIdRelacionada: {
          not: null,
        },
      },
      select: {
        documentoNumero: true,
        clienteNombre: true,
        referenciaEquipo: true,
        serialImei: true,
        plataformaCredito: true,
        financierasDetalle: true,
        telefono: true,
        whatsapp: true,
        referenciaFamiliar1Nombre: true,
        referenciaFamiliar1Telefono: true,
        referenciaFamiliar2Nombre: true,
        referenciaFamiliar2Telefono: true,
        ventaIdRelacionada: true,
        convertidoEn: true,
        createdAt: true,
      },
      orderBy: [
        {
          convertidoEn: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });

    const ventaIds = Array.from(
      new Set(
        registros
          .map((registro) => registro.ventaIdRelacionada)
          .filter((id): id is number => typeof id === "number")
      )
    );

    const ventas = ventaIds.length
      ? await prisma.venta.findMany({
          where: {
            id: {
              in: ventaIds,
            },
          },
          select: {
            id: true,
            fecha: true,
            descripcion: true,
            serial: true,
            financierasDetalle: true,
            alcanos: true,
            payjoy: true,
            sistecredito: true,
            addi: true,
            sumaspay: true,
            celya: true,
            bogota: true,
            alocredit: true,
            esmio: true,
            kaiowa: true,
            finser: true,
            gora: true,
          },
        })
      : [];

    const ventasById = new Map(ventas.map((venta) => [venta.id, venta]));
    const rows = registros
      .map((registro) => {
        const venta = registro.ventaIdRelacionada
          ? ventasById.get(registro.ventaIdRelacionada)
          : undefined;
        const fechaBase = venta?.fecha ?? registro.convertidoEn;

        if (!isWithinMonth(fechaBase, period)) {
          return null;
        }

        return {
          cedula: text(registro.documentoNumero),
          nombre: text(registro.clienteNombre),
          referencia: text(registro.referenciaEquipo) || text(venta?.descripcion),
          imei: text(registro.serialImei) || text(venta?.serial),
          financiera: resolveFinancieras(registro, venta),
          telefono: text(registro.telefono) || text(registro.whatsapp),
          referencia1Nombre: text(registro.referenciaFamiliar1Nombre),
          referencia1Telefono: text(registro.referenciaFamiliar1Telefono),
          referencia2Nombre: text(registro.referenciaFamiliar2Nombre),
          referencia2Telefono: text(registro.referenciaFamiliar2Telefono),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CONECTAMOS.APP";
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet("Base de datos", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    });

    worksheet.columns = [
      { header: "CEDULA", key: "cedula", width: 18, style: { numFmt: "@" } },
      { header: "NOMBRE", key: "nombre", width: 34 },
      { header: "REFERENCIA", key: "referencia", width: 34 },
      { header: "IMEI", key: "imei", width: 20, style: { numFmt: "@" } },
      { header: "FINANCIERA", key: "financiera", width: 28 },
      { header: "TELEFONO", key: "telefono", width: 18, style: { numFmt: "@" } },
      { header: "REFERENCIA 1 NOMBRE", key: "referencia1Nombre", width: 30 },
      { header: "REFERENCIA 1 TELEFONO", key: "referencia1Telefono", width: 22, style: { numFmt: "@" } },
      { header: "REFERENCIA 2 NOMBRE", key: "referencia2Nombre", width: 30 },
      { header: "REFERENCIA 2 TELEFONO", key: "referencia2Telefono", width: 22, style: { numFmt: "@" } },
    ];

    rows.forEach((row) => worksheet.addRow(row));

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
      if (rowNumber === 1) return;
      row.height = 22;
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    worksheet.autoFilter = {
      from: "A1",
      to: "J1",
    };

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="base-datos-asesores-${period.key}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exportando base de datos de asesores", error);
    return NextResponse.json(
      { error: "Error generando base de datos" },
      { status: 500 }
    );
  }
}
