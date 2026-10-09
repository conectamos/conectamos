import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = path => readFileSync(join(ROOT, path), "utf8");
function load(path, imports = {}) {
  const output = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "console", output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {}, warn() {} });
  return loaded.exports;
}

const access = load("lib/access-control.ts");
const loans = load("lib/prestamos.ts");
const financialDetails = load("lib/ventas-financieras.ts");
const balance = load("lib/financial-dashboard-view.ts");
class NextResponse extends Response {
  static json(body, options = {}) {
    return new NextResponse(JSON.stringify(body), { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  }
}
const admin = { id: 7, sedeId: 1, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const supervisor = { id: 8, sedeId: 2, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" };

function databaseProbe() {
  const state = { journal: new Map(), expenses: [], calls: [], schemaAttempts: 0, failSchema: false, failExpense: false, failResult: false };
  let queue = Promise.resolve();
  const clone = value => structuredClone(value);
  const listExpenses = async ({ where = {} } = {}) => state.expenses.filter(item => !where.sedeId || item.sedeId === where.sedeId).map(clone);
  const db = {
    $executeRaw: async (template) => {
      const sql = template.join("?"); state.calls.push({ sql }); state.schemaAttempts++;
      assert.match(sql, /CREATE TABLE IF NOT EXISTS "CarteraRegistroSolicitud"/);
      assert.match(sql, /PRIMARY KEY \("usuarioId", "clave"\)/);
      if (state.failSchema) { state.failSchema = false; throw Error("Schema QA unavailable"); }
      return 0;
    },
    sede: {
      findUnique: async ({ where }) => [1, 2, 3].includes(where.id) ? { id: where.id } : null,
      findFirst: async () => ({ id: 1 }), findMany: async () => [],
    },
    gastoCartera: { findMany: listExpenses },
    venta: { findMany: async () => [] },
    cajaMovimiento: { findMany: async () => [] },
    inventarioSede: { findMany: async () => [] },
    abonoFinanciero: { findMany: async () => [] },
    prestamoSede: { findMany: async () => [] },
    $transaction: async (fn) => {
      // Model database serialization at the unique insert/row lock, and rollback.
      const previous = queue; let release;
      queue = new Promise(resolve => { release = resolve; }); await previous;
      const savedJournal = clone(state.journal); const savedExpenses = clone(state.expenses);
      const tx = {
        $executeRaw: async (template, ...values) => {
          const sql = template.join("?"); state.calls.push({ sql, values });
          if (sql.includes("INSERT INTO")) {
            assert.match(sql, /ON CONFLICT \("usuarioId", "clave"\) DO NOTHING/);
            const [usuarioId, clave, solicitud] = values; const key = `${usuarioId}:${clave}`;
            if (!state.journal.has(key)) state.journal.set(key, { solicitud, resultado: null });
          } else if (sql.includes("UPDATE")) {
            if (state.failResult) { state.failResult = false; throw Error("Result save QA failed"); }
            const [resultado, usuarioId, clave] = values;
            state.journal.get(`${usuarioId}:${clave}`).resultado = JSON.parse(resultado);
          } else assert.fail(`Unexpected SQL: ${sql}`);
          return 1;
        },
        $queryRaw: async (template, ...values) => {
          const sql = template.join("?"); state.calls.push({ sql, values }); assert.match(sql, /FOR UPDATE/);
          const item = state.journal.get(`${values[0]}:${values[1]}`); return item ? [clone(item)] : [];
        },
        gastoCartera: { create: async ({ data }) => {
          if (state.failExpense) { state.failExpense = false; throw Error("Expense QA failed"); }
          const item = { ...data, id: state.expenses.length + 1, createdAt: new Date("2026-10-09T12:00:00Z") };
          state.expenses.push(item); state.calls.push({ expense: clone(item) }); return clone(item);
        } },
      };
      try { return await fn(tx); } catch (error) {
        state.journal = savedJournal; state.expenses = savedExpenses; throw error;
      } finally { release(); }
    },
  };
  return { state, db };
}

function serverProbe({ sessionUser = admin, database = databaseProbe() } = {}) {
  const dependencies = { "@/lib/prisma": { __esModule: true, default: database.db } };
  const registration = load("lib/cartera-expense-registration.ts", dependencies);
  const financialAccess = { requireFinancialAccess: async () => sessionUser
    ? { ok: true, user: sessionUser, esAdmin: access.esRolAdministrativo(sessionUser.rolNombre) }
    : { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) } };
  const route = load("app/api/financiero/cartera/route.ts", {
    ...dependencies, "next/server": { NextResponse }, "@/lib/auth": { getSessionUser: async () => sessionUser },
    "@/lib/access-control": access, "@/lib/financial-access": financialAccess,
    "@/lib/cartera-expense-registration": registration,
  });
  const financialRoute = load("app/api/financiero/route.ts", {
    ...dependencies, "next/server": { NextResponse }, "@/lib/financial-access": financialAccess,
    "@/lib/prestamos": loans, "@/lib/ventas-financieras": financialDetails,
  });
  return {
    ...database,
    async post(values = {}, { key = "qa-expense-request-1", headerKey = key, raw } = {}) {
      const result = await route.POST(new Request("http://qa.local/api/financiero/cartera", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": headerKey },
        body: raw === undefined ? JSON.stringify({ valor: 1500000, sedeId: 2, observacion: " Gasto QA ", idempotencyKey: key, ...values }) : raw,
      }));
      return { status: result.status, body: await result.json(), cache: result.headers.get("Cache-Control") };
    },
    async list(sedeId = "") {
      const result = await route.GET(new Request(`http://qa.local/api/financiero/cartera?sedeId=${sedeId}`));
      return { status: result.status, body: await result.json() };
    },
    async summary(sedeId = "") {
      const result = await financialRoute.GET(new Request(`http://qa.local/api/financiero?sedeId=${sedeId}`));
      assert.equal(result.status, 200); return (await result.json()).resumen;
    },
  };
}

test("POST real crea un único gasto, conserva decimales y no duplica movimientos contables", async () => {
  const server = serverProbe(); const result = await server.post({ valor: 1500000.25 });
  assert.equal(result.status, 200); assert.equal(result.body.ok, true); assert.equal(result.body.replayed, false);
  assert.equal(result.body.item.valor, 1500000.25); assert.equal(result.body.item.observacion, "Gasto QA");
  assert.equal(result.body.item.sedeId, 2); assert.equal(result.body.item.id, 1);
  assert.equal(server.state.expenses.length, 1); assert.equal(server.state.journal.size, 1);
  assert.equal(server.state.schemaAttempts, 1); assert.ok(result.cache.includes("no-store"));
  assert.ok(server.state.calls.every(call => !call.sql || !/CajaMovimiento|INSERT.*GastoCartera/.test(call.sql)));
});

test("POST real rechaza importes no positivos, infinitos, inválidos o de tipos incompatibles antes de escribir", async () => {
  for (const valor of [0, -1, "-1", "Infinity", "NaN", "abc", "", null, true, [1], {}]) {
    const server = serverProbe(); const result = await server.post({ valor });
    assert.equal(result.status, 400, JSON.stringify(valor)); assert.equal(server.state.expenses.length, 0);
    assert.equal(server.state.schemaAttempts, 0); assert.equal(server.state.journal.size, 0);
  }
});

test("POST real valida la sede existente y el alcance del supervisor, sin ampliar perfiles habilitados", async () => {
  for (const [sessionUser, values, expected] of [
    [null, {}, 401], [{ ...supervisor, perfilTipo: "VENDEDOR" }, {}, 403],
    [{ ...supervisor, perfilTipo: "FACTURADOR" }, {}, 403],
    [supervisor, { sedeId: 3 }, 403], [admin, { sedeId: 500 }, 404],
    [admin, { sedeId: 0 }, 400], [admin, { sedeId: 1.5 }, 400], [admin, { sedeId: "Infinity" }, 400],
    [admin, { sedeId: true }, 400], [admin, { sedeId: [2] }, 400],
  ]) {
    const server = serverProbe({ sessionUser }); const result = await server.post(values);
    assert.equal(result.status, expected); assert.equal(server.state.expenses.length, 0); assert.equal(server.state.schemaAttempts, 0);
  }
  const supervisorServer = serverProbe({ sessionUser: supervisor });
  assert.equal((await supervisorServer.post()).status, 200);
  assert.equal((await supervisorServer.post({ sedeId: undefined }, { key: "qa-supervisor-default" })).body.item.sedeId, 2);
  const auditor = serverProbe({ sessionUser: { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" } });
  assert.equal((await auditor.post({ sedeId: 3 })).body.item.sedeId, 3);
});

test("POST real requiere clave válida, acepta encabezado o cuerpo y rechaza claves discrepantes", async () => {
  for (const key of ["", "short", "a".repeat(161), "invalid key value", "invalid/key/value"]) {
    const server = serverProbe(); assert.equal((await server.post({}, { key })).status, 400);
    assert.equal(server.state.expenses.length, 0); assert.equal(server.state.schemaAttempts, 0);
  }
  const server = serverProbe();
  assert.equal((await server.post({}, { key: "qa-body-key", headerKey: "qa-other-key" })).status, 409);
  assert.equal((await server.post({}, { key: "qa-only-body-key", headerKey: "" })).status, 200);
  assert.equal((await server.post({ idempotencyKey: undefined }, { key: "qa-only-header-key" })).status, 200);
});

test("POST real serializa varios envíos simultáneos de la misma clave y devuelve el mismo gasto", async () => {
  const server = serverProbe(); const results = await Promise.all(Array.from({ length: 8 }, () => server.post()));
  assert.ok(results.every(result => result.status === 200 && result.body.item.id === 1));
  assert.equal(results.filter(result => !result.body.replayed).length, 1);
  assert.equal(server.state.expenses.length, 1); assert.equal(server.state.journal.size, 1);
  assert.equal(server.state.schemaAttempts, 1);
});

test("POST real recupera la respuesta tras reiniciar el proceso sin volver a registrar el gasto", async () => {
  const first = serverProbe(); const original = await first.post();
  const restarted = serverProbe({ database: { db: first.db, state: first.state } });
  const retry = await restarted.post();
  assert.equal(retry.status, 200); assert.equal(retry.body.replayed, true);
  assert.deepEqual(retry.body.item, original.body.item); assert.equal(first.state.expenses.length, 1);
});

test("POST real rechaza reutilizar un intento con otro valor, sede u observación y aísla cada usuario", async () => {
  const server = serverProbe(); await server.post();
  for (const change of [{ valor: 1500001 }, { sedeId: 3 }, { observacion: "Otro gasto" }]) {
    const result = await server.post(change); assert.equal(result.status, 409);
    assert.equal(result.body.codigo, "IDEMPOTENCIA_CONFLICTO");
  }
  assert.equal(server.state.expenses.length, 1);
  const other = serverProbe({ sessionUser: { ...admin, id: 9 }, database: server });
  assert.equal((await other.post()).body.replayed, false); assert.equal(server.state.expenses.length, 2);
});

test("POST real revierte gasto y reserva si falla la transacción; el reintento completa una sola vez", async () => {
  for (const failure of ["failExpense", "failResult"]) {
    const server = serverProbe(); server.state[failure] = true;
    assert.equal((await server.post()).status, 500);
    assert.equal(server.state.expenses.length, 0); assert.equal(server.state.journal.size, 0);
    assert.equal((await server.post()).status, 200); assert.equal((await server.post()).body.replayed, true);
    assert.equal(server.state.expenses.length, 1);
  }
});

test("el esquema auxiliar puede reintentarse después de un fallo y nunca registra un gasto incompleto", async () => {
  const server = serverProbe(); server.state.failSchema = true;
  assert.equal((await server.post()).status, 500); assert.equal(server.state.expenses.length, 0);
  assert.equal((await server.post()).status, 200); assert.equal(server.state.schemaAttempts, 2);
});

test("el resumen financiero real aumenta cartera y pasivos exactamente una vez, sin alterar caja ni otras sedes", async () => {
  const server = serverProbe(); const before = await server.summary(2);
  const beforeBalance = balance.calcularBalanceFinanciero(before);
  await server.post({ valor: 1500000.25 }); await server.post({ valor: 1500000.25 });
  const after = await server.summary(2); const afterBalance = balance.calcularBalanceFinanciero(after);
  assert.equal(after.totalGastosCartera - before.totalGastosCartera, 1500000.25);
  assert.equal(afterBalance.pasivos - beforeBalance.pasivos, 1500000.25);
  assert.equal(afterBalance.resultadoNeto - beforeBalance.resultadoNeto, -1500000.25);
  assert.equal(afterBalance.activos, beforeBalance.activos); assert.equal(after.cajaDisponible, before.cajaDisponible);
  assert.equal((await server.summary(3)).totalGastosCartera, 0);
  assert.equal((await server.summary()).totalGastosCartera, 1500000.25);
  assert.equal((await server.list(2)).body.total, 1500000.25);
  const restricted = serverProbe({ sessionUser: { ...supervisor, sedeId: 3 }, database: server });
  assert.equal((await restricted.list(2)).body.total, 0);
  assert.equal((await restricted.summary(2)).totalGastosCartera, 0);
});

test("POST real rechaza JSON mal formado o no objeto sin crear registros", async () => {
  const server = serverProbe();
  for (const raw of ["{", "null", "[]", "5"]) assert.equal((await server.post({}, { raw })).status, 400);
  assert.equal(server.state.expenses.length, 0); assert.equal(server.state.schemaAttempts, 0);
});
