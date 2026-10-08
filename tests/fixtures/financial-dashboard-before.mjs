// Expressions copied from app/dashboard/financiero/page.tsx in commit
// 165a723ab0af97dcbe9fb0fafacab45d5f63bc24, before the visual redesign.
export function calcularBalanceAntes(resumen) {
  const totalFinancieras = Object.values(resumen?.financieras || {}).reduce(
    (acc, value) => acc + Number(value || 0),
    0
  );

  const activos =
    Number(resumen?.cajaDisponible || 0) +
    Number(resumen?.saldoTransferencias || 0) +
    Number(resumen?.prestamosPorCobrar || 0) +
    Number(resumen?.valorBodega || 0) +
    Number(totalFinancieras || 0);

  const pasivos =
    Number(resumen?.deudaEquipos || 0) +
    Number(resumen?.valorPendiente || 0) +
    Number(resumen?.valorGarantia || 0) +
    Number(resumen?.totalGastosCartera || 0);

  const resumenGeneral = activos - pasivos;
  return { totalFinancieras, activos, pasivos, resultadoNeto: resumenGeneral };
}
