import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateCredits, bogotaDayKey, canonicalFinancialName, deduplicateCredits,
  normalizeCreditStatus, projectLocalSaleCredits, resolveCierrePeriod, resolveCierreSede,
} from "../lib/cierre-domain.ts";

const today = new Date("2026-10-13T03:30:00Z"); // Still Oct 12 in Colombia.
const sale = (overrides = {}) => ({ id: 1, idVenta: "VTA-1", sedeId: 2,
  fecha: new Date("2026-10-12T19:00:00Z"), payjoy: "1000000.25", ...overrides });
const local = (overrides = {}) => projectLocalSaleCredits(sale(overrides))[0];
const month = resolveCierrePeriod({ periodo: "mes", mes: "2026-10" });

test("día usa America/Bogota, fechas anteriores y fin exclusivo", () => {
  assert.equal(bogotaDayKey(today), "2026-10-12");
  const current = resolveCierrePeriod({}, today);
  assert.equal(current.desde, "2026-10-12");
  assert.equal(current.start.toISOString(), "2026-10-12T05:00:00.000Z");
  assert.equal(current.end.toISOString(), "2026-10-13T05:00:00.000Z");
  assert.equal(resolveCierrePeriod({ fecha: "2025-01-01" }).desde, "2025-01-01");
});

test("semana siempre lunes a domingo, incluyendo cambio de año", () => {
  for (const date of ["2025-12-29", "2025-12-31", "2026-01-04"]) {
    const week = resolveCierrePeriod({ periodo: "semana", fecha: date });
    assert.equal(week.desde, "2025-12-29");
    assert.equal(week.hasta, "2026-01-04");
    assert.equal(week.end.toISOString(), "2026-01-05T05:00:00.000Z");
  }
});

test("meses históricos respetan días del mes y año bisiesto", () => {
  assert.equal(resolveCierrePeriod({ periodo: "mes", mes: "2024-02" }).hasta, "2024-02-29");
  assert.equal(resolveCierrePeriod({ periodo: "mes", mes: "2025-02" }).hasta, "2025-02-28");
  assert.equal(resolveCierrePeriod({ periodo: "mes", mes: "2025-12" }).end.toISOString(), "2026-01-01T05:00:00.000Z");
  assert.equal(resolveCierrePeriod({ fecha: "1992-06-01" }).start.toISOString(), "1992-06-01T04:00:00.000Z", "Respeta IANA incluso en fechas de DST histórico");
});

test("rango incluye ambas fechas civiles, incluso un solo día", () => {
  const range = resolveCierrePeriod({ periodo: "rango", desde: "2025-01-31", hasta: "2025-02-02" });
  assert.equal(range.start.toISOString(), "2025-01-31T05:00:00.000Z");
  assert.equal(range.end.toISOString(), "2025-02-03T05:00:00.000Z");
  const sameDay = resolveCierrePeriod({ periodo: "rango", desde: "2025-01-31", hasta: "2025-01-31" });
  assert.equal(sameDay.end - sameDay.start, 86400000);
});

test("rechaza fechas imposibles, rangos invertidos y periodos desconocidos", () => {
  for (const input of [
    { fecha: "2025-02-29" }, { fecha: "2026-02-31" }, { fecha: "2026-10-13T00:00:00Z" },
    { periodo: "mes", mes: "2026-13" }, { periodo: "hoy" }, { periodo: "rango", desde: "2026-01-01" },
    { periodo: "rango", desde: "2026-02-02", hasta: "2026-02-01" },
  ]) assert.throws(() => resolveCierrePeriod(input), (error) => error.status === 400);
});

test("normaliza alias reales y conserva financieras sin API", () => {
  for (const name of ["ALO-CREDIT", " alo credit ", "Alocredit"]) assert.equal(canonicalFinancialName(name), "ALO CREDIT");
  for (const name of ["FINSER", "FINSER PAY", "finserpay"]) assert.equal(canonicalFinancialName(name), "FINSERPAY");
  assert.equal(canonicalFinancialName("SISTECRÉDITO"), "SISTECREDITO");
  assert.equal(canonicalFinancialName("Banco de Bogotá"), "BANCO BOGOTA");
  assert.equal(canonicalFinancialName("celya"), "CELYA");
});

