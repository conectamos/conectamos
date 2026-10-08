// Server selection/data flow copied from app/dashboard/reportes/page.tsx at
// 5ab96adb420d9530e8ab2a9de9ae5301a3eb06af, before the redesign.
export async function monthlyReportsBefore(params, dependencies) {
  const {
    getCurrentBogotaMonthInput,
    getBogotaMonthRangeFromInput,
    listSedes,
    getMonthlyCommercialSummary,
    getFinancialDashboardSummaryForMonthlyReport,
    calcularTotalesFinancieros,
  } = dependencies;
  const periodoSeleccionado = params?.period || getCurrentBogotaMonthInput();
  const periodoCorte = getBogotaMonthRangeFromInput(periodoSeleccionado);
  const sedes = await listSedes({ select: { id: true, nombre: true }, orderBy: { id: "asc" } });
  const sedeIdSolicitada = Number(params?.sedeId || 0);
  const sedeSeleccionada = Number.isInteger(sedeIdSolicitada) && sedeIdSolicitada > 0
    ? sedes.find((sede) => sede.id === sedeIdSolicitada) || null
    : null;
  const sedeSeleccionadaId = sedeSeleccionada?.id ?? null;
  const coberturaLabel = sedeSeleccionada?.nombre || "Todas las sedes";
  const [resumen, lecturaFinanciera] = await Promise.all([
    getMonthlyCommercialSummary({ period: periodoSeleccionado, sedeId: sedeSeleccionadaId }),
    getFinancialDashboardSummaryForMonthlyReport({
      periodKey: periodoCorte?.key ?? periodoSeleccionado,
      sedeId: sedeSeleccionadaId,
      fechaCorte: periodoCorte?.end ?? null,
    }),
  ]);
  const financiero = lecturaFinanciera.summary;
  return {
    sedes,
    sedeSeleccionadaId,
    coberturaLabel,
    resumen,
    lecturaFinanciera,
    financiero,
    financieraLider: resumen.topFinancieras[0] ?? null,
    totales: calcularTotalesFinancieros(financiero),
  };
}
