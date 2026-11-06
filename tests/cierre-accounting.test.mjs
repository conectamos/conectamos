import assert from "node:assert/strict";
import test from "node:test";
import { modules, database, admin, supervisor, credit } from "./cierre-test-helpers.mjs";

const scope = { from: "2026-10-01", to: "2026-10-31", sedeId: null };
const actor = { ...admin, id: 7, perfilId: 11, perfilNombre: "Administrador QA" };
function setup(session = actor, seed = {}) {
  const db = database({ cierreAjuste: [], cierreAjusteEvento: [], ...seed });
  db.prisma.cierreAjuste.findUniqueOrThrow ??= async (args) => {
    const row = await db.prisma.cierreAjuste.findUnique(args);
    assert.ok(row);
    return row;
  };
  const loader = modules(db.prisma, { session });
  return { db, loader, accounting: loader.load("lib/cierre-accounting.ts") };
}
const payload = (changes = {}) => ({ financial: "SUMASPAY", version: 0, correctedAmount: 178027733,
  collectedAmount: null, note: "Reporte oficial octubre", ...changes });
const payment = (id, amount, changes = {}) => ({ id, date: "2026-11-05", amount, reference: null, ...changes });
const paymentsPayload = (payments, changes = {}) => ({ financial: "SUMASPAY", version: 0, payments, ...changes });

test("ajuste conserva el capital sincronizado, deja recaudo desconocido y calcula saldo en centavos", async () => {
  const { db, accounting } = setup();
  const saved = await accounting.saveCierreAccounting(db.prisma, scope, actor, accounting.parseCierreAccountingPatch(payload()));
  const row = accounting.applyCierreAccounting({ name: "SUMASPAY", amount: 168787733, units: 180, complete: false }, saved);
  assert.equal(row.syncedAmount, 168787733);
  assert.equal(row.amount, 178027733);
  assert.equal(row.amount - row.syncedAmount, 9240000);
  assert.equal(row.collectedAmount, null);
  assert.equal(row.balance, null);
  assert.equal(row.complete, false);
  assert.equal(row.units, 180);
  assert.equal(db.tables.cierreCredito.length, 0, "No crea créditos para explicar un ajuste");
  const collected = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: 1, collectedAmount: 150000000.29 }));
  assert.equal(accounting.applyCierreAccounting({ name: "SUMASPAY", amount: 168787733 }, collected).balance, 28027732.71);
  assert.equal(collected.correctedAmount, 178027733, "El parche de recaudado conserva la corrección");
  assert.equal(db.tables.cierreAjusteEvento.length, 2);
  assert.equal(db.tables.cierreAjusteEvento[1].actorId, 7);
  assert.equal(db.tables.cierreAjusteEvento[1].actorProfileId, 11);
  assert.equal(db.tables.cierreAjusteEvento[1].snapshot.before.collectedAmount, null);
  assert.equal(db.tables.cierreAjusteEvento[1].snapshot.after.collectedAmount, 150000000.29);
});

test("ocultar y restaurar persiste sin eliminar créditos ni valores; null restaura la fuente", async () => {
  const { db, accounting } = setup(actor, { cierreCredito: [credit(1, { financial: "SUMASPAY" })] });
  let saved = await accounting.saveCierreAccounting(db.prisma, scope, actor, accounting.parseCierreAccountingPatch(payload({ collectedAmount: 0 })));
  saved = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: saved.version, hidden: true }));
  assert.equal(saved.hidden, true);
  assert.equal(saved.collectedAmount, 0);
  assert.equal(saved.correctedAmount, 178027733);
  const reloaded = await accounting.readCierreAccounting(db.prisma, scope);
  assert.equal(reloaded.get("SUMASPAY").hidden, true);
  saved = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: saved.version, hidden: false, correctedAmount: null }));
  const row = accounting.applyCierreAccounting({ name: "SUMASPAY", amount: 168787733 }, saved);
  assert.equal(row.hidden, false);
  assert.equal(row.amount, 168787733);
  assert.equal(row.balance, 168787733);
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreAjusteEvento.length, 3);
});

