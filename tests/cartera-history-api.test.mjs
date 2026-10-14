import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
function load(path, imports = {}) {
  const compiled = ts.transpileModule(readFileSync(join(ROOT, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "console", compiled)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {} });
  return loaded.exports;
}
const access = load("lib/access-control.ts");
class NextResponse extends Response {
  static json(body, options = {}) {
    return new NextResponse(JSON.stringify(body), { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  }
}
const admin = { id: 7, sedeId: 1, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const auditor = { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" };
const supervisor = { id: 8, sedeId: 2, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" };
const createdAt = new Date("2026-10-14T04:30:00Z");
const expense = { id: 1, sedeId: 2, valor: 1500000.25, observacion: "Gasto QA", createdAt, updatedAt: createdAt };
const other = { ...expense, id: 10, sedeId: 3, valor: -12345.5, observacion: "Ajuste histórico" };
const cash = { id: 101, sedeId: 2, tipo: "EGRESO", concepto: "GASTO CARTERA", valor: expense.valor, descripcion: "GASTO CARTERA #1 · Gasto QA", createdAt };
const clone = value => structuredClone(value);

function matches(item, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(condition => matches(item, condition));
    if (key === "createdAt") return (!value.gte || item.createdAt >= value.gte) && (!value.lte || item.createdAt <= value.lte);
    if (value && typeof value === "object" && "startsWith" in value) return String(item[key] ?? "").startsWith(value.startsWith);
    return item[key] === value;
  });
}

function database({ expenses = [expense, other], movements = [] } = {}) {
  const state = { expenses: clone(expenses), movements: clone(movements), calls: [], failList: false, failUpdate: false, failCashDelete: false };
  let queue = Promise.resolve();
  const findExpenses = async ({ where = {}, take, skip }) => {
    state.calls.push({ type: "list", where, take, skip });
    if (state.failList) throw Error("Synthetic read failure");
    return state.expenses.filter(item => matches(item, where)).sort((a, b) => b.id - a.id)
      .map(item => ({ ...clone(item), sede: { nombre: `SEDE ${item.sedeId}` } }));
  };
  const db = {
    gastoCartera: { findMany: findExpenses },
    sede: { findUnique: async ({ where }) => {
      state.calls.push({ type: "sede", id: where.id });
      return [1, 2, 3].includes(where.id) ? { id: where.id } : null;
    } },
    $transaction: async fn => {
      const pending = queue; let release;
      queue = new Promise(resolve => { release = resolve; });
      await pending;
      const before = { expenses: clone(state.expenses), movements: clone(state.movements) };
      let locked = false;
      const findCash = async ({ where, take }) => state.movements.filter(item => matches(item, where)).sort((a, b) => b.id - a.id).slice(0, take ?? Infinity).map(clone);
      const tx = {
        $queryRaw: async (template, ...values) => {
          assert.match(template.join("?"), /SELECT id FROM "GastoCartera" WHERE id = \? FOR UPDATE/);
          state.calls.push({ type: "lock", id: values[0] }); locked = true;
          return state.expenses.filter(item => item.id === values[0]).map(item => ({ id: item.id }));
        },
        gastoCartera: {
          findUnique: async ({ where }) => {
            assert.ok(locked, "El gasto debe releerse bajo bloqueo de fila");
            state.calls.push({ type: "expense-read", id: where.id });
            return clone(state.expenses.find(item => item.id === where.id) ?? null);
          },
          update: async ({ where, data }) => {
            assert.ok(locked); if (state.failUpdate) throw Error("Synthetic update failure");
            const item = state.expenses.find(item => item.id === where.id);
            Object.assign(item, clone(data), { updatedAt: new Date("2026-10-14T15:00:00Z") });
            state.calls.push({ type: "expense-update", id: where.id }); return clone(item);
          },
          delete: async ({ where }) => {
            assert.ok(locked); state.calls.push({ type: "expense-delete", id: where.id });
            const found = state.expenses.find(item => item.id === where.id);
            state.expenses = state.expenses.filter(item => item.id !== where.id); return clone(found);
          },
        },
        cajaMovimiento: {
          findFirst: async options => (await findCash(options))[0] ?? null,
          findMany: findCash,
          delete: async ({ where }) => {
            if (state.failCashDelete) throw Error("Synthetic cash deletion failure");
            assert.ok(state.movements.some(item => item.id === where.id));
            state.calls.push({ type: "cash-delete", id: where.id });
            state.movements = state.movements.filter(item => item.id !== where.id);
          },
        },
      };
      try { return await fn(tx); } catch (error) {
        state.expenses = before.expenses; state.movements = before.movements; throw error;
      } finally { release(); }
    },
  };
  return { state, db };
}

function server({ user = admin, authorized = true, dbProbe = database() } = {}) {
  const financialAccess = { requireFinancialAccess: async () => {
    if (!user) return { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
    if (!authorized || !access.puedeAccederModulosOperativos(user.perfilTipo)) return { ok: false, response: NextResponse.json({ error: "Acceso financiero requerido" }, { status: 403 }) };
    return { ok: true, user, esAdmin: access.esRolAdministrativo(user.rolNombre) };
  } };
  const route = load("app/api/financiero/cartera/route.ts", {
    "next/server": { NextResponse }, "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/access-control": access, "@/lib/financial-access": financialAccess,
    "@/lib/cartera-expense-registration": { CarteraRequestConflictError: class extends Error {}, registrarGastoCarteraUnaVez: () => assert.fail("Este historial no debe crear gastos") },
    "@/lib/prisma": { __esModule: true, default: dbProbe.db },
  });
  return {
    ...dbProbe,
    async invoke(method, body, query = "") {
      const response = await route[method](new Request(`http://qa.local/api/financiero/cartera${query}`, {
        method, ...(method !== "GET" ? { headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
      }));
      return { status: response.status, body: await response.json(), cache: response.headers.get("Cache-Control") };
    },
    list: query => route.GET(new Request(`http://qa.local/api/financiero/cartera${query || ""}`)),
  };
}
const patch = { id: 1, sedeId: 3, valor: 1750000.75, observacion: " Gasto actualizado QA " };

test("GET real devuelve toda la cobertura ordenada, suma valores históricos y nunca escribe", async () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ ...expense, id: i + 1, valor: i === 0 ? -0.5 : 100 + i / 100 }));
  const probe = server({ dbProbe: database({ expenses: rows }) }); const result = await probe.invoke("GET");
  assert.equal(result.status, 200); assert.equal(result.body.items.length, 23);
  assert.equal(result.body.items[0].id, 23); assert.ok(Math.abs(result.body.total - rows.reduce((sum, item) => sum + item.valor, 0)) < 1e-8);
  assert.equal(result.body.items[0].createdAt, createdAt.toISOString()); assert.equal(result.cache, "no-store");
  assert.deepEqual(probe.state.calls, [{ type: "list", where: {}, take: undefined, skip: undefined }]);
});

test("GET real conserva filtros de ADMIN/AUDITOR y fuerza sede propia para supervisor", async () => {
  for (const user of [admin, auditor]) {
    const result = await server({ user }).invoke("GET", undefined, "?sedeId=3");
    assert.deepEqual(result.body.items.map(item => item.id), [10]); assert.equal(result.body.total, -12345.5);
  }
  const probe = server({ user: supervisor });
  const result = await probe.invoke("GET", undefined, "?sedeId=3");
  assert.deepEqual(result.body.items.map(item => item.id), [1]); assert.equal(result.body.total, expense.valor);
  assert.deepEqual(probe.state.calls[0].where, { sedeId: 2 });
  const invalidSession = await server({ user: { ...supervisor, sedeId: undefined } }).invoke("GET");
  assert.equal(invalidSession.status, 403);
});

test("GET real rechaza sedes inválidas y devuelve errores sin falsos resultados", async () => {
  for (const sede of ["0", "-1", "1.5", "Infinity", "NaN", "abc", "9007199254740992"]) {
    const probe = server(); const result = await probe.invoke("GET", undefined, `?sedeId=${sede}`);
    assert.equal(result.status, 400); assert.equal(probe.state.calls.length, 0); assert.equal(result.cache, "no-store");
  }
  const probe = server(); probe.state.failList = true;
  const result = await probe.invoke("GET"); assert.equal(result.status, 500);
  assert.equal(result.body.ok, undefined); assert.equal(result.body.items, undefined); assert.equal(result.cache, "no-store");
});

test("las rutas reales exigen sesión, acceso financiero y permisos actuales por acción", async () => {
  for (const [options, expected] of [
    [{ user: null }, 401], [{ authorized: false }, 403],
    [{ user: { ...supervisor, perfilTipo: "VENDEDOR" } }, 403],
  ]) {
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const probe = server(options); assert.equal((await probe.invoke(method, patch)).status, expected);
      assert.equal(probe.state.calls.length, 0);
    }
  }
  for (const method of ["PATCH", "DELETE"]) {
    const probe = server({ user: supervisor }); assert.equal((await probe.invoke(method, patch)).status, 403);
    assert.equal(probe.state.calls.length, 0);
  }
  const auditorProbe = server({ user: auditor }); assert.equal((await auditorProbe.invoke("DELETE", { id: 1 })).status, 403);
  assert.equal((await auditorProbe.invoke("PATCH", patch)).status, 200);
});

test("PATCH/DELETE reales validan objetos e IDs seguros antes de tocar la base", async () => {
  for (const method of ["PATCH", "DELETE"]) {
    for (const raw of ["{", "null", "[]", "5"]) {
      const probe = server(); assert.equal((await probe.invoke(method, raw)).status, 400); assert.equal(probe.state.calls.length, 0);
    }
    for (const id of [0, -1, 1.5, "Infinity", "NaN", "abc", true, [1], {}, null, "9007199254740992"]) {
      const probe = server(); assert.equal((await probe.invoke(method, { ...patch, id })).status, 400); assert.equal(probe.state.calls.length, 0);
    }
  }
});

test("PATCH real valida sede, valor finito no cero y observación, conservando negativos y decimales", async () => {
  for (const [field, values] of [
    ["sedeId", [0, -1, 1.5, "Infinity", null, true, [2], {}, "9007199254740992"]],
    ["valor", [0, "Infinity", "NaN", "abc", null, true, [2], {}]],
    ["observacion", [true, 5, [], {}]],
  ]) {
    for (const value of values) {
      const probe = server(); assert.equal((await probe.invoke("PATCH", { ...patch, [field]: value })).status, 400, `${field}:${value}`);
      assert.equal(probe.state.calls.length, 0);
    }
  }
  const invalidSede = server(); assert.equal((await invalidSede.invoke("PATCH", { ...patch, sedeId: 999 })).status, 404);
  assert.ok(invalidSede.state.calls.every(call => call.type === "sede"));
  const probe = server(); const result = await probe.invoke("PATCH", { ...patch, valor: -150.125 });
  assert.equal(result.status, 200); assert.equal(result.body.item.valor, -150.125); assert.equal(result.body.item.observacion, "Gasto actualizado QA");
});

test("PATCH real actualiza gasto bajo bloqueo, conserva fecha original y elimina solo movimiento legado asociado", async () => {
  const unrelated = { ...cash, id: 110, descripcion: "GASTO CARTERA #10 · Otro gasto" };
  const probe = server({ dbProbe: database({ movements: [cash, unrelated] }) });
  const result = await probe.invoke("PATCH", patch);
  assert.equal(result.status, 200); assert.equal(result.body.ok, true); assert.equal(result.body.item.sedeId, 3);
  assert.equal(probe.state.expenses.find(item => item.id === 1).createdAt.toISOString(), createdAt.toISOString());
  assert.deepEqual(probe.state.movements.map(item => item.id), [110]);
  assert.deepEqual(probe.state.calls.map(item => item.type), ["sede", "lock", "expense-read", "expense-update", "cash-delete"]);
  assert.equal((await probe.invoke("GET")).body.total, patch.valor + other.valor);
});

test("PATCH/DELETE reales no confunden marcador #1 con #10 ni lo rescatan mediante fallback", async () => {
  for (const method of ["PATCH", "DELETE"]) {
    for (const suffix of ["", " · Otro gasto", " : otro", "\nOtro gasto", "-Detalle", " / Detalle"]) {
      const wrong = { ...cash, id: 110, descripcion: `GASTO CARTERA #10${suffix}` };
      const probe = server({ dbProbe: database({ movements: [wrong] }) });
      assert.equal((await probe.invoke(method, method === "PATCH" ? patch : { id: 1 })).status, 200);
      assert.deepEqual(probe.state.movements.map(item => item.id), [110]);
      assert.ok(probe.state.calls.every(call => call.type !== "cash-delete"));
    }
  }
});

test("DELETE real elimina gasto y su movimiento legado en una sola transacción sin crear asientos", async () => {
  const probe = server({ dbProbe: database({ movements: [cash] }) });
  const result = await probe.invoke("DELETE", { id: "1" });
  assert.equal(result.status, 200); assert.equal(result.body.ok, true);
  assert.deepEqual(probe.state.expenses.map(item => item.id), [10]); assert.equal(probe.state.movements.length, 0);
  assert.deepEqual(probe.state.calls.map(item => item.type), ["lock", "expense-read", "expense-delete", "cash-delete"]);
  assert.equal((await probe.invoke("GET")).body.total, other.valor);
});

test("la asociación legado conserva afinidad de observación/fecha y nunca borra conceptos ajenos", async () => {
  const near = { ...cash, id: 201, descripcion: "Otra descripción", createdAt: new Date(createdAt.getTime() + 1000) };
  const right = { ...cash, id: 202, descripcion: "Gasto QA", createdAt: new Date(createdAt.getTime() + 2000) };
  const protectedCash = { ...cash, id: 203, concepto: "VENTA", descripcion: "Gasto QA" };
  const probe = server({ dbProbe: database({ movements: [near, right, protectedCash] }) });
  assert.equal((await probe.invoke("PATCH", patch)).status, 200);
  assert.deepEqual(probe.state.movements.map(item => item.id), [201, 203]);
});

test("la asociación legado ambigua produce conflicto antes de modificar gasto o caja", async () => {
  for (const method of ["PATCH", "DELETE"]) {
    const movements = [501, 502].map(id => ({ ...cash, id, descripcion: "Gasto QA" }));
    const probe = server({ dbProbe: database({ movements }) });
    const result = await probe.invoke(method, method === "PATCH" ? patch : { id: 1 });
    assert.equal(result.status, 409); assert.equal(result.body.codigo, "MOVIMIENTO_AMBIGUO");
    assert.deepEqual(probe.state.expenses, clone([expense, other])); assert.deepEqual(probe.state.movements, clone(movements));
    assert.ok(probe.state.calls.every(call => !/update|delete/.test(call.type)));
  }
});

test("PATCH/DELETE reales preservan gastos y caja cuando falla una escritura, sin anunciar éxito", async () => {
  for (const method of ["PATCH", "DELETE"]) {
    const probe = server({ dbProbe: database({ movements: [cash] }) }); probe.state.failCashDelete = true;
    const result = await probe.invoke(method, method === "PATCH" ? patch : { id: 1 });
    assert.equal(result.status, 500); assert.equal(result.body.ok, undefined);
    assert.deepEqual(probe.state.expenses, clone([expense, other])); assert.deepEqual(probe.state.movements, clone([cash]));
  }
  const probe = server(); probe.state.failUpdate = true;
  assert.equal((await probe.invoke("PATCH", patch)).status, 500); assert.deepEqual(probe.state.expenses, clone([expense, other]));
});

test("registros inexistentes y borrados repetidos no producen nuevos movimientos ni falsos éxitos", async () => {
  for (const method of ["PATCH", "DELETE"]) {
    const probe = server(); const result = await probe.invoke(method, { ...patch, id: 999 });
    assert.equal(result.status, 404); assert.equal(result.body.ok, undefined);
    assert.ok(probe.state.calls.every(call => !/update|delete/.test(call.type)));
  }
  const probe = server({ dbProbe: database({ movements: [cash] }) });
  const result = await Promise.all(Array.from({ length: 6 }, () => probe.invoke("DELETE", { id: 1 })));
  assert.equal(result.filter(item => item.status === 200).length, 1); assert.equal(result.filter(item => item.status === 404).length, 5);
  assert.equal(probe.state.calls.filter(item => item.type === "cash-delete").length, 1);
});

test("edición y eliminación simultáneas se serializan y no dejan gasto ni caja huérfanos", async () => {
  const probe = server({ dbProbe: database({ movements: [cash] }) });
  const results = await Promise.all([probe.invoke("PATCH", patch), probe.invoke("DELETE", { id: 1 })]);
  assert.ok(results.every(item => [200, 404].includes(item.status)));
  assert.ok(probe.state.expenses.every(item => item.id !== 1)); assert.equal(probe.state.movements.length, 0);
  assert.equal(probe.state.calls.filter(item => item.type === "cash-delete").length, 1);
});

test("observaciones largas y cambio de cobertura conservan todos los datos y los totales de la API", async () => {
  const text = "Observación de prueba con acentos y detalle completo. ".repeat(250);
  const probe = server(); assert.equal((await probe.invoke("PATCH", { ...patch, observacion: text })).status, 200);
  const result = await probe.invoke("GET", undefined, "?sedeId=3");
  assert.equal(result.body.items.find(item => item.id === 1).observacion, text.trim());
  assert.equal(result.body.total, patch.valor + other.valor);
  assert.equal((await probe.invoke("GET", undefined, "?sedeId=2")).body.total, 0);
});
