import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { numeroReciboAbonoProveedor } from "@/lib/proveedores";

type ReciboAbonoProveedorData = {
  aliado: string;
  aprobadoEn: Date;
  aprobadoPorNombre: string;
  facturaId: number;
  fechaVencimiento: Date | string;
  id: number;
  numeroFactura: string;
  observacion: string | null;
  referencia: string | null;
  saldoAnterior: { toString(): string } | number | string;
  saldoPosterior: { toString(): string } | number | string;
  valor: { toString(): string } | number | string;
  valorFactura: { toString(): string } | number | string;
};

const windowsFontDir = path.join(
  process.env.WINDIR || "C:\\Windows",
  "Fonts",
);
const SYSTEM_FONT_REGULAR = path.join(windowsFontDir, "arial.ttf");
const SYSTEM_FONT_BOLD = path.join(windowsFontDir, "arialbd.ttf");
const BUNDLED_FONT_REGULAR = path.join(
  process.cwd(),
  "public",
  "pdf-fonts",
  "Geist-Regular.ttf",
);
const LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "branding",
  "conectamos-logo.png",
);

function getPdfFonts() {
  if (existsSync(SYSTEM_FONT_REGULAR) && existsSync(SYSTEM_FONT_BOLD)) {
    return { bold: SYSTEM_FONT_BOLD, regular: SYSTEM_FONT_REGULAR };
  }

  return {
    bold: BUNDLED_FONT_REGULAR,
    regular: BUNDLED_FONT_REGULAR,
  };
}

function toBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function formatoDinero(value: ReciboAbonoProveedorData["valor"]) {
  const number = Number(value.toString());
  return new Intl.NumberFormat("es-CO", {
    currency: "COP",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  })
    .format(Number.isFinite(number) ? number : 0)
    .replace("COP", "$")
    .trim();
}

function formatoFechaHora(value: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(value);
}

function formatoFecha(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

export async function generarReciboAbonoProveedorPdf(
  data: ReciboAbonoProveedorData,
) {
  const fonts = getPdfFonts();
  const doc = new PDFDocument({
    bufferPages: true,
    margin: 44,
    info: {
      Author: "CONECTAMOS",
      Subject: `Abono a factura ${data.numeroFactura}`,
      Title: `Recibo ${numeroReciboAbonoProveedor(data.id)}`,
    },
    size: "A4",
  });
  const bufferPromise = toBuffer(doc);
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 88;
  const receiptNumber = numeroReciboAbonoProveedor(data.id);
  const paidInFull = Number(data.saldoPosterior.toString()) <= 0;

  doc.rect(0, 0, pageWidth, 12).fill("#E30613");

  if (existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 44, 34, { fit: [150, 44] });
  } else {
    doc
      .font(fonts.bold)
      .fontSize(20)
      .fillColor("#111827")
      .text("CONECTAMOS", 44, 42);
  }

  doc
    .font(fonts.bold)
    .fontSize(10)
    .fillColor("#E30613")
    .text("RECIBO DE ABONO A PROVEEDOR", pageWidth - 300, 40, {
      align: "right",
      width: 256,
    })
    .fontSize(20)
    .fillColor("#0F172A")
    .text(receiptNumber, pageWidth - 300, 56, {
      align: "right",
      width: 256,
    });

  doc
    .roundedRect(44, 104, contentWidth, 62, 10)
    .fill(paidInFull ? "#ECFDF5" : "#F8FAFC");
  doc
    .font(fonts.bold)
    .fontSize(12)
    .fillColor(paidInFull ? "#047857" : "#334155")
    .text(paidInFull ? "FACTURA LIQUIDADA" : "ABONO APLICADO", 60, 120)
    .font(fonts.regular)
    .fontSize(10)
    .fillColor("#475569")
    .text(
      `Registrado el ${formatoFechaHora(data.aprobadoEn)} por ${data.aprobadoPorNombre}.`,
      60,
      140,
      { width: contentWidth - 32 },
    );

  let y = 194;
  doc
    .font(fonts.bold)
    .fontSize(9)
    .fillColor("#64748B")
    .text("ALIADO", 44, y)
    .text("FACTURA", 310, y);
  y += 17;
  doc.font(fonts.bold).fontSize(13);
  const aliadoHeight = doc.heightOfString(data.aliado, { width: 240 });
  const facturaHeight = doc.heightOfString(data.numeroFactura, { width: 241 });
  const identificationHeight = Math.max(aliadoHeight, facturaHeight);

  doc
    .fillColor("#0F172A")
    .text(data.aliado, 44, y, { width: 240 })
    .text(data.numeroFactura, 310, y, { width: 241 });
  y += Math.max(42, identificationHeight + 12);
  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor("#64748B")
    .text(`Vencimiento: ${formatoFecha(data.fechaVencimiento)}`, 44, y)
    .text(`Registro interno de factura: ${data.facturaId}`, 310, y, {
      width: 241,
    });

  y += 38;
  const rows = [
    ["Valor original de la factura", formatoDinero(data.valorFactura)],
    ["Saldo antes del abono", formatoDinero(data.saldoAnterior)],
    ["Valor de este abono", formatoDinero(data.valor)],
    ["Saldo pendiente", formatoDinero(data.saldoPosterior)],
  ] as const;

  rows.forEach(([label, value], index) => {
    const rowY = y + index * 50;
    doc
      .roundedRect(44, rowY, contentWidth, 42, 8)
      .fill(index === 2 ? "#FEF2F2" : index === 3 ? "#ECFDF5" : "#F8FAFC");
    doc
      .font(index >= 2 ? fonts.bold : fonts.regular)
      .fontSize(10)
      .fillColor(index === 2 ? "#B91C1C" : "#475569")
      .text(label, 58, rowY + 14, { width: 280 })
      .font(fonts.bold)
      .fontSize(index >= 2 ? 13 : 11)
      .fillColor(index === 3 ? "#047857" : "#0F172A")
      .text(value, 350, rowY + 12, { align: "right", width: 187 });
  });

  y += rows.length * 50 + 18;

  if (data.referencia) {
    doc
      .font(fonts.bold)
      .fontSize(9)
      .fillColor("#64748B")
      .text("REFERENCIA DEL PAGO", 44, y)
      .font(fonts.regular)
      .fontSize(11)
      .fillColor("#0F172A")
      .text(data.referencia, 44, y + 16, { width: contentWidth });
    y += 48;
  }

  if (data.observacion) {
    doc
      .font(fonts.bold)
      .fontSize(9)
      .fillColor("#64748B")
      .text("OBSERVACION", 44, y)
      .font(fonts.regular)
      .fontSize(10)
      .fillColor("#334155")
      .text(data.observacion, 44, y + 16, { width: contentWidth });
  }

  doc
    .moveTo(44, doc.page.height - 72)
    .lineTo(pageWidth - 44, doc.page.height - 72)
    .strokeColor("#CBD5E1")
    .stroke();
  doc
    .font(fonts.regular)
    .fontSize(8)
    .fillColor("#64748B")
    .text(
      "Comprobante interno generado por CONECTAMOS. Este documento conserva la trazabilidad del abono aplicado a la factura indicada.",
      44,
      doc.page.height - 58,
      { align: "center", width: contentWidth },
    );

  doc.end();
  return bufferPromise;
}
