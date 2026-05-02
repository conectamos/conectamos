import { existsSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  extraerFinancierasDetalle,
  type CatalogoFinanciera,
} from "@/lib/ventas-financieras";
import { obtenerCatalogoPersonalVenta } from "@/lib/ventas-personal";
import {
  getBogotaDayRangeFromInput,
  getTodayBogotaDateKey,
  getTodayBogotaRange,
} from "@/lib/ventas-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONCEPTO_GASTO_CARTERA = "GASTO CARTERA";
const windowsFontDir = path.join(process.env.WINDIR || "C:\\Windows", "Fonts");
const SYSTEM_FONT_REGULAR = path.join(windowsFontDir, "arial.ttf");
const SYSTEM_FONT_BOLD = path.join(windowsFontDir, "arialbd.ttf");
const BUNDLED_FONT_REGULAR = path.join(
  process.cwd(),
  "public",
  "pdf-fonts",
  "Geist-Regular.ttf"
);
const STANDALONE_FONT_REGULAR = path.join(
  process.cwd(),
  ".next",
  "standalone",
  "public",
  "pdf-fonts",
  "Geist-Regular.ttf"
);
const SERVER_DIR_FONT_REGULAR = path.join(
  path.dirname(process.argv[1] || process.cwd()),
  "public",
  "pdf-fonts",
  "Geist-Regular.ttf"
);
const BRAND_LOGO_PATHS = [
  path.join(process.cwd(), "public", "branding", "conectamos-logo.png"),
  path.join(process.cwd(), ".next", "standalone", "public", "branding", "conectamos-logo.png"),
  path.join(
    path.dirname(process.argv[1] || process.cwd()),
    "public",
    "branding",
    "conectamos-logo.png"
  ),
];
const FALLBACK_FINANCIERAS_CIERRE = [
  "ALCANOS",
  "PAYJOY",
  "SISTECREDITO",
  "ADDI",
  "SU+PAY",
  "CELYA",
  "BANCO BOGOTA",
  "ALO CREDIT",
  "ESMIO",
  "KAIOWA",
  "FINSER",
  "GORA",
];

type PdfFonts = {
  regular: string;
  bold: string;
};

type CashMovementRow = {
  tipo: string;
  concepto: string;
  sedeNombre: string;
  valor: number;
};

type SaleDetailRow = {
  codigo: string;
  cliente: string;
  equipo: string;
  sede: string;
  ingresos: string;
  financieras: string;
};

type SaleTableRow = {
  venta: string;
  servicio: string;
  imei: string;
  jalador: string;
  ingresos: number;
  detalleIngresos: string;
  financieras: Record<string, number>;
  efectivo: number;
  transferencia: number;
  voucher: number;
  utilidad: number;
  vendedor: string;
  comision: number;
  salida: number;
  caja: number;
};

type CompactColumn = {
  key: string;
  title: string;
  width: number;
  align?: "left" | "right";
  tone?: "neutral" | "money" | "danger" | "financial";
};

function getPdfFonts(): PdfFonts {
  if (existsSync(SYSTEM_FONT_REGULAR) && existsSync(SYSTEM_FONT_BOLD)) {
    return {
      regular: SYSTEM_FONT_REGULAR,
      bold: SYSTEM_FONT_BOLD,
    };
  }

  const bundledFont = [
    BUNDLED_FONT_REGULAR,
    STANDALONE_FONT_REGULAR,
    SERVER_DIR_FONT_REGULAR,
  ].find((fontPath) => existsSync(fontPath));

  if (bundledFont) {
    return {
      regular: bundledFont,
      bold: bundledFont,
    };
  }

  return {
    regular: BUNDLED_FONT_REGULAR,
    bold: BUNDLED_FONT_REGULAR,
  };
}

function getBrandLogoPath() {
  return BRAND_LOGO_PATHS.find((logoPath) => existsSync(logoPath));
}

function toBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on("error", reject);
  });
}

function n(value: unknown) {
  if (!value) return 0;

  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return Number(value || 0);
}

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function textoLimpio(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function joinParts(parts: Array<string | null | undefined>, fallback = "-") {
  const seen = new Set<string>();
  const valid = parts
    .map((part) => textoLimpio(part))
    .filter((part) => {
      if (!part || seen.has(part)) return false;
      seen.add(part);
      return true;
    });

  return valid.length ? valid.join(" | ") : fallback;
}

function moneyPart(label: string, value: unknown) {
  const amount = n(value);
  return amount > 0 ? `${label}: ${formatoPesos(amount)}` : null;
}

function financierasVentaTexto(source: Record<string, unknown>) {
  const detalle = extraerFinancierasDetalle(source);

  return joinParts(
    detalle.map((item) => `${item.nombre}: ${formatoPesos(item.valorBruto)}`)
  );
}

function financierasRegistroTexto(value: unknown) {
  if (!Array.isArray(value)) return null;

  return joinParts(
    value.map((item) => {
      if (!item || typeof item !== "object") return null;

      const row = item as Record<string, unknown>;
      const plataforma = textoLimpio(row.plataformaCredito);
      const credito = moneyPart("Aut", row.creditoAutorizado);
      const inicial = moneyPart("Inicial", row.cuotaInicial);

      return joinParts([plataforma, credito, inicial], "");
    })
  );
}

function financieraLabel(nombre: unknown) {
  const value = textoLimpio(nombre).toUpperCase();

  if (value === "SUMASPAY" || value === "SUMAS+") return "SU+PAY";
  if (value === "BOGOTA" || value === "BANCO BOGOTA") return "BANCO BOGOTA";
  if (value === "ALO-CREDIT" || value === "ALO CREDIT") return "ALO CREDIT";
  if (value === "FINSER PAY") return "FINSER";

  return value;
}

function normalizePaymentType(value: unknown) {
  const tipo = textoLimpio(value).toUpperCase();

  if (tipo === "TRANSFERENCIA") return "TRANSFERENCIA";
  if (tipo === "VOUCHER") return "VOUCHER";
  if (tipo === "EFECTIVO") return "EFECTIVO";

  return tipo;
}

function buildPaymentBreakdown(venta: Record<string, unknown>) {
  const primerValor = n(venta.primerValor);
  const segundoValor = n(venta.segundoValor);
  const hasSplitValues = primerValor > 0 || segundoValor > 0;
  const pagos = hasSplitValues
    ? [
        {
          tipo:
            normalizePaymentType(venta.ingreso1) ||
            normalizePaymentType(venta.tipoIngreso) ||
            "EFECTIVO",
          valor: primerValor,
        },
        {
          tipo: normalizePaymentType(venta.ingreso2),
          valor: segundoValor,
        },
      ]
    : [
        {
          tipo: normalizePaymentType(venta.tipoIngreso) || "EFECTIVO",
          valor: n(venta.ingreso),
        },
      ];

  return pagos.reduce(
    (acc, pago) => {
      if (pago.valor <= 0) return acc;

      if (pago.tipo === "TRANSFERENCIA") {
        acc.transferencia += pago.valor;
      } else if (pago.tipo === "VOUCHER") {
        acc.voucher += pago.valor;
      } else {
        acc.efectivo += pago.valor;
      }

      return acc;
    },
    { efectivo: 0, transferencia: 0, voucher: 0 }
  );
}

function buildFinancialColumns(catalogo?: CatalogoFinanciera[]) {
  const columnas = (catalogo || [])
    .map((item) => financieraLabel(item.nombre))
    .filter(Boolean);
  const baseColumns = columnas.length ? columnas : FALLBACK_FINANCIERAS_CIERRE;
  const seen = new Set<string>();

  return baseColumns.filter((nombre) => {
    if (seen.has(nombre)) return false;
    seen.add(nombre);
    return true;
  });
}

function financierasRegistroDetalle(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const row = item as Record<string, unknown>;
      const nombre = financieraLabel(row.plataformaCredito);
      const valor = n(row.creditoAutorizado);

      return nombre && valor > 0 ? { nombre, valor } : null;
    })
    .filter((item): item is { nombre: string; valor: number } => Boolean(item));
}

