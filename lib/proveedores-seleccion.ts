import { moneyValueToCents } from "./proveedores-pagos";

type FacturaProveedorSeleccionable = {
  id: number;
  valorFactura: number;
  valorAbonado: number;
  saldoPendiente: number;
};

export function resumirFacturasSeleccionadas(
  facturas: readonly FacturaProveedorSeleccionable[],
  seleccion: ReadonlySet<number>,
) {
  let cantidad = 0;
  let totalFacturasCentavos = 0;
  let totalAbonadoCentavos = 0;
  let totalPendienteCentavos = 0;

  for (const factura of facturas) {
    if (!seleccion.has(factura.id)) continue;

    cantidad += 1;
    totalFacturasCentavos += moneyValueToCents(factura.valorFactura);
    totalAbonadoCentavos += moneyValueToCents(factura.valorAbonado);
    totalPendienteCentavos += moneyValueToCents(factura.saldoPendiente);
  }

  return {
    cantidad,
    totalFacturas: totalFacturasCentavos / 100,
    totalAbonado: totalAbonadoCentavos / 100,
    totalPendiente: totalPendienteCentavos / 100,
  };
}
