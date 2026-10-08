import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularBalanceFinanciero,
  formatoPesos,
  obtenerAlertasFinancieras,
  obtenerSaldosFinancieras,
} from "../lib/financial-dashboard-view.ts";
import { calcularBalanceAntes } from "./fixtures/financial-dashboard-before.mjs";

const vacio = {
  cajaGeneralVentas: 0,
  saldoCaja: 0,
  cajaDisponible: 0,
  transferenciasVentas: 0,
  abonosTransferencia: 0,
  saldoTransferencias: 0,
  prestamosPorCobrar: 0,
  deudaEquipos: 0,
  financieras: {},
  valorPendiente: 0,
  valorGarantia: 0,
  valorBodega: 0,
  totalGastosCartera: 0,
};

test("el rediseño conserva los cuatro totales anteriores para el mismo corte y cobertura", () => {
  const coberturas = [
    vacio,
    {
      ...vacio,
      cajaGeneralVentas: 100_182_332,
      cajaDisponible: 100_182_332,
      saldoTransferencias: 66_950_941,
      prestamosPorCobrar: 33_530_000,
      valorBodega: 71_055_000,
      financieras: { PAYJOY: 800_000_000, SUMASPAY: 74_310_477.4 },
      deudaEquipos: 538_660_000,
      valorPendiente: 4_390_000,
      valorGarantia: 1_335_000,
      totalGastosCartera: 273_591_552,
    },
    {
      ...vacio,
      cajaDisponible: -12_500,
      saldoTransferencias: -20_000,
      prestamosPorCobrar: 1_500_000,
      valorBodega: 3_000_000,
      financieras: { PAYJOY: 30_000_000.17, ADDI: -2_000.21 },
      deudaEquipos: 70_000_000,
      valorPendiente: 100_000,
      valorGarantia: 200_000,
      totalGastosCartera: -900_000,
    },
  ];

  for (const corte of coberturas) {
    assert.deepEqual(calcularBalanceFinanciero(corte), calcularBalanceAntes(corte));
  }
  assert.deepEqual(calcularBalanceFinanciero(null), calcularBalanceAntes(null));
});

test("resultado neto y caja disponible siguen siendo valores independientes", () => {
  const corte = {
    ...vacio,
    cajaDisponible: 1_000_000,
    financieras: { PAYJOY: 2_000_000 },
    deudaEquipos: 500_000,
  };
  assert.equal(calcularBalanceFinanciero(corte).resultadoNeto, 2_500_000);
  assert.equal(corte.cajaDisponible, 1_000_000);
});

test("mantiene todas las cinco alertas y sus accesos cuando se cumplen simultáneamente", () => {
  const corte = {
    ...vacio,
    cajaDisponible: -1_000,
    valorPendiente: 2_000,
    valorGarantia: 3_000,
    deudaEquipos: 4_000,
    totalGastosCartera: 4_000,
  };
  const alertas = obtenerAlertasFinancieras(corte, calcularBalanceFinanciero(corte).resultadoNeto);
  assert.deepEqual(alertas.map((alerta) => alerta.title), [
    "Resultado neto en rojo",
    "Caja disponible negativa",
    "Equipos pendientes",
    "Garantías abiertas",
    "Cartera con peso alto",
  ]);
  assert.equal(alertas[1].href, "/caja");
  assert.equal(alertas[2].href, "/inventario");
  assert.equal(alertas[3].href, "/inventario");
  assert.equal(alertas[4].href, "/dashboard/financiero/cartera/detalle");
  assert.match(alertas[0].detail, /\$ 14\.000/);
});

test("no genera alertas críticas con cero, cartera negativa o cartera menor que deuda", () => {
  assert.deepEqual(obtenerAlertasFinancieras(vacio, 0), []);
  assert.deepEqual(obtenerAlertasFinancieras(null, 0), []);
  assert.deepEqual(obtenerAlertasFinancieras({ ...vacio, totalGastosCartera: -1 }, 1), []);
  assert.deepEqual(obtenerAlertasFinancieras({ ...vacio, totalGastosCartera: 9, deudaEquipos: 10 }, 1), []);
  assert.equal(obtenerAlertasFinancieras({ ...vacio, totalGastosCartera: 10, deudaEquipos: 10 }, 1)[0].title, "Cartera con peso alto");
});

test("incluye todas las financieras del catálogo sin reemplazar los saldos reales", () => {
  const corte = { ...vacio, financieras: { PAYJOY: 75, SUMASPAY: 25, HISTORICA: 0 } };
  const saldos = obtenerSaldosFinancieras(corte, ["Payjoy", "SUMASPAY", "ADDI", "ADDI", " "]);
  assert.deepEqual(saldos, [
    { nombre: "PAYJOY", valor: 75, participacion: 75, anchoBarra: 75 },
    { nombre: "SUMASPAY", valor: 25, participacion: 25, anchoBarra: 25 },
    { nombre: "HISTORICA", valor: 0, participacion: 0, anchoBarra: 0 },
    { nombre: "ADDI", valor: 0, participacion: 0, anchoBarra: 0 },
  ]);
  assert.equal(saldos.reduce((acc, item) => acc + item.valor, 0), calcularBalanceAntes(corte).totalFinancieras);
});

test("total cero conserva el catálogo y presenta participación cero sin NaN", () => {
  const saldos = obtenerSaldosFinancieras(vacio, ["PAYJOY", "SUMASPAY"]);
  assert.equal(saldos.length, 2);
  for (const item of saldos) {
    assert.equal(item.valor, 0);
    assert.equal(item.participacion, 0);
    assert.equal(item.anchoBarra, 0);
  }
});

test("las participaciones usan total real y las barras respetan sus límites con saldos negativos", () => {
  const saldos = obtenerSaldosFinancieras({ ...vacio, financieras: { PAYJOY: 200, ADDI: -100 } }, []);
  assert.deepEqual(saldos, [
    { nombre: "PAYJOY", valor: 200, participacion: 200, anchoBarra: 100 },
    { nombre: "ADDI", valor: -100, participacion: -100, anchoBarra: 0 },
  ]);
  const saldoNegativo = obtenerSaldosFinancieras({ ...vacio, financieras: { ADDI: -100 } }, []);
  assert.equal(saldoNegativo[0].valor, -100);
  assert.equal(saldoNegativo[0].participacion, 0);
  assert.equal(saldoNegativo[0].anchoBarra, 0);
});

test("los importes conservan cifras completas y formato colombiano", () => {
  assert.equal(formatoPesos(87_007_927), "$ 87.007.927");
  assert.equal(formatoPesos(1_146_028_750.4), "$ 1.146.028.750,4");
  assert.equal(formatoPesos(-1000), "$ -1.000");
  assert.equal(formatoPesos(0), "$ 0");
});
