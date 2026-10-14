import test from "node:test";
import assert from "node:assert/strict";
import { modules, database, credit } from "./cierre-test-helpers.mjs";

const effectiveAt = new Date("2026-09-15T18:00:00.000Z");
const scope = { start: new Date("2026-09-01T05:00:00Z"), end: new Date("2026-10-01T05:00:00Z") };
const raw = (id, changes = {}) => ({ source: "credits-by-client", providerId: `loan-${id}`, providerStatus: "ACTIVE",
  principal: 900000, effectiveDate: effectiveAt.toISOString(), diagnostics: { reasons: [] }, ...changes });
const observed = (id, changes = {}, evidence = {}) => credit(id, { financial: "SUMASPAY", localKey: null, ventaId: null,
  providerCreditId: `loan-${id}`, status: "PENDIENTE", source: "API SUMASPAY · pendiente de vinculación", effectiveAt,
  evidence: raw(id, evidence), ...changes });
const load = (db = database()) => modules(db.prisma).load("lib/cierre-sumas-audit.ts");

test("SUMAS acepta únicamente historia/detalle normalizados con identidad y hechos acreditados", () => {
  const { getEffectiveSumasObservation, isEffectiveSumasObservation } = load();
  for (const source of ["credits-by-client", "loan-detail"]) {
    const row = observed(1, { amount: 9999999 }, { source, principal: 912345.16 });
    assert.deepEqual(getEffectiveSumasObservation(row), { amount: 912345.16, effectiveAt });
    assert.equal(isEffectiveSumasObservation(row), true);
  }
  for (const evidence of [
    { source: "client-pos" }, { source: "client-secure" }, { source: "client-online" }, { source: "pay-plan" },
    { source: "list-credit-y2" }, { source: "eligibility" }, { providerId: "different-id" }, { providerId: null },
    { principal: null }, { principal: true }, { principal: [] }, { principal: "" }, { principal: 0.001 },
    { effectiveDate: null }, { effectiveDate: "2026-02-30T18:00:00.000Z" }, { effectiveDate: "2026-09-15" },
    { diagnostics: null }, { diagnostics: { reasons: "" } }, { diagnostics: { reasons: ["UNCONFIRMED_STATUS"] } },
    { diagnostics: { reasons: ["MISSING_PRINCIPAL"] } }, { diagnostics: { reasons: ["MISSING_EFFECTIVE_DATE"] } },
  ]) assert.equal(getEffectiveSumasObservation(observed(1, {}, evidence)), null, JSON.stringify(evidence));
  assert.equal(getEffectiveSumasObservation(observed(1, { providerCreditId: null })), null);
});

test("una aprobación sin desembolso real no pasa; el contrato histórico conserva prueba derivada", () => {
  const loader = modules(database().prisma);
  const { normalizeSumasCierre } = loader.load("lib/cierre-providers.ts");
  const { getEffectiveSumasObservation, createCierreSumasAudit } = loader.load("lib/cierre-sumas-audit.ts");
  const normalize = (data) => normalizeSumasCierre([{ source: "credits-by-client", data: [{
    account_no: "loan-1", principal: 900000, loan_date: "2026-09-15", ...data,
  }] }], {})[0];
  const snapshot = (input) => observed(1, {}, input.raw);
  for (const status of ["APPROVED", "APROBADO", "PENDING", "", "UNKNOWN"]) {
    const approval = normalize({ status });
    assert.equal(approval.estado, "PENDIENTE");
    assert.equal(getEffectiveSumasObservation(snapshot(approval)), null);
    const disbursed = normalize({ status, disbursedOnDate: [2026, 9, 16] });
    assert.equal(disbursed.estado, "EFECTIVO");
    assert.deepEqual(getEffectiveSumasObservation(snapshot(disbursed)), { amount: 900000, effectiveAt: new Date("2026-09-16T05:00:00.000Z") });
    const audit = createCierreSumasAudit();
    audit.add(snapshot(disbursed));
    assert.equal(audit.result().evidenceProof.DERIVED_DISBURSEMENT.units, 1);
  }
  for (const providerStatus of ["UNKNOWN", "APPROVED", "ACTIVE"]) {
    assert.equal(getEffectiveSumasObservation(observed(1, {}, { providerStatus, diagnostics: null })), null);
  }
});

test("negativos de proveedor o ledger y tombstone siempre prevalecen sobre prueba efectiva", () => {
  const { getEffectiveSumasObservation } = load();
  for (const status of ["ANULADO", "REVERSADO", "RECHAZADO", "VINCULADO", "UNKNOWN"]) {
    assert.equal(getEffectiveSumasObservation(observed(1, { status })), null);
  }
  for (const providerStatus of ["CANCELLED", "ANULADO", "REVERSED", "REVERSO", "DEVUELTO", "REJECTED", "DENIED"]) {
    assert.equal(getEffectiveSumasObservation(observed(1, {}, { providerStatus })), null);
  }
  assert.equal(getEffectiveSumasObservation(observed(1, {}, { localTombstone: true })), null);
});