function financierasVentaDetalle(
  venta: Record<string, unknown>,
  registro?: Record<string, unknown>
) {
  const detalle = extraerFinancierasDetalle(venta)
    .map((item) => ({
      nombre: financieraLabel(item.nombre),
      valor: n(item.valorBruto),
    }))
    .filter((item) => item.nombre && item.valor > 0);

  return detalle.length
    ? detalle
    : financierasRegistroDetalle(registro?.financierasDetalle);
}

function buildRegistroPaymentSources(registro?: Record<string, unknown>) {
  if (!registro) return [];

  return [
    {
      tipo: normalizePaymentType(registro.medioPago1Tipo),
      valor: n(registro.medioPago1Valor || registro.cuotaInicial),
      usado: false,
    },
    {
      tipo: normalizePaymentType(registro.medioPago2Tipo),
      valor: n(registro.medioPago2Valor),
      usado: false,
    },
  ].filter((item) => item.tipo && item.valor > 0);
}

function buildIngresoDetalle(label: string, neto: number, bruto?: number) {
  const tipo = normalizePaymentType(label) || "INGRESO";

  if (tipo === "VOUCHER") {
    if (bruto && Math.abs(bruto - neto) > 0.5) {
      return `VOUCHER bruto: ${formatoPesos(bruto)} | Neto caja: ${formatoPesos(neto)}`;
    }

    return `VOUCHER neto caja: ${formatoPesos(neto)}`;
  }

  return `${tipo}: ${formatoPesos(neto)}`;
}

function buildIngresosVenta(
  venta: Record<string, unknown>,
  registro?: Record<string, unknown>
) {
  const primerIngresoNombre =
    textoLimpio(venta.ingreso1) || textoLimpio(venta.tipoIngreso) || "Ingreso";
  const segundoIngresoNombre = textoLimpio(venta.ingreso2) || "Ingreso 2";
  const pagosVenta = [
    {
      tipo: primerIngresoNombre,
      valor: n(venta.primerValor || venta.ingreso),
    },
    {
      tipo: segundoIngresoNombre,
      valor: n(venta.segundoValor),
    },
  ].filter((item) => item.tipo && item.valor > 0);
  const pagosRegistro = buildRegistroPaymentSources(registro);
  const detalles = pagosVenta.map((pago) => {
    const tipo = normalizePaymentType(pago.tipo);
    const pagoRegistro = pagosRegistro.find((item) => !item.usado && item.tipo === tipo);

    if (pagoRegistro) {
      pagoRegistro.usado = true;
    }

    return buildIngresoDetalle(pago.tipo, pago.valor, pagoRegistro?.valor);
  });

  for (const pagoRegistro of pagosRegistro.filter((item) => !item.usado)) {
    detalles.push(buildIngresoDetalle(pagoRegistro.tipo, pagoRegistro.valor));
  }

  return joinParts(detalles);
}

function buildEquipoVenta(
  venta: Record<string, unknown>,
  registro?: Record<string, unknown>
) {
  return joinParts([
    textoLimpio(venta.servicio),
    textoLimpio(registro?.referenciaEquipo) || textoLimpio(venta.descripcion),
    textoLimpio(venta.serial || registro?.serialImei)
      ? `IMEI ${textoLimpio(venta.serial || registro?.serialImei)}`
      : null,
  ]);
}

