import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, imports = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", "console", output)((name) => {
    assert.ok(name in imports, `Unexpected dependency ${name}`);
    return imports[name];
  }, testModule, testModule.exports, { error() {} });
  return testModule.exports;
}

const access = load("lib/access-control.ts");
const helpers = load("lib/prestamos.ts");
const sedes = load("lib/sedes.ts");
const warehouse = { id: 99, nombre: "BODEGA PRINCIPAL" };
const userBodega = { id: 10, sedeId: 99, rolNombre: "BODEGA", perfilTipo: "BODEGA" };
const loan = { id: 7, imei: "001234567890123", referencia: "Equipo real", color: "Negro", costo: 750000, sedeOrigenId: 99, sedeDestinoId: 2, estado: "PENDIENTE", createdAt: new Date("2026-10-19T12:00:00Z") };
const inventory = { id: 60, ...loan, sedeId: 99, estadoActual: "BODEGA", estadoFinanciero: "PAGO", deboA: null, origen: "SEDE", inventarioPrincipalId: null, sede: warehouse };

function matches(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((part) => matches(row, part));
    if (key === "OR") return value.some((part) => matches(row, part));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
}

function probe(path, options = {}) {
  const user = options.user ?? userBodega;
  const currentLoan = { ...loan, ...options.loan };
  const currentInventory = { ...inventory, ...options.inventory };
  const loans = options.loans ?? [currentLoan];
  const writes = [];
  const queries = [];
  const mutate = (model, action) => async (query) => {
    writes.push({ model, action, ...query });
    return { id: 100, ...query.data };
  };
  const model = (name) => Object.fromEntries(["create", "update", "updateMany", "delete", "deleteMany"].map((action) => [action, mutate(name, action)]));
  const db = {
    sede: {
      findFirst: async () => options.noWarehouse ? null : warehouse,
      findUnique: async ({ where }) => ({ id: where.id, nombre: where.id === 99 ? warehouse.nombre : `SEDE ${where.id}` }),
      findMany: async () => [warehouse, { id: 2, nombre: "SEDE 2" }, { id: 3, nombre: "SEDE 3" }],
    },
    prestamoSede: {
      ...model("prestamoSede"),
      findUnique: async () => currentLoan,
      findFirst: async () => null,
      findMany: async ({ where }) => { queries.push(where); return loans.filter((row) => matches(row, where)); },
      count: async ({ where }) => { queries.push(where); return loans.filter((row) => matches(row, where)).length; },
    },
    inventarioSede: {
      ...model("inventarioSede"),
      findUnique: async () => currentInventory,
      findMany: async () => [],
      findFirst: async ({ where }) => options.noInventory || (where.sedeId !== undefined && where.sedeId !== currentInventory.sedeId && options.destinationMissing) ? null : currentInventory,
    },
    inventarioPrincipal: model("inventarioPrincipal"),
    movimientoInventario: model("movimientoInventario"),
    cajaMovimiento: model("cajaMovimiento"),
    venta: { findFirst: async () => null },
  };
  db.$transaction = async (callback) => callback(db);
  const route = load(`app/api/prestamos/${path ? `${path}/` : ""}route.ts`, {
    "next/server": { NextResponse: { json: (data, init) => ({ status: init?.status ?? 200, data }) } },
    "@/lib/prisma": { __esModule: true, default: db },
    "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/access-control": access,
    "@/lib/prestamos": helpers,
    "@/lib/sedes": sedes,
  });
  return { route, writes, queries, request: (body = {}, search = "") => ({ url: `https://conectamos.app/api/prestamos${search}`, json: async () => body }) };
}

test("BODEGA consulta solamente préstamos con principal como origen o destino, aunque intente ampliar por sede", async () => {
  const loans = [loan, { ...loan, id: 8, sedeOrigenId: 2, sedeDestinoId: 99 }, { ...loan, id: 9, sedeOrigenId: 2, sedeDestinoId: 3 }];
  for (const [search, ids] of [["", [7, 8]], ["?sedeId=2", [7, 8]], ["?sedeId=3", []]]) {
    const p = probe("", { loans });
    const result = await p.route.GET(p.request({}, search));
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.map((row) => row.id), ids);
    assert.equal(p.writes.length, 0);
  }
});

test("sin bodega principal configurada BODEGA no cae en una consulta global", async () => {
  const p = probe("", { noWarehouse: true });
  assert.equal((await p.route.GET(p.request())).status, 403);
  assert.equal(p.queries.length, 0);
});

test("ADMIN y AUDITOR mantienen consulta global y supervisor conserva su sede", async () => {
  const loans = [loan, { ...loan, id: 8, sedeOrigenId: 2, sedeDestinoId: 3 }];
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const p = probe("", { loans, user: { ...userBodega, rolNombre, perfilTipo: rolNombre, sedeId: 3 } });
    const result = await p.route.GET(p.request());
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.map((row) => row.id), rolNombre === "SUPERVISOR" ? [8] : [7, 8]);
  }
});

