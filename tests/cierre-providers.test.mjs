import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import {
  CIERRE_PROVIDER_CAPABILITIES,
  consultarLoteProveedorCierre,
  normalizeAddiCierre,
  normalizePayJoyCierre,
  normalizeSumasCierre,
  parseCierreProviderDate,
} from "../lib/cierre-providers.ts";

const reference = { documento: "1.234.567", imei: "359999999999991" };
const day = "2026-07-25";
const financeTime = Date.parse(`${day}T14:00:00-05:00`) / 1000;
const finance = (id, overrides = {}) => ({
  type: "finance", time: financeTime,
  financeOrder: { id, financeAmount: 900000, downPayment: 200000, purchaseAmount: 1100000 },
  device: { imei: reference.imei }, ...overrides,
});
const addi = (overrides = {}) => ({
  orderId: "AD-1", documentNumber: "1234567", status: "SUCCESS",
  storeName: "CONECTAMOS CENTRO", transactionDate: `${day}T12:00:00-05:00`, creditAmount: 700000,
  ...overrides,
});
const sumas = (overrides = {}) => ({
  accountNo: "SUM-1", documento: "1234567", status: "ACTIVE",
  point_credit_name: "CONECTAMOS CENTRO", loanDate: day, principal: 800000,
  ...overrides,
});
const source = (data) => [{ source: "test-credit-history", data }];

test("PAYJOY cuenta financeAmount sin sumar inicial, precio ni cuotas", () => {
  const credits = normalizePayJoyCierre({ valid: true, transactions: [finance("P-1")] }, reference);
  assert.equal(credits.length, 1);
  assert.equal(credits[0].valor, 900000);
  assert.equal(credits[0].estado, "EFECTIVO");
  assert.equal(credits[0].fechaEfectiva.toISOString(), "2026-07-25T19:00:00.000Z");
  assert.equal(credits[0].documento, "1234567");
});

test("un importe de transacción o precio sin principal PAYJOY queda pendiente", () => {
  const item = finance("P-1", { amount: 1200000, financeOrder: { id: "P-1", purchaseAmount: 1200000 } });
  const [credit] = normalizePayJoyCierre({ valid: true, transactions: [item] }, reference);
  assert.equal(credit.valor, null);
  assert.equal(credit.estado, "PENDIENTE");
});

test("un pago o aprobación de elegibilidad no es una transacción de financiación", () => {
  const credits = normalizePayJoyCierre({ valid: true, transactions: [
    finance("PAYMENT", { type: "payment" }), finance("APPROVAL", { type: "approved" }),
  ] }, reference);
  assert.deepEqual(credits, []);
  assert.deepEqual(normalizePayJoyCierre({ valid: true, financeOrder: { id: "P-1", financeAmount: 900000 } }, reference), []);
});

test("un mismo ID repetido se cuenta una vez; dos IDs del mismo cliente se conservan", () => {
  const credits = normalizePayJoyCierre({ valid: true, transactions: [finance("P-1"), finance("P-1"), finance("P-2")] }, reference);
  assert.equal(credits.length, 2);
  assert.equal(credits.reduce((sum, item) => sum + item.valor, 0), 1800000);
});

test("un reverso posterior cambia estado pero conserva fecha y capital originales", () => {
  const reversed = finance("P-1", { type: "refund", time: financeTime + 86400, financeOrder: { id: "P-1" } });
  for (const transactions of [[finance("P-1"), reversed], [reversed, finance("P-1")]]) {
    const [credit] = normalizePayJoyCierre({ valid: true, transactions }, reference);
    assert.equal(credit.estado, "REVERSADO");
    assert.equal(credit.valor, 900000);
    assert.equal(credit.fechaEfectiva.toISOString(), "2026-07-25T19:00:00.000Z");
  }
});

test("registros sin identificador del proveedor o de otro IMEI no se agregan", () => {
  const credits = normalizePayJoyCierre({ valid: true, transactions: [
    finance(null), finance("P-2", { device: { imei: "359999999999992" } }),
  ] }, reference);
  assert.deepEqual(credits, []);
});

