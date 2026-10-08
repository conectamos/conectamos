export type FinancialSummary = {
  cajaGeneralVentas: number;
  saldoCaja: number;
  cajaDisponible: number;
  transferenciasVentas: number;
  abonosTransferencia: number;
  saldoTransferencias: number;
  prestamosPorCobrar: number;
  deudaEquipos: number;
  financieras: Record<string, number>;
  valorPendiente: number;
  valorGarantia: number;
  valorBodega: number;
  totalGastosCartera: number;
};

export type FinancialAlert = {
  title: string;
  detail: string;
  href?: string;
};

export function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

export function calcularBalanceFinanciero(resumen: FinancialSummary | null) {
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

  return { totalFinancieras, activos, pasivos, resultadoNeto: activos - pasivos };
}

export function obtenerAlertasFinancieras(
  resumen: FinancialSummary | null,
  resultadoNeto: number
): FinancialAlert[] {
  if (!resumen) return [];

  const items: FinancialAlert[] = [];

  if (resultadoNeto < 0) {
    items.push({
      title: "Resultado neto en rojo",
      detail: `Los pasivos superan a los activos por ${formatoPesos(Math.abs(resultadoNeto))}.`,
    });
  }
  if (Number(resumen.cajaDisponible || 0) < 0) {
    items.push({
      title: "Caja disponible negativa",
      detail: `La caja disponible está en ${formatoPesos(Number(resumen.cajaDisponible || 0))}.`,
      href: "/caja",
    });
  }
  if (Number(resumen.valorPendiente || 0) > 0) {
    items.push({
      title: "Equipos pendientes",
      detail: `Tienes ${formatoPesos(Number(resumen.valorPendiente || 0))} comprometidos en estado pendiente.`,
      href: "/inventario",
    });
  }
  if (Number(resumen.valorGarantia || 0) > 0) {
    items.push({
      title: "Garantías abiertas",
      detail: `Hay ${formatoPesos(Number(resumen.valorGarantia || 0))} inmovilizados por garantía.`,
      href: "/inventario",
    });
  }
  if (
    Number(resumen.totalGastosCartera || 0) > 0 &&
    Number(resumen.totalGastosCartera || 0) >= Number(resumen.deudaEquipos || 0)
  ) {
    items.push({
      title: "Cartera con peso alto",
      detail: `El gasto de cartera alcanza ${formatoPesos(Number(resumen.totalGastosCartera || 0))}.`,
      href: "/dashboard/financiero/cartera/detalle",
    });
  }

  return items;
}

function claveFinanciera(nombre: string) {
  return nombre.trim().toUpperCase();
}

export function obtenerSaldosFinancieras(
  resumen: FinancialSummary | null,
  catalogo: string[]
) {
  const saldos = Object.entries(resumen?.financieras || {}).map(([nombre, valor]) => ({
    nombre,
    valor: Number(valor || 0),
  }));
  const nombresExistentes = new Set(saldos.map((item) => claveFinanciera(item.nombre)));

  for (const nombre of catalogo) {
    const nombreLimpio = nombre.trim();
    const clave = claveFinanciera(nombreLimpio);
    if (!clave || nombresExistentes.has(clave)) continue;
    saldos.push({ nombre: nombreLimpio, valor: 0 });
    nombresExistentes.add(clave);
  }

  const { totalFinancieras } = calcularBalanceFinanciero(resumen);
  return saldos
    .sort((a, b) => b.valor - a.valor)
    .map((item) => {
      const participacion = totalFinancieras > 0 ? (item.valor / totalFinancieras) * 100 : 0;
      return {
        ...item,
        participacion,
        anchoBarra: Math.max(0, Math.min(100, participacion)),
      };
    });
}
