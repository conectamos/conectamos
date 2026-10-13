import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import ExcelJS from "exceljs";

const root = new URL("../", import.meta.url);
const nativeRequire = createRequire(import.meta.url);
const admin = { rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR", sedeId: 1, sedeNombre: "Centro" };
const supervisor = { rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA", sedeId: 1, sedeNombre: "Centro" };

// Execute the production TypeScript, replacing only external infrastructure.
function modules(prisma, options = {}) {
  const cache = new Map();
  const imports = [];
  const mocks = {
    "@/lib/prisma": prisma,
    "@/lib/auth": { getSessionUser: async () => options.session === undefined ? supervisor : options.session },
    "next/server": { NextResponse: { json: (body, init = {}) => Response.json(body, init) } },
    "@/lib/cierre-providers": { consultarLoteProveedorCierre: options.provider || (() => { throw new Error("Provider I/O forbidden"); }) },
    ...options.mocks,
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = fileURLToPath(new URL(relative, root));
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
    }).outputText;
    const mod = { exports: {} };
    cache.set(relative, mod.exports);
    const require = (id) => {
      imports.push(id);
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/")) return load(`${id.slice(2)}.ts`);
      if (id.startsWith("node:") || id === "exceljs") return nativeRequire(id);
      throw new Error(`Unexpected module dependency: ${id}`);
    };
    new Function("require", "module", "exports", code)(require, mod, mod.exports);
    return mod.exports;
  }
  return { load, imports };
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key, rule]) => {
    if (key === "OR") return rule.some((part) => matches(row, part));
    if (key === "financial_providerCreditId") return matches(row, rule);
    const value = row[key] ?? null;
    if (rule && typeof rule === "object" && !(rule instanceof Date)) {
      return Object.entries(rule).every(([operator, target]) => {
        if (operator === "not") return value !== target;
        if (operator === "in") return target.includes(value);
        if (operator === "gt") return value !== null && value > target;
        if (operator === "gte") return value !== null && value >= target;
        if (operator === "lt") return value !== null && value < target;
        if (operator === "lte") return value !== null && value <= target;
        throw new Error(`Unimplemented mock operator ${operator}`);
      });
    }
    return value === rule;
  });
}

function database(seed = {}) {
  const calls = [];
  const tables = {
    cierreCredito: [], cierreEvento: [], cierreVentaPendiente: [], cierreSyncTrabajo: [],
    cierreSyncEstado: [{ key: "LOCAL", initialized: true, lastSuccess: new Date("2026-10-13T12:00:00Z") }],
    venta: [], registroVendedorVenta: [], sede: [{ id: 1, nombre: "Centro" }, { id: 2, nombre: "Norte" }], ...seed,
  };
  const prisma = {};
  let sequence = 0;
  for (const [table, rows] of Object.entries(tables)) {
    for (const row of rows) {
      row.updatedAt ??= new Date("2026-10-13T12:00:00Z");
      if (table === "cierreVentaPendiente" || table === "cierreSyncTrabajo") {
        row.nextAttempt ??= new Date(0);
        row.attempts ??= 0;
      }
    }
    function select(args = {}) {
      let result = rows.filter((row) => matches(row, args.where));
      if (args.orderBy) {
        const order = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        result.sort((a, b) => {
          for (const item of order) for (const [key, direction] of Object.entries(item)) {
            if (a[key] < b[key]) return direction === "asc" ? -1 : 1;
            if (a[key] > b[key]) return direction === "asc" ? 1 : -1;
          }
          return 0;
        });
      }
      if (args.distinct) result = result.filter((row, index, all) => all.findIndex((other) => args.distinct.every((key) => row[key] === other[key])) === index);
      result = result.slice(args.skip || 0, args.take === undefined ? undefined : (args.skip || 0) + args.take);
      if (args.select) result = result.map((row) => Object.fromEntries(Object.keys(args.select).map((key) => [key, row[key]])));
      return result.map((row) => ({ ...row }));
    }
    function change(row, data) {
      if (!row) throw new Error(`Missing mock ${table} row`);
      for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? (row[key] || 0) + value.increment : value;
      row.updatedAt = new Date();
      return row;
    }
    function create(data) {
      const row = { id: `mock-${++sequence}`, syncedAt: new Date(), updatedAt: new Date(), attempts: 0,
        nextAttempt: new Date(0), state: "PENDIENTE", initialized: false, localKey: null, providerCreditId: null, ...data };
      if (table === "cierreCredito" && rows.some((other) =>
        (row.localKey && row.localKey === other.localKey) || (row.providerCreditId && row.providerCreditId === other.providerCreditId && row.financial === other.financial))) {
        throw new Error("Unique identity constraint");
      }
      rows.push(row);
      return row;
    }
    const implementations = {
      findMany: select, findUnique: (args) => select(args)[0] || null, findFirst: (args) => select(args)[0] || null,
      count: (args) => select(args).length,
      create: ({ data }) => create(data),
      update: ({ where, data }) => change(rows.find((row) => matches(row, where)), data),
      updateMany: ({ where, data }) => { const found = rows.filter((row) => matches(row, where)); found.forEach((row) => change(row, data)); return { count: found.length }; },
      upsert: ({ where, create: data, update }) => { const row = rows.find((row) => matches(row, where)); return row ? change(row, update) : create(data); },
      deleteMany: ({ where }) => { const found = rows.filter((row) => matches(row, where)); found.forEach((row) => rows.splice(rows.indexOf(row), 1)); return { count: found.length }; },
      groupBy: ({ where }) => {
        const groups = new Map();
        for (const row of select({ where })) {
          const g = groups.get(row.financial) || { financial: row.financial, _count: { _all: 0 }, _sum: { amount: 0 }, _max: { syncedAt: null } };
          g._count._all++; g._sum.amount += Number(row.amount);
          if (!g._max.syncedAt || row.syncedAt > g._max.syncedAt) g._max.syncedAt = row.syncedAt;
          groups.set(row.financial, g);
        }
        return [...groups.values()];
      },
    };
    prisma[table] = Object.fromEntries(Object.entries(implementations).map(([method, run]) => [method, async (args) => {
      calls.push({ table, method, args });
      return run(args);
    }]));
  }
  prisma.$transaction = async (run, options) => { calls.push({ table: "$transaction", options }); return run(prisma); };
  return { prisma, calls, tables };
}

