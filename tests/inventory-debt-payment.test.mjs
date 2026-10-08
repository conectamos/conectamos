import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const paymentSource = process.env.INVENTORY_DEBT_TEST_SOURCE || "app/api/inventario/pagar-deuda/route.ts";
const baseline = Boolean(process.env.INVENTORY_DEBT_TEST_SOURCE);

function load(path, imports = {}) {
  const javascript = ts.transpileModule(readFileSync(join(ROOT, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", "console", javascript)((name) => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, testModule, testModule.exports, { error() {} });
  return testModule.exports;
}

const prestamos = load("lib/prestamos.ts");
const access = load("lib/access-control.ts");
const admin = { id: 7, sedeId: 1, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
const equipo = {
  id: 10, imei: "000000000000010", referencia: "Equipo real", color: "NEGRO", costo: 123_456.75,
  sedeId: 1, sede: { id: 1, nombre: "SEDE 1" }, estadoActual: "BODEGA", estadoAnterior: null,
  estadoFinanciero: "DEUDA", deboA: "Proveedor Finser", origen: "MANUAL", inventarioPrincipalId: null,
};
const responseMock = { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status ?? 200, headers: { "Content-Type": "application/json" } }) } };
const copy = (value) => structuredClone(value);

function matches(record, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(record[key]);
      if ("equals" in value) return value.mode === "insensitive"
        ? String(record[key]).toLowerCase() === String(value.equals).toLowerCase() : record[key] === value.equals;
    }
    return record[key] === value;
  });
}