test("solo Venta confirmada aporta valor bruto, no inicial, equipo, cupo, neto o cuotas", () => {
  const rows = projectLocalSaleCredits(sale({
    financierasDetalle: [{ nombre: "ADDI", valorBruto: "900000", valorNeto: "828000" }],
    addi: "9999999", ingreso: "1100000", cuotaInicial: "200000", precioEquipo: "1100000", creditoAutorizado: "8000000",
  }), [{ id: 3, ventaIdRelacionada: 1, sedeId: 2, clienteNombre: "Ana", documentoNumero: "1.012.345.678",
    creditoAutorizado: "5000000", cuotaInicial: "1000000", numeroCuotas: 12, valorCuota: 150000 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].financial, "ADDI");
  assert.equal(rows[0].amount, 900000);
  assert.equal(rows[0].documentNumber, "1012345678");
  assert.equal(rows[0].customerName, "Ana");
  assert.equal(rows[0].providerCreditId, null);
  assert.equal(rows[0].creditNumber, null);
  assert.equal(rows[0].localReference, "VTA-1");
  assert.equal(rows[0].source, "CONECTAMOS");
});

test("registro pendiente aislado nunca crea créditos ni aporta identidad por cédula o IMEI", () => {
  const records = [{ id: 3, ventaIdRelacionada: null, clienteNombre: "Otra", documentoNumero: "123", creditoAutorizado: "99999" }];
  const rows = projectLocalSaleCredits(sale(), records);
  assert.equal(rows[0].customerName, null);
  assert.equal(rows[0].registroId, null);
  assert.deepEqual(projectLocalSaleCredits(sale({ payjoy: null }), records), []);
  assert.equal(projectLocalSaleCredits(sale(), [{ ...records[0], ventaIdRelacionada: 1, sedeId: 99 }])[0].customerName, null);
});

test("varias financieras de una venta producen créditos independientes y alias no duplican una financiera", () => {
  const rows = projectLocalSaleCredits(sale({ financierasDetalle: [
    { nombre: "PAYJOY", valorBruto: 1000000 }, { nombre: "CELYA", valorBruto: 500000 },
    { nombre: "ALO-CREDIT", valorBruto: 200000 }, { nombre: "ALO CREDIT", valorBruto: 100000 },
  ] }));
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.financial === "ALO CREDIT").amount, 300000);
  const result = aggregateCredits(rows, { period: month });
  assert.equal(result.totalUnits, 3);
  assert.equal(result.totalAmount, 1800000);
});

test("legacy y modernas usan misma financiera y detalles actuales no suman columnas duplicadas", () => {
  const legacy = projectLocalSaleCredits(sale({ payjoy: 0, finser: 750000, alocredit: 120000, gora: 450000 }));
  assert.deepEqual(legacy.map((row) => row.financial).sort(), ["ALO CREDIT", "FINSERPAY", "GORA"]);
  assert.throws(() => projectLocalSaleCredits(sale({ financierasDetalle: [{ nombre: "PAYJOY", valorNeto: 100 }] })),
    /valor de crédito válido/, "No inventar principal usando valorNeto o columnas legacy desactualizadas");
  assert.throws(() => projectLocalSaleCredits(sale({ financierasDetalle: [{ valorBruto: 100 }] })), /nombre/);
  assert.throws(() => projectLocalSaleCredits(sale({ financierasDetalle: {} })), /no es válido/);
  assert.throws(() => projectLocalSaleCredits(sale({ financierasDetalle: [{ nombre: "PAYJOY", valorBruto: true }] })), /valor/);
  assert.deepEqual(projectLocalSaleCredits(sale({ financierasDetalle: [{ nombre: "PAYJOY", valorBruto: 0 }] })), []);
});

test("fecha efectiva es Venta.fecha; sincronización y creación del registro no cambian el periodo", () => {
  const original = local({ fecha: "2025-02-01T04:59:59.999Z", updatedAt: new Date("2026-10-13T14:00:00Z") });
  assert.equal(original.effectiveAt.toISOString(), "2025-02-01T04:59:59.999Z");
  assert.equal(aggregateCredits([original], { period: resolveCierrePeriod({ periodo: "mes", mes: "2025-01" }) }).totalUnits, 1);
  assert.equal(aggregateCredits([original], { period: month }).totalUnits, 0);
  assert.equal(local({ fecha: "2025-01-01" }).effectiveAt.toISOString(), "2025-01-01T05:00:00.000Z");
  assert.equal(local({ fecha: "2025-01-01T00:00:00Z" }).effectiveAt.toISOString(), "2025-01-01T00:00:00.000Z", "Un timestamp UTC es un instante, no fecha civil");
});

test("anulaciones, reversos, rechazos y aprobaciones de cupo quedan fuera de efectivos", () => {
  for (const state of ["ANULADO", "REVERSED", "REJECTED", "APROBADO", "APPROVED", "ELIGIBLE", "UNKNOWN"]) {
    const credit = { ...local(), status: normalizeCreditStatus(state) };
    assert.equal(aggregateCredits([credit], { period: month }).totalUnits, 0, state);
  }
  assert.equal(normalizeCreditStatus("REVERSADO"), "REVERSADO");
  assert.equal(local({ eliminadoEn: new Date() }).status, "ANULADO");
});

