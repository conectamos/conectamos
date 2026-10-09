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
    assert.ok(name in imports, `Unexpected dependency ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {}, warn() {} });
  return loaded.exports;
}
const imeiHelpers = load("lib/inventory-imeis.ts");
const access = load("lib/access-control.ts");
const productTypes = load("lib/product-types.ts");
class NextResponse extends Response {
  static json(body, options = {}) {
    return new NextResponse(JSON.stringify(body), { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  }
}
const ADMIN = { id: 7, sedeId: 1, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const SUPERVISOR = { id: 8, sedeId: 2, rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" };
const FIRST = "001234567890123";
const SECOND = "101234567890123";
const THIRD = "201234567890123";

function databaseProbe() {
  const state = { journal: new Map(), principal: [], sedes: [], movements: [], sql: [], schemaAttempts: 0, failSchema: false, failMovement: false, failResult: false, incompleteCreate: false };
  let queue = Promise.resolve();
  const clone = value => structuredClone(value);
  const find = kind => async ({ where = {} } = {}) => state[kind].filter(item => {
    if (where.imei?.in && !where.imei.in.includes(item.imei)) return false;
    if (typeof where.imei === "string" && where.imei !== item.imei) return false;
    if (where.sedeId && where.sedeId !== item.sedeId) return false;
    return true;
  }).map(clone);
  const makeModels = () => ({
    sede: { findUnique: async ({ where }) => [1, 2, 3].includes(where.id) ? { nombre: `SEDE ${where.id}` } : where.id === 4 ? { nombre: "VENTAS" } : null },
    inventarioPrincipal: {
      findMany: find("principal"),
      createMany: async ({ data }) => {
        for (const item of data) {
          assert.ok(!state.principal.some(existing => existing.imei === item.imei), "DB unique principal IMEI");
          state.principal.push({ id: state.principal.length + 1, estado: "BODEGA", ...clone(item) });
        }
        return { count: state.incompleteCreate ? data.length - 1 : data.length };
      },
    },
    inventarioSede: {
      findMany: find("sedes"),
      findFirst: async args => (await find("sedes")(args))[0] || null,
      createMany: async ({ data }) => {
        for (const item of data) state.sedes.push({ id: state.sedes.length + 1, ...clone(item) });
        return { count: state.incompleteCreate ? data.length - 1 : data.length };
      },
    },
    movimientoInventario: { createMany: async ({ data }) => {
      if (state.failMovement) { state.failMovement = false; throw Error("QA movement failure"); }
      state.movements.push(...clone(data)); return { count: data.length };
    } },
  });
  const db = {
    ...makeModels(),
    $executeRaw: async template => {
      state.schemaAttempts++;
      const sql = template.join("?"); state.sql.push({ sql });
      assert.match(sql, /CREATE TABLE IF NOT EXISTS "InventarioCargaSolicitud"/);
      assert.match(sql, /PRIMARY KEY \("usuarioId", "destino", "clave"\)/);
      if (state.failSchema) { state.failSchema = false; throw Error("QA schema failure"); }
      return 0;
    },
    $transaction: async fn => {
      // Serialize at row/advisory locks and restore all effects on rollback.
      const previous = queue; let release;
      queue = new Promise(resolve => { release = resolve; }); await previous;
      const saved = clone({ journal: state.journal, principal: state.principal, sedes: state.sedes, movements: state.movements });
      const tx = {
        ...makeModels(),
        $executeRaw: async (template, ...values) => {
          const sql = template.join("?"); state.sql.push({ sql, values });
          if (sql.includes("INSERT INTO")) {
            assert.match(sql, /ON CONFLICT \("usuarioId", "destino", "clave"\) DO NOTHING/);
            const [user, destination, key, solicitud] = values; const journalKey = `${user}:${destination}:${key}`;
            if (!state.journal.has(journalKey)) state.journal.set(journalKey, { solicitud, resultado: null });
          } else if (sql.includes("UPDATE")) {
            if (state.failResult) { state.failResult = false; throw Error("QA journal failure"); }
            const [encoded, user, destination, key] = values;
            state.journal.get(`${user}:${destination}:${key}`).resultado = JSON.parse(encoded);
          } else assert.fail(`Unexpected SQL ${sql}`);
          return 1;
        },
        $queryRaw: async (template, ...values) => {
          const sql = template.join("?"); state.sql.push({ sql, values });
          if (sql.includes("pg_advisory_xact_lock")) {
            assert.match(sql, /hashtextextended\(\?, 0\)/);
            assert.match(values[0], /^inventario-imei:\d{15}$/);
            return [{ pg_advisory_xact_lock: "" }];
          }
          assert.match(sql, /FOR UPDATE/);
          const entry = state.journal.get(`${values[0]}:${values[1]}:${values[2]}`);
          return entry ? [clone(entry)] : [];
        },
      };
      try { return await fn(tx); } catch (error) { Object.assign(state, saved); throw error; } finally { release(); }
    },
  };
  return { db, state };
}

function serverProbe({ user = ADMIN, database = databaseProbe(), activeReference = true } = {}) {
  const catalogState = { active: activeReference, name: "TECNO QA" };
  const dependencies = { "@/lib/prisma": { __esModule: true, default: database.db } };
  const registration = load("lib/inventory-intake-registration.ts", { ...dependencies, "@/lib/inventory-imeis": imeiHelpers });
  const imports = {
    ...dependencies,
    "next/server": { NextResponse },
    "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/access-control": access,
    "@/lib/product-types": productTypes,
    "@/lib/inventory-imeis": imeiHelpers,
    "@/lib/inventory-intake-registration": registration,
    "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: async () => {} },
    "@/lib/record-catalog-media": { enriquecerRegistrosConCatalogo: async entries => entries.map(entry => ({ ...entry, catalogoEquipo: { referencia: entry.referenciaEquipo, imagenUrl: "/qa-real.jpg", sistemaOperativo: "Android" } })) },
    "@/lib/inventory-references": {
      normalizarReferenciaInventario: value => String(value || "").trim().replace(/\s+/g, " "),
      buscarReferenciaInventarioActiva: async value => catalogState.active && value === "TECNO QA" ? { nombre: catalogState.name } : null,
    },
    "@/lib/sedes": { esSedeVentas: name => name === "VENTAS" },
    "@/lib/inventory-creditors": { nombreHistoricoAcreedor() {}, obtenerSaldoPendienteInventario() {}, resolverIdentidadesAcreedores() {} },
  };
  const principal = load("app/api/inventario-principal/route.ts", imports);
  const sede = load("app/api/inventario/route.ts", imports);
  const review = load("app/api/inventario/revisar/route.ts", imports);
  async function request(route, payload, { key = "qa-intake-request-1", headerKey = key, raw } = {}) {
    const result = await route.POST(new Request("http://qa.test/api/inventario", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": headerKey },
      body: raw === undefined ? JSON.stringify({ idempotencyKey: key, ...payload }) : raw,
    }));
    return { status: result.status, body: await result.json() };
  }
  const defaults = { imeis: [FIRST], referencia: "TECNO QA", tipoProducto: "TELEFONIA", color: "NEGRO", costo: 610000.25, numeroFactura: "QA-123", distribuidor: "COMUNICARIBE" };
  return {
    ...database,
    catalogState,
    principal: (values = {}, options) => request(principal, { ...defaults, ...values }, options),
    sede: (values = {}, options) => request(sede, { ...defaults, sedeId: user?.sedeId || 2, estadoFinanciero: "DEUDA", deboA: "Proveedor QA", ...values }, options),
    review: (values = {}, options) => request(review, { destino: "PRINCIPAL", imeis: [FIRST], ...values }, options),
    getPrincipal: () => principal.GET(),
  };
}

test("strict parser preserves leading zeros and rejects numeric or malformed IMEIs without repair", async () => {
  for (const imeis of [[351234567890123], ["3.51234567890123e14"], ["35A123456789012"], ["00123456789012"], ["0012345678901234"], [null], [""], [], [FIRST, FIRST]]) {
    const server = serverProbe(); const response = await server.principal({ imeis });
    assert.equal(response.status, 400, JSON.stringify(imeis));
    assert.equal(server.state.principal.length, 0); assert.equal(server.state.schemaAttempts, 0);
  }
  const server = serverProbe(); const result = await server.principal({ imeis: [FIRST, SECOND] });
  assert.equal(result.status, 200); assert.equal(result.body.insertados, 2);
  assert.equal(server.state.principal[0].imei, FIRST); assert.equal(server.state.principal[0].costo, 610000.25);
  assert.equal(server.state.movements.length, 2); assert.equal(server.state.movements[0].tipoMovimiento, "INGRESO_PRINCIPAL");
  assert.equal(server.state.movements[0].imei, FIRST); assert.equal(server.state.journal.size, 1);
});

test("review classifies invalid, in-batch duplicate and existing IMEIs from both inventories", async () => {
  const server = serverProbe(); server.state.principal.push({ imei: SECOND }); server.state.sedes.push({ imei: THIRD, sedeId: 3 });
  const response = await server.review({ imeis: [FIRST, FIRST, SECOND, THIRD, "bad", 301234567890123] });
  assert.equal(response.status, 200); assert.deepEqual(response.body.imeisValidos, [FIRST]);
  assert.deepEqual(response.body.entradas.map(entry => entry.estado), ["VALIDO", "REPETIDO", "EXISTENTE", "EXISTENTE", "INCORRECTO", "INCORRECTO"]);
  assert.equal(response.body.detectados, 6); assert.equal(response.body.validos, 1);
  assert.equal(response.body.existentes, 2); assert.equal(response.body.repetidos, 1); assert.equal(response.body.incorrectos, 2);
  assert.ok(!JSON.stringify(response.body).includes("SEDE 3"));
  assert.equal(server.state.schemaAttempts, 0); assert.equal(server.state.movements.length, 0);
});

test("principal review and registration enforce ADMIN/AUDITOR; sede intake enforces operational profile and own sede", async () => {
  for (const user of [null, SUPERVISOR]) {
    const server = serverProbe({ user });
    assert.equal((await server.principal()).status, user ? 403 : 401);
    assert.equal((await server.review()).status, user ? 403 : 401);
    assert.equal(server.state.principal.length, 0);
  }
  for (const perfilTipo of ["VENDEDOR", "APOYO_OPERATIVO", "FACTURADOR"]) {
    const server = serverProbe({ user: { ...SUPERVISOR, perfilTipo } });
    assert.equal((await server.sede()).status, 403);
    assert.equal((await server.review({ destino: "SEDE" })).status, 403);
  }
  const server = serverProbe({ user: SUPERVISOR });
  assert.equal((await server.sede({ sedeId: 3 })).status, 403);
  assert.equal((await server.review({ destino: "SEDE", sedeId: 3 })).status, 403);
  const own = await server.sede(); assert.equal(own.status, 200); assert.equal(own.body.item.sedeId, 2);
  assert.equal(server.state.movements[0].tipoMovimiento, "INGRESO_SEDE");
  assert.equal(server.state.sedes[0].origen, "MANUAL"); assert.equal(server.state.sedes[0].deboA, "Proveedor QA");
  const auditor = serverProbe({ user: { ...ADMIN, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" } });
  assert.equal((await auditor.principal()).status, 200);
});

test("validates commercial requirements, positive finite cost, sede existence and VENTAS restriction", async () => {
  for (const values of [{ referencia: "" }, { costo: 0 }, { costo: -1 }, { costo: "Infinity" }, { costo: true }, { numeroFactura: "" }, { distribuidor: "" }]) {
    const server = serverProbe(); assert.equal((await server.principal(values)).status, 400);
    assert.equal(server.state.principal.length, 0);
  }
  assert.equal((await serverProbe({ activeReference: false }).principal()).status, 400);
  for (const values of [{ sedeId: 50 }, { sedeId: 4 }, { sedeId: 0 }, { sedeId: true }, { sedeId: 1.5 }, { estadoFinanciero: "" }, { deboA: "" }]) {
    const server = serverProbe(); assert.equal((await server.sede(values)).status, 400);
    assert.equal(server.state.sedes.length, 0);
  }
  assert.equal((await serverProbe().sede({ estadoFinanciero: "PAGO", deboA: null })).status, 200);
});

test("existing inventory rejects the whole batch and never silently succeeds for unsaved entries", async () => {
  for (const kind of ["principal", "sedes"]) {
    const server = serverProbe(); server.state[kind].push({ imei: SECOND, sedeId: 3 });
    const result = await server.principal({ imeis: [FIRST, SECOND] });
    assert.equal(result.status, 409); assert.equal(result.body.codigo, "INVENTARIO_MODIFICADO");
    assert.match(result.body.error, /No se guardó ningún equipo/);
    assert.equal(server.state.principal.filter(item => item.imei === FIRST).length, 0);
    assert.equal(server.state.journal.size, 0); assert.equal(server.state.movements.length, 0);
  }
  const server = serverProbe({ user: SUPERVISOR }); server.state.principal.push({ imei: FIRST });
  assert.equal((await server.sede()).status, 409); assert.equal(server.state.sedes.length, 0);
});

test("concurrent identical retries create one inventory batch and one trace per IMEI", async () => {
  const server = serverProbe();
  const results = await Promise.all(Array.from({ length: 8 }, () => server.principal({ imeis: [FIRST, SECOND] })));
  assert.ok(results.every(result => result.status === 200 && result.body.insertados === 2));
  assert.equal(results.filter(result => !result.body.replayed).length, 1);
  assert.equal(server.state.principal.length, 2); assert.equal(server.state.movements.length, 2);
  assert.equal(server.state.schemaAttempts, 1);
  const restarted = serverProbe({ database: server });
  assert.equal((await restarted.principal({ imeis: [FIRST, SECOND] })).body.replayed, true);
  assert.equal(server.state.principal.length, 2);
});

test("a lost successful response can replay after the reference is hidden or renamed", async () => {
  const server = serverProbe(); const first = await server.principal();
  assert.equal(first.status, 200); server.catalogState.active = false;
  const hiddenReplay = await server.principal();
  assert.equal(hiddenReplay.status, 200); assert.equal(hiddenReplay.body.replayed, true);
  assert.equal(hiddenReplay.body.insertados, first.body.insertados);
  server.catalogState.active = true; server.catalogState.name = "TECNO RENAMED";
  const renamedReplay = await server.principal();
  assert.equal(renamedReplay.status, 200); assert.equal(renamedReplay.body.replayed, true);
  assert.equal(server.state.principal[0].referencia, "TECNO QA");
  assert.equal(server.state.principal.length, 1); assert.equal(server.state.movements.length, 1);
  server.catalogState.active = false;
  assert.equal((await server.principal({ imeis: [SECOND] }, { key: "qa-new-hidden-reference" })).status, 400);
  assert.equal(server.state.principal.length, 1);
});

test("overlapping principal and sede intakes cannot both register the same IMEI, including different request keys", async () => {
  const first = serverProbe(); const second = serverProbe({ user: SUPERVISOR, database: first });
  const results = await Promise.all([first.principal({}, { key: "qa-principal-concurrent" }), second.sede({}, { key: "qa-sede-concurrent" })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(first.state.principal.length + first.state.sedes.length, 1); assert.equal(first.state.movements.length, 1);
  const locked = first.state.sql.filter(call => call.sql.includes("pg_advisory_xact_lock"));
  assert.equal(locked.length, 2); assert.equal(locked[0].values[0], locked[1].values[0]);
});

test("locks IMEIs in deterministic order and rejects changed payload reuse without writing", async () => {
  const server = serverProbe(); await server.principal({ imeis: [SECOND, FIRST] });
  const locks = server.state.sql.filter(call => call.sql.includes("pg_advisory_xact_lock"));
  assert.deepEqual(locks.map(call => call.values[0]), [`inventario-imei:${FIRST}`, `inventario-imei:${SECOND}`]);
  for (const values of [{ costo: 610001 }, { numeroFactura: "DIFFERENT" }, { color: "AZUL" }, { imeis: [THIRD] }]) {
    const result = await server.principal(values); assert.equal(result.status, 409); assert.equal(result.body.codigo, "IDEMPOTENCIA_CONFLICTO");
  }
  assert.equal(server.state.principal.length, 2); assert.equal(server.state.movements.length, 2);
});

test("rolls back inventory, movements and journal together if any save step fails", async () => {
  for (const flag of ["failMovement", "failResult", "incompleteCreate"]) {
    const server = serverProbe(); server.state[flag] = true;
    assert.equal((await server.principal()).status, 500);
    assert.equal(server.state.principal.length, 0); assert.equal(server.state.movements.length, 0); assert.equal(server.state.journal.size, 0);
    server.state[flag] = false;
    assert.equal((await server.principal()).status, 200); assert.equal((await server.principal()).body.replayed, true);
    assert.equal(server.state.principal.length, 1); assert.equal(server.state.movements.length, 1);
  }
});

test("validates request JSON and idempotency key before any inventory writes; schema initialization can retry", async () => {
  for (const raw of ["{", "null", "[]", "5"]) assert.equal((await serverProbe().principal({}, { raw })).status, 400);
  for (const key of ["", "short", "key with spaces", "a".repeat(161)]) {
    const server = serverProbe(); assert.equal((await server.principal({}, { key })).status, 400); assert.equal(server.state.schemaAttempts, 0);
  }
  assert.equal((await serverProbe().principal({}, { key: "qa-body-key", headerKey: "qa-other-key" })).status, 409);
  assert.equal((await serverProbe().principal({}, { headerKey: "" })).status, 200);
  const server = serverProbe(); server.state.failSchema = true;
  assert.equal((await server.principal()).status, 500); assert.equal(server.state.principal.length, 0);
  assert.equal((await server.principal()).status, 200); assert.equal(server.state.schemaAttempts, 2);
});

test("principal GET keeps its array contract and enriches optional catalog media only after access control", async () => {
  const server = serverProbe(); await server.principal();
  const response = await server.getPrincipal(); const items = await response.json();
  assert.equal(response.status, 200); assert.equal(items[0].imei, FIRST);
  assert.equal(items[0].catalogoEquipo.imagenUrl, "/qa-real.jpg"); assert.equal(items[0].referenciaEquipo, undefined);
  assert.equal((await serverProbe({ user: SUPERVISOR }).getPrincipal()).status, 403);
});