function buildSaleTableRows(
  ventas: Array<Record<string, unknown> & { id: number }>,
  registrosPorVenta: Map<number, Record<string, unknown> | undefined>,
  catalogoFinancieras?: CatalogoFinanciera[]
) {
  const rows: SaleTableRow[] = ventas.map((venta) => {
    const registro = registrosPorVenta.get(venta.id);
    const pagos = buildPaymentBreakdown(venta);
    const financieras = financierasVentaDetalle(venta, registro).reduce(
      (acc, item) => {
        acc[item.nombre] = (acc[item.nombre] || 0) + item.valor;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      venta: textoLimpio(venta.idVenta),
      servicio: textoLimpio(venta.servicio),
      imei: textoLimpio(venta.serial || registro?.serialImei),
      jalador: textoLimpio(venta.jalador || registro?.jaladorNombre),
      ingresos: n(venta.ingreso),
      detalleIngresos: buildIngresosVenta(venta, registro),
      financieras,
      efectivo: pagos.efectivo,
      transferencia: pagos.transferencia,
      voucher: pagos.voucher,
      utilidad: n(venta.utilidad),
      vendedor: textoLimpio(venta.cerrador || registro?.asesorNombre),
      comision: n(venta.comision),
      salida: n(venta.salida),
      caja: n(venta.cajaOficina),
    };
  });

  const catalogColumns = buildFinancialColumns(catalogoFinancieras);
  const known = new Set(catalogColumns);
  const extras = new Set<string>();

  for (const row of rows) {
    Object.keys(row.financieras).forEach((nombre) => {
      if (!known.has(nombre)) extras.add(nombre);
    });
  }

  const financieras = [...catalogColumns, ...Array.from(extras).sort()];

  return { rows, financieras };
}

function moneyCell(value: number) {
  return value ? value : null;
}

function buildTrialTotals(rows: SaleTableRow[], movimientos: CashMovementRow[]) {
  const totalFinancieras = rows.reduce(
    (acc, row) =>
      acc +
      Object.values(row.financieras).reduce(
        (finAcc, value) => finAcc + Number(value || 0),
        0
      ),
    0
  );
  const ingresosCaja = movimientos
    .filter((movimiento) => movimiento.tipo.toUpperCase() === "INGRESO")
    .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
  const egresosCaja = movimientos
    .filter((movimiento) => movimiento.tipo.toUpperCase() === "EGRESO")
    .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
  const ingresosVentas = rows.reduce(
    (acc, row) => acc + Number(row.ingresos || 0),
    0
  );

  return {
    ventas: rows.length,
    ingresosVentas,
    financieras: totalFinancieras,
    utilidad: rows.reduce((acc, row) => acc + Number(row.utilidad || 0), 0),
    comision: rows.reduce((acc, row) => acc + Number(row.comision || 0), 0),
    salida: rows.reduce((acc, row) => acc + Number(row.salida || 0), 0),
    caja: rows.reduce((acc, row) => acc + Number(row.caja || 0), 0),
    efectivo: rows.reduce((acc, row) => acc + Number(row.efectivo || 0), 0),
    transferencia: rows.reduce(
      (acc, row) => acc + Number(row.transferencia || 0),
      0
    ),
    voucher: rows.reduce((acc, row) => acc + Number(row.voucher || 0), 0),
    ingresosCaja,
    egresosCaja,
    cajaNeta: ingresosCaja - egresosCaja,
    ingresosAcumulados: ingresosVentas + ingresosCaja,
  };
}

function trialExcelColumnWidth(header: string, financieras: string[]) {
  if (financieras.includes(header)) return 19;
  if (header === "JALADOR") return 20;
  if (header === "DETALLES DE INGRESO") return 32;
  if (header === "IMEI") return 19;
  if (header === "SERVICIO") return 22;

  return header.length < 9 ? 14 : 17;
}

async function buildExcelCierreTabla(params: {
  periodoKey: string;
  cobertura: string;
  rows: SaleTableRow[];
  financieras: string[];
  movimientos: CashMovementRow[];
}) {
  const totals = buildTrialTotals(params.rows, params.movimientos);
  const headers = [
    "# VENTA",
    "SERVICIO",
    "IMEI",
    "JALADOR",
    "INGRESOS",
    "DETALLES DE INGRESO",
    ...params.financieras,
    "UTILIDAD",
    "VENDEDOR",
    "COMISION",
    "SALIDA",
    "CAJA",
  ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CONECTAMOS.APP";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Cierre del dia", {
    properties: {
      defaultRowHeight: 20,
    },
    views: [
      {
        state: "frozen",
        ySplit: 9,
        showGridLines: false,
      },
    ],
  });
  const totalColumns = headers.length;
  const moneyHeaders = new Set([
    "INGRESOS",
    ...params.financieras,
    "UTILIDAD",
    "COMISION",
    "SALIDA",
    "CAJA",
    "VALOR",
  ]);
  const logoPath = getBrandLogoPath();

  worksheet.columns = headers.map((header) => ({
    key: header,
    width: trialExcelColumnWidth(header, params.financieras),
  }));

  worksheet.mergeCells(1, 3, 1, totalColumns);
  worksheet.mergeCells(2, 3, 2, totalColumns);
  worksheet.mergeCells(3, 3, 3, totalColumns);
  worksheet.mergeCells(4, 3, 4, totalColumns);
  worksheet.getCell(1, 3).value = "CONECTAMOS FINAN SERVICES S.A.S";
  worksheet.getCell(2, 3).value = "CIERRE DEL DIA";
  worksheet.getCell(3, 3).value = `${params.periodoKey} | ${params.cobertura}`;
  worksheet.getCell(4, 3).value =
    "Vista de prueba con ventas, catalogo completo de financieras y caja del dia.";

  [1, 2, 3, 4].forEach((rowNumber) => {
    const row = worksheet.getRow(rowNumber);
    row.height = rowNumber === 2 ? 28 : 22;
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: rowNumber === 2 ? "FF111827" : "FFF8FAFC" },
      };
      cell.font = {
        bold: rowNumber <= 2,
        color: { argb: rowNumber === 2 ? "FFFFFFFF" : "FF0F172A" },
        size: rowNumber === 2 ? 18 : 11,
      };
      cell.alignment = { vertical: "middle" };
    });
  });

  if (logoPath) {
    const logoId = workbook.addImage({
      filename: logoPath,
      extension: "png",
    });
    worksheet.addImage(logoId, {
      tl: { col: 0.15, row: 0.2 },
      ext: { width: 92, height: 92 },
    });
  }

  const metricRows = [
    {
      rowNumber: 6,
      items: [
        ["VENTAS", totals.ventas],
        ["INGRESOS", totals.ingresosAcumulados],
        ["INGRESO VENTAS", totals.ingresosVentas],
        ["INGRESO CAJA", totals.ingresosCaja],
      ],
    },
    {
      rowNumber: 7,
      items: [
        ["TRANSFERENCIA", totals.transferencia],
        ["VOUCHER", totals.voucher],
        ["FINANCIERAS", totals.financieras],
        ["CAJA NETA", totals.cajaNeta],
      ],
    },
  ];

  metricRows.forEach(({ rowNumber, items }) => {
    const metricRow = worksheet.getRow(rowNumber);
    metricRow.height = 28;

    items.forEach(([label, value], index) => {
      const labelCell = worksheet.getCell(rowNumber, index * 2 + 1);
      const valueCell = worksheet.getCell(rowNumber, index * 2 + 2);
      const isMainIncome = label === "INGRESOS";

      labelCell.value = label;
      valueCell.value = value;
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isMainIncome ? "FFDCFCE7" : "FFEFF6FF" },
      };
      valueCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFFFF" },
      };
      labelCell.font = {
        bold: true,
        color: { argb: isMainIncome ? "FF166534" : "FF1E3A5F" },
        size: 9,
      };
      valueCell.font = {
        bold: true,
        color: { argb: isMainIncome ? "FF047857" : "FF0F172A" },
        size: 11,
      };
      valueCell.numFmt =
        label === "VENTAS" ? "0" : '"$"#,##0;[Red]-"$"#,##0';
      labelCell.alignment = { horizontal: "center", vertical: "middle" };
      valueCell.alignment = { horizontal: "center", vertical: "middle" };
      [labelCell, valueCell].forEach((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFD7E3F2" } },
          left: { style: "thin", color: { argb: "FFD7E3F2" } },
          bottom: { style: "thin", color: { argb: "FFD7E3F2" } },
          right: { style: "thin", color: { argb: "FFD7E3F2" } },
        };
      });
    });
  });

  worksheet.addRow([]);
  const headerRow = worksheet.addRow(headers);
  headerRow.height = 25;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF111827" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF111827" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      bottom: { style: "thin", color: { argb: "FF111827" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  params.rows.forEach((saleRow, index) => {
    const row = worksheet.addRow([
      saleRow.venta,
      saleRow.servicio,
      saleRow.imei,
      saleRow.jalador,
      moneyCell(saleRow.ingresos),
      saleRow.detalleIngresos,
      ...params.financieras.map((nombre) =>
        moneyCell(saleRow.financieras[nombre] || 0)
      ),
      moneyCell(saleRow.utilidad),
      saleRow.vendedor,
      moneyCell(saleRow.comision),
      moneyCell(saleRow.salida),
      moneyCell(saleRow.caja),
    ]);
    row.height = 22;
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC" },
      };
      cell.font = {
        color: { argb: header === "SALIDA" ? "FFB91C1C" : "FF0F172A" },
        size: 9,
      };
      cell.alignment = {
        horizontal: moneyHeaders.has(header) ? "right" : "left",
        vertical: "middle",
        wrapText: header === "DETALLES DE INGRESO",
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      if (moneyHeaders.has(header)) {
        cell.numFmt = '"$"#,##0;[Red]-"$"#,##0';
      }
    });
  });

  const totalsRow = worksheet.addRow([
    "TOTALES",
    "",
    "",
    "",
    totals.ingresosAcumulados,
    `Ventas: ${formatoPesos(totals.ingresosVentas)} | Caja: ${formatoPesos(
      totals.ingresosCaja
    )} | Transferencia: ${formatoPesos(
      totals.transferencia
    )} | Voucher: ${formatoPesos(totals.voucher)}`,
    ...params.financieras.map((nombre) =>
      params.rows.reduce(
        (acc, row) => acc + Number(row.financieras[nombre] || 0),
        0
      )
    ),
    totals.utilidad,
    "",
    totals.comision,
    totals.salida,
    totals.caja,
  ]);
  totalsRow.height = 24;
  totalsRow.eachCell((cell, colNumber) => {
    const header = headers[colNumber - 1];
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFBEB" },
    };
    cell.font = { bold: true, color: { argb: "FF78350F" }, size: 9 };
    cell.alignment = {
      horizontal: moneyHeaders.has(header) ? "right" : "left",
      vertical: "middle",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFF59E0B" } },
      bottom: { style: "thin", color: { argb: "FFF59E0B" } },
    };
    if (moneyHeaders.has(header)) {
      cell.numFmt = '"$"#,##0;[Red]-"$"#,##0';
    }
  });

  worksheet.addRow([]);
  const cajaTitleRow = worksheet.addRow(["INGRESOS Y EGRESOS DE CAJA"]);
  worksheet.mergeCells(cajaTitleRow.number, 1, cajaTitleRow.number, 4);
  cajaTitleRow.height = 24;
  cajaTitleRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF7F1D1D" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle" };
  });

  const cajaHeaderRow = worksheet.addRow(["TIPO", "CONCEPTO", "SEDE", "VALOR"]);
  cajaHeaderRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" },
    };
    cell.font = { bold: true, color: { argb: "FF111827" }, size: 9 };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });

  params.movimientos.forEach((movimiento) => {
    const row = worksheet.addRow([
      movimiento.tipo,
      movimiento.concepto,
      movimiento.sedeNombre,
      moneyCell(movimiento.valor),
    ]);
    row.eachCell((cell, colNumber) => {
      cell.font = {
        color: {
          argb:
            movimiento.tipo.toUpperCase() === "EGRESO"
              ? "FFB91C1C"
              : "FF047857",
        },
        size: 9,
      };
      cell.alignment = {
        horizontal: colNumber === 4 ? "right" : "left",
        vertical: "middle",
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      if (colNumber === 4) {
        cell.numFmt = '"$"#,##0;[Red]-"$"#,##0';
      }
    });
  });

  worksheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: totalColumns },
  };
  worksheet.pageSetup = {
    orientation: "landscape",
    paperSize: 5,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function fitColumns(
  columns: CompactColumn[],
  availableWidth: number
) {
  const totalWidth = columns.reduce((acc, column) => acc + column.width, 0);
  const scale = totalWidth > availableWidth ? availableWidth / totalWidth : 1;

  return columns.map((column) => ({
    ...column,
    width: column.width * scale,
  }));
}

function drawCompactTableHeader(
  doc: PDFKit.PDFDocument,
  columns: CompactColumn[],
  y: number,
  x: number,
  fonts: PdfFonts
) {
  let cursorX = x;

  for (const column of columns) {
    const fillColor =
      column.tone === "financial"
        ? "#23395d"
        : column.tone === "danger"
          ? "#6f2432"
          : column.tone === "money"
            ? "#1f5f4b"
            : "#182235";

    doc
      .rect(cursorX, y, column.width, 24)
      .fillAndStroke(fillColor, "#334155");

    doc
      .fillColor("#ffffff")
      .font(fonts.bold)
      .fontSize(6.2)
      .text(column.title, cursorX + 2, y + 8, {
        width: Math.max(8, column.width - 4),
        align: column.align ?? "left",
        ellipsis: true,
      });
    cursorX += column.width;
  }

  return y + 24;
}

function drawCompactRow(
  doc: PDFKit.PDFDocument,
  columns: CompactColumn[],
  values: Record<string, string>,
  y: number,
  x: number,
  rowHeight: number,
  fonts: PdfFonts,
  options?: { index?: number }
) {
  let cursorX = x;
  const rowFill =
    options?.index !== undefined && options.index % 2 === 1
      ? "#f8fafc"
      : "#ffffff";

  doc
    .rect(x, y, columns.reduce((acc, column) => acc + column.width, 0), rowHeight)
    .fillAndStroke(rowFill, "#e5e7eb");

  for (const column of columns) {
    const toneColor =
      column.tone === "danger"
        ? "#9f2737"
        : column.tone === "financial"
          ? "#254f87"
          : column.tone === "money"
            ? "#16694f"
            : "#162033";

    doc
      .fillColor(toneColor)
      .font(column.tone ? fonts.bold : fonts.regular)
      .fontSize(6.2)
      .text(values[column.key] || "-", cursorX + 2, y + 5, {
        width: Math.max(8, column.width - 4),
        height: rowHeight - 8,
        align: column.align ?? "left",
        ellipsis: true,
      });
    cursorX += column.width;
  }

  return y + rowHeight;
}

function drawTrialMetricCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  fonts: PdfFonts,
  accent: string
) {
  const valueSize = value.length > 18 ? 11 : value.length > 14 ? 12 : 13.5;

  doc.roundedRect(x, y, width, 46, 10).fillAndStroke("#ffffff", "#d8e0ec");
  doc.roundedRect(x + 10, y + 12, 4, 22, 2).fill(accent);
  doc
    .fillColor("#65748a")
    .font(fonts.bold)
    .fontSize(6.8)
    .text(label.toUpperCase(), x + 22, y + 10, {
      width: width - 34,
      characterSpacing: 0.7,
      ellipsis: true,
    });
  doc
    .fillColor("#142033")
    .font(fonts.bold)
    .fontSize(valueSize)
    .text(value, x + 22, y + 25, {
      width: width - 34,
      ellipsis: true,
    });
}

function drawSalesComparisonChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  currentSales: number,
  previousSales: number,
  fonts: PdfFonts
) {
  const chartHeight = 66;
  const maxSales = Math.max(currentSales, previousSales, 1);
  const currentWidth =
    currentSales > 0 ? Math.max(8, ((width - 170) * currentSales) / maxSales) : 0;
  const previousWidth =
    previousSales > 0
      ? Math.max(8, ((width - 170) * previousSales) / maxSales)
      : 0;
  const diff = currentSales - previousSales;
  const diffText =
    previousSales === 0
      ? currentSales > 0
        ? "Sin ventas el dia anterior"
        : "Sin variacion"
      : `${diff >= 0 ? "+" : ""}${diff} ventas vs ayer`;

  doc.roundedRect(x, y, width, chartHeight, 12).fillAndStroke("#ffffff", "#d8e0ec");
  doc
    .fillColor("#142033")
    .font(fonts.bold)
    .fontSize(10)
    .text("Comparativo de ventas", x + 14, y + 11, { width: width - 28 });
  doc
    .fillColor(diff >= 0 ? "#16694f" : "#9f2737")
    .font(fonts.bold)
    .fontSize(8)
    .text(diffText, x + width - 210, y + 12, {
      width: 190,
      align: "right",
      ellipsis: true,
    });

  const barX = x + 100;
  const barWidth = width - 170;
  const currentY = y + 34;
  const previousY = y + 49;

  doc
    .fillColor("#65748a")
    .font(fonts.bold)
    .fontSize(7)
    .text("Hoy", x + 14, currentY - 1, { width: 70 })
    .text("Ayer", x + 14, previousY - 1, { width: 70 });
  doc.roundedRect(barX, currentY, barWidth, 8, 4).fill("#edf2f7");
  doc.roundedRect(barX, previousY, barWidth, 8, 4).fill("#edf2f7");
  if (currentWidth > 0) {
    doc.roundedRect(barX, currentY, currentWidth, 8, 4).fill("#16694f");
  }
  if (previousWidth > 0) {
    doc.roundedRect(barX, previousY, previousWidth, 8, 4).fill("#7b8ca7");
  }
  doc
    .fillColor("#142033")
    .font(fonts.bold)
    .fontSize(8)
    .text(String(currentSales), barX + barWidth + 12, currentY - 1, {
      width: 44,
      align: "right",
    })
    .text(String(previousSales), barX + barWidth + 12, previousY - 1, {
      width: 44,
      align: "right",
    });
}

