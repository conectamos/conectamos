import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import {
  calcularSaldoFacturaProveedor,
  centavosADecimalProveedor,
  decimalProveedorACentavos,
  formatPaymentAmountInput,
  moneyValueToPaymentInput,
  normalizePaymentAmountInput,
  normalizarClaveIdempotenciaProveedor,
  paymentAmountToCents,
  validarAbonoFacturaProveedor,
} from "../lib/proveedores-pagos.ts";

// Node strips TypeScript but does not resolve extensionless imports as Next does.
const seleccionUrl = new URL("../lib/proveedores-seleccion.ts", import.meta.url).href;
const pagosUrl = new URL("../lib/proveedores-pagos.ts", import.meta.url).href;
const selectionResolution = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      context.parentURL === seleccionUrl && specifier === "./proveedores-pagos"
        ? pagosUrl
        : specifier,
      context,
    );
  },
});
const { resumirFacturasSeleccionadas } = await import(seleccionUrl);
selectionResolution.deregister();

const facturasSeleccion = [
  { id: 1, valorFactura: 8455000, valorAbonado: 2610000, saldoPendiente: 5845000 },
  { id: 2, valorFactura: 13705000, valorAbonado: 0, saldoPendiente: 13705000 },
  { id: 3, valorFactura: 24760000, valorAbonado: 0, saldoPendiente: 24760000 },
  { id: 4, valorFactura: 33327000, valorAbonado: 0, saldoPendiente: 33327000 },
  { id: 5, valorFactura: 19550000, valorAbonado: 19550000, saldoPendiente: 0 },
];

test("sin selección o sin facturas visibles el resumen muestra cero", () => {
  const vacio = {
    cantidad: 0,
    totalFacturas: 0,
    totalAbonado: 0,
    totalPendiente: 0,
  };
  assert.deepEqual(resumirFacturasSeleccionadas(facturasSeleccion, new Set()), vacio);
  assert.deepEqual(resumirFacturasSeleccionadas([], new Set([1, 2])), vacio);
  assert.deepEqual(
    resumirFacturasSeleccionadas(facturasSeleccion, new Set([999])),
    vacio,
  );
});

test("las cuatro facturas seleccionadas suman sus valores, abonos y saldos exactos", () => {
  assert.deepEqual(
    resumirFacturasSeleccionadas(facturasSeleccion, new Set([1, 2, 4, 5])),
    {
      cantidad: 4,
      totalFacturas: 75037000,
      totalAbonado: 22160000,
      totalPendiente: 52877000,
    },
  );
});

test("la selección individual conserva el abono parcial y el pago completo", () => {
  assert.deepEqual(
    resumirFacturasSeleccionadas(facturasSeleccion, new Set([1])),
    {
      cantidad: 1,
      totalFacturas: 8455000,
      totalAbonado: 2610000,
      totalPendiente: 5845000,
    },
  );
  assert.deepEqual(
    resumirFacturasSeleccionadas(facturasSeleccion, new Set([5])),
    {
      cantidad: 1,
      totalFacturas: 19550000,
      totalAbonado: 19550000,
      totalPendiente: 0,
    },
  );
});

test("el resumen de selección suma en centavos sin acumulación de coma flotante", () => {
  const facturas = [
    { id: 1, valorFactura: 0.1, valorAbonado: 0.03, saldoPendiente: 0.07 },
    { id: 2, valorFactura: 0.2, valorAbonado: 0.06, saldoPendiente: 0.14 },
    { id: 3, valorFactura: 100.1, valorAbonado: 30.05, saldoPendiente: 70.05 },
  ];
  assert.deepEqual(resumirFacturasSeleccionadas(facturas, new Set([1, 2, 3])), {
    cantidad: 3,
    totalFacturas: 100.4,
    totalAbonado: 30.14,
    totalPendiente: 70.26,
  });
});

test("los filtros excluyen de las sumas los IDs seleccionados que ya no están visibles", () => {
  const seleccion = new Set([1, 2, 3, 4, 5]);
  const visibles = facturasSeleccion.filter((factura) => factura.id === 1);
  assert.deepEqual(resumirFacturasSeleccionadas(visibles, seleccion), {
    cantidad: 1,
    totalFacturas: 8455000,
    totalAbonado: 2610000,
    totalPendiente: 5845000,
  });
  assert.deepEqual([...seleccion], [1, 2, 3, 4, 5]);
});

test("el resumen toma saldos actualizados tras refrescar sin mutar la selección ni facturas", () => {
  const seleccion = new Set([1, 5]);
  const actualizadas = Object.freeze(
    facturasSeleccion.map((factura) =>
      Object.freeze(
        factura.id === 1
          ? { ...factura, valorAbonado: 3000000, saldoPendiente: 5455000 }
          : { ...factura },
      ),
    ),
  );
  assert.deepEqual(resumirFacturasSeleccionadas(actualizadas, seleccion), {
    cantidad: 2,
    totalFacturas: 28005000,
    totalAbonado: 22550000,
    totalPendiente: 5455000,
  });
  assert.deepEqual([...seleccion], [1, 5]);
  assert.equal(facturasSeleccion[0].valorAbonado, 2610000);
  assert.equal(actualizadas[0].valorAbonado, 3000000);
});