test("auditoría separa API efectiva, locales, vínculos, exclusiones y evita datos privados", async () => {
  const db = database({ cierreCredito: [
    observed(1, { status: "EFECTIVO", localKey: "local-1", amount: 800000 }),
    observed(2, {}, { principal: 123456.16, cierreDiagnostics: { reasons: ["NO_LOCAL_MATCH", "private-reason"] },
      storeName: "private-store", customerName: "private-client", documentNumber: "private-document" }),
    observed(3, { status: "REVERSADO" }, { principal: 100000, providerStatus: "REVERSED" }),
    observed(4, { status: "ANULADO" }, { principal: 200000, localTombstone: true }),
    observed(5, {}, { principal: null, diagnostics: { reasons: ["MISSING_PRINCIPAL"] } }),
    credit(6, { financial: "SUMASPAY", effectiveAt, amount: 700000 }),
  ] });
  const result = await load(db).readCierreSumasAudit(db.prisma, scope);
  assert.deepEqual(result.totals.ledgerEffective, { units: 2, amount: 1500000, missingAmount: 0 });
  assert.deepEqual(result.totals.apiReportable, { units: 2, amount: 1023456.16, missingAmount: 0 });
  assert.equal(result.totals.apiUnlinkedReportable.units, 1);
  assert.equal(result.totals.apiEffectiveEvidence.amount, 1223456.16);
  assert.equal(result.totals.excludedApiEffectiveEvidence.amount, 200000);
  assert.equal(result.totals.localUnconfirmedEffective.amount, 700000);
  assert.equal(result.totals.apiObserved.missingAmount, 1, "El principal ausente nunca se suple con importe local");
  assert.ok(result.unlinkedReasons.some((row) => row.reason === "NO_LOCAL_MATCH"));
  assert.ok(result.excludedReasons.some((row) => row.reason === "MISSING_PRINCIPAL"));
  assert.ok(!JSON.stringify(result).includes("private-"));
  assert.ok(!JSON.stringify(result).includes("loan-"));
  assert.equal(result.byDay, undefined, "El log operativo no genera una tabla por cada día");
  assert.equal(result.complete, false);
});

test("auditoría aplica fecha API en Bogotá aunque difiera del ledger y conserva límites históricos", async () => {
  const db = database({ cierreCredito: [
    observed(1, { effectiveAt: new Date("2026-08-31T18:00:00Z") }, { effectiveDate: scope.start.toISOString() }),
    observed(2, {}, { effectiveDate: "2026-09-01T04:59:59.999Z" }),
    observed(3, {}, { effectiveDate: "2026-10-01T04:59:59.999Z" }),
    observed(4, {}, { effectiveDate: scope.end.toISOString() }),
    observed(5, { financial: "ADDI" }),
  ] });
  const result = await load(db).readCierreSumasAudit(db.prisma, scope);
  assert.equal(result.totals.apiReportable.units, 2);
  assert.equal(result.totals.apiReportable.amount, 1800000);
  assert.equal(result.totals.apiObserved.units, 2);
});

test("auditoría pagina sólo base local, deduplica identidad y no certifica cobertura", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => observed(index + 1, {}, { principal: 1000 }));
  const db = database({ cierreCredito: rows });
  const loader = modules(db.prisma);
  const api = loader.load("lib/cierre-sumas-audit.ts");
  const result = await api.readCierreSumasAudit(db.prisma, scope);
  assert.deepEqual(result.totals.apiReportable, { units: 501, amount: 501000, missingAmount: 0 });
  const reads = db.calls.filter((call) => call.table === "cierreCredito" && call.method === "findMany");
  assert.equal(reads.length, 2);
  assert.ok(reads.every((call) => call.args.take === 500 && call.args.where.financial === "SUMASPAY"));
  assert.ok(!loader.imports.some((name) => /cierre-providers|sumasconsulta|cierre-sync/.test(name)));
  assert.ok(!db.calls.some((call) => ["create", "update", "upsert", "updateMany", "deleteMany"].includes(call.method)));
  const pure = api.createCierreSumasAudit();
  pure.add(rows[0]); pure.add(rows[0]);
  assert.equal(pure.result().totals.apiReportable.units, 1);
  assert.equal(pure.result().duplicateProviderRows, 1);
  assert.equal(result.complete, false);
  assert.equal((await api.readCierreSumasAudit(database().prisma, scope)).complete, false);
});
