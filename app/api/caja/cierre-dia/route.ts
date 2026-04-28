import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getTodayBogotaRange } from "@/lib/ventas-utils";

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

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";
    const today = getTodayBogotaRange();
    const scope = esAdmin ? {} : { sedeId: user.sedeId };
    const cobertura = esAdmin ? "Todas las sedes" : user.sedeNombre;

    const [
      ventasDia,
      movimientosDia,
      ventasCajaAcumulada,
      ingresosCajaAcumulados,
      egresosCajaAcumulados,
    ] = await Promise.all([
      prisma.venta.aggregate({
        where: {
          fecha: {
            gte: today.start,
            lt: today.end,
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
            gte: today.start,
            lt: today.end,
          },
          NOT: {
            concepto: CONCEPTO_GASTO_CARTERA,
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

    const ingresosDia = movimientosDia
      .filter((movimiento) => String(movimiento.tipo || "").toUpperCase() === "INGRESO")
      .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
    const egresosDia = movimientosDia
      .filter((movimiento) => String(movimiento.tipo || "").toUpperCase() === "EGRESO")
      .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0);
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
      .text(`CONECTAMOS.APP | ${today.label} | ${cobertura}`, 36, 66);

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
    drawMetric(doc, 36 + columnWidth + 18, y, columnWidth, "Egresos del dia", formatoPesos(egresosDia), fonts, {
      accent: "#be123c",
    });
    y += 92;

    drawMetric(doc, 36, y, columnWidth, "Comisiones pagadas", formatoPesos(n(ventasDia._sum.comision)), fonts, {
      accent: "#92400e",
    });
    drawMetric(doc, 36 + columnWidth + 18, y, columnWidth, "Salida de ventas", formatoPesos(n(ventasDia._sum.salida)), fonts, {
      accent: "#7c2d12",
    });
    y += 92;

    drawMetric(doc, 36, y, contentWidth, "Dinero en caja - caja acumulada", formatoPesos(cajaAcumulada), fonts, {
      accent: "#0f172a",
    });
    y += 105;

    doc
      .fillColor("#0f172a")
      .font(fonts.bold)
      .fontSize(13)
      .text("Movimientos de caja del dia", 36, y);

    y += 22;

    if (movimientosDia.length === 0) {
      doc
        .roundedRect(36, y, contentWidth, 42, 10)
        .fillAndStroke("#f8fafc", "#dbe3ef");
      doc
        .fillColor("#64748b")
        .font(fonts.regular)
        .fontSize(10)
        .text("No hay ingresos o egresos registrados en caja para este dia.", 50, y + 15);
    } else {
      doc
        .fillColor("#475569")
        .font(fonts.bold)
        .fontSize(8)
        .text("TIPO", 42, y)
        .text("CONCEPTO", 106, y)
        .text("SEDE", 300, y)
        .text("VALOR", 464, y, { width: 104, align: "right" });
      y += 16;

      for (const movimiento of movimientosDia.slice(0, 14)) {
        if (y > 700) break;

        doc
          .moveTo(36, y - 5)
          .lineTo(576, y - 5)
          .strokeColor("#e2e8f0")
          .stroke();

        doc
          .fillColor("#0f172a")
          .font(fonts.regular)
          .fontSize(8.5)
          .text(String(movimiento.tipo || "-"), 42, y, { width: 58 })
          .text(String(movimiento.concepto || "-"), 106, y, {
            width: 184,
            ellipsis: true,
          })
          .text(movimiento.sede?.nombre || "-", 300, y, {
            width: 150,
            ellipsis: true,
          })
          .text(formatoPesos(Number(movimiento.valor || 0)), 464, y, {
            width: 104,
            align: "right",
          });

        y += 20;
      }
    }

    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor("#94a3b8")
      .text("Este cierre usa las ventas del dia y los movimientos de caja registrados hasta el momento de generacion.", 36, 742, {
        width: contentWidth,
        align: "center",
      });

    doc.end();
    const buffer = await bufferPromise;
    const fileName = `cierre-del-dia-${today.key}.pdf`;

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
