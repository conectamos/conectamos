import test from "node:test";
import assert from "node:assert/strict";
import { modules, database, credit, admin } from "./cierre-test-helpers.mjs";

const effectiveAt = new Date("2026-09-15T18:00:00Z");
const scope = { start: new Date("2026-09-01T05:00:00Z"), end: new Date("2026-10-01T05:00:00Z") };
const evidence = (amount, changes = {}) => ({ source: "list-transactions", providerStatus: "FINANCE",
  principal: amount, effectiveDate: effectiveAt.toISOString(), currency: "COP", diagnostics: { reasons: [] },
  providerMerchantId: "private-merchant-id", providerMerchantName: "private-merchant-name", ...changes });
const observed = (id, amount = 877000, changes = {}) => credit(id, {
  providerCreditId: `private-credit-${id}`, localKey: null, ventaId: null, sedeId: null, effectiveAt,
  amount, status: "PENDIENTE", source: "API PAYJOY · pendiente de vinculación", evidence: evidence(amount), ...changes,
});

test("737 observaciones API pueden coexistir con 733 ventas y 63 referencias locales sin confirmar", async () => {
  const locals = Array.from({ length: 733 }, (_, index) => {
    const id = index + 1, amount = id === 733 ? 870587 : 877000;
    return credit(id, { effectiveAt, amount, ...(id <= 670 ? { providerCreditId: `private-credit-${id}`,
      source: "CONECTAMOS + API PAYJOY", evidence: evidence(amount) } : {}) });
  });
  const notLinked = locals.slice(670).map((row, index) => observed(1000 + index, row.amount, {
    evidence: evidence(row.amount, { cierreDiagnostics: { reasons: ["NO_LOCAL_MATCH"] } }),
  }));
  const extra = [1000000, 1000000, 1000000, 1182219].map((amount, index) => observed(2000 + index, amount));
  const db = database({ cierreCredito: [...locals, ...notLinked, ...extra],
    cierreSyncTrabajo: locals.map((row) => ({ key: row.localKey, localKey: row.localKey, financial: "PAYJOY", state: "REVISADO", lastSuccess: new Date() })) });
  const loader = modules(db.prisma);
  const result = await loader.load("lib/cierre-payjoy-audit.ts").readCierrePayJoyAudit(db.prisma, scope);
  assert.deepEqual(result.totals.ledgerEffective, { units: 733, amount: 642834587, missingAmount: 0 });
  assert.deepEqual(result.totals.apiEffectiveEvidence, { units: 737, amount: 647016806, missingAmount: 0 });
  assert.deepEqual(result.totals.apiReportable, { units: 737, amount: 647016806, missingAmount: 0 });
  assert.equal(result.totals.apiObserved.units, 737);
  assert.equal(result.totals.apiUnlinkedEffectiveEvidence.units, 67);
  assert.equal(result.totals.localUnconfirmedEffective.units, 63);
  assert.equal(result.totals.linkedEffective.units, 670);
  assert.equal(result.byDay[0].apiEffectiveEvidence.units, 737);
  assert.equal(result.unlinkedMerchants.withId, 67);
  assert.equal(result.complete, false);
  const reads = db.calls.filter((call) => call.table === "cierreCredito" && call.method === "findMany");
  assert.equal(reads.length, 2);
  assert.ok(reads.every((read) => read.args.take === 500));
  const report = await loader.load("lib/cierre-report.ts").readCierreReport(new URLSearchParams("mode=month&month=2026-09&financier=PAYJOY"), admin, true);
  assert.equal(report.units, 737, "El reporte corregido usa API; la auditoría conserva el subtotal local de 733");
  assert.equal(report.providerSync.unconfirmed, 63);
  assert.equal(report.providerSync.total, 733);
  assert.ok(!JSON.stringify(result).includes("private-"));
  assert.ok(!loader.imports.includes("@/lib/cierre-providers"));
  assert.ok(db.calls.every((call) => !["create", "update", "upsert", "updateMany", "deleteMany"].includes(call.method)));
});

