export const LOAN_TABS = ["Todos", "Pendientes", "Aprobados", "Pagos", "Devoluciones", "Finalizados"] as const;
export type LoanTab = (typeof LOAN_TABS)[number];

const finalizados = ["RECHAZADO", "CANCELADO", "DEVUELTO", "PAGADO", "FINALIZADO"];

export function prestamoEnPestana(estado: string, pestana: LoanTab) {
  if (pestana === "Pendientes") return estado === "PENDIENTE";
  if (pestana === "Aprobados") return estado === "APROBADO";
  if (pestana === "Pagos") return ["PAGO_PENDIENTE_APROBACION", "PAGADO"].includes(estado);
  if (pestana === "Devoluciones") return ["DEVOLUCION_PENDIENTE", "DEVUELTO"].includes(estado);
  if (pestana === "Finalizados") return finalizados.includes(estado);
  return true;
}

export function textoEstadoPrestamo(estado: string) {
  const etiquetas: Record<string, string> = {
    PENDIENTE: "Pendiente", APROBADO: "Aprobado", DEVOLUCION_PENDIENTE: "Devolución pendiente",
    PAGO_PENDIENTE_APROBACION: "Pago por aprobar", PAGADO: "Pagado", RECHAZADO: "Rechazado",
    CANCELADO: "Cancelado", DEVUELTO: "Devuelto", FINALIZADO: "Finalizado", PAGO: "Pagado", DEUDA: "Deuda",
    BODEGA: "En bodega", VENDIDO: "Vendido", POR_ACEPTAR: "Por aceptar",
  };
  return etiquetas[estado] || estado || "Sin estado";
}

export function paginasPrestamos(total: number, filas: number) {
  return Math.max(1, Math.ceil(total / filas));
}

export function numerosPaginaPrestamos(actual: number, total: number) {
  return Array.from(new Set([1, actual - 1, actual, actual + 1, total]))
    .filter((pagina) => pagina > 0 && pagina <= total).sort((a, b) => a - b);
}
