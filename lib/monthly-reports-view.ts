import type { CommercialRankingItem } from "@/lib/dashboard-commercial-summary";
import type { FinancialDashboardSummary } from "@/lib/dashboard-financial-summary";

export type MonthlyReportsView = {
  usuario: { nombre: string; rolNombre: string };
  consulta: { period: string; periodLabel: string; sedeId: string; cobertura: string };
  sedes: Array<{ id: number; nombre: string }>;
  mensual: {
    utilidad: number;
    ventas: number;
    financieraLider: CommercialRankingItem | null;
  };
  financiero: FinancialDashboardSummary;
  totales: { totalFinancieras: number; activos: number; pasivos: number; resultadoNeto: number };
  cierre: { source: "live" | "snapshot"; fechaCorte: string | null; capturedAt: string | null };
  rankings: {
    oficina: CommercialRankingItem[];
    sede: CommercialRankingItem[];
    jalador: CommercialRankingItem[];
    cerrador: CommercialRankingItem[];
    financiera: CommercialRankingItem[];
  };
};

export function formatoPesos(valor: number) {
  const numero = Number(valor || 0);
  const absoluto = Math.abs(numero);
  const centavos = Number(absoluto.toFixed(2));
  return `${numero < 0 ? "-" : ""}$ ${absoluto.toLocaleString("es-CO", {
    minimumFractionDigits: Number.isInteger(centavos) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

export function formatoFechaHora(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