function credit(id, changes = {}) {
  return { id: String(id), financial: "PAYJOY", localKey: `VENTA:${id}:PAYJOY`, providerCreditId: null,
    ventaId: id, registroId: null, sedeId: 1, effectiveAt: new Date("2026-10-12T18:00:00Z"),
    amount: 1000000, customerName: "Cliente", documentNumber: "1.234.567", creditNumber: null,
    localReference: `VTA-${id}`, imei: "123456789012345", status: "EFECTIVO", source: "CONECTAMOS", syncedAt: new Date(), ...changes };
}

function sale(id, changes = {}) {
  return { id, idVenta: `VTA-${id}`, sedeId: 1, fecha: new Date("2025-02-03T19:00:00Z"), payjoy: 1000000, serial: "123456789012345", ...changes };
}

const params = (extra = "") => new URLSearchParams(`mode=month&month=2026-10${extra}`);

test("servidor filtra sede, estado y fecha efectiva antes de totalizar y pagina máximo diez", async () => {
  const db = database({ cierreCredito: [
    ...Array.from({ length: 23 }, (_, index) => credit(index + 1)), credit(90, { sedeId: 2 }),
    credit(91, { status: "REVERSADO" }), credit(92, { status: "ANULADO" }), credit(93, { status: "RECHAZADO" }),
    credit(94, { effectiveAt: new Date("2026-11-01T05:00:00Z") }), credit(95, { amount: null }),
  ] });
  const report = await modules(db.prisma).load("lib/cierre-report.ts").readCierreReport(params("&financier=PAYJOY&page=2"), supervisor, true);
  assert.equal(report.total, 23);
  assert.equal(report.items.length, 10);
  assert.equal(report.totals.amount, 23000000);
  assert.ok(report.items.every((row) => row.sedeName === "Centro" && row.customerDocument === "1234567"));
  assert.equal(report.scope.sedeId, 1);
  assert.equal(report.complete, false);
  assert.equal(db.calls.find((c) => c.table === "$transaction").options.isolationLevel, "RepeatableRead");
});