test("ajustes se aíslan por periodo exacto, financiera y sede; rango equivalente comparte registro", async () => {
  const { db, accounting } = setup();
  await accounting.saveCierreAccounting(db.prisma, scope, actor, accounting.parseCierreAccountingPatch(payload()));
  assert.equal((await accounting.readCierreAccounting(db.prisma, { ...scope })).size, 1);
  for (const otherScope of [{ ...scope, sedeId: 1 }, { ...scope, from: "2026-10-02" },
    { ...scope, from: "2026-09-01", to: "2026-09-30" }]) {
    assert.equal((await accounting.readCierreAccounting(db.prisma, otherScope)).size, 0);
  }
  await accounting.saveCierreAccounting(db.prisma, { ...scope, sedeId: 1 }, actor,
    accounting.parseCierreAccountingPatch(payload({ correctedAmount: 500 })));
  await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(payload({ financial: "PAYJOY", correctedAmount: 700 })));
  assert.equal((await accounting.readCierreAccounting(db.prisma, scope)).get("SUMASPAY").correctedAmount, 178027733);
  assert.equal((await accounting.readCierreAccounting(db.prisma, { ...scope, sedeId: 1 })).get("SUMASPAY").correctedAmount, 500);
  assert.equal(db.tables.cierreAjuste.length, 3);
});

test("valida importes, versión, observación y campos antes de escribir", async () => {
  const { db, accounting } = setup();
  const invalid = [-1, 0.001, NaN, Infinity, "178.027.733", true, {}, 1e15];
  for (const value of invalid) {
    assert.throws(() => accounting.parseCierreAccountingPatch(payload({ correctedAmount: value })), /importe/);
    assert.throws(() => accounting.parseCierreAccountingPatch(payload({ collectedAmount: value })), /importe/);
  }
  for (const version of [null, undefined, -1, 0.5, "0", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => accounting.parseCierreAccountingPatch(payload({ version })), /versión/);
  }
  assert.throws(() => accounting.parseCierreAccountingPatch(payload({ units: 180 })), /campos/);
  assert.throws(() => accounting.parseCierreAccountingPatch(payload({ hidden: "true" })), /visibilidad/);
  assert.throws(() => accounting.parseCierreAccountingPatch(payload({ note: "x".repeat(501) })), /500/);
  await assert.rejects(accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(payload({ note: " " }))), /observación/);
  assert.equal(db.tables.cierreAjuste.length, 0);
  assert.equal(db.tables.cierreAjusteEvento.length, 0);
  assert.equal(accounting.parseCierreAccountingPatch(payload({ correctedAmount: 0.29 })).correctedAmount, 0.29);
});

test("una financiera conocida conserva su ajuste editable si se retira el último crédito", async () => {
  const { db, accounting } = setup(actor, { cierreCredito: [credit(1, { financial: "OTRA FINANCIERA" })] });
  await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(payload({ financial: "OTRA FINANCIERA", hidden: true })));
  db.tables.cierreCredito.length = 0;
  const restored = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "OTRA FINANCIERA", version: 1, hidden: false }));
  assert.equal(restored.hidden, false);
  assert.equal(restored.correctedAmount, 178027733);
  assert.equal(db.tables.cierreAjusteEvento.length, 2);
});

test("rechaza escrituras concurrentes y no registra un evento para cambios que no se guardaron", async () => {
  const { db, accounting } = setup();
  const patch = accounting.parseCierreAccountingPatch(payload());
  await accounting.saveCierreAccounting(db.prisma, scope, actor, patch);
  await assert.rejects(accounting.saveCierreAccounting(db.prisma, scope, actor, patch), (error) => error.status === 409);
  assert.equal(db.tables.cierreAjuste[0].version, 1);
  assert.equal(db.tables.cierreAjusteEvento.length, 1);
  db.prisma.cierreAjuste.updateMany = async () => ({ count: 0 });
  await assert.rejects(accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: 1, hidden: true })), (error) => error.status === 409);
  assert.equal(db.tables.cierreAjusteEvento.length, 1);
});

