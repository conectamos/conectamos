import test from "node:test";
import assert from "node:assert/strict";
import { modules, database, credit, sale, admin, supervisor, params } from "./cierre-test-helpers.mjs";

const effectiveAt = new Date("2026-10-12T18:00:00.000Z");
const later = new Date("2026-10-13T18:00:00.000Z");
const providers = ["PAYJOY", "SUMASPAY"];
function observed(financial, changes = {}) {
  return { financiera: financial, providerId: `${financial}-1`, fechaEfectiva: effectiveAt, valor: 1000000,
    documento: "1234567", imei: "123456789012345", cliente: "Cliente", estado: "EFECTIVO",
    fuente: `API ${financial}`, sourceUpdatedAt: effectiveAt,
    raw: { source: financial === "PAYJOY" ? "list-transactions" : "credits-by-client", providerId: `${financial}-1`,
      providerStatus: financial === "PAYJOY" ? "FINANCE" : "ACTIVE", currency: "COP", principal: 1000000,
      effectiveDate: effectiveAt.toISOString(), diagnostics: { reasons: [] } }, ...changes };
}
const local = (financial, changes = {}) => credit(1, { financial, localKey: `VENTA:1:${financial}`, ...changes });
function setup(financial, seed = {}) {
  const db = database({ venta: [sale(1, { fecha: effectiveAt, payjoy: financial === "PAYJOY" ? 1000000 : 0,
    sumaspay: financial === "SUMASPAY" ? 1000000 : 0 })], cierreCredito: [local(financial)], ...seed });
  const loader = modules(db.prisma);
  const store = loader.load("lib/cierre-store.ts");
  const reconcile = (input) => loader.load("lib/cierre-reconcile.ts").reconcileCierreCredits(db.prisma, input);
  const fact = financial === "PAYJOY" ? loader.load("lib/cierre-payjoy-audit.ts").getEffectivePayJoyObservation
    : loader.load("lib/cierre-sumas-audit.ts").getEffectiveSumasObservation;
  const queue = async () => {
    db.tables.cierreVentaPendiente.push({ ventaId: 1, revision: 1, updatedAt: new Date(), nextAttempt: new Date(0), attempts: 0 });
    await store.drainCierreLocalQueue();
  };
  return { db, loader, store, reconcile, fact, queue, row: () => db.tables.cierreCredito.find((row) => row.providerCreditId === `${financial}-1`) };
}