test("administrador consolida global; supervisor y auditor no consultan otra sede", async () => {
  const db = database({ cierreCredito: [credit(1), credit(2, { sedeId: 2 })] });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  assert.equal((await readCierreReport(params(), admin)).totals.units, 2);
  for (const session of [supervisor, { ...supervisor, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" }]) {
    const previousCount = db.calls.length;
    await assert.rejects(readCierreReport(params("&sedeId=2"), session), (error) => error.status === 403);
    assert.equal(db.calls.length, previousCount, "Deniega antes de leer datos");
    assert.equal((await readCierreReport(params("&sedeId=TODAS"), session)).totals.units, 1);
  }
});

test("pendientes no se presentan como ceros confirmados y fuentes locales sin API sí completan", async () => {
  const db = database({ cierreCredito: [credit(1, { financial: "CELYA" })], cierreVentaPendiente: [{ ventaId: 99 }] });
  const { readCierreReport } = modules(db.prisma).load("lib/cierre-report.ts");
  let report = await readCierreReport(params(), supervisor);
  assert.equal(report.financiers.find((r) => r.name === "SISTECREDITO").units, null);
  assert.equal(report.financiers.find((r) => r.name === "CELYA").complete, false);
  db.tables.cierreVentaPendiente.length = 0;
  report = await readCierreReport(params(), supervisor);
  assert.equal(report.financiers.find((r) => r.name === "CELYA").complete, true);
  assert.equal(report.financiers.find((r) => r.name === "SISTECREDITO").units, 0);
  assert.equal(report.financiers.find((r) => r.name === "PAYJOY").units, null);
  assert.equal(report.complete, false, "Consultar referencias conocidas no prueba cobertura API exhaustiva");
});

test("día, semana, mes y rango históricos del servidor no importan ni llaman proveedores", async () => {
  const db = database({ cierreCredito: [credit(1, { effectiveAt: new Date("2024-02-29T23:00:00Z") })] });
  const fixture = modules(db.prisma);
  const { readCierreReport } = fixture.load("lib/cierre-report.ts");
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Unexpected provider network request"); };
  try {
    for (const query of ["mode=day&date=2024-02-29", "mode=week&date=2024-03-03", "mode=month&month=2024-02", "mode=range&from=2024-02-28&to=2024-02-29"]) {
      assert.equal((await readCierreReport(new URLSearchParams(query), supervisor)).total, 1);
    }
    assert.ok(!fixture.imports.some((id) => /provider|consulta|cierre-sync|cierre-store/.test(id)));
  } finally { globalThis.fetch = original; }
});

test("rutas resumen, detalle y Excel deniegan sin sesión o sede ajena", async () => {
  for (const path of ["app/api/cierre/route.ts", "app/api/cierre/detalle/route.ts", "app/api/cierre/export/route.ts"]) {
    const db = database();
    const request = new Request("https://conectamos.test/api/cierre?mode=month&month=2026-10&sedeId=2&financier=PAYJOY");
    assert.equal((await modules(db.prisma, { session: null }).load(path).GET(request)).status, 401);
    assert.equal((await modules(db.prisma).load(path).GET(request)).status, 403);
    assert.equal(db.calls.length, 0);
  }
});

test("Excel real incluye todos los resultados autorizados, pesos completos y totales parciales", async () => {
  const db = database({ cierreCredito: [...Array.from({ length: 23 }, (_, index) => credit(index + 1)), credit(99, { sedeId: 2, customerName: "Privado" })] });
  const response = await modules(db.prisma).load("app/api/cierre/export/route.ts").GET(new Request("https://conectamos.test/api/cierre/export?mode=month&month=2026-10&page=2"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /spreadsheetml/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sheet = workbook.getWorksheet("Créditos");
  assert.equal(sheet.rowCount, 24);
  assert.equal(sheet.getCell("E2").value, "1234567");
  assert.equal(sheet.getCell("G2").value, 1000000);
  assert.match(sheet.getCell("G2").numFmt, /#,##0/);
  assert.ok(!JSON.stringify(sheet.getSheetValues()).includes("Privado"));
  const summary = workbook.getWorksheet("Cierre");
  assert.match(summary.getCell("B2").value, /pendiente/);
  assert.equal(summary.getRow(summary.rowCount).getCell(2).value, 23);
  assert.equal(summary.getRow(summary.rowCount).getCell(3).value, 23000000);
});

test("guardado idempotente usa financiera más ID y vincula venta una sola vez conservando eventos", async () => {
  const local = credit(1);
  const provider = credit(2, { localKey: null, providerCreditId: "provider-1", status: "PENDIENTE" });
  const db = database({ cierreCredito: [local, provider] });
  const { saveCierreCredit } = modules(db.prisma).load("lib/cierre-store.ts");
  const data = { ...local, providerCreditId: "provider-1", source: "CONECTAMOS + API PAYJOY" };
  delete data.id; delete data.syncedAt;
  await saveCierreCredit(db.prisma, data);
  await saveCierreCredit(db.prisma, data);
  assert.equal(db.tables.cierreCredito.filter((r) => r.status === "EFECTIVO").length, 1);
  assert.equal(db.tables.cierreCredito.find((r) => r.id === "1").status, "VINCULADO");
  assert.equal(db.tables.cierreEvento.length, 2, "Un evento vínculo y una observación; reintento no duplica");
  await saveCierreCredit(db.prisma, { ...data, localKey: null, providerCreditId: "provider-2" });
  assert.equal(db.tables.cierreCredito.filter((r) => r.status === "EFECTIVO").length, 2, "Misma cédula no deduplica otro préstamo");
});

test("histórico se procesa por lotes reanudables sin perder fechas ni completar antes de drenar", async () => {
  const sales = Array.from({ length: 105 }, (_, index) => sale(index + 1));
  const db = database({ venta: sales, cierreVentaPendiente: sales.map((s) => ({ ventaId: s.id, revision: 1, updatedAt: new Date(0) })),
    cierreSyncEstado: [{ key: "LOCAL", initialized: false }] });
  const { drainCierreLocalQueue } = modules(db.prisma).load("lib/cierre-store.ts");
  assert.deepEqual(await drainCierreLocalQueue(100), { processed: 100, remaining: 5 });
  assert.equal(db.tables.cierreSyncEstado[0].initialized, false);
  assert.equal(db.tables.cierreCredito.length, 100);
  assert.deepEqual(await drainCierreLocalQueue(100), { processed: 5, remaining: 0 });
  assert.equal(db.tables.cierreSyncEstado[0].initialized, true);
  assert.equal(db.tables.cierreCredito.length, 105);
  assert.ok(db.tables.cierreCredito.every((r) => r.effectiveAt.toISOString() === "2025-02-03T19:00:00.000Z"));
  await drainCierreLocalQueue(100);
  assert.equal(db.tables.cierreCredito.length, 105);
});

test("venta eliminada antes del primer lote deja trazabilidad anulada y actualización concurrente conserva outbox", async () => {
  const db = database({ cierreVentaPendiente: [{ ventaId: 1, revision: 1, snapshot: sale(1), updatedAt: new Date() }] });
  const { drainCierreLocalQueue } = modules(db.prisma).load("lib/cierre-store.ts");
  const original = db.prisma.cierreVentaPendiente.deleteMany;
  db.prisma.cierreVentaPendiente.deleteMany = async (args) => {
    db.tables.cierreVentaPendiente[0].revision = 2;
    return original(args);
  };
  assert.deepEqual(await drainCierreLocalQueue(), { processed: 1, remaining: 1 });
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].status, "ANULADO");
  assert.equal(db.tables.cierreEvento.length, 1);
});

test("editar venta local no resucita reverso confirmado por proveedor", async () => {
  const db = database({ venta: [sale(1)], cierreCredito: [credit(1, { providerCreditId: "p-1", status: "REVERSADO", source: "CONECTAMOS + API PAYJOY" })],
    cierreVentaPendiente: [{ ventaId: 1, revision: 1, updatedAt: new Date() }] });
  await modules(db.prisma).load("lib/cierre-store.ts").drainCierreLocalQueue();
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].status, "REVERSADO");
});

test("editar una venta conserva ID proveedor observado aunque aún use importes locales", async () => {
  const db = database({ venta: [sale(1, { payjoy: 1500000 })], cierreCredito: [credit(1, { providerCreditId: "p-observado", creditNumber: "p-observado", source: "CONECTAMOS" })],
    cierreVentaPendiente: [{ ventaId: 1, revision: 1, updatedAt: new Date() }] });
  await modules(db.prisma).load("lib/cierre-store.ts").drainCierreLocalQueue();
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].providerCreditId, "p-observado");
  assert.equal(db.tables.cierreCredito[0].amount, 1500000);
});