test("SUMASPAY no trata APPROVED ni approvedPrincipal como crédito generado", () => {
  const [credit] = normalizeSumasCierre(source([sumas({ status: "APPROVED", principal: undefined, approvedPrincipal: 800000 })]), reference);
  assert.equal(credit.estado, "PENDIENTE");
  assert.equal(credit.valor, null);
});

test("el estado activo del cliente no acredita generación de un crédito SUMASPAY", () => {
  const [credit] = normalizeSumasCierre(source([sumas({ status: undefined, customer: { status: "ACTIVE" } })]), reference);
  assert.equal(credit.estado, "PENDIENTE");
});

test("SUMASPAY usa desembolso real y no fecha de actualización o de solicitud", () => {
  const [credit] = normalizeSumasCierre(source([sumas({
    loanDate: "2026-07-20", timeline: { disbursedOnDate: [2026, 7, 25] },
    principalDisbursed: 650000, updatedAt: "2026-08-01T10:00:00Z",
  })]), reference);
  assert.equal(credit.fechaEfectiva.toISOString(), "2026-07-25T05:00:00.000Z");
  assert.equal(credit.valor, 650000);
  assert.equal(credit.sourceUpdatedAt.toISOString(), "2026-08-01T10:00:00.000Z");
});

test("anulación y rechazo se distinguen de un crédito pagado", () => {
  const credits = normalizeSumasCierre(source([
    sumas({ accountNo: "S-1", status: "ANULADO" }),
    sumas({ accountNo: "S-2", status: "REJECTED" }),
    sumas({ accountNo: "S-3", status: "PAID IN FULL" }),
    sumas({ accountNo: "S-4", status: "CLOSED" }),
  ]), reference);
  assert.deepEqual(credits.map((item) => item.estado), ["ANULADO", "RECHAZADO", "EFECTIVO", "PENDIENTE"]);
});

test("ADDI APPROVED permanece pendiente, incluso con ID, monto y tienda", () => {
  const [credit] = normalizeAddiCierre(source([addi({ status: "APPROVED" })]), reference);
  assert.equal(credit.estado, "PENDIENTE");
});

test("ADDI no utiliza price, amount, approvedAmount ni updatedAt como capital o fecha", () => {
  const [credit] = normalizeAddiCierre(source([addi({
    creditAmount: undefined, amount: 700000, price: 900000, approvedAmount: 1000000,
    transactionDate: undefined, createdAt: undefined, updatedAt: "2026-07-25T10:00:00Z",
  })]), reference);
  assert.equal(credit.estado, "PENDIENTE");
  assert.equal(credit.valor, null);
  assert.equal(credit.fechaEfectiva, null);
});

test("ADDI createdAt sin fecha efectiva de transacción no fecha el crédito", () => {
  const [credit] = normalizeAddiCierre(source([addi({
    transactionDate: undefined, createdAt: "2026-07-25T10:00:00Z",
  })]), reference);
  assert.equal(credit.fechaEfectiva, null);
  assert.equal(credit.estado, "PENDIENTE");
});

test("ADDI conserva estados negativos, distingue clientes y descarta otros comercios", () => {
  const credits = normalizeAddiCierre(source([
    addi({ status: "REVERSED" }), addi({ orderId: "OTHER-1", documentNumber: "7654321" }),
    addi({ orderId: "OTHER-2", storeName: "OTRO COMERCIO" }),
  ]), reference);
  assert.equal(credits.length, 1);
  assert.equal(credits[0].estado, "REVERSADO");
});

test("fechas locales usan Bogotá y rechazan días inexistentes", () => {
  assert.equal(parseCierreProviderDate(day).toISOString(), "2026-07-25T05:00:00.000Z");
  assert.equal(parseCierreProviderDate(`${day}T23:30:00`).toISOString(), "2026-07-26T04:30:00.000Z");
  assert.equal(parseCierreProviderDate("2026-02-30"), null);
  assert.equal(parseCierreProviderDate("invalida"), null);
});

