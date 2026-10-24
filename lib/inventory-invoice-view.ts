export type InventoryInvoice = {
  id?: number;
  estado?: string;
  nombre: string | null;
  url?: string | null;
  error?: string | null;
};

/** Un vínculo a un lote no implica que Siigo haya emitido la factura. */
export function vistaFacturaInventario(factura?: InventoryInvoice | null): {
  estado: string;
  etiqueta: string;
  tono: "success" | "warning" | "danger" | "neutral";
} {
  if (!factura) return { estado: "SIN_FACTURA", etiqueta: "Sin factura vinculada", tono: "neutral" };
  const estado = String(factura.estado || "").trim().toUpperCase();
  switch (estado) {
    case "EMITIDA": return { estado, etiqueta: "Con factura", tono: "success" };
    case "PROCESANDO": return { estado, etiqueta: "En proceso", tono: "warning" };
    case "ERROR": return { estado, etiqueta: "Error de factura", tono: "danger" };
    case "ANULADA": return { estado, etiqueta: "Anulada", tono: "danger" };
    default: return { estado: estado || "VINCULADA", etiqueta: estado ? estado.replaceAll("_", " ") : "Factura vinculada", tono: "neutral" };
  }
}