test("servidor solo permite administrador real y conserva restricciones de sede y origen", async () => {
  const priorUrl = process.env.APP_URL;
  process.env.APP_URL = "https://conectamos.example";
  const request = (body, origin = "https://conectamos.example", query = "mode=month&month=2026-10") => new Request(`https://conectamos.example/api/cierre/ajustes?${query}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
  try {
    for (const session of [null, supervisor, { ...actor, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" },
      { ...actor, perfilTipo: "VENDEDOR" }]) {
      const { db, loader } = setup(session);
      const response = await loader.load("app/api/cierre/ajustes/route.ts").POST(request(payload()));
      assert.equal(response.status, session ? 403 : 401);
      assert.equal(db.calls.length, 0, "Deniega antes de consultar o modificar datos");
    }
    const { db, loader } = setup();
    const { POST } = loader.load("app/api/cierre/ajustes/route.ts");
    const { cierreAccountingTrustedOrigin } = loader.load("lib/cierre-accounting.ts");
    assert.equal(cierreAccountingTrustedOrigin(new Request("https://custom.example/api/cierre/ajustes", { headers: { Origin: "https://custom.example" } })), true);
    assert.equal(cierreAccountingTrustedOrigin(new Request("https://custom.example/api/cierre/ajustes", { headers: { Origin: "https://custom.example", "Sec-Fetch-Site": "cross-site" } })), false);
    assert.equal((await POST(request(payload(), "https://otro.example"))).status, 403);
    assert.equal((await POST(request(payload(), "https://conectamos.example", "mode=month&month=2026-10&sedeId=999"))).status, 404);
    assert.equal((await POST(request(payload({ financial: "NO EXISTE" })))).status, 404);
    const response = await POST(request(payload()));
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.adjustment.correctedAmount, 178027733);
    assert.equal(saved.adjustment.version, 1);
    assert.ok(db.calls.some((call) => call.table === "$transaction"), "Valor e historial se guardan en una transacción");
    assert.ok(!loader.imports.some((item) => item === "@/lib/cierre-providers"), "Guardar no consulta proveedores");
    assert.equal((await POST(request(payload()))).status, 409);
  } finally {
    if (priorUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = priorUrl;
  }
});

test("varios pagos suman en centavos, admiten recaudos posteriores al cierre y conservan cada referencia", async () => {
  const { db, accounting } = setup();
  const payments = [payment("pago-1", 10.10, { reference: "Transferencia 001" }), payment("pago-2", 20.20, { date: "2026-12-01" })];
  const saved = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload(payments)));
  assert.equal(saved.collectedAmount, 30.30);
  assert.deepEqual(saved.payments, payments);
  assert.equal(accounting.applyCierreAccounting({ name: "SUMASPAY", amount: 100 }, saved).balance, 69.70);
  assert.deepEqual(db.tables.cierreAjuste[0].payments, payments);
  assert.deepEqual((await accounting.readCierreAccounting(db.prisma, scope)).get("SUMASPAY").payments, payments);
  assert.deepEqual(db.tables.cierreAjusteEvento[0].snapshot.before.payments, []);
  assert.deepEqual(db.tables.cierreAjusteEvento[0].snapshot.after.payments, payments);
});

test("editar y retirar pagos recalcula el total sin tocar el capital ni perder trazabilidad", async () => {
  const { db, accounting } = setup();
  const initial = [payment("pago-1", 100), payment("pago-2", 200), payment("pago-3", 300)];
  await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload(initial, { correctedAmount: 1000, note: "Reporte oficial" })));
  const modified = [payment("pago-1", 125, { reference: "Importe corregido" }), payment("pago-3", 300)];
  const saved = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload(modified, { version: 1 })));
  assert.equal(saved.correctedAmount, 1000);
  assert.equal(saved.collectedAmount, 425);
  assert.equal(accounting.applyCierreAccounting({ name: "SUMASPAY", amount: 950 }, saved).balance, 575);
  assert.deepEqual(db.tables.cierreAjusteEvento[1].snapshot.before.payments, initial);
  assert.deepEqual(db.tables.cierreAjusteEvento[1].snapshot.after.payments, modified);
  assert.equal(db.tables.cierreCredito.length, 0);
  assert.equal(db.tables.cierreAjuste[0].version, 2);
});

test("recaudado histórico aparece como pago sin fecha; lectura y ocultación no inventan ni reescriben datos", async () => {
  const { db, accounting } = setup();
  await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(payload({ collectedAmount: 300 })));
  const readsBefore = db.tables.cierreAjusteEvento.length;
  const saved = (await accounting.readCierreAccounting(db.prisma, scope)).get("SUMASPAY");
  assert.deepEqual(saved.payments, [{ id: "legacy-collected", date: null, amount: 300, reference: null }]);
  assert.equal(db.tables.cierreAjuste[0].payments, undefined, "Leer no migra el registro histórico");
  assert.equal(db.tables.cierreAjusteEvento.length, readsBefore);
  const hidden = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: 1, hidden: true }));
  assert.deepEqual(hidden.payments, saved.payments);
  assert.equal(db.tables.cierreAjuste[0].payments, undefined);
  const migrated = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload([...saved.payments, payment("pago-nuevo", 50)], { version: 2 })));
  assert.equal(migrated.collectedAmount, 350);
  assert.deepEqual(db.tables.cierreAjuste[0].payments, [...saved.payments, payment("pago-nuevo", 50)]);
  assert.equal(migrated.payments[0].date, null);
});

test("sin registrar sigue siendo null hasta guardar una lista; lista vacía y cero histórico son cero explícito", async () => {
  const { db, accounting } = setup();
  const blank = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: 0, hidden: true }));
  assert.equal(blank.collectedAmount, null);
  assert.deepEqual(blank.payments, []);
  const recorded = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload([], { version: 1 })));
  assert.equal(recorded.collectedAmount, 0);
  assert.deepEqual(recorded.payments, []);
  assert.deepEqual(db.tables.cierreAjuste[0].payments, []);
  const previousZero = await accounting.saveCierreAccounting(db.prisma, { ...scope, sedeId: 1 }, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: 0, collectedAmount: 0 }));
  assert.equal(previousZero.collectedAmount, 0);
  assert.deepEqual(previousZero.payments, []);
});

test("valida filas de pago, fechas reales, importes positivos, IDs únicos y suma segura", async () => {
  const { db, accounting } = setup();
  for (const amount of [0, null, -1, 0.001, NaN, Infinity, "10.00", 1e15]) {
    assert.throws(() => accounting.parseCierreAccountingPatch(paymentsPayload([payment("p-1", amount)])));
  }
  for (const date of [undefined, "2026-02-30", "2026-13-01", "2026-2-01", "0000-01-01", "2026-10-01T05:00:00Z", 20261001]) {
    assert.throws(() => accounting.parseCierreAccountingPatch(paymentsPayload([payment("p-1", 1, { date })])), /fecha/);
  }
  assert.throws(() => accounting.parseCierreAccountingPatch(paymentsPayload([payment("same", 1), payment("same", 2)])), /única/);
  assert.throws(() => accounting.parseCierreAccountingPatch(paymentsPayload([payment("bad id", 1)])), /única/);
  assert.throws(() => accounting.parseCierreAccountingPatch(paymentsPayload([payment("p-1", 1, { reference: "x".repeat(201) })])), /200/);
  assert.throws(() => accounting.parseCierreAccountingPatch(paymentsPayload([payment("p-1", 1, { extra: true })])), /campos/);
  assert.throws(() => accounting.parseCierreAccountingPatch(paymentsPayload([payment("p-1", 999999999999.99), payment("p-2", 0.01)])), /suma/);
  assert.throws(() => accounting.parseCierreAccountingPatch(paymentsPayload(Array.from({ length: 1001 }, (_, i) => payment(`p-${i}`, 1)))), /1000/);
  await assert.rejects(accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload([payment("legacy-collected", 10, { date: null })]))), /fecha/);
  assert.equal(db.tables.cierreAjuste.length, 0);
  assert.equal(db.tables.cierreAjusteEvento.length, 0);
  assert.equal(accounting.parseCierreAccountingPatch(paymentsPayload([payment("leap", 1, { date: "2028-02-29" })])).payments[0].date, "2028-02-29");
});

test("el total no puede contradecir el detalle y clientes anteriores no borran pagos registrados", async () => {
  const { db, accounting } = setup();
  assert.throws(() => accounting.parseCierreAccountingPatch(paymentsPayload([payment("p-1", 10)], { collectedAmount: 20 })), /coincidir/);
  const initial = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload([payment("p-1", 10)], { collectedAmount: 10 })));
  await assert.rejects(accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: 1, collectedAmount: 20 })), /detalle de pagos/);
  await assert.rejects(accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: 1, collectedAmount: null })), /detalle de pagos/);
  const same = await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch({ financial: "SUMASPAY", version: 1, collectedAmount: 10, hidden: true }));
  assert.deepEqual(same.payments, initial.payments);
  assert.equal(same.collectedAmount, 10);
  await assert.rejects(accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload([], { version: 1 }))), (error) => error.status === 409);
  assert.equal(db.tables.cierreAjusteEvento.length, 2);
  assert.equal(db.tables.cierreAjuste[0].payments.length, 1);
});

test("pagos no se trasladan a otra sede o periodo aunque compartan financiera e ID", async () => {
  const { db, accounting } = setup();
  await accounting.saveCierreAccounting(db.prisma, scope, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload([payment("p-1", 100)])));
  await accounting.saveCierreAccounting(db.prisma, { ...scope, sedeId: 1 }, actor,
    accounting.parseCierreAccountingPatch(paymentsPayload([payment("p-1", 20)])));
  const november = { from: "2026-11-01", to: "2026-11-30", sedeId: null };
  assert.equal((await accounting.readCierreAccounting(db.prisma, scope)).get("SUMASPAY").collectedAmount, 100);
  assert.equal((await accounting.readCierreAccounting(db.prisma, { ...scope, sedeId: 1 })).get("SUMASPAY").collectedAmount, 20);
  assert.equal((await accounting.readCierreAccounting(db.prisma, november)).size, 0);
});
