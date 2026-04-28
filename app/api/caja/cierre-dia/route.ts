import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { extraerFinancierasDetalle } from "@/lib/ventas-financieras";
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
  venta: string;
  ingresos: string;
  financieras: string;
  credito: string;
  egresos: string;
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

function buildIngresosVenta(
  venta: Record<string, unknown>,
  registro?: Record<string, unknown>
) {
  const primerIngresoNombre =
    textoLimpio(venta.ingreso1) || textoLimpio(venta.tipoIngreso) || "Ingreso";
  const segundoIngresoNombre = textoLimpio(venta.ingreso2) || "Ingreso 2";

  return joinParts([
    moneyPart(primerIngresoNombre, venta.primerValor || venta.ingreso),
    moneyPart(segundoIngresoNombre, venta.segundoValor),
    registro
      ? moneyPart(
          textoLimpio(registro.medioPago1Tipo) || "Inicial 1",
          registro.medioPago1Valor || registro.cuotaInicial
        )
      : null,
    registro
      ? moneyPart(
          textoLimpio(registro.medioPago2Tipo) || "Inicial 2",
          registro.medioPago2Valor
        )
      : null,
  ]);
}

function buildCreditoVenta(registro?: Record<string, unknown>) {
  if (!registro) return "Sin registro vendedor";

  const detalleFinancieras = financierasRegistroTexto(
    registro.financierasDetalle
  );

  return joinParts([
    detalleFinancieras,
    detalleFinancieras ? null : textoLimpio(registro.plataformaCredito),
    detalleFinancieras
      ? null
      : moneyPart("Aut", registro.creditoAutorizado),
    detalleFinancieras ? null : moneyPart("Inicial", registro.cuotaInicial),
  ], "Sin credito registrado");
}

function buildVentaLabel(
  venta: Record<string, unknown>,
  registro?: Record<string, unknown>
) {
  return joinParts([
    textoLimpio(venta.idVenta),
    textoLimpio(registro?.clienteNombre),
    textoLimpio(venta.servicio),
    textoLimpio(registro?.referenciaEquipo) || textoLimpio(venta.descripcion),
    textoLimpio(venta.serial || registro?.serialImei)
      ? `IMEI ${textoLimpio(venta.serial || registro?.serialImei)}`
      : null,
    textoLimpio((venta.sede as { nombre?: string } | null)?.nombre),
  ]);
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

function drawSaleDetailTableHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  fonts: PdfFonts
) {
  doc
    .fillColor("#475569")
    .font(fonts.bold)
    .fontSize(8)
    .text("VENTA", 42, y)
    .text("INICIALES / INGRESOS", 138, y)
    .text("FINANCIERAS", 258, y)
    .text("CREDITO", 398, y)
    .text("EGRESOS", 500, y);

  return y + 16;
}

