import assert from "node:assert/strict";
import test from "node:test";
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