// An unlocked transaction is deliberately allowed to interleave. Only the
// route's actual SELECT FOR UPDATE acquires the per-record lock, so this probe
// detects the original duplicate-payment race instead of hiding it in a mutex.
function database(options = {}) {
  const state = {
    items: copy(options.items ?? [equipo]), loans: copy(options.loans ?? []), cash: [], history: [],
    siteCash: copy(options.siteCash ?? []), principal: copy(options.principal ?? []),
    sedes: copy(options.sedes ?? [{ id: 1, nombre: "SEDE 1" }, { id: 2, nombre: "SEDE 2" }, { id: 99, nombre: "BODEGA PRINCIPAL" }]),
  };
  const calls = [];
  const locks = new Map();
  let nextId = 100;
  let txNumber = 0;
  let beforeLockApplied = false;

  async function lock(id) {
    const previous = locks.get(id) ?? Promise.resolve();
    let release;
    const tail = new Promise((done) => { release = done; });
    locks.set(id, previous.then(() => tail));
    await previous;
    return release;
  }

  function client(transaction) {
    const data = () => transaction ? (transaction.draft ??= copy(state)) : state;
    const read = (name, args, fn) => {
      calls.push({ name, transaction: transaction?.id ?? null, args: copy(args) });
      return Promise.resolve(copy(fn(data())));
    };
    const write = async (name, args, fn) => {
      assert.ok(transaction, `Escritura fuera de transacción: ${name}`);
      calls.push({ name, transaction: transaction.id, args: copy(args), write: true });
      if (options.failWrite === name) {
        if (options.failOnce) options.failWrite = null;
        throw new Error("Fallo simulado de persistencia");
      }
      const result = fn(data());
      transaction.operations.push(fn);
      await Promise.resolve();
      return copy(result);
    };
    const update = (collection, args) => (target) => {
      const row = target[collection].find((entry) => matches(entry, args.where));
      assert.ok(row, `Registro no encontrado para actualizar ${collection}`);
      Object.assign(row, copy(args.data));
      return row;
    };
    const updateMany = (collection, args) => (target) => {
      const rows = target[collection].filter((entry) => matches(entry, args.where));
      rows.forEach((row) => Object.assign(row, copy(args.data)));
      return { count: rows.length };
    };
    const create = (collection, args) => {
      const row = { id: nextId++, ...copy(args.data) };
      return (target) => { target[collection].push(copy(row)); return row; };
    };
    return {
      async $queryRaw(strings, ...values) {
        assert.ok(transaction);
        assert.match(strings.join("?"), /SELECT "id" FROM "InventarioSede".*FOR UPDATE/s);
        const id = values[0];
        if (!beforeLockApplied && options.beforeLock) {
          beforeLockApplied = true;
          options.beforeLock(state);
        }
        const release = await lock(id);
        transaction.releases.push(release);
        transaction.draft = copy(state);
        calls.push({ name: "lock", transaction: transaction.id, id });
        return state.items.some((item) => item.id === id) ? [{ id }] : [];
      },
      inventarioSede: {
        findUnique: (args) => read("inventory-read", args, (target) => target.items.find((item) => matches(item, args.where)) ?? null),
        findMany: (args) => read("inventory-list", args, (target) => target.items.filter((item) => matches(item, args.where))),
        update: (args) => write("inventory-update", args, update("items", args)),
        delete: (args) => write("inventory-delete", args, (target) => {
          const row = target.items.find((item) => matches(item, args.where));
          target.items = target.items.filter((item) => !matches(item, args.where));
          return row;
        }),
        deleteMany: (args) => write("inventory-delete-many", args, (target) => {
          const rows = target.items.filter((item) => matches(item, args.where));
          target.items = target.items.filter((item) => !matches(item, args.where));
          return { count: rows.length };
        }),
      },
      sede: {
        findFirst: (args) => read("sede-read", args, (target) => target.sedes.find((sede) => matches(sede, args.where)) ?? null),
        findMany: (args) => read("sede-list", args, (target) => target.sedes.filter((sede) => matches(sede, args.where))),
      },
      inventarioPrincipal: {
        findUnique: (args) => read("principal-read", args, (target) => target.principal.find((item) => matches(item, args.where)) ?? null),
        updateMany: (args) => write("principal-update-many", args, updateMany("principal", args)),
      },
      prestamoSede: {
        findMany: (args) => read("loan-read", args, (target) => target.loans.filter((loan) => matches(loan, args.where))),
        update: (args) => write("loan-update", args, update("loans", args)),
        updateMany: (args) => write("loan-update-many", args, updateMany("loans", args)),
        create: (args) => write("loan-create", args, create("loans", args)),
      },
      movimientoCajaSede: {
        findFirst: (args) => read("site-cash-read", args, (target) => target.siteCash.find((movement) => matches(movement, args.where)) ?? null),
        update: (args) => write("site-cash-update", args, update("siteCash", args)),
        updateMany: (args) => write("site-cash-update-many", args, updateMany("siteCash", args)),
        create: (args) => write("site-cash-create", args, create("siteCash", args)),
      },
      cajaMovimiento: { create: (args) => write("cash-create", args, create("cash", args)) },
      movimientoInventario: { create: (args) => write("history-create", args, create("history", args)) },
    };
  }

  const prisma = client(null);
  prisma.$transaction = async (callback, config) => {
    const transaction = { id: ++txNumber, draft: null, operations: [], releases: [] };
    calls.push({ name: "transaction", config });
    try {
      const result = await callback(client(transaction));
      transaction.operations.forEach((operation) => operation(state));
      return result;
    } finally {
      transaction.releases.forEach((release) => release());
    }
  };
  return { state, calls, prisma };
}