function drawSaleDetailRow(
  doc: PDFKit.PDFDocument,
  row: SaleDetailRow,
  y: number,
  fonts: PdfFonts
) {
  const rowHeight = 58;

  doc
    .moveTo(36, y - 5)
    .lineTo(576, y - 5)
    .strokeColor("#e2e8f0")
    .stroke();

  doc
    .fillColor("#0f172a")
    .font(fonts.regular)
    .fontSize(7.6)
    .text(row.venta, 42, y, { width: 86, height: 44, ellipsis: true })
    .text(row.ingresos, 138, y, { width: 108, height: 44, ellipsis: true })
    .text(row.financieras, 258, y, { width: 128, height: 44, ellipsis: true })
    .text(row.credito, 398, y, { width: 90, height: 44, ellipsis: true })
    .text(row.egresos, 500, y, { width: 68, height: 44, ellipsis: true });

  return y + rowHeight;
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
    const periodo = getBogotaDayRangeFromInput(fechaParam) || getTodayBogotaRange();
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
          comision: true,
          salida: true,
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
    const ingresosDia = movimientosDia
      .filter((movimiento) => String(movimiento.tipo || "").toUpperCase() === "INGRESO")
      .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
    const egresosDia = movimientosDia
      .filter((movimiento) => String(movimiento.tipo || "").toUpperCase() === "EGRESO")
      .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
    const egresosCarteraDia = gastosCarteraDia.reduce(
      (acc, gasto) => acc + Number(gasto.valor || 0),
      0
    );
    const comisionesVentasDia = n(ventasDia._sum.comision);
    const salidasVentasTotal = n(ventasDia._sum.salida);
    const egresosTotalesDia =
      egresosDia + egresosCarteraDia + comisionesVentasDia + salidasVentasTotal;
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
        venta: buildVentaLabel(ventaRecord, registro),
        ingresos: buildIngresosVenta(ventaRecord, registro),
        financieras:
          financierasVenta === "-" ? financierasRegistro || "-" : financierasVenta,
        credito: buildCreditoVenta(registro),
        egresos: joinParts([
          moneyPart("Com", venta.comision),
          moneyPart("Salida", venta.salida),
        ]),
      };
    });
    const cajaAcumulada =
      n(ventasCajaAcumulada._sum.cajaOficina) +
      n(ingresosCajaAcumulados._sum.valor) -
      n(egresosCajaAcumulados._sum.valor);

    const fonts = getPdfFonts();
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

    drawMetric(doc, 36, y, columnWidth, "Ingresos del dia", formatoPesos(ingresosDia), fonts, {
      accent: "#0369a1",
    });
    drawMetric(doc, 36 + columnWidth + 18, y, columnWidth, "Egresos del dia", formatoPesos(egresosTotalesDia), fonts, {
      accent: "#be123c",
    });
    y += 92;

    drawMetric(doc, 36, y, columnWidth, "Comisiones pagadas", formatoPesos(comisionesVentasDia), fonts, {
      accent: "#92400e",
    });
    drawMetric(doc, 36 + columnWidth + 18, y, columnWidth, "Salida de ventas", formatoPesos(salidasVentasTotal), fonts, {
      accent: "#7c2d12",
    });
    y += 92;

    drawMetric(doc, 36, y, contentWidth, "Dinero en caja - caja acumulada", formatoPesos(cajaAcumulada), fonts, {
      accent: "#0f172a",
    });
    y += 105;

    y = drawSectionTitle(doc, "Ingresos y egresos del dia", y, fonts);

    if (movimientosCierre.length === 0) {
      doc
        .roundedRect(36, y, contentWidth, 42, 10)
        .fillAndStroke("#f8fafc", "#dbe3ef");
      doc
        .fillColor("#64748b")
        .font(fonts.regular)
        .fontSize(10)
        .text("No hay ingresos o egresos registrados para este dia.", 50, y + 15);
      y += 60;
    } else {
      y = drawCashTableHeader(doc, y, fonts);

      for (const movimiento of movimientosCierre) {
        y = ensureSpace(doc, y, 24, fonts, "Ingresos y egresos del dia");
        if (y === 66) {
          y = drawCashTableHeader(doc, y, fonts);
        }

        y = drawCashRow(doc, movimiento, y, fonts);
      }
    }

    y = ensureSpace(doc, y + 18, 98, fonts, "Detalle de ventas del dia");
    y = drawSectionTitle(doc, "Detalle de ventas del dia", y, fonts);

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
      y = drawSaleDetailTableHeader(doc, y, fonts);

      for (const venta of detallesVentasCierre) {
        y = ensureSpace(doc, y, 64, fonts, "Detalle de ventas del dia");
        if (y === 66) {
          y = drawSaleDetailTableHeader(doc, y, fonts);
        }

        y = drawSaleDetailRow(doc, venta, y, fonts);
      }
    }

    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor("#94a3b8")
      .text("Este cierre usa las ventas del dia, movimientos de caja, gastos de cartera, comisiones y salidas registrados hasta el momento de generacion.", 36, 742, {
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
