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
const debtGroups = load("lib/warehouse-debt-groups.ts");
class NextResponse extends Response {
  static json(body, options = {}) {
    return new NextResponse(JSON.stringify(body), {
      ...options, headers: { "Content-Type": "application/json", ...options.headers },
    });
  }
}
const bodega = { id: 52, rolNombre: "BODEGA", sedeId: 1, sedeNombre: "BODEGA PRINCIPAL" };
const sedes = [
  { id: 1, nombre: "BODEGA PRINCIPAL" },
  { id: 2, nombre: "SEDE NORTE" },
  { id: 3, nombre: "Sede Norte" },
  { id: 4, nombre: "SEDE SUR" },
];
function item(id, overrides = {}) {
  return {
    id, imei: `00123456789${String(id).padStart(4, "0")}`,
    referencia: "EQUIPO DE PRUEBA", color: "Azul", costo: 100,
    estado: "PRESTAMO", estadoCobro: "PENDIENTE", sedeDestinoId: 2,
    fechaEnvio: new Date("2026-10-19T15:45:00Z"), ...overrides,
  };
}
function probe({ user = bodega, items = [], locations = sedes, fail = false } = {}) {
  const state = { calls: [] };
  const read = (name, value) => async args => {
    state.calls.push({ name, args: structuredClone(args) });
    if (fail) throw new Error("Fallo de prueba: base no disponible");
    return value;
  };
  const prisma = {
    inventarioPrincipal: { findMany: read("principal.read", items) },
    sede: { findMany: read("sede.read", locations) },
  };
  const service = load("lib/bodega-dashboard.ts", {
    "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/access-control": access,
    "@/lib/prestamos": { NOMBRE_SEDE_BODEGA: "BODEGA PRINCIPAL" },
    "@/lib/warehouse-debt-groups": debtGroups,
  });
  const route = load("app/api/dashboard/bodega/route.ts", {
    "next/server": { NextResponse }, "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/access-control": access, "@/lib/bodega-dashboard": service,
  });
  return {
    state, service,
    async get() {
      const response = await route.GET(new Request("http://qa.local/api/dashboard/bodega?sedeId=999&take=1"));
      return { status: response.status, body: await response.json(), headers: response.headers };
    },
  };
}

test("dashboard BODEGA conserva todas las métricas originales del inventario principal", async () => {
  const p = probe({ items: [
    item(1, { estado: "BODEGA", estadoCobro: null, costo: 100.25, sedeDestinoId: null }),
    item(2, { estado: "bodega", estadoCobro: null, costo: 200.5, sedeDestinoId: null }),
    item(3, { costo: 500 }),
    item(4, { estado: "PAGO", estadoCobro: "PAGADO", costo: 800 }),
    item(5, { estado: "CANCELADO", estadoCobro: "CANCELADO", costo: 900 }),
    item(6, { estado: "OTRO", costo: 1000, sedeDestinoId: 4 }),
  ] });
  const result = await p.get();
  assert.equal(result.status, 200); assert.equal(result.body.ok, true);
  assert.deepEqual(result.body.metrics, {
    equiposEnBodega: 2, valorEnBodega: 300.75, enviadosASede: 2,
    totalPorCobrar: 1500, equiposPorCobrar: 2, sedesDeudoras: 2,
  });
  assert.equal(result.body.sedeNombre, "BODEGA PRINCIPAL");
  assert.ok(Number.isFinite(Date.parse(result.body.updatedAt)));
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("cobertura completa ignora paginación y parámetros de sede solicitados por cliente", async () => {
  const items = Array.from({ length: 27 }, (_, index) => item(index + 1, {
    sedeDestinoId: index % 2 ? 2 : 4, costo: 10.25,
  }));
  const p = probe({ items }); const result = await p.get();
  assert.equal(result.body.metrics.equiposPorCobrar, 27);
  assert.equal(result.body.metrics.totalPorCobrar, 276.75);
  assert.equal(result.body.equiposConDeuda.length, 27);
  assert.deepEqual(result.body.deudores.map(group => group.equipos), [14, 13]);
  assert.equal(p.state.calls[0].args.take, undefined);
  assert.equal(p.state.calls[0].args.skip, undefined);
  assert.equal(p.state.calls[0].args.where, undefined);
});

test("deudores se agrupan por ID, conservan nombres similares y se ordenan por saldo", async () => {
  const p = probe({ items: [
    item(1, { costo: 0.1, sedeDestinoId: 2 }),
    item(2, { costo: 0.2, sedeDestinoId: 2 }),
    item(3, { costo: 500.56, sedeDestinoId: 3 }),
    item(4, { costo: 2, sedeDestinoId: 99 }),
    item(5, { costo: 1.11, sedeDestinoId: null }),
    item(6, { costo: 99, estadoCobro: "CANCELADO" }),
  ] });
  const result = await p.get();
  assert.deepEqual(result.body.deudores, [
    { key: "sede:3", sedeId: 3, nombre: "Sede Norte", equipos: 1, totalPendiente: 500.56 },
    { key: "sede:99", sedeId: 99, nombre: "Sede #99", equipos: 1, totalPendiente: 2 },
    { key: "sin-sede", sedeId: null, nombre: "Deudor no identificado", equipos: 1, totalPendiente: 1.11 },
    { key: "sede:2", sedeId: 2, nombre: "SEDE NORTE", equipos: 2, totalPendiente: 0.3 },
  ]);
  assert.equal(result.body.metrics.totalPorCobrar, 503.97);
  assert.equal(result.body.metrics.sedesDeudoras, 4);
  assert.equal(result.body.metrics.equiposPorCobrar, 5);
});

test("detalle mantiene IMEI con ceros iniciales, sede por ID y fechas ISO", async () => {
  const p = probe({ items: [item(1, { imei: "000123456789012", color: null })] });
  const result = await p.get(); const equipo = result.body.equiposConDeuda[0];
  assert.deepEqual(equipo, {
    id: 1, imei: "000123456789012", referencia: "EQUIPO DE PRUEBA", color: null,
    costo: 100, estado: "PRESTAMO", estadoCobro: "PENDIENTE", sedeDestinoId: 2,
    sedeDestinoNombre: "SEDE NORTE", fechaEnvio: "2026-10-19T15:45:00.000Z",
  });
  assert.equal(typeof equipo.imei, "string"); assert.equal(equipo.imei.length, 15);
});

test("ADMIN y AUDITOR pueden consultar y BODEGA exige su sede principal", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR"]) {
    const p = probe({ user: { ...bodega, rolNombre, sedeId: 4, sedeNombre: "SEDE SUR" } });
    assert.equal((await p.get()).status, 200); assert.equal(p.state.calls.length, 2);
  }
  for (const sedeNombre of ["SEDE SUR", "BODEGA PRINCIPAL AJENA", "", null]) {
    const p = probe({ user: { ...bodega, sedeNombre } });
    assert.equal((await p.get()).status, 403); assert.equal(p.state.calls.length, 0);
  }
  assert.equal((await probe({ user: { ...bodega, sedeNombre: "  Bodega  principal " } }).get()).status, 200);
});

