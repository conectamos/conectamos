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
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {} });
  return loaded.exports;
}

const access = load("lib/access-control.ts");
const routeAccess = load("lib/bodega-route-access.ts");
class NextResponse extends Response {
  static json(body, options = {}) {
    return new NextResponse(JSON.stringify(body), { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  }
}

function probe() {
  const state = { rows: [], sql: [], schemaCalls: 0, failSchema: false, failWrite: false, failRead: false, history: [{ distribuidor: "COMUNICARIBE", numeroFactura: "00001", imei: "001234567890123" }] };
  const record = (parts, values) => {
    const sql = parts.join("?").replace(/\s+/g, " ").trim();
    state.sql.push({ sql, values: structuredClone(values) });
    assert.ok(!/InventarioPrincipal|InventarioSede|MovimientoInventario/.test(sql), "Catalog must never alter historical equipment or movements");
    return sql;
  };
  const db = {
    async $queryRaw(parts, ...values) {
      const sql = record(parts, values);
      if (/pg_advisory_xact_lock/.test(sql)) return [{ lock: "" }];
      assert.match(sql, /^SELECT "id", "nombre" FROM "CatalogoDistribuidorInventario"/);
      if (state.failRead) { state.failRead = false; throw Error("QA read failure"); }
      return state.rows.filter(row => row.activo).sort((a, b) => a.nombreNormalizado.localeCompare(b.nombreNormalizado)).map(({ id, nombre }) => ({ id, nombre }));
    },
    async $executeRaw(parts, ...values) {
      const sql = record(parts, values);
      if (/^CREATE TABLE/.test(sql)) {
        state.schemaCalls++;
        if (state.failSchema) { state.failSchema = false; throw Error("QA bootstrap failure"); }
        return 0;
      }
      if (state.failWrite) { state.failWrite = false; throw Error("QA write failure"); }
      if (/^INSERT INTO/.test(sql)) {
        const [nombre, nombreNormalizado] = values;
        const existing = state.rows.find(row => row.nombreNormalizado === nombreNormalizado);
        if (existing) {
          if (/DO UPDATE/.test(sql)) existing.activo = true;
          return 1;
        }
        state.rows.push({ id: state.rows.length + 1, nombre, nombreNormalizado, activo: true });
        return 1;
      }
      assert.match(sql, /^UPDATE "CatalogoDistribuidorInventario" SET "activo" = false/);
      const existing = state.rows.find(row => row.id === values[0]);
      if (!existing) return 0;
      existing.activo = false;
      return 1;
    },
  };
  let queue = Promise.resolve();
  db.$transaction = async callback => {
    const prior = queue; let release;
    queue = new Promise(resolve => { release = resolve; });
    await prior;
    const saved = structuredClone(state.rows);
    try { return await callback(db); }
    catch (error) { state.rows = saved; throw error; }
    finally { release(); }
  };
  const service = () => load("lib/inventory-distributors.ts", { "@/lib/prisma": { __esModule: true, default: db } });
  const lib = service();
  function routes(rolNombre = "ADMIN", implementation = lib) {
    return load("app/api/inventario-principal/distribuidores/route.ts", {
      "next/server": { NextResponse },
      "@/lib/auth": { getSessionUser: async () => rolNombre ? { id: 1, rolNombre } : null },
      "@/lib/access-control": access,
      "@/lib/inventory-distributors": implementation,
    });
  }
  async function invoke(method, body, role = "ADMIN", rawBody) {
    const response = await routes(role)[method](new Request("http://qa.local/api/inventario-principal/distribuidores", {
      method, headers: { "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: rawBody === undefined ? JSON.stringify(body) : rawBody }),
    }));
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { state, lib, service, routes, invoke };
}

test("ADMIN, AUDITOR y BODEGA consultan y gestionan solo el catálogo de principal", async () => {
  for (const role of ["ADMIN", "AUDITOR", "BODEGA"]) {
    const p = probe();
    const initial = await p.invoke("GET", undefined, role);
    assert.equal(initial.status, 200);
    assert.equal(initial.body.ok, true);
    assert.equal(initial.body.distribuidores.length, 6);
    assert.match(initial.headers.get("Cache-Control"), /private, no-store/);
    const created = await p.invoke("POST", { nombre: `Aliado ${role}` }, role);
    assert.equal(created.status, 200);
    const row = created.body.distribuidores.find(item => item.nombre === `Aliado ${role}`);
    assert.equal((await p.invoke("DELETE", { id: row.id }, role)).status, 200);
    assert.equal(routeAccess.puedeAccederRutaBodega("/api/inventario-principal/distribuidores", "GET"), true);
    assert.equal(routeAccess.puedeAccederRutaBodega("/api/inventario-principal/distribuidores", "POST"), true);
    assert.equal(routeAccess.puedeAccederRutaBodega("/api/inventario-principal/distribuidores", "DELETE"), true);
    assert.equal(routeAccess.puedeAccederRutaBodega("/api/inventario-principal/distribuidores", "PATCH"), false);
  }
});

test("sesiones ausentes y roles de sede no leen ni modifican distribuidores", async () => {
  for (const role of [null, "SUPERVISOR", "VENDEDOR", "FACTURADOR", "APOYO_OPERATIVO"]) {
    for (const method of ["GET", "POST", "DELETE"]) {
      const p = probe();
      const result = await p.invoke(method, method === "POST" ? { nombre: "Proveedor QA" } : { id: 1 }, role);
      assert.equal(result.status, role === null ? 401 : 403);
      assert.equal(result.body.ok, undefined);
      assert.deepEqual(p.state.sql, []);
    }
  }
});

test("nombres se validan sin escribir y se normalizan sin borrar acentos", async () => {
  const p = probe();
  for (const nombre of [undefined, null, 123, false, [], {}, "", "  \n ", "a".repeat(101), "Nulo\0Nombre"]) {
    assert.equal((await p.invoke("POST", { nombre })).status, 400);
  }
  assert.equal(p.state.schemaCalls, 0);
  assert.equal(p.lib.normalizarDistribuidorInventario("  Distribuidora  José\t SAS "), "Distribuidora José SAS");
  const result = await p.invoke("POST", { nombre: "  Distribuidora  José\t SAS " });
  assert.ok(result.body.distribuidores.some(item => item.nombre === "Distribuidora José SAS"));
  await p.invoke("POST", { nombre: "Distribuidora Jose SAS" });
  assert.equal(p.state.rows.filter(row => row.nombre.startsWith("Distribuidora")).length, 2);
});

test("POST repetido y concurrente no duplica nombres por mayúsculas o espacios", async () => {
  const p = probe();
  const attempts = await Promise.all([" Aliado  Nuevo ", "aliado nuevo", "ALIADO NUEVO"].map(nombre => p.invoke("POST", { nombre })));
  assert.ok(attempts.every(result => result.status === 200));
  const rows = p.state.rows.filter(row => row.nombreNormalizado === "ALIADO NUEVO");
  assert.equal(rows.length, 1);
  assert.equal((await p.invoke("GET")).body.distribuidores.length, 7);
  assert.equal(p.state.schemaCalls, 1);
});

test("retirar excluye el selector y conserva IDs, equipos, factura e historial", async () => {
  const p = probe(); const before = structuredClone(p.state.history);
  const row = (await p.invoke("GET")).body.distribuidores.find(item => item.nombre === "COMUNICARIBE");
  const result = await p.invoke("DELETE", { id: row.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.distribuidores.some(item => item.id === row.id), false);
  assert.equal(p.state.rows.find(item => item.id === row.id).activo, false);
  assert.deepEqual(p.state.history, before);
  assert.equal((await p.invoke("DELETE", { id: row.id })).status, 200);
  assert.equal(p.state.rows.length, 6);
  assert.equal(p.state.sql.some(call => /^DELETE /.test(call.sql)), false);
});

test("reiniciar y sembrar nuevamente no resucita opciones retiradas", async () => {
  const p = probe();
  await p.lib.obtenerDistribuidoresInventario();
  const row = p.state.rows.find(item => item.nombre === "COMUNICARIBE");
  await p.lib.retirarDistribuidorInventario(row.id);
  const afterRestart = await p.service().obtenerDistribuidoresInventario();
  assert.equal(p.state.schemaCalls, 2);
  assert.equal(afterRestart.some(item => item.id === row.id), false);
  assert.equal(p.state.rows.length, 6);
});

test("agregar nuevamente restaura el mismo ID sin cambiar el nombre histórico", async () => {
  const p = probe();
  await p.invoke("POST", { nombre: "Proveedor Próximo" });
  const row = p.state.rows.find(item => item.nombreNormalizado === "PROVEEDOR PRÓXIMO");
  await p.invoke("DELETE", { id: row.id });
  const result = await p.invoke("POST", { nombre: " proveedor  próximo " });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.distribuidores.find(item => item.id === row.id), { id: row.id, nombre: "Proveedor Próximo" });
  assert.equal(p.state.rows.filter(item => item.nombreNormalizado === row.nombreNormalizado).length, 1);
});

test("DELETE exige un ID seguro y válido y diferencia un distribuidor inexistente", async () => {
  const p = probe();
  for (const id of [undefined, null, "1", true, 0, -1, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await p.invoke("DELETE", { id })).status, 400);
  }
  assert.equal(p.state.schemaCalls, 0);
  assert.equal((await p.invoke("DELETE", { id: 999 })).status, 404);
});

test("solicitudes JSON malformadas se rechazan sin crear opciones", async () => {
  for (const method of ["POST", "DELETE"]) {
    for (const raw of ["{", "null", "[]", '"texto"', "true"]) {
      const p = probe();
      assert.equal((await p.invoke(method, undefined, "BODEGA", raw)).status, 400);
      assert.deepEqual(p.state.sql, []);
    }
  }
});

test("bootstrap falla sin éxito falso y vuelve a intentarse conservando defaults", async () => {
  const p = probe(); p.state.failSchema = true;
  assert.equal((await p.invoke("GET")).status, 500);
  assert.deepEqual(p.state.rows, []);
  const recovered = await p.invoke("GET");
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.distribuidores.length, 6);
  assert.equal(p.state.schemaCalls, 2);
});

test("dos instancias inicializan bajo el mismo lock sin duplicar defaults ni reactivar retirados", async () => {
  const p = probe();
  await p.lib.obtenerDistribuidoresInventario();
  const row = p.state.rows.find(item => item.nombre === "CORBETA");
  await p.lib.retirarDistribuidorInventario(row.id);
  const results = await Promise.all([p.service(), p.service()].map(service => service.obtenerDistribuidoresInventario()));
  assert.equal(p.state.schemaCalls, 3);
  assert.equal(p.state.rows.length, 6);
  assert.ok(results.every(rows => rows.length === 5 && !rows.some(item => item.id === row.id)));
  const locks = p.state.sql.filter(call => /pg_advisory_xact_lock/.test(call.sql));
  assert.equal(locks.length, 3);
  assert.ok(locks.every(call => call.sql.includes("inventario-distribuidores-schema")));
});

test("fallo de escritura no confirma éxito y el reintento conserva una sola opción", async () => {
  const p = probe(); await p.invoke("GET"); p.state.failWrite = true;
  const failed = await p.invoke("POST", { nombre: "Aliado reintento" });
  assert.equal(failed.status, 500); assert.equal(failed.body.ok, undefined);
  assert.equal(p.state.rows.some(row => row.nombre === "Aliado reintento"), false);
  assert.equal((await p.invoke("POST", { nombre: "Aliado reintento" })).status, 200);
  assert.equal(p.state.rows.filter(row => row.nombre === "Aliado reintento").length, 1);
});

test("respuesta perdida tras escribir permite recuperar sin duplicar", async () => {
  const p = probe(); await p.invoke("GET"); p.state.failRead = true;
  assert.equal((await p.invoke("POST", { nombre: "Aliado sin respuesta" })).status, 500);
  assert.equal(p.state.rows.filter(row => row.nombre === "Aliado sin respuesta").length, 1);
  const retried = await p.invoke("POST", { nombre: "aliado sin respuesta" });
  assert.equal(retried.status, 200);
  assert.equal(p.state.rows.filter(row => row.nombreNormalizado === "ALIADO SIN RESPUESTA").length, 1);
});

test("nombres con comillas se envían como parámetros SQL y el catálogo no tiene borrados físicos", async () => {
  const p = probe(); const name = "Aliado '); DROP TABLE test; --";
  assert.equal((await p.invoke("POST", { nombre: name })).status, 200);
  const insert = p.state.sql.find(call => call.values[0] === name);
  assert.ok(insert);
  assert.equal(insert.sql.includes(name), false);
  assert.match(insert.sql, /VALUES \(\?, \?\)/);
  assert.equal(p.state.sql.some(call => /DROP TABLE|^DELETE /.test(call.sql)), false);
});
