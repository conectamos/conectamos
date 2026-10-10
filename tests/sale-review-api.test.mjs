import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
function load(path, imports = {}) {
  const source = readFileSync(`${ROOT}${path}`, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "console", output)(name => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {} });
  return loaded.exports;
}
class NextResponse extends Response {
  static json(body, options = {}) {
    return new NextResponse(JSON.stringify(body), { ...options, headers: { "Content-Type": "application/json" } });
  }
}
const access = load("lib/access-control.ts");
const financieras = load("lib/ventas-financieras.ts");
const IMEI = "001234567890123";
const REVISION = "2026-10-10T02:30:00.000Z";
const ADMIN = { id: 7, nombre: "Administrador QA", rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR", sedeId: 1, sedeNombre: "BODEGA PRINCIPAL" };
const SEDE = { id: 8, nombre: "Sede QA", rolNombre: "SEDE", perfilTipo: "SUPERVISOR_TIENDA", sedeId: 2, sedeNombre: "SEDE 2" };
const clone = value => structuredClone(value);
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(condition => matches(row, condition));
    if (value && typeof value === "object" && "equals" in value) {
      return String(row[key]).toUpperCase() === String(value.equals).toUpperCase();
    }
    return row[key] === value;
  });
}
function databaseProbe() {
  const state = {
    records: [{ id: 61, sedeId: 2, sede: { nombre: "SEDE 2" }, puntoVenta: "SEDE 2", serialImei: IMEI,
      eliminadoEn: null, ventaIdRelacionada: null, estadoVentaRegistro: "PENDIENTE", updatedAt: new Date(REVISION), referenciaEquipo: "INFINIX QA",
      asesorNombre: "Cerrador del registro", jaladorNombre: "Jalador del registro", plataformaCredito: "PAYJOY",
      creditoAutorizado: 1450583.5, cuotaInicial: 250000.5, medioPago1Tipo: "TRANSFERENCIA", medioPago1Valor: 250000.5,
      medioPago2Tipo: null, medioPago2Valor: null, financierasDetalle: [], telefono: "3001234567", whatsapp: "3007654321" }],
    inventory: [{ id: 81, imei: IMEI, sedeId: 2, sede: { nombre: "SEDE 2" }, referencia: "INFINIX QA", color: "Plata",
      costo: 1350000.35, estadoActual: "BODEGA", estadoFinanciero: "DEUDA", origen: "PRESTAMO" }],
    sales: [], movements: [], loans: [], log: [], failMovement: false, onInventoryLock: null, onRecordLock: null,
  };
  let queue = Promise.resolve();
  const models = transactional => {
    const find = key => async ({ where = {}, orderBy } = {}) => {
      state.log.push(`${transactional ? "tx" : "outside"}:${key}:read`);
      const rows = state[key].filter(row => matches(row, where));
      if (orderBy?.id === "desc") rows.sort((a, b) => b.id - a.id);
      return clone(rows);
    };
    return {
      registroVendedorVenta: {
        findFirst: async args => (await find("records")(args))[0] || null,
        findMany: find("records"),
        update: async ({ where, data }) => { Object.assign(state.records.find(row => matches(row, where)), clone(data)); },
      },
      inventarioSede: {
        findFirst: async args => (await find("inventory")(args))[0] || null,
        findMany: find("inventory"),
        update: async ({ where, data }) => { Object.assign(state.inventory.find(row => matches(row, where)), clone(data)); },
      },
      inventarioPrincipal: { findUnique: async () => null },
      prestamoSede: { findFirst: async args => (await find("loans")(args))[0] || null },
      venta: {
        findFirst: async args => (await find("sales")(args))[0] || null,
        create: async ({ data }) => {
          state.log.push("tx:sales:create");
          const row = { id: state.sales.length + 1, ...clone(data) }; state.sales.push(row);
          return { id: row.id, idVenta: row.idVenta };
        },
      },
      movimientoInventario: { create: async ({ data }) => {
        if (state.failMovement) throw Error("QA inventory movement failure");
        state.movements.push(clone(data));
      } },
    };
  };
  const db = {
    ...models(false),
    $transaction: async (callback, options) => {
      assert.ok(options.timeout >= 10000);
      const previous = queue; let release;
      queue = new Promise(resolve => { release = resolve; }); await previous;
      const before = clone({ records: state.records, inventory: state.inventory, sales: state.sales, movements: state.movements });
      const tx = { ...models(true), $queryRaw: async (template, ...values) => {
        const sql = template.join("?"); state.log.push({ sql, values });
        if (sql.includes("pg_advisory_xact_lock")) {
          assert.match(sql, /hashtextextended\(\?, 0\)/);
          assert.match(values[0], /^venta-imei:\d{15}$/);
        } else if (sql.includes('"InventarioSede"')) {
          assert.match(sql, /FOR UPDATE/); assert.match(values[0], /^\d{15}$/); assert.ok(Number.isInteger(values[1]));
          state.onInventoryLock?.(state);
        } else {
          assert.match(sql, /"RegistroVendedorVenta"/); assert.match(sql, /FOR UPDATE/);
          state.onRecordLock?.(state);
        }
        return [];
      } };
      try { return await callback(tx); } catch (error) { Object.assign(state, before); throw error; } finally { release(); }
    },
  };
  return { db, state };
}
function serverProbe({ user = ADMIN, database = databaseProbe() } = {}) {
  const imports = {
    "next/server": { NextResponse },
    "@/app/generated/prisma/client": { Prisma: { JsonNull: null } },
    "@/lib/prisma": { __esModule: true, default: database.db },
    "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/access-control": access,
    "@/lib/ventas-financieras": financieras,
    "@/lib/ventas-personal": { obtenerCatalogoPersonalVenta: async () => ({ financieras: [
      { id: 1, nombre: "PAYJOY", aplicaIntermediacion: false },
      { id: 2, nombre: "ADDI", aplicaIntermediacion: true, porcentajeIntermediacion: 8 },
    ] }) },
    "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: async () => {} },
    "@/lib/siigo": {}, "@/lib/siigo-attempt": {},
  };
  const route = load("app/api/ventas/route.ts", imports);
  const lookup = load("app/api/ventas/buscar-imei/route.ts", imports);
  const payload = { registroVendedorId: 61, serial: IMEI, servicio: "FINANCIERA", descripcion: "INFINIX QA", jalador: "Jalador QA",
    cerrador: "Cerrador QA", ingreso1Base: 100000.25, tipoIngreso1: "EFECTIVO", ingreso2Base: 20000.5, tipoIngreso2: "VOUCHER",
    comision: 10000.1, salida: 5000.2, fin1Nombre: "PAYJOY", fin1Valor: 1450583.5, fin2Nombre: "ADDI", fin2Valor: 100000.25,
    confirmoEfectivoRecibido: true, confirmoTransferenciaValidada: true };
  const request = async (handler, values) => {
    const result = await handler(new Request("http://qa.test/api/ventas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }));
    return { status: result.status, body: await result.json() };
  };
  return { ...database, approve: (values = {}) => request(route.POST, { ...payload, ...values }), lookup: (values = {}) => request(lookup.POST, { serial: IMEI, registroVendedorId: 61, ...values }) };
}

test("server recalculates the existing voucher, finance, commission and cash formulas using current inventory cost", async () => {
  const server = serverProbe();
  const result = await server.approve({ costoEquipo: 1, utilidad: 999999999, cajaOficina: 999999999 });
  assert.equal(result.status, 200); assert.equal(result.body.ok, true);
  const sale = server.state.sales[0];
  assert.equal(sale.serial, IMEI); assert.equal(sale.sedeId, 2); assert.equal(sale.inventarioSedeId, 81);
  assert.equal(sale.primerValor, 100000.25); assert.ok(Math.abs(sale.segundoValor - 19000.475) < 0.00001);
  assert.ok(Math.abs(sale.ingreso - 119000.725) < 0.00001);
  assert.ok(Math.abs(sale.utilidad - 296583.805) < 0.00001);
  assert.ok(Math.abs(sale.cajaOficina - 104000.425) < 0.00001);
  assert.equal(sale.financierasDetalle.length, 2); assert.equal(sale.addi, 100000.25);
  assert.equal(sale.financierasDetalle[1].valorNeto, 92000.23);
  assert.equal(server.state.inventory[0].estadoActual, "VENDIDO"); assert.equal(server.state.movements.length, 1);
  assert.equal(server.state.records[0].ventaIdRelacionada, sale.id);
  assert.equal(server.state.records[0].estadoVentaRegistro, "CONVERTIDO_EN_VENTA");
  assert.ok(!server.state.log.some(entry => typeof entry === "string" && entry.startsWith("outside:")), "approval preconditions must be read inside the locked transaction");
  const log = server.state.log;
  assert.ok(log.findIndex(entry => entry.sql?.includes('"RegistroVendedorVenta"')) < log.indexOf("tx:records:read"));
  assert.ok(log.findIndex(entry => entry.sql?.includes('"InventarioSede"')) < log.indexOf("tx:inventory:read"));
});

test("a retry and simultaneous approval create only one sale, one movement and one conversion", async () => {
  const server = serverProbe();
  const concurrent = await Promise.all([server.approve(), server.approve()]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
  assert.equal((await server.approve()).status, 409);
  assert.equal(server.state.sales.length, 1); assert.equal(server.state.movements.length, 1);
});

test("different records cannot sell the same IMEI twice, even with duplicate historical stock in another sede", async () => {
  const server = serverProbe();
  server.state.records.push({ ...clone(server.state.records[0]), id: 62, sedeId: 3 });
  server.state.inventory.push({ ...clone(server.state.inventory[0]), id: 82, sedeId: 3 });
  const results = await Promise.all([server.approve(), server.approve({ registroVendedorId: 62 })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(server.state.sales.length, 1); assert.equal(server.state.movements.length, 1);
  assert.equal(server.state.records.filter(record => record.ventaIdRelacionada).length, 1);
});

test("the same record cannot be approved twice using two different admin-selected IMEIs", async () => {
  const server = serverProbe(); const second = "101234567890123";
  server.state.inventory.push({ ...clone(server.state.inventory[0]), id: 82, imei: second });
  const results = await Promise.all([server.approve(), server.approve({ serial: second })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(server.state.sales.length, 1); assert.equal(server.state.movements.length, 1);
  const locks = server.state.log.filter(entry => entry.sql?.includes('"RegistroVendedorVenta"'));
  assert.equal(locks.length, 2); assert.deepEqual(locks.map(entry => entry.values), [[61], [61]]);
});

test("a matching record revision and expected cost approve normally, while malformed concurrency metadata is rejected", async () => {
  const valid = serverProbe();
  assert.equal((await valid.approve({ registroRevision: REVISION, costoEquipoEsperado: 1350000.35 })).status, 200);
  for (const registroRevision of [null, 1, "", "wrong", "2026-10-10T02:30:00Z", "2026-02-31T02:30:00.000Z"]) {
    const server = serverProbe(); assert.equal((await server.approve({ registroRevision })).status, 400);
    assert.equal(server.state.sales.length, 0); assert.equal(server.state.log.length, 0);
  }
  for (const costoEquipoEsperado of [null, true, "", -1, "Infinity", "wrong"]) {
    const server = serverProbe(); assert.equal((await server.approve({ costoEquipoEsperado })).status, 400);
    assert.equal(server.state.sales.length, 0); assert.equal(server.state.log.length, 0);
  }
});

test("record changes are detected under the record lock for admin and sede without overwriting or approving the draft", async () => {
  for (const user of [ADMIN, SEDE]) {
    const server = serverProbe({ user });
    server.state.onRecordLock = state => {
      state.records[0].updatedAt = new Date("2026-10-10T02:31:00.000Z");
      state.records[0].medioPago1Valor = 500000;
    };
    const changed = await server.approve({ registroRevision: REVISION });
    assert.equal(changed.status, 409); assert.equal(changed.body.code, "REGISTRO_CAMBIO");
    assert.equal(server.state.sales.length, 0); assert.equal(server.state.movements.length, 0);
    assert.equal(server.state.inventory[0].estadoActual, "BODEGA"); assert.equal(server.state.records[0].ventaIdRelacionada, null);
  }
});

test("cost changes between lookup and the locked approval are rejected atomically without accounting effects", async () => {
  const server = serverProbe();
  server.state.onInventoryLock = state => { state.inventory[0].costo = 1450000.35; };
  const changed = await server.approve({ registroRevision: REVISION, costoEquipoEsperado: 1350000.35 });
  assert.equal(changed.status, 409); assert.equal(changed.body.code, "COSTO_CAMBIO");
  assert.equal(server.state.sales.length, 0); assert.equal(server.state.movements.length, 0);
  assert.equal(server.state.inventory[0].estadoActual, "BODEGA"); assert.equal(server.state.records[0].ventaIdRelacionada, null);
  server.state.onInventoryLock = null;
  assert.equal((await server.approve({ registroRevision: REVISION, costoEquipoEsperado: 1450000.35 })).status, 200);
  assert.equal(server.state.sales.length, 1); assert.equal(server.state.movements.length, 1);
});

test("a failed movement rolls back the sale, stock and record, then permits a single successful retry", async () => {
  const server = serverProbe(); server.state.failMovement = true;
  assert.equal((await server.approve()).status, 500);
  assert.equal(server.state.sales.length, 0); assert.equal(server.state.movements.length, 0);
  assert.equal(server.state.inventory[0].estadoActual, "BODEGA"); assert.equal(server.state.records[0].ventaIdRelacionada, null);
  server.state.failMovement = false; assert.equal((await server.approve()).status, 200);
  assert.equal(server.state.sales.length, 1); assert.equal(server.state.movements.length, 1);
});

test("sale approval rejects numeric, malformed, truncated and scientific-notation IMEIs without repairing them", async () => {
  for (const serial of [123456789012345, "00123456789012", "0012345678901234", "00A234567890123", "1.23456789012345e14", null]) {
    const server = serverProbe();
    assert.equal((await server.approve({ serial })).status, 400, String(serial));
    assert.equal(server.state.sales.length, 0); assert.equal(server.state.log.length, 0);
  }
});

test("server rejects invalid money and missing receipt confirmations", async () => {
  for (const values of [{ ingreso1Base: -1 }, { ingreso1Base: "" }, { ingreso1Base: null }, { ingreso1Base: "invalid" }, { ingreso2Base: -1 }, { ingreso2Base: 10, tipoIngreso2: "" },
    { comision: -1 }, { salida: "Infinity" }, { fin1Valor: -1 }, { fin1Nombre: "", fin1Valor: 100 }, { confirmoEfectivoRecibido: false },
    { ingreso1Base: 10, tipoIngreso1: "TRANSFERENCIA", confirmoTransferenciaValidada: false }]) {
    const server = serverProbe(); assert.equal((await server.approve(values)).status, 400, JSON.stringify(values));
    assert.equal(server.state.sales.length, 0); assert.equal(server.state.movements.length, 0);
  }
  const zero = serverProbe(); assert.equal((await zero.approve({ ingreso1Base: 0 })).status, 200);
  const missing = serverProbe({ user: SEDE });
  Object.assign(missing.state.records[0], { medioPago1Valor: null, cuotaInicial: null });
  assert.equal((await missing.approve({ ingreso1Base: 999999 })).status, 400);
});

test("sede permissions and readonly financial values are enforced by the server, including every registered financiera", async () => {
  const server = serverProbe({ user: SEDE });
  const all = ["PAYJOY", "ADDI", "SISTECREDITO", "ALCANOS", "FINSER PAY"].map((name, index) => ({ plataformaCredito: name, creditoAutorizado: 100000.25 + index }));
  server.state.records[0].financierasDetalle = all;
  const result = await server.approve({ servicio: "CONTADO", descripcion: "Alterado", cerrador: "Otro cerrador", ingreso1Base: 999999,
    tipoIngreso1: "EFECTIVO", fin1Valor: 999999, financierasDetalle: [{ nombre: "ADDI", valor: 1 }] });
  assert.equal(result.status, 200);
  const sale = server.state.sales[0];
  assert.equal(sale.servicio, "FINANCIERA"); assert.equal(sale.descripcion, "INFINIX QA"); assert.equal(sale.cerrador, "Cerrador del registro");
  assert.equal(sale.ingreso, 250000.5); assert.equal(sale.primerValor, 250000.5); assert.equal(sale.ingreso1, "TRANSFERENCIA");
  assert.equal(sale.financierasDetalle.length, 5); assert.equal(sale.financierasDetalle[4].nombre, "FINSER PAY");
  assert.equal(sale.financierasDetalle[4].valorBruto, 100004.25); assert.ok(Math.abs(sale.cajaOficina + 15000.3) < 0.00001);
  const denied = serverProbe({ user: { ...SEDE, sedeId: 3, sedeNombre: "SEDE 3" } });
  assert.equal((await denied.approve()).status, 409); assert.equal(denied.state.sales.length, 0);
  const vendedor = serverProbe({ user: { ...SEDE, perfilTipo: "VENDEDOR" } });
  assert.equal((await vendedor.approve()).status, 403); assert.equal(vendedor.state.log.length, 0);
  assert.equal((await serverProbe({ user: null }).approve()).status, 401);
});

test("admin array payload preserves all financieras instead of silently limiting them to four", async () => {
  const server = serverProbe();
  const all = ["PAYJOY", "ADDI", "SISTECREDITO", "ALCANOS", "FINSER PAY"].map((nombre, index) => ({ nombre, valor: 100000.25 + index }));
  assert.equal((await server.approve({ financierasDetalle: all })).status, 200);
  assert.equal(server.state.sales[0].financierasDetalle.length, 5);
  assert.equal(server.state.sales[0].financierasDetalle[4].valorBruto, 100004.25);
});

test("one registered financiera and an explicitly zero initial remain valid; contado still excludes hidden financieras", async () => {
  const one = serverProbe({ user: SEDE });
  Object.assign(one.state.records[0], { cuotaInicial: 0, medioPago1Valor: 0 });
  assert.equal((await one.approve()).status, 200);
  assert.equal(one.state.sales[0].financierasDetalle.length, 1);
  assert.equal(one.state.sales[0].ingreso, 0); assert.equal(one.state.sales[0].payjoy, 1450583.5);
  const contado = serverProbe();
  assert.equal((await contado.approve({ servicio: "CONTADO", fin1Valor: 999999999 })).status, 200);
  assert.equal(contado.state.sales[0].financierasDetalle, null); assert.equal(contado.state.sales[0].payjoy, null);
  assert.ok(Math.abs(contado.state.sales[0].utilidad + 1245999.925) < 0.00001);
});

test("current record and availability are revalidated after locks; cancelled, sold, missing and return-pending stock cannot be approved", async () => {
  const cases = [
    state => { state.records[0].estadoVentaRegistro = "CANCELADO"; },
    state => { state.records[0].eliminadoEn = new Date(); },
    state => { state.inventory[0].estadoActual = "VENDIDO"; },
    state => { state.inventory[0].sedeId = 3; },
    state => { state.loans.push({ id: 1, imei: IMEI, estado: "DEVOLUCION_PENDIENTE" }); },
    state => { state.sales.push({ id: 1, serial: IMEI }); },
  ];
  for (const arrange of cases) {
    const server = serverProbe(); arrange(server.state);
    const before = server.state.sales.length;
    const result = await server.approve(); assert.ok([400, 404, 409].includes(result.status));
    assert.equal(server.state.sales.length, before); assert.equal(server.state.movements.length, 0);
  }
  const moved = serverProbe(); moved.state.onInventoryLock = state => { state.inventory[0].estadoActual = "TRASLADO"; };
  assert.equal((await moved.approve()).status, 400); assert.equal(moved.state.sales.length, 0);
  const cost = serverProbe(); cost.state.onInventoryLock = state => { state.inventory[0].costo += 100000; };
  assert.equal((await cost.approve()).status, 200); assert.ok(Math.abs(cost.state.sales[0].utilidad - 196583.805) < 0.00001);
});

test("lookup reports actual sede, full IMEI and telephone and refuses closed, return-pending and previously sold records", async () => {
  const server = serverProbe();
  const found = await server.lookup(); assert.equal(found.status, 200);
  assert.equal(found.body.imei, IMEI); assert.equal(found.body.sedeId, 2); assert.equal(found.body.sedeNombre, "SEDE 2");
  assert.equal(found.body.estadoActual, "BODEGA"); assert.equal(found.body.registroVenta.telefono, "3001234567");
  assert.equal(found.body.registroVenta.updatedAt, REVISION);
  for (const arrange of [state => { state.records[0].estadoVentaRegistro = "CANCELADO"; },
    state => { state.records[0].ventaIdRelacionada = 1; }, state => { state.loans.push({ id: 1, imei: IMEI, estado: "DEVOLUCION_PENDIENTE" }); },
    state => { state.sales.push({ id: 1, serial: IMEI }); }]) {
    const blocked = serverProbe(); arrange(blocked.state); assert.ok([400, 409].includes((await blocked.lookup()).status));
  }
  assert.equal((await server.lookup({ serial: 123456789012345 })).status, 400);
  const foreign = serverProbe({ user: { ...SEDE, sedeId: 3, sedeNombre: "SEDE 3" } });
  assert.equal((await foreign.lookup()).status, 409);
  const undisclosed = await foreign.lookup({ registroVendedorId: null });
  assert.equal(undisclosed.status, 404); assert.equal(undisclosed.body.costo, undefined);
});