async function buildPdfCierreTabla(params: {
  periodoLabel: string;
  cobertura: string;
  rows: SaleTableRow[];
  financieras: string[];
  movimientos: CashMovementRow[];
  previousSalesCount: number;
  fonts: PdfFonts;
}) {
  const doc = new PDFDocument({
    size: "A3",
    layout: "landscape",
    margin: 22,
    font: params.fonts.regular,
    info: {
      Title: "Cierre del dia - vista prueba",
      Author: "CONECTAMOS.APP",
    },
  });
  const bufferPromise = toBuffer(doc);
  const contentWidth = doc.page.width - 44;
  const tableX = 22;
  const logoPath = getBrandLogoPath();
  const totals = buildTrialTotals(params.rows, params.movimientos);

  const columns = fitColumns(
    [
      { key: "venta", title: "# VENTA", width: 56 },
      { key: "servicio", title: "SERVICIO", width: 70 },
      { key: "imei", title: "IMEI", width: 86 },
      { key: "jalador", title: "JALADOR", width: 112 },
      { key: "ingresos", title: "INGRESOS", width: 72, align: "right", tone: "money" },
      { key: "detalleIngresos", title: "DETALLES DE INGRESO", width: 120 },
      ...params.financieras.map((nombre) => ({
        key: `fin_${nombre}`,
        title: nombre,
        width: 86,
        align: "right" as const,
        tone: "financial" as const,
      })),
      { key: "utilidad", title: "UTILIDAD", width: 76, align: "right", tone: "money" },
      { key: "vendedor", title: "VENDEDOR", width: 78 },
      { key: "comision", title: "COMISION", width: 66, align: "right", tone: "danger" },
      { key: "salida", title: "SALIDA", width: 66, align: "right", tone: "danger" },
      { key: "caja", title: "CAJA", width: 76, align: "right", tone: "money" },
    ],
    contentWidth
  );

  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f4f6fa");
  const headerGradient = doc.linearGradient(tableX, 18, doc.page.width - 22, 104);
  headerGradient.stop(0, "#111827").stop(0.58, "#1e293b").stop(1, "#79313a");
  doc.roundedRect(tableX, 18, contentWidth, 86, 16).fill(headerGradient);

  doc.roundedRect(tableX + 18, 30, 62, 62, 14).fill("#ffffff");
  if (logoPath) {
    try {
      doc.image(logoPath, tableX + 23, 35, { fit: [52, 52], align: "center" });
    } catch {
      doc
        .fillColor("#ef3333")
        .font(params.fonts.bold)
        .fontSize(10)
        .text("C", tableX + 45, 52);
    }
  }

  doc
    .fillColor("#ffffff")
    .font(params.fonts.bold)
    .fontSize(21)
    .text("CIERRE DEL DIA", tableX + 96, 31, { width: 360 });
  doc
    .fillColor("#f8fafc")
    .font(params.fonts.bold)
    .fontSize(8)
    .text("CONECTAMOS FINAN SERVICES S.A.S", tableX + 98, 58, {
      width: 270,
      characterSpacing: 0.8,
    });
  doc
    .fillColor("#cbd5e1")
    .font(params.fonts.regular)
    .fontSize(8)
    .text(`${params.periodoLabel} | ${params.cobertura}`, tableX + 98, 75, {
      width: 360,
    });

  doc
    .roundedRect(doc.page.width - 278, 36, 228, 46, 12)
    .fillAndStroke("#ffffff", "#ead5d8");
  doc
    .fillColor("#64748b")
    .font(params.fonts.bold)
    .fontSize(7)
    .text("INGRESO ACUMULADO", doc.page.width - 262, 45, {
      width: 190,
      characterSpacing: 0.6,
    });
  doc
    .fillColor("#047857")
    .font(params.fonts.bold)
    .fontSize(14)
    .text(formatoPesos(totals.ingresosAcumulados), doc.page.width - 262, 58, {
      width: 190,
      align: "left",
      ellipsis: true,
    });
  doc
    .fillColor("#64748b")
    .font(params.fonts.regular)
    .fontSize(6.4)
    .text("Ventas + caja", doc.page.width - 262, 75, { width: 160 });

  const metricCards = [
    { label: "Ventas", value: String(totals.ventas), color: "#334155" },
    {
      label: "Ingreso ventas",
      value: formatoPesos(totals.ingresosVentas),
      color: "#1f7a5c",
    },
    {
      label: "Ingreso caja",
      value: formatoPesos(totals.ingresosCaja),
      color: "#277489",
    },
    {
      label: "Transferencia",
      value: formatoPesos(totals.transferencia),
      color: "#3b5b92",
    },
    {
      label: "Voucher",
      value: formatoPesos(totals.voucher),
      color: "#6f4f9f",
    },
    {
      label: "Financieras",
      value: formatoPesos(totals.financieras),
      color: "#254f87",
    },
    { label: "Utilidad", value: formatoPesos(totals.utilidad), color: "#8a651e" },
    { label: "Caja neta", value: formatoPesos(totals.cajaNeta), color: "#9f2737" },
  ];
  const metricGap = 12;
  const cardsPerRow = 4;
  const metricWidth =
    (contentWidth - metricGap * (cardsPerRow - 1)) / cardsPerRow;

  metricCards.forEach((metric, index) => {
    const rowIndex = Math.floor(index / cardsPerRow);
    const columnIndex = index % cardsPerRow;
    const x = tableX + columnIndex * (metricWidth + metricGap);
    const cardY = 120 + rowIndex * 54;

    drawTrialMetricCard(
      doc,
      x,
      cardY,
      metricWidth,
      metric.label,
      metric.value,
      params.fonts,
      metric.color
    );
  });

  drawSalesComparisonChart(
    doc,
    tableX,
    232,
    contentWidth,
    totals.ventas,
    params.previousSalesCount,
    params.fonts
  );

  let y = 330;
  doc
    .fillColor("#0f172a")
    .font(params.fonts.bold)
    .fontSize(11)
    .text("VENTAS DEL DIA - FINANCIERAS DEL CATALOGO", tableX, 314);
  y = drawCompactTableHeader(doc, columns, y, tableX, params.fonts);

  if (!params.rows.length) {
    doc
      .fillColor("#64748b")
      .font(params.fonts.regular)
      .fontSize(10)
      .text("No hay ventas registradas para este dia.", tableX, y + 18);
    y += 58;
  } else {
    for (const row of params.rows) {
      if (y + 32 > doc.page.height - 44) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f4f6fa");
        y = drawCompactTableHeader(doc, columns, 34, tableX, params.fonts);
      }

      const values: Record<string, string> = {
        venta: row.venta,
        servicio: row.servicio,
        imei: row.imei,
        jalador: row.jalador,
        ingresos: formatoPesos(row.ingresos),
        detalleIngresos: row.detalleIngresos,
        utilidad: formatoPesos(row.utilidad),
        vendedor: row.vendedor,
        comision: formatoPesos(row.comision),
        salida: formatoPesos(row.salida),
        caja: formatoPesos(row.caja),
      };

      params.financieras.forEach((nombre) => {
        values[`fin_${nombre}`] = row.financieras[nombre]
          ? formatoPesos(row.financieras[nombre])
          : "-";
      });

      y = drawCompactRow(doc, columns, values, y, tableX, 30, params.fonts, {
        index: params.rows.indexOf(row),
      });
    }
  }

  y += 22;
  if (y + 78 > doc.page.height - 36) {
    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f4f6fa");
    y = 34;
  }

  doc
    .fillColor("#0f172a")
    .font(params.fonts.bold)
    .fontSize(12)
    .text("INGRESOS Y EGRESOS DE CAJA", tableX, y);
  doc
    .fillColor("#64748b")
    .font(params.fonts.regular)
    .fontSize(8)
    .text(
      `Ingresos: ${formatoPesos(totals.ingresosCaja)} | Egresos: ${formatoPesos(
        totals.egresosCaja
      )}`,
      tableX + 190,
      y + 2,
      { width: 300 }
    );
  y += 18;

  const cashColumns = fitColumns(
    [
      { key: "tipo", title: "TIPO", width: 80 },
      { key: "concepto", title: "CONCEPTO", width: 300 },
      { key: "sede", title: "SEDE", width: 140 },
      { key: "valor", title: "VALOR", width: 120, align: "right", tone: "money" },
    ],
    640
  );
  y = drawCompactTableHeader(doc, cashColumns, y, tableX, params.fonts);

  if (!params.movimientos.length) {
    doc
      .fillColor("#64748b")
      .font(params.fonts.regular)
      .fontSize(9)
      .text("No hay ingresos o egresos registrados para este dia.", tableX, y + 16);
  } else {
    for (const movimiento of params.movimientos) {
      if (y + 26 > doc.page.height - 36) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f4f6fa");
        y = drawCompactTableHeader(doc, cashColumns, 34, tableX, params.fonts);
      }

      y = drawCompactRow(
        doc,
        cashColumns,
        {
          tipo: movimiento.tipo,
          concepto: movimiento.concepto,
          sede: movimiento.sedeNombre,
          valor: formatoPesos(movimiento.valor),
        },
        y,
        tableX,
        26,
        params.fonts,
        { index: params.movimientos.indexOf(movimiento) }
      );
    }
  }

  doc.end();
  return bufferPromise;
}