test("sesión ausente o roles no autorizados no leen inventario ni sedes", async () => {
  for (const [user, status] of [
    [null, 401], ...["SUPERVISOR", "VENDEDOR", "FACTURADOR", "SOPORTE", ""].map(rolNombre => [{ ...bodega, rolNombre }, 403]),
  ]) {
    const p = probe({ user }); const result = await p.get();
    assert.equal(result.status, status); assert.equal(p.state.calls.length, 0);
    assert.equal(result.headers.get("cache-control"), "no-store");
  }
});

test("consulta vacía y valores históricos no finitos no producen métricas inválidas", async () => {
  const empty = await probe().get();
  assert.deepEqual(empty.body.metrics, {
    equiposEnBodega: 0, valorEnBodega: 0, enviadosASede: 0,
    totalPorCobrar: 0, equiposPorCobrar: 0, sedesDeudoras: 0,
  });
  assert.deepEqual(empty.body.deudores, []); assert.deepEqual(empty.body.equiposConDeuda, []);
  const p = probe({ items: [item(1, { costo: Infinity, fechaEnvio: "fecha inválida" }), item(2, { costo: NaN, fechaEnvio: null })] });
  const result = await p.get();
  assert.equal(result.body.metrics.totalPorCobrar, 0);
  assert.deepEqual(result.body.equiposConDeuda.map(equipo => equipo.costo), [0, 0]);
  assert.deepEqual(result.body.equiposConDeuda.map(equipo => equipo.fechaEnvio), [null, null]);
});

test("errores de lectura se muestran sin datos parciales ni acceso contable o comercial", async () => {
  const p = probe({ fail: true }); const result = await p.get();
  assert.equal(result.status, 500); assert.match(result.body.error, /No se pudo cargar/);
  assert.equal(result.body.metrics, undefined); assert.equal(result.headers.get("cache-control"), "no-store");
  assert.ok(p.state.calls.every(call => ["principal.read", "sede.read"].includes(call.name)));
  assert.deepEqual(Object.keys(p.state.calls.find(call => call.name === "principal.read").args.select).sort(), [
    "id", "imei", "referencia", "color", "costo", "estado", "estadoCobro", "sedeDestinoId", "fechaEnvio",
  ].sort());
});

test("API de dashboard expone únicamente GET y el servicio no realiza escrituras", async () => {
  const p = probe({ items: [item(1)] }); const data = await p.service.getBodegaDashboard();
  assert.equal(data.equiposConDeuda.length, 1);
  assert.equal(p.state.calls.length, 2);
  assert.ok(p.state.calls.every(call => call.name.endsWith(".read")));
  const source = readFileSync(join(ROOT, "app/api/dashboard/bodega/route.ts"), "utf8");
  assert.doesNotMatch(source, /export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)/);
});
