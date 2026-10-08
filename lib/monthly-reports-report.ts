import { esRolAdministrativo } from "@/lib/access-control";
import { getMonthlyCommercialSummary } from "@/lib/dashboard-commercial-summary";
import {
  calcularTotalesFinancieros,
  getFinancialDashboardSummaryForMonthlyReport,
} from "@/lib/dashboard-financial-summary";
import type { MonthlyReportsView } from "@/lib/monthly-reports-view";
import prisma from "@/lib/prisma";
import { getBogotaMonthRangeFromInput, getCurrentBogotaMonthInput } from "@/lib/ventas-utils";

export class MonthlyReportsAccessError extends Error {
  constructor(message: string, public readonly code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(message);
    this.name = "MonthlyReportsAccessError";
  }
}

export async function getMonthlyReportsView(
  session: { nombre?: string | null; usuario?: string | null; rolNombre: string } | null,
  options?: { period?: string | null; sedeId?: string | number | null }
): Promise<MonthlyReportsView> {
  if (!session) throw new MonthlyReportsAccessError("No autenticado", "UNAUTHENTICATED");
  if (!esRolAdministrativo(session.rolNombre)) {
    throw new MonthlyReportsAccessError("No tienes acceso a los reportes", "FORBIDDEN");
  }

  const periodoSolicitado = options?.period || getCurrentBogotaMonthInput();
  const periodoCorte = getBogotaMonthRangeFromInput(periodoSolicitado)
    ?? getBogotaMonthRangeFromInput(getCurrentBogotaMonthInput());
  if (!periodoCorte) throw new Error("No se pudo resolver el periodo del reporte");
  // Ambos lectores reciben el mismo periodo aplicado, incluso si el parámetro original era inválido.
  const periodoSeleccionado = periodoCorte.key;
  const sedes = await prisma.sede.findMany({
    select: { id: true, nombre: true },
    orderBy: { id: "asc" },
  });
  // ADMIN/AUDITOR ya tenían acceso total: se mantiene el fallback de cobertura original.
  const sedeIdSolicitada = Number(options?.sedeId || 0);
  const sedeSeleccionada = Number.isInteger(sedeIdSolicitada) && sedeIdSolicitada > 0
    ? sedes.find((sede) => sede.id === sedeIdSolicitada) || null
    : null;
  const sedeSeleccionadaId = sedeSeleccionada?.id ?? null;
  const coberturaLabel = sedeSeleccionada?.nombre || "Todas las sedes";
  const [resumen, lecturaFinanciera] = await Promise.all([
    getMonthlyCommercialSummary({ period: periodoSeleccionado, sedeId: sedeSeleccionadaId }),
    getFinancialDashboardSummaryForMonthlyReport({
      periodKey: periodoSeleccionado,
      sedeId: sedeSeleccionadaId,
      fechaCorte: periodoCorte.end,
    }),
  ]);
  const financiero = lecturaFinanciera.summary;

  return {
    usuario: { nombre: session.nombre || session.usuario || "Admin", rolNombre: session.rolNombre },
    consulta: {
      period: resumen.periodo.key,
      periodLabel: resumen.periodo.label,
      sedeId: sedeSeleccionadaId ? String(sedeSeleccionadaId) : "",
      cobertura: coberturaLabel,
    },
    sedes,
    mensual: {
      utilidad: resumen.utilidad,
      ventas: resumen.ventas,
      financieraLider: resumen.topFinancieras[0] ?? null,
    },
    financiero,
    totales: calcularTotalesFinancieros(financiero),
    cierre: {
      source: lecturaFinanciera.source,
      fechaCorte: lecturaFinanciera.snapshot?.fechaCorte ?? periodoCorte.end.toISOString(),
      capturedAt: lecturaFinanciera.snapshot?.capturedAt ?? null,
    },
    rankings: {
      oficina: resumen.topSedesJalador,
      sede: resumen.topVentasSede,
      jalador: resumen.topJaladores,
      cerrador: resumen.topCerradores,
      financiera: resumen.topFinancieras,
    },
  };
}