function paymentProbe(options = {}, user = admin) {
  const db = database(options);
  const { POST } = load(paymentSource, {
    "next/server": responseMock,
    "@/lib/prisma": { __esModule: true, default: db.prisma },
    "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/access-control": access, "@/lib/prestamos": prestamos,
  });
  return { ...db, pay: (id = 10, extra = {}) => POST(new Request("https://qa.test/api/inventario/pagar-deuda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...extra }) })) };
}

function creditorProbe() {
  const catalog = new Map();
  const calls = [];
  let nextId = 1;
  let failEnsure = false;
  const prisma = {
    async $executeRaw(strings, ...values) {
      const sql = strings.join("?");
      calls.push({ sql, values: copy(values) });
      if (sql.includes("CREATE TABLE")) {
        if (failEnsure) { failEnsure = false; throw new Error("DDL temporalmente no disponible"); }
        assert.match(sql, /COLLATE "C"/);
        assert.match(sql, /UNIQUE \("origen", "nombre"\)/);
        return 0;
      }
      assert.match(sql, /ON CONFLICT \("origen", "nombre"\) DO NOTHING/);
      assert.match(sql, /ORDER BY "nombre" COLLATE "C"/);
      const [origin, names] = values;
      for (const nombre of names) {
        const key = JSON.stringify([origin, nombre]);
        if (!catalog.has(key)) catalog.set(key, { id: nextId++, nombre });
      }
      return names.length;
    },
    async $queryRaw(strings, ...values) {
      calls.push({ sql: strings.join("?"), values: copy(values) });
      const [origin, names] = values;
      return names.map((nombre) => catalog.get(JSON.stringify([origin, nombre]))).filter(Boolean).map(copy);
    },
  };
  const helpers = load("lib/inventory-creditors.ts", {
    "@/lib/prisma": { __esModule: true, default: prisma }, "@/lib/prestamos": prestamos,
  });
  return { catalog, calls, helpers, prisma, failNextEnsure: () => { failEnsure = true; } };
}

test("IDs de acreedor persistentes conservan etiquetas históricas exactas sin fusionar similares", async () => {
  const probe = creditorProbe();
  const names = ["Proveedor Finser", "PROVEEDOR FINSER", "Proveedor Finser ", "Proveedor Fínser", "Proveedor 'Especial'; DROP TABLE X; --"];
  const first = await probe.helpers.resolverIdentidadesAcreedores(names.map((deboA) => ({ deboA })));
  assert.equal(new Set([...first.values()].map((entry) => entry.id)).size, names.length);
  const second = await probe.helpers.resolverIdentidadesAcreedores([...names].reverse().map((deboA) => ({ deboA })));
  for (const nombre of names) assert.deepEqual(second.get(nombre), first.get(nombre));
  const [third, fourth] = await Promise.all([
    probe.helpers.resolverIdentidadesAcreedores([{ deboA: "Proveedor nuevo" }]),
    probe.helpers.resolverIdentidadesAcreedores([{ deboA: "Proveedor nuevo" }]),
  ]);
  assert.deepEqual(third.get("Proveedor nuevo"), fourth.get("Proveedor nuevo"));
  assert.equal(probe.catalog.size, names.length + 1);
  assert.equal(probe.calls.filter((call) => call.sql.includes("CREATE TABLE")).length, 1);
  assert.ok(probe.calls.every((call) => !call.sql.includes(names.at(-1))), "Los nombres se envían como parámetros, nunca como SQL");
  const restarted = load("lib/inventory-creditors.ts", {
    "@/lib/prisma": { __esModule: true, default: probe.prisma }, "@/lib/prestamos": prestamos,
  });
  const afterRestart = await restarted.resolverIdentidadesAcreedores(names.map((deboA) => ({ deboA })));
  for (const nombre of names) assert.deepEqual(afterRestart.get(nombre), first.get(nombre));
  assert.equal(probe.catalog.size, names.length + 1);
});

test("ausencia de acreedor no crea un ID ficticio y ensure fallido puede recuperarse", async () => {
  const empty = creditorProbe();
  const result = await empty.helpers.resolverIdentidadesAcreedores([{ deboA: null }, {}, { deboA: "" }, { deboA: "   " }]);
  assert.equal(result.size, 0);
  assert.equal(empty.calls.length, 0);
  const recovering = creditorProbe();
  recovering.failNextEnsure();
  await assert.rejects(recovering.helpers.resolverIdentidadesAcreedores([{ deboA: "Proveedor Finser" }]));
  const restored = await recovering.helpers.resolverIdentidadesAcreedores([{ deboA: "Proveedor Finser" }]);
  assert.ok(restored.get("Proveedor Finser").id > 0);
  assert.equal(recovering.calls.filter((call) => call.sql.includes("CREATE TABLE")).length, 2);
});

test("saldo pendiente conserva costo completo sólo en DEUDA y no descuenta solicitudes sin aprobar", () => {
  const { helpers } = creditorProbe();
  for (const estadoFinanciero of ["DEUDA", "deuda", " DEUDA "]) {
    assert.equal(helpers.obtenerSaldoPendienteInventario({ estadoFinanciero, costo: 123_456.75 }), 123_456.75);
  }
  for (const estadoFinanciero of ["PAGO", "CANCELADO", null]) {
    assert.equal(helpers.obtenerSaldoPendienteInventario({ estadoFinanciero, costo: 123_456.75 }), 0);
  }
  assert.equal(helpers.obtenerSaldoPendienteInventario({ estadoFinanciero: "DEUDA", costo: -12.5 }), -12.5, "No se cambia la fórmula existente ni se inventa un saldo");
});

test("GET incorpora IDs reales y saldo sin cambiar cobertura, IMEI, origen, factura ni destino", async () => {
  const identity = creditorProbe();
  const rawItems = [
    { ...equipo, tipoProducto: "TELEFONIA", distribuidor: "Original", facturaStandItem: { factura: { id: 6, estado: "EMITIDA", siigoInvoiceName: "FV6", siigoInvoiceUrl: "https://qa.test/fv6", siigoInvoiceError: null } } },
    { ...equipo, id: 11, deboA: "PROVEEDOR FINSER", estadoActual: "PRESTAMO", estadoFinanciero: "PAGO", facturaStandItem: null },
    { ...equipo, id: 12, deboA: null, facturaStandItem: null },
  ];
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const db = database({ items: rawItems, loans: [{ id: 8, imei: equipo.imei, sedeOrigenId: 1, sedeDestinoId: 2, estado: "APROBADO" }] });
    const route = load("app/api/inventario/route.ts", {
      "next/server": responseMock, "@/lib/prisma": { __esModule: true, default: db.prisma },
      "@/lib/auth": { getSessionUser: async () => ({ ...admin, rolNombre }) },
      "@/lib/access-control": access, "@/lib/sedes": load("lib/sedes.ts"), "@/lib/product-types": load("lib/product-types.ts"),
      "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: async () => {} }, "@/lib/inventory-creditors": identity.helpers,
    });
    const result = await route.GET(new Request("https://qa.test/api/inventario?sedeId=1"));
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.length, 3);
    assert.notEqual(data[0].acreedorId, data[1].acreedorId);
    assert.equal(data[0].acreedorNombre, equipo.deboA);
    assert.equal(data[0].deudaPendiente, equipo.costo);
    assert.equal(data[1].deudaPendiente, 0);
    assert.equal(data[2].acreedorId, null);
    assert.equal(data[2].acreedorNombre, null);
    assert.equal(data[2].deudaPendiente, equipo.costo);
    assert.equal(data[0].imei, "000000000000010");
    assert.equal(data[0].facturaStand.nombre, "FV6");
    assert.equal(data[1].prestamoDestino.id, 2);
    assert.deepEqual(db.calls.find((call) => call.name === "inventory-list").args.where, { sedeId: 1 });
  }
});

test("GET y pago rechazan sesión/perfiles antes de consultar o crear metadatos", async () => {
  for (const user of [null, { ...admin, perfilTipo: "VENDEDOR" }, { ...admin, perfilTipo: "APOYO_OPERATIVO" }, { ...admin, perfilTipo: "FACTURADOR" }]) {
    const probe = paymentProbe({}, user);
    const result = await probe.pay();
    assert.equal(result.status, user ? 403 : 401);
    assert.equal(probe.calls.length, 0);
    let metadataCalls = 0;
    const route = load("app/api/inventario/route.ts", {
      "next/server": responseMock, "@/lib/prisma": { __esModule: true, default: probe.prisma },
      "@/lib/auth": { getSessionUser: async () => user }, "@/lib/access-control": access,
      "@/lib/sedes": load("lib/sedes.ts"), "@/lib/product-types": load("lib/product-types.ts"),
      "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: async () => { metadataCalls++; } },
      "@/lib/inventory-creditors": { resolverIdentidadesAcreedores: async () => { metadataCalls++; } },
    });
    assert.equal((await route.GET(new Request("https://qa.test/api/inventario"))).status, user ? 403 : 401);
    assert.equal(metadataCalls, 0);
  }
});

test("pago ordinario conserva importe servidor, permisos de sede y estados operativos originales", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    for (const estadoActual of ["BODEGA", "VENDIDO", "TRASLADO", "PRESTAMO_PAGO"]) {
      const probe = paymentProbe({ items: [{ ...equipo, estadoActual }] }, { ...admin, rolNombre });
      const response = await probe.pay(10, { costo: 1, deudaPendiente: 1, sedeId: 999 });
      assert.equal(response.status, 200);
      assert.equal(probe.state.cash.length, 1);
      assert.equal(probe.state.cash[0].valor, equipo.costo);
      assert.equal(probe.state.cash[0].sedeId, equipo.sedeId);
      assert.equal(probe.state.items[0].estadoActual, estadoActual);
      assert.equal(probe.state.items[0].estadoFinanciero, "PAGO");
      assert.equal(probe.state.items[0].deboA, null);
      assert.equal(probe.state.history[0].tipoMovimiento, "PAGO_DEUDA_INVENTARIO");
    }
  }
  const otherSite = paymentProbe({ items: [{ ...equipo, sedeId: 2 }] }, { ...admin, rolNombre: "SUPERVISOR" });
  assert.equal((await otherSite.pay()).status, 403);
  assert.equal(otherSite.calls.filter((call) => call.write).length, 0);
});