test("API y venta vinculadas por identificador estable cuentan una vez con principal y fecha API", () => {
  const row = local();
  const provider = { ...row, providerCreditId: "pj-0001", creditNumber: "PJ-1", amount: 950000,
    effectiveAt: new Date("2026-09-30T20:00:00Z"), source: "PAYJOY_API" };
  const deduplicated = deduplicateCredits([row, provider, provider]);
  assert.equal(deduplicated.length, 1);
  assert.equal(deduplicated[0].amount, 950000);
  assert.equal(aggregateCredits([row, provider], { period: month }).totalUnits, 0);
  assert.equal(aggregateCredits([row, provider], { period: resolveCierrePeriod({ periodo: "mes", mes: "2026-09" }) }).totalUnits, 1);
});

test("mismo cliente con dos IDs proveedor genera dos créditos, incluso idéntico número en otra financiera", () => {
  const base = { ...local(), localKey: null, documentNumber: "1012345", source: "API" };
  const records = [
    { ...base, providerCreditId: "1" }, { ...base, providerCreditId: "2" },
    { ...base, providerCreditId: "1", financial: "ADDI" },
  ];
  assert.equal(deduplicateCredits(records).length, 3);
  assert.equal(aggregateCredits(records, { period: month }).totalUnits, 3);
});

test("webhooks repetidos y fuera de orden no duplican ni resucitan crédito reversado", () => {
  const credit = { ...local(), providerCreditId: "1", source: "API", updatedAt: new Date("2026-10-12T12:00:00Z") };
  const reversed = { ...credit, status: "REVERSADO", updatedAt: new Date("2026-10-13T12:00:00Z") };
  const result = deduplicateCredits([credit, reversed, credit, reversed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "REVERSADO");
  assert.equal(aggregateCredits(result, { period: month }).totalUnits, 0);
  assert.throws(() => deduplicateCredits([{ ...credit, providerCreditId: null, localKey: null }]));
});

test("detalle, resumen y totales comparten filtro; paginar diez no recorta el total", () => {
  const records = Array.from({ length: 25 }, (_, index) => local({ id: index + 1, sedeId: index < 23 ? 2 : 3, payjoy: 100 }));
  records.push(local({ id: 99, fecha: "2026-11-01T05:00:00Z", payjoy: 100 }));
  const result = aggregateCredits(records, { period: month, sedeId: 2, financial: "payjoy" });
  assert.equal(result.detail.slice(0, 10).length, 10);
  assert.equal(result.totalUnits, 23);
  assert.equal(result.totalAmount, 2300);
  assert.equal(result.rows[0].units, result.detail.length);
});

test("solo administrador obtiene global; sede autenticada también rige exportaciones", () => {
  assert.equal(resolveCierreSede({ rolNombre: "ADMIN", sedeId: 2 }), null);
  assert.equal(resolveCierreSede({ perfilTipo: "ADMINISTRADOR", sedeId: 2 }, "5"), 5);
  for (const role of ["SUPERVISOR", "AUDITOR", "VENDEDOR"]) {
    assert.equal(resolveCierreSede({ rolNombre: role, sedeId: 2 }), 2);
    assert.equal(resolveCierreSede({ rolNombre: role, sedeId: 2 }, "2"), 2);
    assert.throws(() => resolveCierreSede({ rolNombre: role, sedeId: 2 }, "3"), (error) => error.status === 403);
  }
  assert.throws(() => resolveCierreSede({ rolNombre: "SUPERVISOR" }), (error) => error.status === 403);
  for (const invalid of ["ALL", "abc", "0", "-1", "1.5", "Infinity"]) {
    assert.throws(() => resolveCierreSede({ rolNombre: "ADMIN" }, invalid), (error) => error.status === 400);
  }
});

test("cambiar filtros es cálculo local y nunca llama fetch", () => {
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("El reporte no debe consultar proveedores"); };
  try {
    const records = [local()];
    for (const input of [{ periodo: "dia", fecha: "2026-10-12" }, { periodo: "semana", fecha: "2026-10-12" },
      { periodo: "mes", mes: "2026-10" }, { periodo: "rango", desde: "2026-10-01", hasta: "2026-10-30" }]) {
      assert.equal(aggregateCredits(records, { period: resolveCierrePeriod(input) }).totalUnits, 1);
    }
  } finally { globalThis.fetch = previous; }
});
