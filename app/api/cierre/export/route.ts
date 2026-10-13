import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { CierreRequestError, readCierreReport } from "@/lib/cierre-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const report = await readCierreReport(new URL(request.url).searchParams, session, false, true);
    const book = new ExcelJS.Workbook();
    book.creator = "CONECTAMOS";
    const summary = book.addWorksheet("Cierre");
    summary.addRows([
      ["CIERRE", report.period.label, report.scope.label],
      ["Estado", report.complete ? "Completo" : "Información pendiente; totales parciales"],
      ["Última actualización", report.lastUpdatedAt || "Pendiente"],
      [], ["Financiera", "Unidades de créditos", "Valor de los créditos", "Estado", "Fuente"],
      ...report.financiers.map((r) => [r.name, r.units ?? "Pendiente", r.amount ?? "Pendiente", r.complete ? "Completo" : "Pendiente", r.source]),
      ["TOTAL", report.totals.units ?? "Pendiente", report.totals.amount ?? "Pendiente"],
    ]);
    summary.columns = [{ width: 28 }, { width: 30 }, { width: 30 }, { width: 24 }, { width: 52 }];
    summary.getColumn(3).numFmt = '"$" #,##0.00';
    const sheet = book.addWorksheet("Créditos", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Financiera", key: "financial", width: 22 }, { header: "Fecha (America/Bogota)", key: "date", width: 25 },
      { header: "Número del crédito", key: "creditNumber", width: 26 }, { header: "Cliente", key: "customerName", width: 32 },
      { header: "Cédula", key: "customerDocument", width: 20 }, { header: "Sede", key: "sedeName", width: 28 },
      { header: "Valor del crédito", key: "amount", width: 24, style: { numFmt: '"$" #,##0.00' } },
      { header: "Estado", key: "status", width: 20 }, { header: "Fuente", key: "source", width: 34 },
      { header: "Referencia local", key: "localReference", width: 24 },
    ];
    const formatter = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
    for (const row of report.items) sheet.addRow({ ...row, date: formatter.format(new Date(row.date)), creditNumber: row.creditNumber || "No informado", customerName: row.customerName || "No informado" });
    for (const [ws, index] of [[summary, 5], [sheet, 1]] as const) {
      ws.getRow(index).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF11161D" } }; });
    }
    const buffer = await book.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cierre-${report.period.from}-${report.period.to}.xlsx"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CierreRequestError ? error.message : "No fue posible exportar el cierre" }, { status: error instanceof CierreRequestError ? error.status : 503 });
  }
}