function drawMetric(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  fonts: PdfFonts,
  options?: { accent?: string }
) {
  doc
    .roundedRect(x, y, width, 74, 12)
    .fillAndStroke("#f8fafc", "#dbe3ef");

  doc
    .fillColor("#64748b")
    .font(fonts.bold)
    .fontSize(8)
    .text(label.toUpperCase(), x + 14, y + 13, {
      width: width - 28,
      characterSpacing: 0.7,
    });

  doc
    .fillColor(options?.accent || "#0f172a")
    .font(fonts.bold)
    .fontSize(16)
    .text(value, x + 14, y + 36, {
      width: width - 28,
      ellipsis: true,
    });
}

function drawSectionTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  y: number,
  fonts: PdfFonts
) {
  doc
    .fillColor("#0f172a")
    .font(fonts.bold)
    .fontSize(13)
    .text(title, 36, y);

  return y + 22;
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  requiredHeight: number,
  fonts: PdfFonts,
  title: string
) {
  if (y + requiredHeight <= 716) {
    return y;
  }

  doc.addPage();
  return drawSectionTitle(doc, title, 44, fonts);
}

function drawCashTableHeader(doc: PDFKit.PDFDocument, y: number, fonts: PdfFonts) {
  doc
    .fillColor("#475569")
    .font(fonts.bold)
    .fontSize(8)
    .text("TIPO", 42, y)
    .text("CONCEPTO", 106, y)
    .text("SEDE", 300, y)
    .text("VALOR", 464, y, { width: 104, align: "right" });

  return y + 16;
}

function drawCashRow(
  doc: PDFKit.PDFDocument,
  row: CashMovementRow,
  y: number,
  fonts: PdfFonts
) {
  doc
    .moveTo(36, y - 5)
    .lineTo(576, y - 5)
    .strokeColor("#e2e8f0")
    .stroke();

  doc
    .fillColor("#0f172a")
    .font(fonts.regular)
    .fontSize(8.5)
    .text(row.tipo, 42, y, { width: 58 })
    .text(row.concepto, 106, y, {
      width: 184,
      ellipsis: true,
    })
    .text(row.sedeNombre, 300, y, {
      width: 150,
      ellipsis: true,
    })
    .text(formatoPesos(row.valor), 464, y, {
      width: 104,
      align: "right",
    });

  return y + 20;
}

function drawSaleField(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  fonts: PdfFonts
) {
  doc
    .fillColor("#475569")
    .font(fonts.bold)
    .fontSize(7.5)
    .text(label.toUpperCase(), x, y, {
      width,
      characterSpacing: 0.4,
    });

  doc
    .fillColor("#0f172a")
    .font(fonts.regular)
    .fontSize(8.4)
    .text(value, x, y + 12, {
      width,
      height: 28,
      ellipsis: true,
      lineGap: 1.2,
    });
}

function drawSaleDetailCard(
  doc: PDFKit.PDFDocument,
  row: SaleDetailRow,
  y: number,
  contentWidth: number,
  fonts: PdfFonts
) {
  const cardHeight = 142;
  const leftX = 50;
  const rightX = 318;
  const columnWidth = 236;
  const fullWidth = contentWidth - 28;

  doc
    .roundedRect(36, y, contentWidth, cardHeight, 10)
    .fillAndStroke("#f8fafc", "#dbe3ef");

  doc
    .fillColor("#0f172a")
    .font(fonts.bold)
    .fontSize(10.5)
    .text(row.codigo, leftX, y + 13, {
      width: 260,
      ellipsis: true,
    });

  doc
    .fillColor("#64748b")
    .font(fonts.bold)
    .fontSize(8)
    .text(row.sede, rightX, y + 14, {
      width: columnWidth,
      align: "right",
      ellipsis: true,
    });

  doc
    .fillColor("#334155")
    .font(fonts.regular)
    .fontSize(9)
    .text(row.cliente, leftX, y + 31, {
      width: contentWidth - 28,
      ellipsis: true,
    });

  doc
    .moveTo(leftX, y + 50)
    .lineTo(36 + contentWidth - 14, y + 50)
    .strokeColor("#e2e8f0")
    .stroke();

  drawSaleField(doc, "Equipo", row.equipo, leftX, y + 62, columnWidth, fonts);
  drawSaleField(
    doc,
    "Financieras",
    row.financieras,
    rightX,
    y + 62,
    columnWidth,
    fonts
  );
  drawSaleField(
    doc,
    "Iniciales / ingresos",
    row.ingresos,
    leftX,
    y + 103,
    fullWidth,
    fonts
  );

  return y + cardHeight + 12;
}

