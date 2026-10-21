import type * as XLSX from "xlsx";
import { deudaPendienteInventario, identidadAcreedor } from "./inventory-debt-view";

export type InventorySelectionExportItem = {
  id: number;
  imei: string;
  referencia: string;
  tipoProducto: string;
  color: string | null;
  costo: number;
  sedeId: number;
  sede?: { nombre: string } | null;
  deboA?: string | null;
  acreedorId?: number | null;
  acreedorNombre?: string | null;
  deudaPendiente?: number;
  estadoActual: string | null;
  estadoFinanciero: string | null;
  distribuidor: string | null;
  origen: string | null;
  prestamoDestino?: { nombre: string; prestamoId: number; estado: string } | null;
  facturaStand?: { nombre: string | null } | null;
};

const formatoMoneda = (valor: number) => Number.isInteger(valor) ? '"$"#,##0' : '"$"#,##0.00';

/** Recibe únicamente la selección de la consulta autorizada, sin limitarla a una página. */
export function crearLibroSeleccionInventario(
  xlsx: typeof XLSX,
  items: readonly InventorySelectionExportItem[],
  cobertura: string,
): XLSX.WorkBook {
  if (!items.length) throw new Error("Selecciona al menos un equipo para exportar.");

  let costoTotal = 0;
  let deudaTotal = 0;
  const filas = items.map((item) => {
    const costo = Number(item.costo);
    const deuda = deudaPendienteInventario(item);
    if (!Number.isFinite(costo) || !Number.isFinite(deuda)) {
      throw new Error(`No se pudo exportar el valor del equipo ID ${item.id}. Actualiza el inventario e intenta nuevamente.`);
    }
    costoTotal += costo;
    deudaTotal += deuda;
    const acreedor = identidadAcreedor(item);
    return [
      item.id, String(item.imei ?? ""), item.referencia, item.tipoProducto,
      item.color ?? "", costo, item.sede?.nombre ?? `Sede ${item.sedeId}`,
      acreedor.name, acreedor.id ?? "", item.estadoActual ?? "",
      item.estadoFinanciero ?? "", deuda, item.distribuidor ?? "", item.origen ?? "",
      item.prestamoDestino?.nombre ?? "", item.prestamoDestino?.prestamoId ?? "",
      item.prestamoDestino?.estado ?? "", item.facturaStand?.nombre ?? "",
    ];
  });
  const hoja = xlsx.utils.aoa_to_sheet([
    ["ID", "IMEI", "Referencia", "Tipo de producto", "Color", "Costo", "Sede", "Acreedor", "ID acreedor", "Estado del equipo", "Estado financiero", "Deuda pendiente", "Distribuidor", "Origen", "Sede destino", "ID préstamo", "Estado préstamo", "Factura del stand"],
    ...filas,
  ]);
  for (let fila = 1; fila <= filas.length; fila++) {
    // IMEI y referencias permanecen como texto, incluidos ceros iniciales y signos.
    hoja[`B${fila + 1}`] = { t: "s", v: String(items[fila - 1].imei ?? ""), z: "@" };
    for (const columna of ["F", "L"]) {
      const celda = hoja[`${columna}${fila + 1}`];
      celda.z = formatoMoneda(Number(celda.v));
    }
  }
  hoja["!cols"] = [10, 21, 38, 22, 18, 20, 26, 32, 14, 24, 22, 22, 28, 20, 28, 16, 24, 28].map(wch => ({ wch }));
  hoja["!autofilter"] = { ref: hoja["!ref"]! };

  const resumen = xlsx.utils.aoa_to_sheet([
    ["Selección de inventario", "Valor"],
    ["Cobertura", cobertura],
    ["Equipos seleccionados", items.length],
    ["Costo total", costoTotal],
    ["Deuda pendiente total", deudaTotal],
  ]);
  resumen["!cols"] = [{ wch: 30 }, { wch: 32 }];
  resumen.B4.z = formatoMoneda(costoTotal);
  resumen.B5.z = formatoMoneda(deudaTotal);
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hoja, "Equipos seleccionados");
  xlsx.utils.book_append_sheet(libro, resumen, "Resumen");
  return libro;
}
