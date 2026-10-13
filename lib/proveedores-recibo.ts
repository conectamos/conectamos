import "server-only";

import path from "node:path";
import PDFDocument from "pdfkit";
import { numeroReciboAbonoProveedor } from "@/lib/proveedores";
import { decimalProveedorACentavos } from "@/lib/proveedores-pagos";

type Money = { toString(): string } | number | string;
export type ReciboAbonoProveedorData = {
  aliado: string;
  aprobadoEn: Date;
  aprobadoPorNombre: string;
  facturaId: number;
  fechaVencimiento: Date | string;
  id: number;
  numeroFactura: string;
  observacion: string | null;
  referencia: string | null;
  saldoAnterior: Money;
  saldoPosterior: Money;
  valor: Money;
  valorFactura: Money;
  // Current payments are immutable approved records. Future callers must not
  // present a canceled or unrecognized state as an active payment.
  estado?: string;
};

const FONT_REGULAR = path.join(process.cwd(), "public", "pdf-fonts", "LiberationSans-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "public", "pdf-fonts", "LiberationSans-Bold.ttf");
const LOGO_PATH = path.join(process.cwd(), "public", "branding", "conectamos-logo.png");
const COLOR = {
  ink: "#111318", muted: "#626975", border: "#C7CCD3",
  soft: "#F0F1F3", graphite: "#252B31", red: "#E30613", white: "#FFFFFF",
};

function toBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function moneyInCents(value: Money) {
  const cents = decimalProveedorACentavos(value);
  if (cents === null) throw new Error("El recibo contiene un importe histórico inválido");
  return cents;
}

function formatoDinero(cents: number) {
  const integer = Math.floor(cents / 100).toLocaleString("es-CO");
  return `$${integer},${String(cents % 100).padStart(2, "0")}`;
}

function formatoFechaHora(value: Date) {
  if (Number.isNaN(value.getTime())) throw new Error("Fecha de abono inválida");
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota",
  }).format(value);
}

