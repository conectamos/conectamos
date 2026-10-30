import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
export const administrator = { id: 10, nombre: "Administrador QA", sedeId: 6, sedeNombre: "SEDE 6 QA", rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR" };
export const supervisor = { ...administrator, nombre: "Supervisor QA", rolNombre: "SUPERVISOR", perfilTipo: "SUPERVISOR_TIENDA" };
export const historicalDescription = "Pago de deuda del equipo IMEI 350000000000101 a Proveedor Histórico QA";
export const longDescription = `Pago aprobado hacia Bodega QA. Detalle de equipos: ${Array.from({ length: 28 }, (_, index) => `IMEI 35000000000${String(index).padStart(4, "0")} referencia Modelo QA ${index + 1}`).join("; ")}. FIN DEL DETALLE QA`;
const movement = {
  id: 101, tipo: "EGRESO", concepto: "PAGO DEUDA INVENTARIO", valor: 1250000,
  descripcion: historicalDescription, sedeId: 6, sede: { nombre: "SEDE 6 QA" },
  createdAt: new Date("2026-10-30T00:17:39.000Z"),
};
export const syntheticMovements = [
  movement,
  { ...movement, id: 102, tipo: "INGRESO", concepto: "ABONO FINANCIERA", valor: 250000, descripcion: "Abono recibido QA", createdAt: new Date("2026-10-29T10:00:00Z") },
  { ...movement, id: 103, valor: 50000, descripcion: null, createdAt: new Date("2026-10-29T15:00:00Z") },
  { ...movement, id: 104, concepto: "PAGO PRESTAMO ENTRE SEDES", valor: 750000, descripcion: longDescription, createdAt: new Date("2026-10-29T18:00:00Z") },
  { ...movement, id: 105, valor: 999999, descripcion: "DESTINATARIO SEDE AJENA QA", sedeId: 8, sede: { nombre: "SEDE 8 QA" }, createdAt: new Date("2026-10-29T12:00:00Z") },
  { ...movement, id: 106, valor: 111111, descripcion: "DIA ANTERIOR QA", createdAt: new Date("2026-10-29T04:59:59.999Z") },
  { ...movement, id: 107, valor: 222222, descripcion: "DIA SIGUIENTE QA", createdAt: new Date("2026-10-30T05:00:00Z") },
  { ...movement, id: 108, tipo: "INGRESO", valor: 10000, descripcion: "INICIO DEL DIA QA", createdAt: new Date("2026-10-29T05:00:00Z") },
  { ...movement, id: 109, valor: 5000, descripcion: "FIN DEL DIA QA", createdAt: new Date("2026-10-30T04:59:59.999Z") },
];
export const syntheticRecords = {
  movimientos: syntheticMovements,
  gastos: [{ id: 201, valor: 15000, observacion: "Gestión de cartera QA", sedeId: 6, sede: { nombre: "SEDE 6 QA" }, createdAt: new Date("2026-10-29T16:30:00Z") }],
  ventas: [{ id: 301, idVenta: "VENTA-QA-301", servicio: "TELEFONIA", descripcion: "Equipo sintético QA", serial: "350000000000301", sedeId: 6, sede: { nombre: "SEDE 6 QA" }, fecha: new Date("2026-10-29T17:00:00Z"), ingreso: 200000, tipoIngreso: "EFECTIVO", primerValor: 200000, ingreso1: "EFECTIVO", utilidad: 30000, comision: 10000, salida: 5000, cajaOficina: 185000, payjoy: 800000, cerrador: "Asesor QA", jalador: "Apoyo QA" }],
  registros: [],
};

function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "AND") return (Array.isArray(expected) ? expected : [expected]).every((part) => matches(row, part));
    if (key === "OR") return expected.some((part) => matches(row, part));
    if (key === "NOT") return !(Array.isArray(expected) ? expected : [expected]).some((part) => matches(row, part));
    const actual = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if ("in" in expected) return expected.in.includes(actual);
      if ("gte" in expected && !(actual >= expected.gte)) return false;
      if ("gt" in expected && !(actual > expected.gt)) return false;
      if ("lt" in expected && !(actual < expected.lt)) return false;
      if ("lte" in expected && !(actual <= expected.lte)) return false;
      if (["gte", "gt", "lt", "lte"].some((key) => key in expected)) return true;
      return matches(actual || {}, expected);
    }
    return actual === expected;
  });
}