test("calcula varios abonos en centavos sin perder precisión", () => {
  const resumen = calcularSaldoFacturaProveedor("1000.00", [
    "300.00",
    { valor: "250.00" },
    "125.25",
  ]);

  assert.equal(resumen.valorFactura, "1000.00");
  assert.equal(resumen.valorAbonado, "675.25");
  assert.equal(resumen.saldoPendiente, "324.75");
  assert.equal(resumen.cantidadAbonos, 3);
  assert.equal(resumen.valorFacturaCentavos, 100000);
  assert.equal(resumen.valorAbonadoCentavos, 67525);
  assert.equal(resumen.saldoPendienteCentavos, 32475);
});

test("cierra exactamente una factura con centavos fraccionarios", () => {
  const primero = validarAbonoFacturaProveedor("30.05", "100.10");
  assert.equal(primero.ok, true);
  if (!primero.ok) return;
  assert.equal(primero.saldoPosterior, "70.05");

  const ultimo = validarAbonoFacturaProveedor(
    "70.05",
    primero.saldoPosterior,
  );
  assert.equal(ultimo.ok, true);
  if (!ultimo.ok) return;
  assert.equal(ultimo.saldoPosterior, "0.00");

  const resumen = calcularSaldoFacturaProveedor("100.10", [
    "30.05",
    "70.05",
  ]);
  assert.equal(resumen.valorAbonado, "100.10");
  assert.equal(resumen.saldoPendiente, "0.00");
});

test("rechaza valores inválidos y cualquier sobreabono", () => {
  for (const value of ["0", "0.00", "-1.00", "texto", "1.001"]) {
    assert.deepEqual(validarAbonoFacturaProveedor(value, "100.00"), {
      codigo: "VALOR_INVALIDO",
      error: "El valor del abono debe ser mayor que cero",
      ok: false,
    });
  }

  assert.deepEqual(validarAbonoFacturaProveedor("100.01", "100.00"), {
    codigo: "SOBREABONO",
    error: "El abono no puede superar el saldo pendiente de la factura",
    ok: false,
  });
  assert.deepEqual(validarAbonoFacturaProveedor("1.00", "0.00"), {
    codigo: "SIN_SALDO",
    error: "La factura ya no tiene saldo pendiente",
    ok: false,
  });
});

test("normaliza importes y limita las claves de idempotencia", () => {
  assert.equal(decimalProveedorACentavos("000000000001.2"), 120);
  assert.equal(
    decimalProveedorACentavos("100"),
    decimalProveedorACentavos("100.00"),
  );
  assert.equal(centavosADecimalProveedor(120), "1.20");
  assert.equal(decimalProveedorACentavos("999999999999.99"), 99999999999999);
  assert.equal(decimalProveedorACentavos("1000000000000.00"), null);

  const key = "  proveedor:factura-15.abono_01  ";
  assert.equal(
    normalizarClaveIdempotenciaProveedor(key),
    "proveedor:factura-15.abono_01",
  );
  assert.equal(normalizarClaveIdempotenciaProveedor("corta"), null);
  assert.equal(normalizarClaveIdempotenciaProveedor("clave con espacios"), null);
});

test("la entrada monetaria conserva enteros, pegados y centavos exactos", () => {
  let current = "";

  for (const digit of "1234567") {
    current = normalizePaymentAmountInput(
      `${formatPaymentAmountInput(current)}${digit}`,
      current,
    );
  }

  assert.equal(current, "1234567");
  assert.equal(formatPaymentAmountInput(current), "1.234.567");
  assert.equal(normalizePaymentAmountInput("100", "1000"), "100");
  assert.equal(
    normalizePaymentAmountInput("1.234", "1234.56"),
    "1234",
  );
  assert.equal(
    normalizePaymentAmountInput("1,234", "1234.56", true),
    "1234",
  );
  assert.equal(
    normalizePaymentAmountInput("1,234,567", "1234.56", true),
    "1234567",
  );
  assert.equal(
    normalizePaymentAmountInput("1.234.567,89"),
    "1234567.89",
  );
  assert.equal(normalizePaymentAmountInput("100.50"), "100.50");
  assert.equal(paymentAmountToCents("1234567.89"), 123456789);
  assert.equal(moneyValueToPaymentInput(1234.5), "1234.5");
});

test("una factura histórica pagada sin abonos conserva saldo cero", () => {
  const resumen = calcularSaldoFacturaProveedor("8455000.00", [], "PAGADO");

  assert.equal(resumen.valorFactura, "8455000.00");
  assert.equal(resumen.valorAbonado, "8455000.00");
  assert.equal(resumen.saldoPendiente, "0.00");
  assert.equal(resumen.cantidadAbonos, 0);
});