for (const endpoint of ["pagar", "solicitar-pago", "solicitar-pago-lote", "aprobar-pago", "aprobar-pago-lote"]) {
  test(`BODEGA no puede ejecutar ${endpoint}, ni sobre un préstamo de principal`, async () => {
    const p = probe(endpoint);
    const request = { json() { throw new Error("No debe leer el payload financiero"); } };
    assert.equal((await p.route.POST(request)).status, 403);
    assert.equal(p.writes.length, 0);
    assert.equal(p.queries.length, 0);
  });
}

for (const [endpoint, estado, body] of [
  ["aprobar", "PENDIENTE", {}], ["cerrar-pendiente", "PENDIENTE", { accion: "CANCELADO" }],
  ["cerrar-pendiente", "PENDIENTE", { accion: "RECHAZADO" }], ["devolver", "DEVOLUCION_PENDIENTE", {}],
  ["solicitar-devolucion", "APROBADO", {}], ["rechazar-devolucion", "DEVOLUCION_PENDIENTE", {}],
]) {
  test(`BODEGA no puede ${endpoint} entre dos sedes ajenas con ID forjado`, async () => {
    const p = probe(endpoint, { loan: { sedeOrigenId: 2, sedeDestinoId: 3, estado } });
    assert.equal((await p.route.POST(p.request({ id: 7, ...body }))).status, 403);
    assert.equal(p.writes.length, 0);
  });
}

test("BODEGA puede aprobar y cerrar solicitudes de principal manteniendo la trazabilidad", async () => {
  for (const [endpoint, body] of [["aprobar", {}], ["cerrar-pendiente", { accion: "CANCELADO" }], ["cerrar-pendiente", { accion: "RECHAZADO" }]]) {
    const p = probe(endpoint);
    const response = await p.route.POST(p.request({ id: 7, ...body }));
    assert.equal(response.status, 200);
    assert.ok(p.writes.some((entry) => entry.model === "movimientoInventario"));
    assert.ok(!p.writes.some((entry) => entry.model === "cajaMovimiento"));
  }
});

test("BODEGA conserva la prohibición actual de devolución de un envío desde principal", async () => {
  for (const [endpoint, estado] of [["solicitar-devolucion", "APROBADO"], ["devolver", "DEVOLUCION_PENDIENTE"]]) {
    const p = probe(endpoint, { loan: { estado } });
    const response = await p.route.POST(p.request({ id: 7 }));
    assert.equal(response.status, 400);
    assert.match(response.data.error, /principal/);
    assert.equal(p.writes.length, 0);
  }
});

test("BODEGA solo crea préstamos y consulta IMEI desde el ID real de principal", async () => {
  for (const endpoint of ["", "crear-desde-inventario", "buscar-imei"]) {
    const p = probe(endpoint, { inventory: { sedeId: 2 }, user: { ...userBodega, sedeId: 2 } });
    const response = await p.route.POST(p.request({ ...loan, sedeOrigenId: 2, sedeDestinoId: 3, inventarioId: 60 }));
    assert.equal(response.status, 403);
    assert.equal(p.writes.length, 0);
  }
  const p = probe("buscar-imei");
  const response = await p.route.POST(p.request({ imei: loan.imei, sedeOrigenId: 99 }));
  assert.equal(response.status, 200);
  assert.equal(response.data.referencia, inventory.referencia);
});

test("las alertas BODEGA derivan el destino de la principal real y no de una sesión mal asociada", async () => {
  const p = probe("pendientes-destino", { user: { ...userBodega, sedeId: 3 }, loans: [loan, { ...loan, id: 8, sedeOrigenId: 2, sedeDestinoId: 99 }] });
  const response = await p.route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.data.total, 1);
  assert.deepEqual(response.data.items.map((row) => row.id), [8]);
  assert.ok(p.queries.every((query) => query.sedeDestinoId === 99));
});

test("crear desde principal conserva IMEI de texto y traza logística sin movimientos de caja", async () => {
  for (const endpoint of ["", "crear-desde-inventario"]) {
    const p = probe(endpoint, { destinationMissing: true });
    const response = await p.route.POST(p.request({ ...loan, inventarioId: 60 }));
    assert.equal(response.status, 200);
    const created = p.writes.find((entry) => entry.model === "prestamoSede" && entry.action === "create");
    assert.equal(created.data.imei, "001234567890123");
    assert.equal(created.data.sedeOrigenId, 99);
    assert.equal(created.data.sedeDestinoId, 2);
    assert.ok(p.writes.some((entry) => entry.model === "movimientoInventario"));
    assert.ok(!p.writes.some((entry) => entry.model === "cajaMovimiento"));
  }
});

test("los IDs de otras sedes se rechazan sin revelar su estado operativo", async () => {
  for (const endpoint of ["aprobar", "cerrar-pendiente", "solicitar-devolucion", "devolver", "rechazar-devolucion"]) {
    for (const estado of ["PENDIENTE", "APROBADO", "PAGO_PENDIENTE_APROBACION", "PAGADO", "FINALIZADO", "DEVOLUCION_PENDIENTE"]) {
      const p = probe(endpoint, { loan: { sedeOrigenId: 2, sedeDestinoId: 3, estado } });
      const response = await p.route.POST(p.request({ id: 7, accion: "CANCELADO" }));
      assert.equal(response.status, 403);
      assert.equal(p.writes.length, 0);
    }
  }
});
