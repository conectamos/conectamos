import test from "node:test";
import assert from "node:assert/strict";
import { modules, database, credit, sale } from "./cierre-test-helpers.mjs";

const date = new Date("2026-10-12T18:00:00Z");
const later = new Date("2026-10-13T18:00:00Z");
const observation = (changes = {}) => ({
  financiera: "PAYJOY", providerId: "p-1", fechaEfectiva: date, valor: 1000000,
  documento: "1234567", imei: "123456789012345", cliente: "Cliente", estado: "EFECTIVO",
  fuente: "API PAYJOY", sourceUpdatedAt: date, raw: { providerStatus: "FINANCE" }, ...changes,
});
const reconcile = (db, observations) => modules(db.prisma).load("lib/cierre-reconcile.ts").reconcileCierreCredits(db.prisma, observations);
const apiRow = (changes = {}) => credit(2, {
  localKey: null, ventaId: null, sedeId: null, providerCreditId: "p-1", status: "PENDIENTE",
  source: "API PAYJOY · pendiente de vinculación", providerUpdatedAt: date, ...changes,
});

test("identificadores contradictorios o IMEI parcialmente numérico vetan el enlace", async () => {
  for (const changes of [
    { imei: "999999999999999" }, { documento: "7654321" },
    { imei: "abc123456789012345" }, { imei: "12345-6789012345" },
  ]) {
    const db = database({ cierreCredito: [credit(1)] });
    const result = await reconcile(db, [observation({ ...changes, estado: "REVERSADO" })]);
    assert.equal(result.linked, 0);
    assert.equal(db.tables.cierreCredito[0].status, "EFECTIVO");
    assert.equal(db.tables.cierreCredito[0].providerCreditId, null);
    assert.equal(db.tables.cierreCredito[1].status, "REVERSADO");
  }
});

test("documento formateado válido permite vínculo si no hay IMEI contradictorio", async () => {
  const db = database({ cierreCredito: [credit(1, { imei: null })] });
  const result = await reconcile(db, [observation({ imei: undefined })]);
  assert.equal(result.linked, 1);
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].providerCreditId, "p-1");
});

test("reverso sin fecha/importe usa hechos previos del mismo ID y excluye venta local", async () => {
  const db = database({ cierreCredito: [credit(1), apiRow()] });
  const result = await reconcile(db, [observation({ fechaEfectiva: null, valor: null,
    documento: "", imei: undefined, estado: "REVERSADO", sourceUpdatedAt: later, raw: { providerStatus: "REVERSED" } })]);
  assert.equal(result.linked, 1);
  const linked = db.tables.cierreCredito.find((row) => row.providerCreditId === "p-1");
  assert.equal(linked.localKey, "VENTA:1:PAYJOY");
  assert.equal(linked.status, "REVERSADO");
  assert.equal(linked.effectiveAt.getTime(), date.getTime());
  assert.equal(linked.amount, 1000000);
  assert.equal(db.tables.cierreCredito.filter((row) => row.status === "EFECTIVO").length, 0);
  assert.equal(db.tables.cierreCredito.find((row) => row.id === "1").status, "VINCULADO");
});

test("otro ID persistido compatible mantiene el vínculo ambiguo fuera del lote", async () => {
  const db = database({ cierreCredito: [credit(1), apiRow({ providerCreditId: "other-id" })] });
  const result = await reconcile(db, [observation()]);
  assert.equal(result.linked, 0);
  assert.equal(db.tables.cierreCredito[0].providerCreditId, null);
  assert.equal(db.tables.cierreCredito.find((row) => row.providerCreditId === "p-1").status, "PENDIENTE");
  assert.equal(db.tables.cierreCredito.filter((row) => row.status === "EFECTIVO").length, 1);
});

test("venta local tardía se enlaza al negativo conocido al releer la financiación más antigua", async () => {
  const db = database({ cierreCredito: [credit(1), apiRow({ status: "REVERSADO", providerUpdatedAt: later,
    evidence: { providerStatus: "REVERSED" } })] });
  const result = await reconcile(db, [observation()]);
  assert.equal(result.linked, 1);
  const linked = db.tables.cierreCredito.find((row) => row.providerCreditId === "p-1");
  assert.equal(linked.localKey, "VENTA:1:PAYJOY");
  assert.equal(linked.status, "REVERSADO");
  assert.equal(linked.providerUpdatedAt.getTime(), later.getTime());
  assert.equal(linked.evidence.providerStatus, "REVERSED");
  assert.equal(db.tables.cierreCredito.filter((row) => row.status === "EFECTIVO").length, 0);
});

test("un ID previo incompatible no impide enlazar el crédito correcto", async () => {
  const db = database({ cierreCredito: [credit(1), apiRow({ providerCreditId: "other-id", imei: "999999999999999" })] });
  assert.equal((await reconcile(db, [observation()])).linked, 1);
});