function readers(overrides = {}) {
  const forbidden = async () => { throw new Error("No debe consultar esta fuente"); };
  return { configured: () => true, sumas: forbidden, addi: forbidden, payjoy: forbidden, ...overrides };
}

test("financieras sin contrato útil usan fallback local sin realizar llamadas", async () => {
  for (const financiera of ["SISTECREDITO", "ALO CREDIT", "FINSERPAY"]) {
    const result = await consultarLoteProveedorCierre({ financiera, fechaDesde: day, fechaHasta: day, referencias: [reference] }, readers({ configured: () => { throw new Error("No debe verificar credenciales"); } }));
    assert.equal(result.complete, false);
    assert.deepEqual(result.credits, []);
    assert.equal(CIERRE_PROVIDER_CAPABILITIES[financiera].source, "LOCAL");
    assert.ok(result.limitation);
  }
});

test("configuración ausente no consulta al proveedor ni confirma un cero", async () => {
  const result = await consultarLoteProveedorCierre({ financiera: "ADDI", fechaDesde: day, fechaHasta: day, referencias: [reference] }, readers({ configured: () => false }));
  assert.equal(result.complete, false);
  assert.deepEqual(result.credits, []);
  assert.match(result.limitation, /sin configurar/);
});

test("el trabajador recibe un solo trabajo y un error no se transforma en periodo completo", async () => {
  const request = { financiera: "SUMASPAY", fechaDesde: day, fechaHasta: day, referencias: [reference] };
  await assert.rejects(consultarLoteProveedorCierre({ ...request, referencias: [reference, reference] }, readers()), /una referencia/);
  await assert.rejects(consultarLoteProveedorCierre(request, readers({ sumas: async () => { throw new Error("HTTP 429"); } })), /HTTP 429/);
});

test("un histórico leído con éxito sigue parcial y filtra por fecha efectiva Bogotá", async () => {
  let count = 0;
  const result = await consultarLoteProveedorCierre({ financiera: "SUMASPAY", fechaDesde: day, fechaHasta: day, referencias: [reference] }, readers({
    sumas: async () => { count++; return source([
      sumas({ accountNo: "PREV", loanDate: "2026-07-25T04:59:59Z" }),
      sumas({ accountNo: "IN", loanDate: "2026-07-26T04:59:59Z" }),
      sumas({ accountNo: "NEXT", loanDate: "2026-07-26T05:00:00Z" }),
    ]); },
  }));
  assert.equal(count, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.credits.map((item) => item.providerId), ["IN"]);
});

test("no se infiere la sede del cliente ni se persiste el payload completo", () => {
  const [credit] = normalizeAddiCierre(source([addi({ token: "private", email: "private@example.test" })]), { ...reference, sedeId: 7 });
  assert.equal(credit.sedeId, undefined);
  assert.equal(JSON.stringify(credit.raw).includes("private"), false);
});

test("SUMASPAY aborta un login vencido y no reintenta dentro del lector de CIERRE", async () => {
  const sourceText = readFileSync(new URL("../lib/sumasconsulta.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(sourceText, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exported = {};
  const timeout = new DOMException("Tiempo de espera agotado", "TimeoutError");
  const signal = AbortSignal.abort(timeout);
  const durations = [];
  let calls = 0;
  const fetchStub = async (_url, init) => {
    calls++;
    assert.equal(init.signal, signal);
    throw init.signal.reason;
  };
  new Function("require", "exports", "process", "fetch", "AbortSignal", code)(
    createRequire(import.meta.url), exported,
    { env: { SUMASCONSULTA_URL: "https://sumas.example.test/api/", SUMASCONSULTA_USUARIO: "test-user", SUMASCONSULTA_CLAVE: "test-only" } },
    fetchStub, { timeout: (duration) => { durations.push(duration); return signal; } },
  );
  await assert.rejects(exported.readSumasCierreHistory("1234567"), (error) => error === timeout);
  assert.equal(calls, 1);
  assert.deepEqual(durations, [20000]);
});