for (const financial of providers) {
  test(`${financial}: anulación, edición, retirada y eliminación local conservan el hecho API`, async () => {
    const run = setup(financial);
    await run.reconcile([observed(financial)]);
    const original = structuredClone(run.row().evidence.providerObservation);
    run.db.tables.venta[0].estado = "ANULADO";
    await run.queue();
    assert.equal(run.row().status, "ANULADO");
    assert.equal(run.row().evidence.localTombstone, true);
    assert.deepEqual(run.fact(run.row()), { amount: 1000000, effectiveAt });
    await run.reconcile([observed(financial)]);
    const count = run.db.tables.cierreEvento.length;
    await run.reconcile([observed(financial)]);
    assert.equal(run.db.tables.cierreEvento.length, count, "El reintento no repite eventos");
    assert.equal(run.row().status, "ANULADO", "El informe API no resucita la venta local");
    run.db.tables.venta[0].estado = "EFECTIVO";
    run.db.tables.venta[0][financial === "PAYJOY" ? "payjoy" : "sumaspay"] = 900000;
    run.db.tables.venta[0].fecha = new Date("2026-10-14T18:00:00Z");
    await run.queue();
    assert.deepEqual(run.fact(run.row()), { amount: 1000000, effectiveAt });
    run.db.tables.venta[0][financial === "PAYJOY" ? "payjoy" : "sumaspay"] = 0;
    await run.queue();
    assert.equal(run.row().status, "ANULADO");
    assert.deepEqual(run.row().evidence.providerObservation, original);
    run.db.tables.venta.splice(0);
    await run.queue();
    assert.equal(run.row().evidence.reason, "VENTA_ELIMINADA");
    assert.deepEqual(run.fact(run.row()), { amount: 1000000, effectiveAt });
    assert.equal(run.db.tables.cierreCredito.length, 1);
  });

  test(`${financial}: negativo remoto prevalece sobre local y lecturas antiguas, iguales o sin fecha`, async () => {
    const run = setup(financial);
    const first = observed(financial);
    await run.reconcile([first]);
    run.db.tables.venta[0].estado = "ANULADO";
    await run.queue();
    await run.reconcile([observed(financial, { estado: "REVERSADO", valor: null, fechaEfectiva: null,
      sourceUpdatedAt: later, raw: { ...first.raw, providerStatus: "REVERSED", principal: null, effectiveDate: null } })]);
    assert.equal(run.row().evidence.providerObservation.state, "REVERSADO");
    assert.equal(run.fact(run.row()), null);
    for (const sourceUpdatedAt of [effectiveAt, undefined, later]) {
      await run.reconcile([observed(financial, { sourceUpdatedAt })]);
      assert.equal(run.fact(run.row()), null);
      assert.equal(run.row().status, "REVERSADO");
      assert.equal(run.row().evidence.providerObservation.raw.providerStatus, "REVERSED");
    }
    run.db.tables.venta[0].estado = "EFECTIVO";
    await run.queue();
    assert.equal(run.fact(run.row()), null);
    assert.equal(run.row().status, "REVERSADO");
  });

  test(`${financial}: sólo estado efectivo completo y tiempo del proveedor posterior restaura el hecho`, async () => {
    const run = setup(financial);
    const first = observed(financial);
    await run.reconcile([first]);
    await run.reconcile([observed(financial, { estado: "REVERSADO", sourceUpdatedAt: later,
      raw: { ...first.raw, providerStatus: "REVERSED" } })]);
    const newer = new Date(later.getTime() + 1000);
    await run.reconcile([observed(financial, { sourceUpdatedAt: newer, valor: null,
      raw: { ...first.raw, principal: null, diagnostics: { reasons: ["MISSING_PRINCIPAL"] } } })]);
    assert.equal(run.fact(run.row()), null);
    await run.reconcile([observed(financial, { sourceUpdatedAt: newer })]);
    assert.deepEqual(run.fact(run.row()), { amount: 1000000, effectiveAt });
    assert.equal(run.row().status, "EFECTIVO");
    assert.ok(run.db.tables.cierreEvento.some((event) => event.snapshot.evidence?.providerObservation?.state === "REVERSADO"));
  });

  test(`${financial}: lectura incompleta o pendiente no borra capital/fecha confirmados`, async () => {
    const run = setup(financial);
    const first = observed(financial);
    await run.reconcile([first]);
    for (const estado of ["EFECTIVO", "PENDIENTE"]) {
      await run.reconcile([observed(financial, { estado, valor: null, fechaEfectiva: null, sourceUpdatedAt: later,
        raw: { ...first.raw, principal: null, effectiveDate: null,
          diagnostics: { reasons: ["MISSING_PRINCIPAL", "MISSING_EFFECTIVE_DATE", ...(estado === "PENDIENTE" ? ["UNCONFIRMED_STATUS"] : [])] } } })]);
      assert.deepEqual(run.fact(run.row()), { amount: 1000000, effectiveAt });
      assert.equal(run.row().evidence.providerObservation.raw.principal, 1000000);
    }
    await run.reconcile([observed(financial, { estado: "RECHAZADO", valor: null, fechaEfectiva: null, sourceUpdatedAt: later,
      raw: { ...first.raw, providerStatus: "REJECTED", principal: null, effectiveDate: null } })]);
    assert.equal(run.fact(run.row()), null, "El negativo incompleto sí cambia el hecho financiero");
  });

  test(`${financial}: local terminal sin evidencia anterior admite hecho nuevo sin cambiar estado local`, async () => {
    const run = setup(financial, { cierreCredito: [local(financial, { status: "ANULADO", source: "CONECTAMOS", evidence: { reason: "VENTA_ELIMINADA", localTombstone: true } })] });
    await run.reconcile([observed(financial)]);
    assert.equal(run.row().status, "ANULADO");
    assert.equal(run.row().source, "CONECTAMOS");
    assert.deepEqual(run.fact(run.row()), { amount: 1000000, effectiveAt });
    assert.equal(run.row().evidence.providerObservation.raw.localTombstone, undefined);
    const read = run.loader.load("lib/cierre-report.ts").readCierreReport;
    const own = await read(params(`&financier=${financial}`), supervisor, true, true);
    assert.deepEqual(own.totals, { units: 1, amount: 1000000 });
    assert.equal(own.items[0].status, "EFECTIVO");
    const other = await read(params(`&financier=${financial}`), { ...supervisor, sedeId: 2 }, true, true);
    assert.equal(other.items.length, 0);
    const global = await read(params(`&financier=${financial}`), admin, true, true);
    assert.equal(global.items.length, 1);
  });

  test(`${financial}: vínculo tardío fusiona registros y conserva una sola observación API`, async () => {
    const run = setup(financial, { cierreCredito: [] });
    await run.reconcile([observed(financial, { documento: "", imei: undefined })]);
    run.db.tables.cierreCredito.push(local(financial, { status: "ANULADO", evidence: { localTombstone: true } }));
    await run.reconcile([observed(financial)]);
    assert.equal(run.db.tables.cierreCredito.filter((row) => run.fact(row)).length, 1);
    assert.equal(run.row().localKey, `VENTA:1:${financial}`);
    assert.equal(run.row().status, "ANULADO");
    assert.equal(run.db.tables.cierreCredito.find((row) => row.id === "1").status, "VINCULADO");
  });
}

test("snapshot valida identidad, conserva invalidación y nunca convierte aprobación en crédito", async () => {
  for (const financial of providers) {
    const run = setup(financial);
    const first = observed(financial);
    await run.reconcile([observed(financial, { estado: "PENDIENTE", raw: { ...first.raw, providerStatus: "APPROVED", diagnostics: { reasons: ["UNCONFIRMED_STATUS"] } } })]);
    assert.equal(run.fact(run.row()), null);
    const legacy = { ...run.row(), status: "PENDIENTE", source: `API ${financial}`,
      evidence: { ...first.raw, providerId: "different-provider-id", providerStatus: "REVERSED" } };
    assert.equal(run.store.getCierreProviderObservationForRow(legacy), null);
    await run.reconcile([first]);
    run.row().evidence.providerObservation.raw.providerId = "different-provider-id";
    assert.equal(run.fact(run.row()), null);
    await run.store.saveCierreCredit(run.db.prisma, { financial, localKey: run.row().localKey, providerCreditId: first.providerId,
      status: "EFECTIVO", source: "CONECTAMOS", evidence: first.raw });
    assert.equal(run.fact(run.row()), null, "Una edición local no elimina la marca inválida ni habilita fallback legacy");
  }
});

test("una observación remota más antigua no anula un hecho más reciente", async () => {
  const run = setup("PAYJOY");
  const first = observed("PAYJOY", { sourceUpdatedAt: later });
  await run.reconcile([first]);
  await run.reconcile([observed("PAYJOY", { estado: "REVERSADO", raw: { ...first.raw, providerStatus: "REVERSED" } })]);
  assert.deepEqual(run.fact(run.row()), { amount: 1000000, effectiveAt });
  assert.equal(run.row().status, "EFECTIVO");
});
