import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
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
    "@/lib/cierre-providers": {
      consultarLoteProveedorCierre: options.provider || (() => { throw new Error("Provider I/O forbidden"); }),
      consultarPeriodoPayJoyCierre: options.periodProvider || (() => { throw new Error("Provider period I/O forbidden"); }),
      classifyCierreProviderError: (error) => load("lib/cierre-providers.ts").classifyCierreProviderError(error),
    },
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
        if (operator === "startsWith") return typeof value === "string" && value.startsWith(target);
        if (operator === "gt") return value !== null && value > target;
        if (operator === "gte") return value !== null && value >= target;
        if (operator === "lt") return value !== null && value < target;
        if (operator === "lte") return value !== null && value <= target;
        throw new Error(`Unimplemented mock operator ${operator}`);
      });
    }
    return value instanceof Date && rule instanceof Date ? value.getTime() === rule.getTime() : value === rule;
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
        nextAttempt: new Date(), state: "PENDIENTE", initialized: false, localKey: null, providerCreditId: null, ...data };
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
      const result = run(args);
      return result && !Array.isArray(result) && typeof result === "object" ? { ...result } : result;
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


export { modules, database, credit, sale, admin, supervisor, params };