test("pago preserva todos los bloqueos de deuda y estado, sin egresos ni historial", async () => {
  for (const fixture of [
    { ...equipo, estadoFinanciero: "PAGO" }, { ...equipo, estadoFinanciero: "CANCELADO" },
    { ...equipo, estadoActual: "PENDIENTE" }, { ...equipo, estadoActual: "GARANTIA" },
    { ...equipo, estadoActual: "PRESTAMO_POR_ACEPTAR" }, { ...equipo, deboA: "SEDE 2" },
    { ...equipo, estadoActual: "PRESTAMO", deboA: null },
  ]) {
    const probe = paymentProbe({ items: [fixture] });
    assert.equal((await probe.pay()).status, 400);
    assert.equal(probe.calls.filter((call) => call.write).length, 0);
  }
  const absent = paymentProbe({ items: [] });
  assert.equal((await absent.pay()).status, 404);
  assert.equal(absent.calls.filter((call) => call.write).length, 0);
});

test("equipo prestado mantiene cuenta por cobrar o elimina sólo el registro informativo como antes", async () => {
  for (const outgoing of [false, true]) {
    const probe = paymentProbe({ items: [{ ...equipo, estadoActual: "PRESTAMO" }], loans: outgoing ? [{ id: 80, imei: equipo.imei, sedeOrigenId: 1, sedeDestinoId: 2, estado: "APROBADO" }] : [] });
    assert.equal((await probe.pay()).status, 200);
    assert.equal(probe.state.cash[0].valor, equipo.costo);
    assert.equal(probe.state.items.length, outgoing ? 1 : 0);
    if (outgoing) {
      assert.equal(probe.state.items[0].estadoActual, "PRESTAMO");
      assert.equal(probe.state.items[0].estadoFinanciero, "PAGO");
      assert.equal(probe.state.loans[0].estado, "APROBADO");
    }
  }
});

