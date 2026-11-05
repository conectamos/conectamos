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