function parseSedeId(value: string | null) {
  const sedeId = Number(value);
  return Number.isInteger(sedeId) && sedeId > 0 ? sedeId : null;
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";
    const url = new URL(req.url);
    const fechaParam = url.searchParams.get("fecha") || getTodayBogotaDateKey();
    const vista = String(url.searchParams.get("vista") || "").toLowerCase();
    const formato = String(url.searchParams.get("formato") || "pdf").toLowerCase();
    const periodo = getBogotaDayRangeFromInput(fechaParam) || getTodayBogotaRange();
    const previousStart = new Date(periodo.start);
    previousStart.setUTCDate(previousStart.getUTCDate() - 1);
    const previousEnd = new Date(periodo.start);
    const sedeIdFiltro = parseSedeId(url.searchParams.get("sedeId"));
    const sedeSeleccionada =
      esAdmin && sedeIdFiltro
        ? await prisma.sede.findUnique({
            where: { id: sedeIdFiltro },
            select: { nombre: true },
          })
        : null;
    const scope = esAdmin
      ? sedeIdFiltro
        ? { sedeId: sedeIdFiltro }
        : {}
      : { sedeId: user.sedeId };
    const cobertura = esAdmin
      ? sedeSeleccionada?.nombre || "Todas las sedes"
      : user.sedeNombre;

    const [
      ventasDia,
      ventasDiaAnterior,
      movimientosDia,
      gastosCarteraDia,
      ventasDetalleDia,
      ventasCajaAcumulada,
      ingresosCajaAcumulados,
      egresosCajaAcumulados,
    ] = await Promise.all([
      prisma.venta.aggregate({
        where: {
          fecha: {
            gte: periodo.start,
            lt: periodo.end,
          },
          ...scope,
        },
        _count: {
          id: true,
        },
        _sum: {
          utilidad: true,
          comision: true,
          salida: true,
        },
      }),
      prisma.venta.count({
        where: {
          fecha: {
            gte: previousStart,
            lt: previousEnd,
          },
          ...scope,
        },
      }),
      prisma.cajaMovimiento.findMany({
        where: {
          createdAt: {
            gte: periodo.start,
            lt: periodo.end,
          },
          ...scope,
        },
        select: {
          tipo: true,
          concepto: true,
          valor: true,
          descripcion: true,
          sede: {
            select: {
              nombre: true,
            },
          },
        },
        orderBy: {
          id: "desc",
        },
      }),
      prisma.gastoCartera.findMany({
        where: {
          createdAt: {
            gte: periodo.start,
            lt: periodo.end,
          },
          ...scope,
        },
        select: {
          valor: true,
          observacion: true,
          sede: {
            select: {
              nombre: true,
            },
          },
        },
        orderBy: {
          id: "desc",
        },
      }),
      prisma.venta.findMany({
        where: {
          fecha: {
            gte: periodo.start,
            lt: periodo.end,
          },
          ...scope,
        },
        select: {
          id: true,
          idVenta: true,
          servicio: true,
          descripcion: true,
          serial: true,
          jalador: true,
          cerrador: true,
          ingreso: true,
          tipoIngreso: true,
          ingreso1: true,
          ingreso2: true,
          primerValor: true,
          segundoValor: true,
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
          financierasDetalle: true,
          utilidad: true,
          comision: true,
          salida: true,
          cajaOficina: true,
          sede: {
            select: {
              nombre: true,
            },
          },
        },
        orderBy: {
          id: "desc",
        },
      }),
      prisma.venta.aggregate({
        where: scope,
        _sum: {
          cajaOficina: true,
        },
      }),
      prisma.cajaMovimiento.aggregate({
        where: {
          tipo: "INGRESO",
          NOT: {
            concepto: CONCEPTO_GASTO_CARTERA,
          },
          ...scope,
        },
        _sum: {
          valor: true,
        },
      }),
      prisma.cajaMovimiento.aggregate({
        where: {
          tipo: "EGRESO",
          NOT: {
            concepto: CONCEPTO_GASTO_CARTERA,
          },
          ...scope,
        },
        _sum: {
          valor: true,
        },
      }),
    ]);

    const registrosVentas = ventasDetalleDia.length
      ? await prisma.registroVendedorVenta.findMany({
          where: {
            ventaIdRelacionada: {
              in: ventasDetalleDia.map((venta) => venta.id),
            },
            eliminadoEn: null,
            ...scope,
          },
          select: {
            ventaIdRelacionada: true,
            clienteNombre: true,
            plataformaCredito: true,
            financierasDetalle: true,
            creditoAutorizado: true,
            cuotaInicial: true,
            valorCuota: true,
            numeroCuotas: true,
            medioPago1Tipo: true,
            medioPago1Valor: true,
            medioPago2Tipo: true,
            medioPago2Valor: true,
            asesorNombre: true,
            jaladorNombre: true,
            referenciaEquipo: true,
            serialImei: true,
          },
          orderBy: {
            id: "desc",
          },
        })
      : [];
    const registrosPorVenta = new Map(
      registrosVentas
        .filter((registro) => registro.ventaIdRelacionada)
        .map((registro) => [registro.ventaIdRelacionada as number, registro])
    );
    const ingresosCajaDia = movimientosDia
      .filter((movimiento) => String(movimiento.tipo || "").toUpperCase() === "INGRESO")
      .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
    const egresosCajaDia = movimientosDia
      .filter((movimiento) => String(movimiento.tipo || "").toUpperCase() === "EGRESO")
      .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
    const egresosCarteraDia = gastosCarteraDia.reduce(
      (acc, gasto) => acc + Number(gasto.valor || 0),
      0
    );
    const ingresosVentasDia = ventasDetalleDia.reduce(
      (acc, venta) => acc + n(venta.ingreso),
      0
    );
    const comisionesVentasDia = n(ventasDia._sum.comision);
    const salidasVentasTotal = n(ventasDia._sum.salida);
    const ingresosTotalesDia = ingresosCajaDia + ingresosVentasDia;
    const egresosTotalesDia =
      egresosCajaDia + egresosCarteraDia + salidasVentasTotal;
    const movimientosCierre: CashMovementRow[] = [
      ...movimientosDia.map((movimiento) => ({
        tipo: String(movimiento.tipo || "-"),
        concepto: String(movimiento.concepto || "-"),
        sedeNombre: movimiento.sede?.nombre || "-",
        valor: Number(movimiento.valor || 0),
      })),
      ...gastosCarteraDia.map((gasto) => ({
        tipo: "EGRESO",
        concepto: `${CONCEPTO_GASTO_CARTERA}${
          gasto.observacion ? ` - ${gasto.observacion}` : ""
        }`,
        sedeNombre: gasto.sede?.nombre || "-",
        valor: Number(gasto.valor || 0),
      })),
    ];
    const detallesVentasCierre: SaleDetailRow[] = ventasDetalleDia.map((venta) => {
      const ventaRecord = venta as unknown as Record<string, unknown>;
      const registro = registrosPorVenta.get(venta.id) as
        (Record<string, unknown> & { ventaIdRelacionada?: number | null }) | undefined;
      const financierasVenta = financierasVentaTexto(ventaRecord);
      const financierasRegistro = financierasRegistroTexto(
        registro?.financierasDetalle
      );

      return {
        codigo: textoLimpio(venta.idVenta),
        cliente: textoLimpio(registro?.clienteNombre) || "Venta sin registro vendedor vinculado",
        equipo: buildEquipoVenta(ventaRecord, registro),
        sede: venta.sede?.nombre || "-",
        ingresos: buildIngresosVenta(ventaRecord, registro),
        financieras:
          financierasVenta === "-" ? financierasRegistro || "-" : financierasVenta,
      };
    });
    const catalogoPersonal =
      vista === "tabla" ? await obtenerCatalogoPersonalVenta() : null;
    const tablaCierre = buildSaleTableRows(
      ventasDetalleDia as unknown as Array<Record<string, unknown> & { id: number }>,
      registrosPorVenta as Map<number, Record<string, unknown> | undefined>,
      catalogoPersonal?.financieras
    );
    const cajaAcumulada =
      n(ventasCajaAcumulada._sum.cajaOficina) +
      n(ingresosCajaAcumulados._sum.valor) -
      n(egresosCajaAcumulados._sum.valor);

    const fonts = getPdfFonts();

    if (vista === "tabla") {
      const baseFileName = `cierre-del-dia-prueba-${periodo.key}${
        sedeIdFiltro ? `-sede-${sedeIdFiltro}` : ""
      }`;

      if (formato === "excel" || formato === "xlsx") {
        const excelBuffer = await buildExcelCierreTabla({
          periodoKey: periodo.key,
          cobertura,
          rows: tablaCierre.rows,
          financieras: tablaCierre.financieras,
          movimientos: movimientosCierre,
        });

        return new Response(Uint8Array.from(excelBuffer), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${baseFileName}.xlsx"`,
            "Cache-Control": "no-store",
          },
        });
      }

      const pdfBuffer = await buildPdfCierreTabla({
        periodoLabel: periodo.label,
        cobertura,
        rows: tablaCierre.rows,
        financieras: tablaCierre.financieras,
        movimientos: movimientosCierre,
        previousSalesCount: ventasDiaAnterior,
        fonts,
      });

      return new Response(Uint8Array.from(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${baseFileName}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const doc = new PDFDocument({
      size: "LETTER",
      margin: 36,
      font: fonts.regular,
      info: {
        Title: "Cierre del dia",
        Author: "CONECTAMOS.APP",
      },
    });
    const bufferPromise = toBuffer(doc);
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 72;
    const columnWidth = (contentWidth - 18) / 2;

    doc
      .rect(0, 0, pageWidth, 116)
      .fill("#0f172a");

    doc
      .fillColor("#ffffff")
      .font(fonts.bold)
      .fontSize(23)
      .text("CIERRE DEL DIA", 36, 34);

    doc
      .fillColor("#cbd5e1")
      .font(fonts.regular)
      .fontSize(10)
      .text(`CONECTAMOS.APP | ${periodo.label} | ${cobertura}`, 36, 66);

    doc
      .fillColor("#cbd5e1")
      .fontSize(9)
      .text(`Generado: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}`, 36, 84);

    let y = 142;

    drawMetric(doc, 36, y, columnWidth, "Ventas del dia", String(ventasDia._count.id || 0), fonts);
    drawMetric(doc, 36 + columnWidth + 18, y, columnWidth, "Utilidad del dia", formatoPesos(n(ventasDia._sum.utilidad)), fonts, {
      accent: "#047857",
    });
    y += 92;

    drawMetric(doc, 36, y, columnWidth, "Ingresos del dia", formatoPesos(ingresosTotalesDia), fonts, {
      accent: "#0369a1",
    });
    drawMetric(doc, 36 + columnWidth + 18, y, columnWidth, "Salidas del dia", formatoPesos(egresosTotalesDia), fonts, {
      accent: "#be123c",
    });
    y += 92;

    drawMetric(doc, 36, y, columnWidth, "Comisiones del dia", formatoPesos(comisionesVentasDia), fonts, {
      accent: "#92400e",
    });
    drawMetric(doc, 36 + columnWidth + 18, y, columnWidth, "Dinero en caja - caja acumulada", formatoPesos(cajaAcumulada), fonts, {
      accent: "#0f172a",
    });
    y += 104;

    y = drawSectionTitle(doc, "Detalle de ventas", y, fonts);

    if (detallesVentasCierre.length === 0) {
      doc
        .roundedRect(36, y, contentWidth, 42, 10)
        .fillAndStroke("#f8fafc", "#dbe3ef");
      doc
        .fillColor("#64748b")
        .font(fonts.regular)
        .fontSize(10)
        .text("No hay ventas registradas para este dia.", 50, y + 15);
      y += 60;
    } else {
      for (const venta of detallesVentasCierre) {
        y = ensureSpace(doc, y, 154, fonts, "Detalle de ventas");
        y = drawSaleDetailCard(doc, venta, y, contentWidth, fonts);
      }
    }

    y += 18;

    if (y + 78 > 716) {
      doc.addPage();
      y = 44;
    }

    y = drawSectionTitle(doc, "Detalles de caja", y, fonts);

    if (movimientosCierre.length === 0) {
      doc
        .roundedRect(36, y, contentWidth, 42, 10)
        .fillAndStroke("#f8fafc", "#dbe3ef");
      doc
        .fillColor("#64748b")
        .font(fonts.regular)
        .fontSize(10)
        .text("No hay ingresos o salidas de caja registrados para este dia.", 50, y + 15);
      y += 60;
    } else {
      y = drawCashTableHeader(doc, y, fonts);

      for (const movimiento of movimientosCierre) {
        y = ensureSpace(doc, y, 24, fonts, "Detalles de caja");
        if (y === 66) {
          y = drawCashTableHeader(doc, y, fonts);
        }

        y = drawCashRow(doc, movimiento, y, fonts);
      }
    }

    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor("#94a3b8")
      .text("Este cierre usa ingresos de caja, ingresos de ventas, egresos de caja, salidas de ventas y comisiones registrados hasta el momento de generacion.", 36, 742, {
        width: contentWidth,
        align: "center",
      });

    doc.end();
    const buffer = await bufferPromise;
    const fileName = `cierre-del-dia-${periodo.key}${
      sedeIdFiltro ? `-sede-${sedeIdFiltro}` : ""
    }.pdf`;

    return new Response(Uint8Array.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("ERROR CIERRE DEL DIA:", error);
    return NextResponse.json(
      {
        error: "Error generando cierre del dia",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