test("pago ordinario conserva cierre de préstamos, principal y anulación de pendientes asociados", async () => {
  for (const principal of [false, true]) {
    // A principal item held by Bodega Principal is paid directly, while items
    // held by a destination site follow the separate approval branch below.
    const item = principal ? { ...equipo, sedeId: 99, inventarioPrincipalId: 50 } : equipo;
    const probe = paymentProbe({
      items: [item, { ...equipo, id: 20, sedeId: 2, estadoActual: "PRESTAMO" }],
      loans: [{ id: 80, imei: equipo.imei, sedeOrigenId: 2, sedeDestinoId: item.sedeId, estado: "APROBADO" }],
      siteCash: [{ id: 90, prestamoId: 80, tipo: "PENDIENTE_APROBACION" }],
      principal: principal ? [{ id: 50, imei: equipo.imei, estado: "PRESTAMO" }] : [],
    });
    assert.equal((await probe.pay()).status, 200);
    assert.equal(probe.state.items.length, 1);
    assert.equal(probe.state.loans[0].estado, "PAGADO");
    assert.equal(probe.state.siteCash[0].tipo, "ANULADO");
    assert.equal(probe.state.cash[0].valor, equipo.costo);
    if (principal) {
      assert.equal(probe.state.principal[0].estado, "PAGO");
      assert.equal(probe.state.principal[0].estadoCobro, "PAGADO");
    }
  }
});

