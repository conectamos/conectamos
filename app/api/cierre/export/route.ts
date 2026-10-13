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
      ["Estado", report.coverageLabel],
      ["Última actualización", report.lastUpdatedAt || "Pendiente"],
      [], ["Financiera", "Unidades de créditos", "Valor de los créditos", "Estado", "Fuente"],
      ...report.financiers.map((r) => [r.name, r.units ?? "Sin confirmar", r.amount ?? "Sin confirmar", r.coverageLabel, r.source]),
      ["TOTAL", report.totals.units ?? "Sin confirmar", report.totals.amount ?? "Sin confirmar"],
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
    const sources = book.addWorksheet("Fuentes", { views: [{ state: "frozen", ySplit: 1 }] });
    sources.columns = [
      { header: "Financiera", key: "name", width: 22 }, { header: "Fuente utilizada", key: "source", width: 44 },
      { header: "Estado del cierre", key: "coverage", width: 28 }, { header: "Conciliación API", key: "sync", width: 28 },
      { header: "Periodo", key: "period", width: 26 }, { header: "Sede", key: "scope", width: 28 },
      { header: "Referencias", key: "total", width: 16 }, { header: "Consultadas vigentes", key: "consulted", width: 22 },
      { header: "Vinculadas con API", key: "linked", width: 22 }, { header: "Sin confirmación API", key: "unconfirmed", width: 22 },
      { header: "En cola", key: "queued", width: 16 }, { header: "Errores", key: "errors", width: 16 },
      { header: "Sin referencia", key: "withoutReference", width: 20 }, { header: "Última consulta exitosa", key: "lastSuccess", width: 30 },
      { header: "Última actividad", key: "lastActivity", width: 30 }, { header: "Disponible para reintento", key: "resumeAt", width: 30 },
      { header: "Periodo prioritario", key: "priority", width: 30 }, { header: "Observaciones de la respuesta", key: "reasons", width: 48 },
      { header: "Limitación de la fuente", key: "limitation", width: 90 },
    ];
    const syncLabels = { DESACTIVADA: "Desactivada", EN_COLA: "En cola", REVISADA_LIMITADA: "Revisada · cobertura parcial", ERROR: "Error de sincronización", SIN_REFERENCIA: "Sin referencia para consultar",
      CONSULTANDO: "Consulta en curso", PAUSADA: "Consultas en pausa", DETENIDA: "Sin actividad reciente" };
    for (const row of report.financiers) sources.addRow({
      name: row.name, source: row.source, coverage: row.coverageLabel,
      sync: row.providerSync ? syncLabels[row.providerSync.status] : "Fuente local",
      period: report.period.label, scope: report.scope.label,
      total: row.providerSync?.total ?? "No aplica", consulted: row.providerSync?.consulted ?? "No aplica",
      linked: row.providerSync?.linked ?? "No aplica", unconfirmed: row.providerSync?.unconfirmed ?? "No aplica",
      queued: row.providerSync?.queued ?? "No aplica", errors: row.providerSync?.errors ?? "No aplica",
      withoutReference: row.providerSync?.withoutReference ?? "No aplica",
      lastSuccess: row.providerSync?.lastSuccessAt || "Sin consulta registrada", limitation: row.limitation,
      lastActivity: row.providerSync?.lastActivityAt || "Sin actividad registrada", resumeAt: row.providerSync?.resumeAt || "No aplica",
      priority: row.providerSync?.priority?.applies ? `${row.providerSync.priority.from} — ${row.providerSync.priority.to}` : "No aplica al filtro",
      reasons: row.providerSync?.reasons.join(", ") || "Sin observaciones registradas",
    });
    sources.getColumn("limitation").alignment = { wrapText: true, vertical: "top" };
    for (const [ws, index] of [[summary, 5], [sheet, 1], [sources, 1]] as const) {
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