test("dato local incompleto mantiene cobertura pendiente y no impide procesar otras ventas", async () => {
  const db = database({ venta: [sale(1, { financierasDetalle: [{ nombre: "PAYJOY", valorNeto: 1000000 }] }), sale(2)],
    cierreVentaPendiente: [1, 2].map((ventaId) => ({ ventaId, revision: 1, updatedAt: new Date(0) })),
    cierreSyncEstado: [{ key: "LOCAL", initialized: false }] });
  const result = await modules(db.prisma).load("lib/cierre-store.ts").drainCierreLocalQueue();
  assert.equal(result.remaining, 1);
  assert.equal(db.tables.cierreSyncEstado[0].initialized, false);
  assert.equal(db.tables.cierreCredito.length, 1);
  assert.equal(db.tables.cierreCredito[0].ventaId, 2);
  assert.equal(db.tables.cierreVentaPendiente[0].ventaId, 1);
  assert.ok(db.tables.cierreVentaPendiente[0].nextAttempt > new Date());
});

async function withProviderEnabled(run) {
  const previous = process.env.CIERRE_PROVIDER_SYNC_ENABLED;
  process.env.CIERRE_PROVIDER_SYNC_ENABLED = "1";
  try { return await run(); }
  finally { if (previous === undefined) delete process.env.CIERRE_PROVIDER_SYNC_ENABLED; else process.env.CIERRE_PROVIDER_SYNC_ENABLED = previous; }
}

