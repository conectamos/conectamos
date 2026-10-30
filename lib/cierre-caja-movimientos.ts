export type CashMovementRow = {
  id: string;
  createdAt: Date | string | null;
  tipo: string;
  concepto: string;
  descripcion: string;
  sedeNombre: string;
  valor: number;
};

type PdfFonts = { regular: string; bold: string };
type MovementColumn = { key: "movimiento" | "detalle" | "sede" | "valor"; title: string; width: number };

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function cashMovementReference(row: CashMovementRow) {
  if (!row.id) return "Sin referencia";
  return row.id.startsWith("GC-") ? row.id : `#${row.id}`;
}

export function cashMovementDate(row: CashMovementRow) {
  const date = row.createdAt ? new Date(row.createdAt) : null;
  return date && !Number.isNaN(date.getTime()) ? dateFormatter.format(date) : "Sin fecha registrada";
}

export function cashMovementDetails(row: CashMovementRow) {
  return `${row.concepto}\n${row.descripcion || "Sin detalle registrado"}`;
}

/** Keep every character, including stored line breaks, when a detail needs continuation rows. */
export function cashMovementExcelParts(text: string, charactersPerLine = 70, linesPerRow = 22) {
  const parts: string[] = [];
  let remaining = text;
  while (remaining) {
    let lines = 1;
    let column = 0;
    let offset = 0;
    let wordBreak = 0;
    for (const character of remaining) {
      if (character === "\n" || column >= charactersPerLine) { lines += 1; column = 0; }
      if (lines > linesPerRow) break;
      if (character !== "\n" && character !== "\r") column += 1;
      offset += character.length;
      if (/\s/u.test(character)) wordBreak = offset;
    }
    if (offset < remaining.length && wordBreak > offset / 2) offset = wordBreak;
    const end = Math.max(1, offset);
    parts.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  return parts.length ? parts : [""];
}

function movementColumns(width: number): MovementColumn[] {
  const movement = Math.max(106, width * 0.17);
  const sede = Math.max(78, width * 0.16);
  const amount = Math.max(90, width * 0.13);
  return [
    { key: "movimiento", title: "MOVIMIENTO", width: movement },
    { key: "detalle", title: "CONCEPTO Y DETALLE", width: width - movement - sede - amount },
    { key: "sede", title: "SEDE", width: sede },
    { key: "valor", title: "VALOR", width: amount },
  ];
}

const fontSize = 9;
const padding = 7;
const textOptions = (width: number) => ({ width: width - padding * 2, lineGap: 1.4, paragraphGap: 0 });

function textHeight(doc: PDFKit.PDFDocument, text: string, width: number, font: string) {
  return text ? doc.font(font).fontSize(fontSize).heightOfString(text, textOptions(width)) : 0;
}

function fittingText(doc: PDFKit.PDFDocument, text: string, width: number, height: number, font: string) {
  if (!text || textHeight(doc, text, width, font) <= height) return [text, ""];
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (textHeight(doc, characters.slice(0, middle).join(""), width, font) <= height) low = middle;
    else high = middle - 1;
  }
  // Prefer a word boundary; a long identifier still wraps without losing characters.
  let end = Math.max(1, low);
  for (let index = end - 1; index >= Math.floor(end / 2); index -= 1) {
    if (/\s/u.test(characters[index])) { end = index + 1; break; }
  }
  return [characters.slice(0, end).join(""), characters.slice(end).join("")];
}

function drawHeader(doc: PDFKit.PDFDocument, columns: MovementColumn[], x: number, y: number, fonts: PdfFonts) {
  const height = 28;
  let left = x;
  for (const column of columns) {
    doc.rect(left, y, column.width, height).fillAndStroke("#151923", "#334155");
    doc.font(fonts.bold).fontSize(8.5).fillColor("#ffffff").text(column.title, left + padding, y + 8, {
      width: column.width - padding * 2, align: column.key === "valor" ? "right" : "left", lineGap: 0,
    });
    left += column.width;
  }
  return y + height;
}

/** Shared full-width table for A3 and portrait reports. Page callbacks only draw document headings. */
export function drawCashMovementsTable(doc: PDFKit.PDFDocument, rows: CashMovementRow[], options: {
  x: number;
  y: number;
  width: number;
  bottomMargin: number;
  fonts: PdfFonts;
  onPage: () => number;
  formatAmount: (amount: number) => string;
}) {
  const { x, width, fonts } = options;
  const columns = movementColumns(width);
  let y = drawHeader(doc, columns, x, options.y, fonts);
  let pageBodyTop = y;
  const nextPage = () => {
    y = drawHeader(doc, columns, x, options.onPage(), fonts);
    pageBodyTop = y;
  };
  rows.forEach((row, index) => {
    const reference = cashMovementReference(row);
    let remaining: Record<MovementColumn["key"], string> = {
      movimiento: `${row.tipo}\n${reference}\n${cashMovementDate(row)}`,
      detalle: cashMovementDetails(row), sede: row.sedeNombre, valor: options.formatAmount(row.valor),
    };
    let continuation = false;
    while (Object.values(remaining).some(Boolean)) {
      let available = doc.page.height - options.bottomMargin - y;
      const fullHeight = Math.max(32, ...columns.map(column => textHeight(doc, remaining[column.key], column.width, fonts.regular) + padding * 2));
      if (available < 48 || (fullHeight > available && y > pageBodyTop)) {
        nextPage();
        available = doc.page.height - options.bottomMargin - y;
      }
      const values = { ...remaining };
      const following = { ...remaining };
      for (const column of columns) {
        [values[column.key], following[column.key]] = fittingText(doc, remaining[column.key], column.width, available - padding * 2 - 1, fonts.regular);
      }
      if (continuation && !values.movimiento) values.movimiento = `${reference}\nContinuación`;
      const height = Math.max(32, ...columns.map(column => textHeight(doc, values[column.key], column.width, fonts.regular) + padding * 2));
      const expense = row.tipo.toUpperCase() === "EGRESO";
      const income = row.tipo.toUpperCase() === "INGRESO";
      const fill = expense ? "#fff1f2" : income ? "#ecfdf5" : index % 2 ? "#f8fafc" : "#ffffff";
      let left = x;
      for (const column of columns) {
        doc.rect(left, y, column.width, height).fillAndStroke(fill, "#e2e8f0");
        if (values[column.key]) doc.font(fonts.regular).fontSize(fontSize)
          .fillColor(column.key === "valor" && expense ? "#9f2737" : column.key === "valor" && income ? "#16694f" : "#151923")
          .text(values[column.key], left + padding, y + padding, {
            ...textOptions(column.width), align: column.key === "valor" ? "right" : "left",
          });
        left += column.width;
      }
      y += height;
      remaining = following;
      continuation = true;
      if (Object.values(remaining).some(Boolean)) nextPage();
    }
  });
  return y;
}