test("dos IDs compatibles del mismo lote continúan pendientes y no duplican la venta", async () => {
  const db = database({ cierreCredito: [credit(1)] });
  const result = await reconcile(db, [observation(), observation({ providerId: "p-2" })]);
  assert.equal(result.linked, 0);
  assert.equal(db.tables.cierreCredito.filter((row) => row.status === "EFECTIVO").length, 1);
});

test("negativos sin vínculo conservan estado real, identidad y trazabilidad idempotente", async () => {
  for (const state of ["ANULADO", "REVERSADO", "RECHAZADO"]) {
    const db = database();
    const input = observation({ estado: state, raw: { providerStatus: state } });
    await reconcile(db, [input]);
    const eventCount = db.tables.cierreEvento.length;
    await reconcile(db, [input]);
    assert.equal(db.tables.cierreCredito.length, 1);
    assert.equal(db.tables.cierreCredito[0].status, state);
    assert.equal(db.tables.cierreCredito[0].evidence.providerStatus, state);
    assert.equal(db.tables.cierreEvento.length, eventCount);
    await reconcile(db, [observation({ estado: "PENDIENTE", sourceUpdatedAt: later, raw: { providerStatus: "UNKNOWN" } })]);
    assert.equal(db.tables.cierreCredito[0].status, state);
    assert.equal(db.tables.cierreCredito[0].evidence.providerStatus, state);
    await reconcile(db, [observation()]);
    assert.equal(db.tables.cierreCredito[0].status, state, "Un efectivo con la misma fecha no invalida el negativo conocido");
  }
});

test("retirar y reañadir financiera conserva reverso API y permite limpiar sólo el tombstone local", async () => {
  const db = database({ venta: [sale(1, { fecha: date, payjoy: 0 })],
    cierreCredito: [credit(1, { providerCreditId: "p-1", status: "REVERSADO", source: "CONECTAMOS + API PAYJOY", providerUpdatedAt: date,
      evidence: { providerStatus: "REVERSED" } })], cierreVentaPendiente: [{ ventaId: 1, revision: 1 }] });
  const { drainCierreLocalQueue } = modules(db.prisma).load("lib/cierre-store.ts");
  await drainCierreLocalQueue();
  assert.equal(db.tables.cierreCredito[0].status, "REVERSADO");
  assert.equal(db.tables.cierreCredito[0].evidence.reason, "FINANCIERA_RETIRADA");
  assert.equal(db.tables.cierreCredito[0].evidence.localTombstone, true);
  assert.equal(db.tables.cierreCredito[0].evidence.providerStatus, "REVERSED");
  // Another provider negative cannot erase the local removal marker.
  await reconcile(db, [observation({ estado: "REVERSADO", sourceUpdatedAt: later, raw: { providerStatus: "REVERSED" } })]);
  await reconcile(db, [observation({ sourceUpdatedAt: new Date(later.getTime() + 1000) })]);
  assert.equal(db.tables.cierreCredito[0].status, "REVERSADO");
  assert.equal(db.tables.cierreCredito[0].evidence.localTombstone, true);
  db.tables.venta[0].payjoy = 1000000;
  db.tables.cierreVentaPendiente.push({ ventaId: 1, revision: 2, updatedAt: new Date(), nextAttempt: new Date(0), attempts: 0 });
  await drainCierreLocalQueue();
  assert.equal(db.tables.cierreCredito[0].status, "REVERSADO");
  assert.equal(db.tables.cierreCredito[0].providerCreditId, "p-1");
  assert.ok(db.tables.cierreCredito[0].source.includes("API"));
  assert.equal(db.tables.cierreCredito[0].evidence.localTombstone, undefined);
  assert.ok(db.tables.cierreEvento.some((event) => event.snapshot.evidence?.reason === "FINANCIERA_RETIRADA"));
});

test("anular venta local no reemplaza estado terminal API y un efectivo remoto no la revive", async () => {
  const db = database({ venta: [sale(1, { fecha: date, estado: "ANULADO" })],
    cierreCredito: [credit(1, { providerCreditId: "p-1", status: "RECHAZADO", source: "CONECTAMOS + API PAYJOY", providerUpdatedAt: date })],
    cierreVentaPendiente: [{ ventaId: 1, revision: 1 }] });
  await modules(db.prisma).load("lib/cierre-store.ts").drainCierreLocalQueue();
  assert.equal(db.tables.cierreCredito[0].status, "RECHAZADO");
  assert.equal(db.tables.cierreCredito[0].evidence.localTombstone, true);
  await reconcile(db, [observation({ sourceUpdatedAt: later })]);
  assert.equal(db.tables.cierreCredito[0].status, "RECHAZADO");
});