test("deuda principal solicita aprobación sin cambiar saldo ni registrar egreso; rechaza pendiente duplicado", async () => {
  const fixture = { ...equipo, origen: "PRINCIPAL", inventarioPrincipalId: 50 };
  const probe = paymentProbe({ items: [fixture], principal: [{ id: 50, imei: equipo.imei, estado: "PRESTAMO" }] });
  const first = await probe.pay();
  assert.equal(first.status, 200);
  assert.match((await first.json()).mensaje, /Bodega principal debe aprobarla/);
  assert.equal(probe.state.cash.length, 0);
  assert.equal(probe.state.items[0].estadoFinanciero, "DEUDA");
  assert.equal(probe.state.loans[0].estado, "PAGO_PENDIENTE_APROBACION");
  assert.equal(probe.state.loans[0].montoPago, equipo.costo);
  assert.equal(probe.state.siteCash[0].valor, equipo.costo);
  assert.equal(probe.state.siteCash[0].tipo, "PENDIENTE_APROBACION");
  assert.equal((await probe.pay()).status, 400);
  assert.equal(probe.state.loans.length, 1);
  assert.equal(probe.state.siteCash.length, 1);
  assert.equal(probe.state.history.length, 1);
});

test("dos pagos simultáneos del mismo registro generan exactamente un egreso", { skip: baseline }, async () => {
  for (const estadoActual of ["BODEGA", "VENDIDO", "PRESTAMO", "TRASLADO", "PRESTAMO_PAGO"]) {
    const probe = paymentProbe({ items: [{ ...equipo, estadoActual }] });
    const responses = await Promise.all([probe.pay(), probe.pay()]);
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.equal(responses.filter((response) => [400, 404].includes(response.status)).length, 1);
    assert.equal(probe.state.cash.length, 1);
    assert.equal(probe.state.cash[0].valor, equipo.costo);
    assert.equal(probe.state.history.length, 1);
    assert.ok(probe.calls.filter((call) => call.name.endsWith("-read")).every((call) => call.transaction !== null));
  }
});

test("dos solicitudes simultáneas hacia principal generan una única aprobación pendiente", { skip: baseline }, async () => {
  for (const existingLoan of [false, true]) {
    const probe = paymentProbe({
      items: [{ ...equipo, origen: "PRINCIPAL", inventarioPrincipalId: 50 }], principal: [{ id: 50, imei: equipo.imei }],
      loans: existingLoan ? [{ id: 80, imei: equipo.imei, sedeOrigenId: 99, sedeDestinoId: 1, estado: "APROBADO" }] : [],
    });
    const responses = await Promise.all([probe.pay(), probe.pay()]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
    assert.equal(probe.state.loans.length, 1);
    assert.equal(probe.state.siteCash.length, 1);
    assert.equal(probe.state.history.length, 1);
    assert.equal(probe.state.cash.length, 0);
  }
});

test("saldo, estado y sede se revalidan después del bloqueo, sin utilizar información previa", { skip: baseline }, async () => {
  const currentCost = paymentProbe({ beforeLock: (state) => { state.items[0].costo = 876_543.21; } });
  assert.equal((await currentCost.pay(10, { deudaPendiente: 1 })).status, 200);
  assert.equal(currentCost.state.cash[0].valor, 876_543.21);
  for (const change of [
    (state) => { state.items[0].estadoFinanciero = "PAGO"; },
    (state) => { state.items[0].sedeId = 2; },
    (state) => { state.items[0].estadoActual = "GARANTIA"; },
    (state) => { state.items = []; },
  ]) {
    const probe = paymentProbe({ beforeLock: change }, { ...admin, rolNombre: "SUPERVISOR" });
    assert.ok([400, 403, 404].includes((await probe.pay()).status));
    assert.equal(probe.calls.filter((call) => call.write).length, 0);
  }
});

test("fallo intermedio revierte egreso, estado e historial y permite reintento sin duplicados", async () => {
  const probe = paymentProbe({ failWrite: "history-create", failOnce: true });
  assert.equal((await probe.pay()).status, 500);
  assert.equal(probe.state.items[0].estadoFinanciero, "DEUDA");
  assert.equal(probe.state.cash.length, 0);
  assert.equal(probe.state.history.length, 0);
  assert.equal((await probe.pay()).status, 200);
  assert.equal(probe.state.items[0].estadoFinanciero, "PAGO");
  assert.equal(probe.state.cash.length, 1);
  assert.equal(probe.state.history.length, 1);
});