function formatoFecha(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Vencimiento de factura inválido");
  // @db.Date is a calendar date, not a timestamp at Colombian midnight.
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

type Field = { label: string; value: string; bold?: boolean };

export async function generarReciboAbonoProveedorPdf(data: ReciboAbonoProveedorData) {
  const original = moneyInCents(data.valorFactura);
  const before = moneyInCents(data.saldoAnterior);
  const after = moneyInCents(data.saldoPosterior);
  const amount = moneyInCents(data.valor);
  if (amount <= 0 || before > original || before - amount !== after) {
    throw new Error("Los saldos históricos del abono no son consistentes");
  }
  const registeredAt = formatoFechaHora(data.aprobadoEn);
  const dueDate = formatoFecha(data.fechaVencimiento);
  const state = (data.estado ?? "APLICADO").trim().toUpperCase();
  const applied = ["APLICADO", "APROBADO"].includes(state);
  const annulled = ["ANULADO", "CANCELADO"].includes(state);
  const status = applied ? "Abono aplicado" : annulled ? "Abono anulado" : "Abono no aplicado";
  const receiptNumber = numeroReciboAbonoProveedor(data.id);
  const doc = new PDFDocument({
    size: "A4", margin: 30, bufferPages: true,
    // Both weights are embedded in every environment. An initial TTF prevents
    // PDFKit from trying to read its default Helvetica AFM in production.
    font: FONT_REGULAR,
    info: {
      Author: "CONECTAMOS", Subject: `Abono a factura ${data.numeroFactura}`,
      Title: `RECIBO DE ABONO A PROVEEDOR ${receiptNumber}`,
      CreationDate: data.aprobadoEn, ModDate: data.aprobadoEn,
    },
  });
  const bufferPromise = toBuffer(doc);
  doc.registerFont("regular", FONT_REGULAR).registerFont("bold", FONT_BOLD);
  const left = 30;
  const width = doc.page.width - left * 2;
  const bottom = doc.page.height - 62;
  let y = 30;

  function text(value: string, x: number, top: number, size: number, options: {
    bold?: boolean; color?: string; width?: number; align?: "left" | "center" | "right";
  } = {}) {
    doc.font(options.bold ? "bold" : "regular").fontSize(size).fillColor(options.color ?? COLOR.ink);
    const available = options.width ?? width;
    const textWidth = doc.widthOfString(value);
    const offset = options.align === "right" ? available - textWidth
      : options.align === "center" ? (available - textWidth) / 2 : 0;
    // All wrapping is managed above. Omitting width prevents PDFKit's automatic
    // pagination when drawing a footer below the body margin.
    doc.text(value, x + offset, top, { lineBreak: false });
  }

  function fitSize(value: string, available: number, preferred: number, minimum: number, bold = true) {
    doc.font(bold ? "bold" : "regular");
    let size = preferred;
    while (size > minimum && doc.fontSize(size).widthOfString(value) > available) size -= 0.5;
    return size;
  }

  function lines(value: string, available: number, size: number, bold = false) {
    doc.font(bold ? "bold" : "regular").fontSize(size);
    const result: string[] = [];
    for (const paragraph of String(value).replace(/[\u0000-\u0008\u000B-\u001F]/g, "").split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (doc.widthOfString(candidate) <= available) { line = candidate; continue; }
        if (line) { result.push(line); line = ""; }
        // Preserve all characters even for long unbroken references/URLs.
        for (const character of word) {
          if (line && doc.widthOfString(line + character) > available) {
            result.push(line); line = "";
          }
          line += character;
        }
      }
      result.push(line);
    }
    return result.length ? result : ["-"];
  }

  function rule(x: number, top: number, end: number, color: string = COLOR.border, weight = 0.6) {
    doc.moveTo(x, top).lineTo(end, top).lineWidth(weight).strokeColor(color).stroke();
  }

  function box(top: number, height: number, fill: string = COLOR.white) {
    doc.roundedRect(left, top, width, height, 4).lineWidth(0.7).fillAndStroke(fill, COLOR.border);
  }

  function newPage() {
    doc.addPage();
    text("CONECTAMOS", left, 28, 12, { bold: true });
    text(receiptNumber, left + width / 2, 28, 12, { bold: true, color: COLOR.red, width: width / 2, align: "right" });
    rule(left, 50, left + width, COLOR.red, 1.5);
    y = 64;
  }

  function ensure(height: number) { if (y + height > bottom) newPage(); }

  function sectionHeading(title: string) {
    box(y, 36);
    text(title, left + 18, y + 9, 17, { bold: true, width: width - 36 });
    y += 36;
  }

  function fieldRows(rows: Field[][], title?: string) {
    if (title) { ensure(88); sectionHeading(title); }
    for (const fields of rows) {
      const cellWidth = width / fields.length;
      const wrapped = fields.map((field) => lines(field.value || "Sin dato", cellWidth - 36, 13, field.bold));
      let offset = 0;
      const maxLines = Math.max(...wrapped.map((value) => value.length));
      while (offset < maxLines) {
        const remainingHeight = 30 + (maxLines - offset) * 17;
        const fullPageHeight = bottom - 100;
        if (y + Math.max(52, remainingHeight) > bottom && remainingHeight <= fullPageHeight) {
          newPage(); if (title) sectionHeading(`${title} (continuación)`);
        }
        if (bottom - y < 52) { newPage(); if (title) sectionHeading(`${title} (continuación)`); }
        const count = Math.min(maxLines - offset, Math.floor((bottom - y - 30) / 17));
        const height = Math.max(52, 30 + count * 17);
        box(y, height);
        fields.forEach((field, index) => {
          const x = left + cellWidth * index;
          if (index > 0) doc.moveTo(x, y).lineTo(x, y + height).lineWidth(0.6).strokeColor(COLOR.border).stroke();
          text(field.label, x + 18, y + 11, 9.5, { color: COLOR.muted, width: cellWidth - 36 });
          wrapped[index].slice(offset, offset + count).forEach((line, lineIndex) => {
            text(line, x + 18, y + 27 + lineIndex * 17, 13, { bold: field.bold, width: cellWidth - 36 });
          });
        });
        y += height;
        offset += count;
      }
    }
  }

  // Official existing logo asset, preserving its original aspect ratio.
  doc.image(LOGO_PATH, left, y, { fit: [72, 72], align: "center", valign: "center" });
  text("CONECTAMOS", left + 81, 56, 19, { bold: true, width: 185 });
  const headingX = left + 292;
  const headingWidth = width - 292;
  text("RECIBO DE ABONO", headingX, 36, fitSize("RECIBO DE ABONO", headingWidth, 21, 16), { bold: true, width: headingWidth, align: "right" });
  text("A PROVEEDOR", headingX, 63, 12, { bold: true, width: headingWidth, align: "right" });
  text(receiptNumber, headingX, 82, fitSize(receiptNumber, headingWidth, 20, 12), { bold: true, color: COLOR.red, width: headingWidth, align: "right" });
  rule(left, 120, left + width, COLOR.red, 2);
  y = 138;

  const registrationText = `Registrado el ${registeredAt.replace(/\.$/, "")}.`;
  const statusSubtitle = applied
    ? registrationText
    : `${registrationText} Los saldos corresponden al registro original.`;
  const statusLines = lines(statusSubtitle, width - 89, 11.5);
  const statusHeight = Math.max(64, 37 + statusLines.length * 14);
  box(y, statusHeight);
  doc.circle(left + 35, y + statusHeight / 2, 17).lineWidth(1.7).strokeColor(COLOR.ink).stroke();
  const cy = y + statusHeight / 2;
  if (applied) doc.moveTo(left + 27, cy).lineTo(left + 33, cy + 6).lineTo(left + 44, cy - 7).lineWidth(2).stroke();
  else doc.moveTo(left + 29, cy - 6).lineTo(left + 41, cy + 6).moveTo(left + 41, cy - 6).lineTo(left + 29, cy + 6).lineWidth(1.7).stroke();
  text(status, left + 69, y + 14, 16, { bold: true, width: width - 89 });
  if (applied && after === 0) text("Factura pagada", left + width - 130, y + 16, 10, { bold: true, width: 110, align: "right" });
  statusLines.forEach((line, index) => text(line, left + 69, y + 37 + index * 14, 11.5, { color: COLOR.muted, width: width - 89 }));
  y += statusHeight + 16;

  doc.roundedRect(left, y, width, 72, 4).fill(COLOR.graphite);
  const dividerX = left + width * 0.49;
  doc.moveTo(dividerX, y + 14).lineTo(dividerX, y + 58).lineWidth(0.7).strokeColor("#A6ABB2").stroke();
  text("VALOR DEL ABONO", left + 18, y + 25, 18, { bold: true, color: COLOR.white, width: width * 0.49 - 36 });
  const amountWidth = width * 0.51 - 34;
  const amountSize = fitSize(formatoDinero(amount), amountWidth, 29, 15);
  text(formatoDinero(amount), dividerX + 16, y + (72 - amountSize * 1.15) / 2, amountSize, { bold: true, color: COLOR.white, width: amountWidth, align: "right" });
  y += 84;

  fieldRows([
    [{ label: "PROVEEDOR", value: data.aliado, bold: true }, { label: "FACTURA", value: data.numeroFactura, bold: true }],
    [{ label: "VENCIMIENTO", value: dueDate }, { label: "REGISTRO INTERNO DE FACTURA", value: String(data.facturaId) }],
  ], "Datos del proveedor");
  y += 12;

  // Keep the financial table together. These are this payment's immutable
  // balances, never the invoice's balance at download time.
  ensure(194);
  sectionHeading("Detalle del abono");
  const conceptWidth = width * 0.63;
  doc.rect(left, y, width, 26).lineWidth(0.6).fillAndStroke(COLOR.soft, COLOR.border);
  text("CONCEPTO", left + 18, y + 7, 10, { bold: true, color: COLOR.muted });
  text("VALOR", left + conceptWidth + 12, y + 7, 10, { bold: true, color: COLOR.muted, width: width - conceptWidth - 30, align: "right" });
  doc.moveTo(left + conceptWidth, y).lineTo(left + conceptWidth, y + 116).lineWidth(0.6).strokeColor(COLOR.border).stroke();
  y += 26;
  const amountLabel = applied ? "Abono aplicado" : annulled ? "Abono registrado (anulado)" : "Abono registrado (no aplicado)";
  for (const [label, value] of [
    ["Valor original de la factura", original], ["Saldo antes del abono", before], [amountLabel, amount],
  ] as const) {
    doc.rect(left, y, width, 30).lineWidth(0.6).strokeColor(COLOR.border).stroke();
    text(label, left + 18, y + 8, 12, { width: conceptWidth - 36 });
    const available = width - conceptWidth - 30;
    text(formatoDinero(value), left + conceptWidth + 12, y + 8, fitSize(formatoDinero(value), available, 12.5, 9, false), { width: available, align: "right" });
    y += 30;
  }
  doc.roundedRect(left, y, width, 42, 3).lineWidth(0.6).fillAndStroke(COLOR.soft, COLOR.border);
  doc.roundedRect(left, y, 3, 42, 1).fill(COLOR.red);
  text(applied ? "Saldo pendiente" : "Saldo histórico posterior", left + 18, y + 13, 14, { bold: true, width: conceptWidth - 36 });
  const balanceWidth = width - conceptWidth - 30;
  text(formatoDinero(after), left + conceptWidth + 12, y + 12, fitSize(formatoDinero(after), balanceWidth, 17, 10), { bold: true, width: balanceWidth, align: "right" });
  y += 54;

  fieldRows([[{ label: "REFERENCIA DEL PAGO", value: data.referencia || "Sin referencia" }, { label: "REGISTRADO POR", value: data.aprobadoPorNombre }]]);
  if (data.observacion) {
    y += 12;
    fieldRows([[{ label: "OBSERVACIÓN", value: data.observacion }]]);
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    const footerY = doc.page.height - 39;
    rule(left, footerY, left + width, "#949BA5");
    text("CONECTAMOS · Recibo de abono a proveedor", left, footerY + 9, 8.5, { color: COLOR.muted, width, align: "center" });
    if (range.count > 1) text(`${index + 1} / ${range.count}`, left + width - 40, footerY + 9, 8, { color: COLOR.muted, width: 40, align: "right" });
  }
  doc.end();
  return bufferPromise;
}
