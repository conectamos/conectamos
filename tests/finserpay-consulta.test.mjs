import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const imei = "111111111111111";
const otherImei = "222222222222222";
const instant = "2026-10-18T00:17:39.000Z";
const now = "2026-10-18T01:00:00.000Z"; // 17 October in Colombia.
const fixture = () => ({
  ok: true, active: true, imei, deviceUid: imei,
  fechaConsulta: "2026-10-13T15:00:00Z", createdAt: "2026-10-13T15:00:00Z",
  credit: { id: "synthetic-credit", folio: "SYNTHETIC", estado: "ENTREGABLE", entregable: true,
    cliente: { nombre: "Cliente de prueba", createdAt: "2026-10-13T15:00:00Z",
      fechaNacimiento: "1990-01-15T00:00:00Z", fechaExpedicion: "2015-10-01T00:00:00Z" },
    equipo: { imei, deviceUid: imei },
    financiacion: { valorCredito: 2480000, valorEquipo: 2780000, cuotaInicial: 300000,
      totalAPagar: 3600000, valorCuota: 300000, plazo: 12, frecuenciaPago: "CATORCENAL", fechaApertura: instant },
    valorCredito: 2480000, valorCreditoActivo: 3600000, totalAPagar: 3600000,
    valorCuota: 300000, plazo: 12, frecuenciaPago: "CATORCENAL", fechaCredito: instant,
  },
});

function reader(payload) {
  const calls = [];
  const cached = new Map();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return Date.parse(now); }
  }
  function load(path) {
    if (cached.has(path)) return cached.get(path);
    const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod = { exports: {} };
    const require = (id) => {
      assert.equal(id, "@/lib/credit-date-utils");
      return load("lib/credit-date-utils.ts");
    };
    const fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json(payload); };
    new Function("require", "module", "exports", "fetch", "process", "Date", code)(require, mod, mod.exports, fetch,
      { env: { FINSERPAYCONSULTA_URL: "https://mock.invalid/imei", FINSERPAYCONSULTA_TOKEN: "synthetic-token" } }, Clock);
    cached.set(path, mod.exports);
    return mod.exports;
  }
  return { lookup: () => load("lib/finserpayconsulta.ts").obtenerCreditoFinserpayPorImei(imei), calls };
}

test("contrato real usa generación Bogotá y capital, sin confundir consulta, inicial o total futuro", async () => {
  const probe = reader(fixture());
  const result = await probe.lookup();
  assert.equal(result.fechaCreacionCredito, "2026-10-17");
  assert.equal(result.creditoAutorizado, 2480000);
  assert.equal(result.valorCuota, 300000);
  assert.equal(result.numeroCuotas, 12);
  assert.equal(result.frecuenciaCuota, "CATORCENAL");
  assert.equal(result.imei, imei);
  assert.equal(probe.calls.length, 1);
  assert.equal(probe.calls[0].options.method, "GET");
  assert.equal(probe.calls[0].options.cache, "no-store");
});

test("la fecha del crédito tiene prioridad explícita sobre la apertura duplicada", async () => {
  const payload = fixture();
  payload.credit.financiacion.fechaApertura = "2026-10-13T15:00:00Z";
  const result = await reader(payload).lookup();
  assert.equal(result.fechaCreacionCredito, "2026-10-17");
  delete payload.credit.fechaCredito;
  payload.credit.financiacion.fechaApertura = instant;
  assert.equal((await reader(payload).lookup()).fechaCreacionCredito, "2026-10-17");
});

test("hoy y ayer se calculan por Bogotá para UTC, offsets, epoch y fechas civiles", async () => {
  const cases = [
    ["2026-10-17T05:00:00Z", "2026-10-17"], ["2026-10-18T04:59:59.999Z", "2026-10-17"],
    ["2026-10-16T05:00:00Z", "2026-10-16"], ["2026-10-16T04:59:59.999Z", null],
    ["2026-10-18T05:00:00Z", null], ["2026-10-18T02:17:39+02:00", "2026-10-17"],
    [Date.parse(instant), "2026-10-17"], [Date.parse(instant) / 1000, "2026-10-17"],
    [String(Date.parse(instant)), "2026-10-17"], ["2026-10-17", "2026-10-17"],
    ["2026-10-16", "2026-10-16"], ["2026-10-15", null], ["2026-10-18", null],
  ];
  for (const [value, expected] of cases) {
    const payload = fixture(); payload.credit.fechaCredito = value;
    assert.equal((await reader(payload).lookup())?.fechaCreacionCredito ?? null, expected, String(value));
  }
});

test("nacimiento y expedición permanecen fechas civiles sin desplazar un día", async () => {
  const result = await reader(fixture()).lookup();
  assert.equal(result.fechaNacimiento, "1990-01-15");
  assert.equal(result.fechaExpedicion, "2015-10-01");
});

test("fecha de generación ausente nunca se sustituye con consulta, cliente, actualización o hoy", async () => {
  const payload = fixture();
  delete payload.credit.fechaCredito;
  delete payload.credit.financiacion.fechaApertura;
  payload.fechaConsulta = instant;
  payload.createdAt = instant;
  payload.credit.updatedAt = instant;
  payload.credit.approvedAt = instant;
  payload.credit.cliente.createdAt = instant;
  assert.equal(await reader(payload).lookup(), null);
  payload.credit.fechaCredito = "invalid";
  payload.credit.financiacion.fechaApertura = instant;
  assert.equal(await reader(payload).lookup(), null);
});

test("contrato oficial no sustituye capital faltante con precio, inicial ni total a pagar", async () => {
  const payload = fixture();
  delete payload.credit.valorCredito;
  delete payload.credit.financiacion.valorCredito;
  assert.equal(await reader(payload).lookup(), null);
  payload.credit.financiacion.valorCredito = 2480000;
  assert.equal((await reader(payload).lookup()).creditoAutorizado, 2480000);
});

test("IMEI explícito contradictorio o inválido veta respuesta sin mezclar clientes/equipos", async () => {
  for (const location of ["root", "equipment", "partial"]) {
    const payload = fixture();
    if (location === "root") payload.imei = otherImei;
    if (location === "equipment") payload.credit.equipo.imei = otherImei;
    if (location === "partial") payload.credit.equipo.imei = `invalid-${imei}`;
    assert.equal(await reader(payload).lookup(), null, location);
  }
  const payload = fixture();
  delete payload.imei; delete payload.deviceUid; delete payload.credit.equipo;
  payload.credit.cliente.imei = imei;
  assert.equal(await reader(payload).lookup(), null, "El IMEI de un objeto cliente no identifica el crédito");
});

test("variantes planas, lista y envoltura data conservan fecha propia e identidad coincidente", async () => {
  const valid = { imei, principal: 850000, fechaCredito: "2026-10-17", cliente: { createdAt: "2020-01-01" } };
  for (const payload of [valid, { data: [valid] }, [{ ...valid, imei: otherImei, principal: 100 }, valid],
    { imei, credito: { principal: 850000, loanDate: "17/10/2026", cliente: { createdAt: "2020-01-01" } } },
    { credit: { imei, loanAmount: 850000, createdAt: instant } },
    { serialImei: imei, montoCredito: 850000, createdAt: instant }]) {
    const result = await reader(payload).lookup();
    assert.equal(result.creditoAutorizado, 850000);
    assert.equal(result.fechaCreacionCredito, "2026-10-17");
  }
  assert.equal(await reader([{ ...valid, imei: otherImei }]).lookup(), null);
  assert.equal(await reader({ ...valid, imei: otherImei }).lookup(), null);
});