// Projection is intentional: a field omitted by the production SELECT must
// disappear from the fixture too, so tests detect lost descriptions/dates/IDs.
function project(row, select) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select).filter(([, choice]) => choice).map(([key, choice]) => [
    key, choice === true || row[key] == null ? row[key] : project(row[key], choice.select),
  ]));
}

export function createFixture(options = {}) {
  const user = "user" in options ? options.user : administrator;
  const records = structuredClone({ ...syntheticRecords, ...options.records });
  const calls = [];
  const pdfText = [];
  const errors = [];
  function table(name, rows) {
    const selectRows = (args) => rows.filter((row) => matches(row, args.where));
    return {
      async findMany(args = {}) {
        calls.push({ table: name, method: "findMany", ...args });
        const selected = selectRows(args);
        const orderBy = Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : [];
        selected.sort((left, right) => {
          for (const order of orderBy) for (const [key, direction] of Object.entries(order)) {
            if (left[key] !== right[key]) return (left[key] > right[key] ? 1 : -1) * (direction === "desc" ? -1 : 1);
          }
          return 0;
        });
        return selected.slice(args.skip || 0, args.take == null ? undefined : (args.skip || 0) + args.take).map((row) => project(row, args.select));
      },
      async count(args = {}) { calls.push({ table: name, method: "count", ...args }); return selectRows(args).length; },
      async aggregate(args = {}) {
        calls.push({ table: name, method: "aggregate", ...args });
        const selected = selectRows(args);
        return {
          _sum: Object.fromEntries(Object.keys(args._sum || {}).map((key) => [key, selected.reduce((sum, row) => sum + Number(row[key] || 0), 0)])),
          _count: Object.fromEntries(Object.keys(args._count || {}).map((key) => [key, selected.length])),
        };
      },
    };
  }
  const prisma = {
    cajaMovimiento: table("cajaMovimiento", records.movimientos),
    gastoCartera: table("gastoCartera", records.gastos),
    venta: table("venta", records.ventas),
    registroVendedorVenta: table("registroVendedorVenta", records.registros),
    sede: { async findUnique(args) {
      calls.push({ table: "sede", method: "findUnique", ...args });
      return [6, 8].includes(args.where.id) ? project({ id: args.where.id, nombre: `SEDE ${args.where.id} QA` }, args.select) : null;
    } },
  };
  class ObservedPDF extends PDFDocument {
    text(...args) {
      if (typeof args[0] === "string") pdfText.push(args[0]);
      return super.text(...args);
    }
  }
  const imports = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/prisma": { default: prisma, __esModule: true },
    "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/ventas-personal": { obtenerCatalogoPersonalVenta: async () => ({ financieras: [] }) },
    exceljs: { default: ExcelJS, __esModule: true },
    pdfkit: { default: ObservedPDF, __esModule: true },
  };
  const localModules = new Set(["lib/access-control.ts", "lib/ventas-utils.ts", "lib/ventas-financieras.ts", "lib/cierre-caja-movimientos.ts"]);
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const source = readFileSync(path.join(ROOT, relative), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const loadedModule = { exports: {} };
    cache.set(relative, loadedModule.exports);
    const resolveImport = (name) => {
      if (name in imports) return imports[name];
      if (name.startsWith("node:")) return require(name);
      const local = name.startsWith("@/") ? `${name.slice(2)}.ts` : name.startsWith(".") ? path.posix.join(path.posix.dirname(relative), `${name}.ts`) : null;
      assert.ok(local && localModules.has(local), `Unexpected dependency: ${name}`);
      return load(local);
    };
    new Function("require", "module", "exports", "console", "process", code)(resolveImport, loadedModule, loadedModule.exports,
      { error: (...args) => errors.push(args), warn() {} }, { ...process, cwd: () => ROOT });
    return loadedModule.exports;
  }
  const route = load("app/api/caja/cierre-dia/route.ts");
  return { GET: route.GET, calls, records, pdfText, errors };
}

export async function GET(request, options) { return createFixture(options).GET(request); }