test("worker enlaza ID real sin duplicar, aplica reverso y preserva créditos independientes", async () => withProviderEnabled(async () => {
  const db = database({ venta: [sale(1)], cierreCredito: [credit(1)],
    cierreSyncTrabajo: [{ key: "job-1", financial: "PAYJOY", localKey: "VENTA:1:PAYJOY", state: "PENDIENTE", attempts: 0, nextAttempt: new Date(0) }] });
  let status = "EFECTIVO";
  let calls = 0;
  const provider = async () => { calls++; return { credits: [
    { financiera: "PAYJOY", providerId: "p-1", fechaEfectiva: new Date("2026-10-12T18:00:00Z"), valor: 1000000,
      documento: "1234567", imei: "123456789012345", cliente: "Cliente", estado: status, raw: { state: status } },
    { financiera: "PAYJOY", providerId: "p-2", fechaEfectiva: new Date("2026-10-10T18:00:00Z"), valor: 500000,
      documento: "1234567", imei: "999999999999999", cliente: "Cliente", estado: "EFECTIVO", raw: {} },
  ] }; };
  const { runCierreSyncBatch } = modules(db.prisma, { provider }).load("lib/cierre-sync.ts");
  await runCierreSyncBatch();
  assert.equal(calls, 1);
  assert.equal(db.tables.cierreCredito.filter((r) => r.status === "EFECTIVO").length, 1);
  assert.equal(db.tables.cierreCredito.find((r) => r.providerCreditId === "p-2").status, "PENDIENTE", "No atribuir otra operación por cédula");
  status = "REVERSADO";
  db.tables.cierreSyncTrabajo[0].nextAttempt = new Date(0);
  await runCierreSyncBatch();
  assert.equal(db.tables.cierreCredito.find((r) => r.providerCreditId === "p-1").status, "REVERSADO");
  assert.equal(db.tables.cierreCredito.length, 2);
}));

test("fallo API conserva venta y difiere reintento sin consultas elegibilidad adicionales", async () => withProviderEnabled(async () => {
  const db = database({ venta: [sale(1)], cierreCredito: [credit(1)],
    cierreSyncTrabajo: [{ key: "job-1", financial: "PAYJOY", localKey: "VENTA:1:PAYJOY", state: "PENDIENTE", attempts: 0, nextAttempt: new Date(0) }] });
  let calls = 0;
  const provider = async () => { calls++; throw new Error("private provider error"); };
  const { runCierreSyncBatch } = modules(db.prisma, { provider }).load("lib/cierre-sync.ts");
  const result = await runCierreSyncBatch();
  assert.equal(result.provider.failed, true);
  assert.equal(db.tables.cierreCredito[0].status, "EFECTIVO");
  assert.equal(db.tables.cierreSyncTrabajo[0].state, "ERROR");
  assert.ok(db.tables.cierreSyncTrabajo[0].nextAttempt > new Date());
  assert.ok(!db.tables.cierreSyncTrabajo[0].limitation.includes("private"));
  await runCierreSyncBatch();
  assert.equal(calls, 1);
}));

test("lease impide dos workers y secreto protege endpoint de sincronización", async () => {
  const db = database({ cierreSyncEstado: [{ key: "WORKER", lockedUntil: new Date(Date.now() + 60000), lockToken: "other" }] });
  assert.deepEqual(await modules(db.prisma).load("lib/cierre-sync.ts").runCierreSyncBatch(), { busy: true });
  assert.equal(db.calls.filter((c) => c.table === "cierreVentaPendiente").length, 0);
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-worker-secret";
  try {
    const route = modules(db.prisma).load("app/api/cierre/sync/route.ts");
    assert.equal((await route.POST(new Request("https://conectamos.test/api/cierre/sync", { method: "POST" }))).status, 401);
    assert.equal((await route.POST(new Request("https://conectamos.test/api/cierre/sync", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status, 401);
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});
