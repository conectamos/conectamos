import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
export const admin = { id: 7, perfilId: 11, perfilNombre: "Administrador QA", rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR", sedeId: 1 };
export function modules(prisma, options = {}) {
  const cache = new Map();
  const imports = [];
  const mocks = { "@/lib/prisma": prisma, "@/lib/auth": { getSessionUser: async () => options.session === undefined ? admin : options.session }, ...options.mocks };
  function load(relative) {
    relative = relative.replaceAll("\\", "/");
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.join(root, relative);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
    }).outputText;
    const mod = { exports: {} };
    cache.set(relative, mod.exports);
    const require = (name) => {
      imports.push(name);
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("node:")) return nativeRequire(name);
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      if (name.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
      throw new Error(`Unexpected dependency: ${name}`);
    };
    new Function("require", "module", "exports", code)(require, mod, mod.exports);
    return mod.exports;
  }
  return { load, imports };
}

export function invoice(id, changes = {}) {
  return { id, number: `FACT-${id}`, numberNormalized: `FACT-${id}`, provider: "Proveedor QA", providerId: null, providerNormalized: "PROVEEDOR QA",
    date: new Date("2026-10-15T00:00:00.000Z"), dueDate: null, paidDate: null, deletedAt: null, deletedById: null, deletedByProfileId: null, deletedBy: null,
    amount: "1000000.00", paidAmount: "0.00", status: "PENDIENTE", version: 1,
    createRequestId: `seed-${id}`, createRequestHash: "seed", createResult: null,
    createdById: 7, createdByProfileId: 11, createdBy: "Administrador QA", createdAt: new Date("2026-10-15T18:00:00Z"),
    updatedAt: new Date("2026-10-15T18:00:00Z"), ...changes };
}
export function payment(id, invoiceId, changes = {}) {
  return { id, invoiceId, requestId: `seed-payment-${id}`, requestHash: "seed", responseSnapshot: null,
    date: new Date("2026-11-05T00:00:00Z"), mode: "partial", amount: "100.00", balanceBefore: "1000000.00", balanceAfter: "999900.00",
    invoiceNumberSnapshot: `FACT-${invoiceId}`, providerSnapshot: "Proveedor QA", invoiceAmountSnapshot: "1000000.00", reference: null,
    createdById: 7, createdByProfileId: 11, createdBy: "Administrador QA", createdAt: new Date("2026-11-05T18:00:00Z"), ...changes };
}
function matches(row, where = {}) {
  return Object.entries(where).every(([field, rule]) => {
    if (field === "OR") return rule.some((item) => matches(row, item));
    const value = row[field] ?? null;
    if (rule && typeof rule === "object" && !(rule instanceof Date)) {
      return Object.entries(rule).every(([operator, target]) => operator === "not" ? value !== target : operator === "gte" ? value !== null && value >= target : operator === "lt" ? value !== null && value < target
        : operator === "contains" ? String(value).includes(target) : (() => { throw Error(`Unsupported ${operator}`); })());
    }
    return value instanceof Date && rule instanceof Date ? value.getTime() === rule.getTime() : value === rule;
  });
}
function ordered(rows, orderBy) {
  return [...rows].sort((a, b) => {
    for (const order of orderBy || []) for (const [field, config] of Object.entries(order)) {
      const direction = typeof config === "string" ? config : config.sort;
      const nulls = typeof config === "object" ? config.nulls : direction === "asc" ? "last" : "first";
      if (a[field] == null || b[field] == null) {
        if (a[field] == null && b[field] == null) continue;
        return a[field] == null ? nulls === "last" ? 1 : -1 : nulls === "last" ? -1 : 1;
      }
      if (a[field] < b[field]) return direction === "asc" ? -1 : 1;
      if (a[field] > b[field]) return direction === "asc" ? 1 : -1;
    }
    return 0;
  });
}
const clone = (value) => structuredClone(value);
const conflict = () => Object.assign(new Error("Unique constraint"), { code: "P2002" });

