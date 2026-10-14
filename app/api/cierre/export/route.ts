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
    const payjoy = report.financiers.find((row) => row.name === "PAYJOY")?.reconciliation;
    if (payjoy) {
      const apiKnown = payjoy.api.units > 0;
      const unlinkedKnown = apiKnown && (payjoy.unlinkedApi.units > 0 || payjoy.daysReviewed === payjoy.totalDays);
      const comparison = book.addWorksheet("Conciliación PAYJOY");
      comparison.addRows([
        ["PAYJOY", report.period.label, report.scope.label],
        ["Fuente del total", payjoy.basis === "PAYJOY_API" ? "API PAYJOY" : "CONECTAMOS · consulta PAYJOY pendiente"],
        ["Días consultados", payjoy.daysReviewed, "de", payjoy.totalDays],
        ["Cobertura", "Parcial; consultar todos los días no certifica cobertura completa."],
        [], ["Comparación de fuentes (no sumar entre sí)", "Créditos", "Valor del crédito"],
        ["Créditos efectivos de API PAYJOY", apiKnown ? payjoy.api.units : "Sin confirmar", apiKnown ? payjoy.api.amount : "Sin confirmar"],
        ["Créditos efectivos en CONECTAMOS", payjoy.local.units, payjoy.local.amount],
        ["Diferencia API menos CONECTAMOS", apiKnown ? payjoy.delta.units : "Sin confirmar", apiKnown ? payjoy.delta.amount : "Sin confirmar"],
        [], ["Pendientes de vinculación (no son créditos adicionales)", "Créditos", "Valor del crédito"],
        ["Créditos API sin venta local vinculada", unlinkedKnown ? payjoy.unlinkedApi.units : "Sin confirmar", unlinkedKnown ? payjoy.unlinkedApi.amount : "Sin confirmar"],
        ["Ventas locales sin confirmación API", payjoy.unmatchedLocal.units, payjoy.unmatchedLocal.amount],
        [], ["Criterio", payjoy.basis === "PAYJOY_API"
          ? "El total cuenta cada crédito efectivo recibido de PAYJOY una sola vez. Si faltan días por consultar, el importe es parcial. Las ventas locales sin vínculo se conservan para conciliación y no se suman de nuevo."
          : "La consulta del periodo está pendiente. La comparación corresponde a los datos recibidos hasta ahora."],
      ]);
      comparison.columns = [{ width: 58 }, { width: 40 }, { width: 28 }, { width: 16 }];
      comparison.getColumn(3).numFmt = '"$" #,##0.00';
      comparison.getColumn(2).alignment = { wrapText: true, vertical: "top" };
      for (const index of [6, 11]) comparison.getRow(index).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF11161D" } };
      });
      const pending = book.addWorksheet("Pendientes PAYJOY", { views: [{ state: "frozen", ySplit: 1 }] });
      pending.columns = sheet.columns.map((column) => ({ header: column.header, key: column.key, width: column.width, style: column.style }));
      for (const row of report.unmatchedLocalItems) pending.addRow({ ...row,
        date: formatter.format(new Date(row.date)), creditNumber: row.creditNumber || "No informado",
        customerName: row.customerName || "No informado", source: payjoy.basis === "PAYJOY_API"
          ? "CONECTAMOS · pendiente de conciliar; no sumar al total API" : "CONECTAMOS · pendiente de conciliar",
      });
      pending.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF11161D" } }; });
    }
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
    const reasonLabels: Record<string, string> = {
      MISSING_PRINCIPAL: "Falta el importe real del crédito",
      MISSING_EFFECTIVE_DATE: "Falta la fecha efectiva del crédito",
      UNCONFIRMED_STATUS: "El estado recibido no confirma un crédito efectivo",
      MISSING_IDENTITY: "Faltan datos para identificar el crédito",
      IDENTITY_CONFLICT: "Los datos de identificación no coinciden",
      NO_LOCAL_MATCH: "No se encontró una venta local coincidente",
      AMBIGUOUS_LOCAL_MATCH: "Hay varias ventas locales posibles",
      AMBIGUOUS_PROVIDER_MATCH: "Hay varios créditos posibles",
      STALE_OBSERVATION: "La respuesta es anterior a la información guardada",
      LOCAL_TERMINAL_PRESERVED: "Se conserva la anulación, reverso o rechazo registrado",
    };
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
      reasons: row.providerSync?.reasons.map((reason) => reasonLabels[reason]).filter(Boolean).join("; ") || "Sin observaciones registradas",
    });
    sources.getColumn("reasons").alignment = { wrapText: true, vertical: "top" };
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