test("la evidencia finance efectiva se conserva separada del estado pendiente de vinculación", async () => {
  const db = database();
  const loader = modules(db.prisma);
  await loader.load("lib/cierre-reconcile.ts").reconcileCierreCredits(db.prisma, [{
    financiera: "PAYJOY", providerId: "private-credit-only", fechaEfectiva: effectiveAt, valor: 950000,
    documento: "", cliente: "private-client", estado: "EFECTIVO", fuente: "API PAYJOY", raw: evidence(950000),
  }]);
  assert.equal(db.tables.cierreCredito[0].status, "PENDIENTE");
  const result = await loader.load("lib/cierre-payjoy-audit.ts").readCierrePayJoyAudit(db.prisma, scope);
  assert.equal(result.totals.ledgerEffective.units, 0);
  assert.equal(result.totals.apiEffectiveEvidence.units, 1);
  assert.equal(result.totals.apiUnlinkedEffectiveEvidence.amount, 950000);
  assert.equal(result.byStateSource[0].ledgerState, "PENDIENTE");
  assert.equal(result.byStateSource[0].apiState, "EFECTIVO");
  assert.ok(result.unlinkedReasons.some((row) => row.reason === "MISSING_IDENTITY"));
  assert.ok(!JSON.stringify(result).includes("private-"));
});

test("reversos, datos faltantes y tombstone local no se mezclan con API efectiva", async () => {
  const db = database({ cierreCredito: [
    observed(1, 100, { status: "REVERSADO", evidence: evidence(100, { providerStatus: "REVERSED" }) }),
    observed(2, 200, { evidence: evidence(null, { currency: null }) }),
    observed(3, 300, { evidence: evidence(300, { diagnostics: { reasons: ["UNCONFIRMED_STATUS"] } }) }),
    observed(4, 400, { localKey: "local-4", status: "ANULADO", source: "CONECTAMOS + API PAYJOY",
      evidence: evidence(400, { localTombstone: true }) }),
    observed(5, 500, { status: "EFECTIVO", localKey: "local-5", source: "CONECTAMOS",
      evidence: evidence(null, { diagnostics: { reasons: ["MISSING_PRINCIPAL"] } }) }),
  ] });
  const result = await modules(db.prisma).load("lib/cierre-payjoy-audit.ts").readCierrePayJoyAudit(db.prisma, scope);
  assert.equal(result.totals.apiEffectiveEvidence.units, 1);
  assert.equal(result.totals.excludedApiEffectiveEvidence.amount, 400);
  assert.equal(result.totals.apiReportable.units, 0);
  assert.equal(result.totals.ledgerEffective.amount, 500);
  assert.equal(result.totals.apiObserved.missingAmount, 1, "No suplir principal API con venta local para una aprobación");
  assert.ok(result.byStateSource.some((row) => row.apiState === "REVERSADO"));
});

test("el auditor respeta septiembre Bogotá, ignora otras financieras y deduplica ID API", async () => {
  const db = database({ cierreCredito: [observed(1), observed(2, 100, { effectiveAt: new Date("2026-09-01T04:59:59Z") }),
    observed(3, 100, { effectiveAt: scope.end }), observed(4, 100, { financial: "ADDI" })] });
  const audit = modules(db.prisma).load("lib/cierre-payjoy-audit.ts");
  const result = await audit.readCierrePayJoyAudit(db.prisma, scope);
  assert.equal(result.totals.apiObserved.units, 1);
  const pure = audit.createCierrePayJoyAudit();
  pure.add(observed(1)); pure.add(observed(1));
  assert.equal(pure.result().totals.apiObserved.units, 1);
  assert.equal(pure.result().duplicateProviderRows, 1);
  const empty = await audit.readCierrePayJoyAudit(database().prisma, scope);
  assert.equal(empty.complete, false);
  assert.equal(empty.totals.apiObserved.units, 0);
});

test("hechos API reportables provienen del principal/fecha acreditados y respetan negativos y tombstone", () => {
  const audit = modules(database().prisma).load("lib/cierre-payjoy-audit.ts");
  const row = observed(1, 999999, { evidence: evidence(850000) });
  assert.deepEqual(audit.getEffectivePayJoyObservation(row), { amount: 850000, effectiveAt });
  assert.equal(audit.isEffectivePayJoyObservation(row), true);
  for (const changes of [
    { providerCreditId: null }, { status: "REVERSADO" }, { status: "ANULADO" }, { status: "RECHAZADO" }, { status: "VINCULADO" },
    { evidence: evidence(850000, { source: "eligibility" }) }, { evidence: evidence(850000, { currency: "USD" }) },
    { evidence: evidence(850000, { effectiveDate: "invalid" }) }, { evidence: evidence(null) },
    { evidence: evidence(850000, { providerId: "other-credit" }) },
    { evidence: evidence(850000, { localTombstone: true }) }, { evidence: evidence(850000, { providerStatus: "REVERSED" }) },
    { evidence: evidence(850000, { diagnostics: { reasons: ["UNCONFIRMED_STATUS"] } }) },
  ]) assert.equal(audit.getEffectivePayJoyObservation({ ...row, ...changes }), null);
});