// Transactions can interleave. Only SELECT FOR UPDATE serializes competing
// invoice payments; this fixture would reveal duplicate consumption without it.
export function database(seed = {}, options = {}) {
  const tables = { facturaAdministrativa: clone(seed.facturaAdministrativa || []), pagoFacturaAdministrativa: clone(seed.pagoFacturaAdministrativa || []), invoiceAdminEvent: clone(seed.invoiceAdminEvent || []),
    proveedorAdministrativo: clone(seed.proveedorAdministrativo || []), proveedorAdministrativoAlias: clone(seed.proveedorAdministrativoAlias || []), proveedorAdministrativoEvento: clone(seed.proveedorAdministrativoEvento || []),
    invoicePaymentReceipt: clone(seed.invoicePaymentReceipt || []) };
  // Mirror the additive migration backfill so seeded historical invoices have
  // stable provider identities. Tests still exercise the real catalog resolver.
  for (const row of tables.facturaAdministrativa) {
    let provider = tables.proveedorAdministrativo.find((item) => row.providerId ? item.id === row.providerId : item.nameNormalized === row.providerNormalized);
    if (!provider) {
      provider = { id: row.providerId || Math.max(0, ...tables.proveedorAdministrativo.map((item) => item.id)) + 1,
        name: row.provider, nameNormalized: row.providerNormalized, active: true, version: 1 };
      tables.proveedorAdministrativo.push(provider);
    }
    row.providerId = provider.id;
  }
  for (const row of tables.proveedorAdministrativo) if (!tables.proveedorAdministrativoAlias.some((alias) => alias.nameNormalized === row.nameNormalized)) {
    tables.proveedorAdministrativoAlias.push({ id: tables.proveedorAdministrativoAlias.length + 1, nameNormalized: row.nameNormalized, providerId: row.id });
  }
  const calls = [];
  const locks = new Map();
  let invoiceSequence = Math.max(0, ...tables.facturaAdministrativa.map((row) => row.id));
  let paymentSequence = Math.max(0, ...tables.pagoFacturaAdministrativa.map((row) => row.id));
  let eventSequence = Math.max(0, ...tables.invoiceAdminEvent.map((row) => row.id));
  const otherSequences = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, Math.max(0, ...rows.map((row) => Number.isSafeInteger(row.id) ? row.id : 0))]));
  let txSequence = 0;
  async function acquire(key, ctx) {
    if (ctx.held.has(key)) return;
    const previous = locks.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    locks.set(key, previous.then(() => current));
    await previous;
    ctx.held.add(key); ctx.releases.push(release);
  }
  function client(ctx) {
    const source = ctx?.snapshot || tables;
    function decorate(row, args = {}) {
      if (!row) return null;
      const result = clone(row);
      const payments = source.pagoFacturaAdministrativa.filter((item) => item.invoiceId === row.id);
      if (args.include?._count) result._count = { payments: payments.length };
      if (args.include?.payments) result.payments = ordered(payments, args.include.payments.orderBy).map((payment) => {
        const value = clone(payment);
        if (args.include.payments.include?.receipt) value.receipt = decorate(source.invoicePaymentReceipt.find((receipt) => receipt.paymentId === payment.id), args.include.payments.include.receipt);
        return value;
      });
      if (args.include?.events) result.events = clone(ordered(source.invoiceAdminEvent.filter((event) => event.invoiceId === row.id), args.include.events.orderBy));
      return args.select ? Object.fromEntries(Object.entries(args.select).filter(([, allowed]) => allowed === true).map(([key]) => [key, result[key]])) : result;
    }
    const api = {};
    for (const table of Object.keys(tables)) {
      const rows = source[table];
      const methods = {
        findUnique: async (args) => decorate(rows.find((row) => matches(row, args.where)), args),
        findFirst: async (args) => decorate(rows.find((row) => matches(row, args.where)), args),
        findUniqueOrThrow: async (args) => { const row = decorate(rows.find((row) => matches(row, args.where)), args); if (!row) throw Error("Missing row"); return row; },
        findMany: async (args = {}) => ordered(rows.filter((row) => matches(row, args.where)), args.orderBy)
          .slice(args.skip || 0, args.take === undefined ? undefined : (args.skip || 0) + args.take).map((row) => decorate(row, args)),
        count: async (args) => rows.filter((row) => matches(row, args.where)).length,
        aggregate: async (args) => {
          const found = rows.filter((row) => matches(row, args.where));
          const sum = (field) => (found.reduce((total, row) => total + Math.round(Number(row[field]) * 100), 0) / 100).toFixed(2);
          return { _count: { _all: found.length }, _sum: Object.fromEntries(Object.keys(args._sum || {}).map(field => [field, found.length ? sum(field) : null])),
            _max: Object.fromEntries(Object.keys(args._max || {}).map(field => [field, found.length ? ordered(found, [{ [field]: "desc" }])[0][field] : null])) };
        },
        create: async ({ data, select }) => {
          if (!ctx) throw Error("Write outside transaction");
          if (table === "facturaAdministrativa") {
            await acquire(`create:${data.createRequestId}`, ctx);
            await acquire(`number:${data.providerId ?? data.providerNormalized}:${data.numberNormalized}`, ctx);
            if (tables[table].some((row) => row.createRequestId === data.createRequestId ||
              (data.providerId ? row.providerId === data.providerId : !row.providerId && row.providerNormalized === data.providerNormalized) && row.numberNormalized === data.numberNormalized)) throw conflict();
          } else if (table === "proveedorAdministrativo" || table === "proveedorAdministrativoAlias") {
            await acquire(`${table}:${data.nameNormalized}`, ctx);
            if (tables[table].some((row) => row.nameNormalized === data.nameNormalized)) throw conflict();
          } else {
            await acquire(`${table}:${data.requestId}`, ctx);
            if (tables[table].some((row) => row.requestId === data.requestId)) throw conflict();
            if (table === "pagoFacturaAdministrativa" && options.failPaymentWrite || table === "invoiceAdminEvent" && options.failEventWrite) throw Error("Synthetic storage failure");
            if (table === "invoicePaymentReceipt") {
              await acquire(`receipt-payment:${data.paymentId}`, ctx);
              if (tables[table].some((row) => row.paymentId === data.paymentId)) throw conflict();
              if (options.failReceiptWrite) throw Error("Synthetic receipt storage failure");
            }
          }
          const row = table === "facturaAdministrativa" ? invoice(++invoiceSequence, clone(data)) : table === "pagoFacturaAdministrativa"
            ? payment(++paymentSequence, data.invoiceId, clone(data)) : { id: table === "invoiceAdminEvent" ? ++eventSequence : ++otherSequences[table],
              createdAt: new Date(), ...(table === "proveedorAdministrativo" ? { active: true, version: 1 } : {}), ...clone(data) };
          tables[table].push(row);
          ctx.undo.push(() => { const index = tables[table].findIndex((item) => item.id === row.id); if (index >= 0) tables[table].splice(index, 1); });
          return decorate(row, { select });
        },
        update: async ({ where, data }) => {
          if (!ctx) throw Error("Write outside transaction");
          const row = tables[table].find((item) => matches(item, where));
          if (!row) throw Error("Missing row");
          if (table === "facturaAdministrativa" && (data.providerId !== undefined || data.providerNormalized !== undefined || data.numberNormalized !== undefined)) {
            const provider = data.providerId ?? row.providerId ?? data.providerNormalized ?? row.providerNormalized;
            const number = data.numberNormalized ?? row.numberNormalized;
            await acquire(`number:${provider}:${number}`, ctx);
            if (tables[table].some((other) => other.id !== row.id && (other.providerId ?? other.providerNormalized) === provider && other.numberNormalized === number)) throw conflict();
          } else if (table === "proveedorAdministrativo" && data.nameNormalized !== undefined) {
            await acquire(`${table}:${data.nameNormalized}`, ctx);
            if (tables[table].some((other) => other.id !== row.id && other.nameNormalized === data.nameNormalized)) throw conflict();
          }
          const before = clone(row);
          ctx.undo.push(() => Object.assign(row, before));
          for (const [field, value] of Object.entries(data)) row[field] = value && typeof value === "object" && "increment" in value ? row[field] + value.increment : clone(value);
          row.updatedAt = new Date();
          return clone(row);
        },
        upsert: async ({ where, create, update }) => {
          if (!ctx) throw Error("Write outside transaction");
          await acquire(`${table}:${where.nameNormalized}`, ctx);
          const row = tables[table].find((item) => matches(item, where));
          return row ? methods.update({ where, data: update }) : methods.create({ data: create });
        },
      };
      api[table] = Object.fromEntries(Object.entries(methods).map(([method, run]) => [method, async (args) => {
        calls.push({ table, method, args, tx: ctx?.id }); return run(args);
      }]));
    }
    api.$queryRaw = async (strings, id, invoiceId) => {
      if (!ctx) throw Error("Lock outside transaction");
      const target = assertLock(strings.join("?"));
      calls.push({ table: "$queryRaw", id, tx: ctx.id });
      await acquire(`${target}:${id}`, ctx);
      return tables[target].some((row) => row.id === id && (invoiceId === undefined || row.invoiceId === invoiceId)) ? [{ id }] : [];
    };
    return api;
  }
  function assertLock(sql) {
    const match = sql.match(/SELECT "id" FROM "(FacturaAdministrativa|ProveedorAdministrativo|PagoFacturaAdministrativa)" WHERE "id" = \?(?: AND "invoiceId" = \?)? FOR UPDATE/);
    if (!match) throw Error(`Unexpected SQL ${sql}`);
    return match[1] === "FacturaAdministrativa" ? "facturaAdministrativa" : match[1] === "PagoFacturaAdministrativa" ? "pagoFacturaAdministrativa" : "proveedorAdministrativo";
  }
  const prisma = client(null);
  prisma.$transaction = async (run, transactionOptions = {}) => {
    const ctx = { id: ++txSequence, held: new Set(), releases: [], undo: [], snapshot: transactionOptions.isolationLevel === "RepeatableRead" ? clone(tables) : null };
    calls.push({ table: "$transaction", options: transactionOptions, tx: ctx.id });
    try { return await run(client(ctx)); }
    catch (error) { ctx.undo.reverse().forEach((undo) => undo()); throw error; }
    finally { ctx.releases.reverse().forEach((release) => release()); }
  };
  return { prisma, tables, calls };
}
