import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeConsultarReporteSiigo } from "@/lib/access-control";
import {
  getSiigoApplianceCorrectionReport,
  getSiigoErrorMessage,
  getSiigoErrorStatus,
} from "@/lib/siigo";

const REPORT_START_DATE = "2026-05-29";

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function toCsv(report: Awaited<ReturnType<typeof getSiigoApplianceCorrectionReport>>) {
  const headers = [
    "Estado correccion",
    "Fecha factura",
    "Factura",
    "Estado factura Siigo",
    "Cliente",
    "Identificacion",
    "Descripcion",
    "Cantidad",
    "Subtotal",
    "IVA 19%",
    "Total afectado",
    "Total factura",
    "Documento Siigo",
    "Centro de costo",
    "Nota credito",
    "Estado nota credito",
    "Fecha nota credito",
    "URL factura",
    "URL nota credito",
  ];
  const rows = report.registros.map((row) => [
    row.estadoCorreccion,
    row.fechaFactura || "",
    row.factura,
    row.estadoFactura,
    row.cliente,
    row.identificacion,
    row.descripcion,
    row.cantidad,
    row.subtotal,
    row.iva19,
    row.totalAfectado,
    row.totalFactura,
    row.documentoSiigo,
    row.centroCosto,
    row.notaCredito,
    row.estadoNotaCredito,
    row.fechaNotaCredito || "",
    row.facturaUrl,
    row.notaCreditoUrl,
  ]);
  const summary = [
    ["Reporte facturas electrodomesticos 002 con IVA 19%"],
    ["Desde", report.desde],
    ["Hasta", report.hasta],
    ["Facturas revisadas", report.facturasRevisadas],
    ["Facturas afectadas", report.facturasAfectadas],
    ["Pendientes correccion", report.pendientesCorreccion],
    ["Corregidas con NC", report.corregidasConNotaCredito],
    ["Valor afectado", report.valorAfectado],
    ["Valor pendiente", report.valorPendiente],
    [],
  ];

  return [
    ...summary.map((row) => row.map(csvCell).join(";")),
    headers.map(csvCell).join(";"),
    ...rows.map((row) => row.map(csvCell).join(";")),
  ].join("\r\n");
}

export async function GET(req: Request) {
  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (
      !puedeConsultarReporteSiigo(
        session.rolNombre,
        session.perfilTipo,
        session.perfilNombre
      )
    ) {
      return NextResponse.json(
        { error: "No tienes permiso para consultar el reporte Siigo" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const today = new Date().toISOString().slice(0, 10);
    const dateStart = url.searchParams.get("from") || REPORT_START_DATE;
    const dateEnd = url.searchParams.get("to") || today;

    if (
      !isValidDate(dateStart) ||
      !isValidDate(dateEnd) ||
      dateStart > dateEnd
    ) {
      return NextResponse.json(
        { error: "Rango de fechas invalido" },
        { status: 400 }
      );
    }

    const report = await getSiigoApplianceCorrectionReport(
      dateStart,
      dateEnd
    );
    const csv = toCsv(report);
    const filename = `reporte-electrodomesticos-002-${dateStart}-a-${dateEnd}.csv`;

    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("ERROR REPORTE ELECTRODOMESTICOS SIIGO:", error);

    return NextResponse.json(
      { error: getSiigoErrorMessage(error) },
      { status: getSiigoErrorStatus(error) }
    );
  }
}
