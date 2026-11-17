import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { modules, admin } from "./invoice-payments-test-helpers.mjs";

const migration = readFileSync(new URL("../scripts/apply-cierre-schema.sql", import.meta.url), "utf8");
const catalogStart = migration.indexOf("-- Stable provider catalog.");
const tables = { proveedorAdministrativo: "ProveedorAdministrativo", proveedorAdministrativoAlias: "ProveedorAdministrativoAlias",
  proveedorAdministrativoEvento: "ProveedorAdministrativoEvento" };
const quote = (key) => { assert.match(key, /^[a-zA-Z][a-zA-Z0-9]*$/); return `"${key}"`; };
const value = (key, entry) => ["snapshot", "responseSnapshot"].includes(key) ? JSON.stringify(entry) : entry;

// The service runs against PostgreSQL/WASM, with a narrow Prisma-shaped adapter.
// SQL constraints, row locks, transactions, trigger behavior and rollback are real.
function adapter(db, calls, options = {}) {
  const client = {};
  async function run(sql, values = []) {
    calls.push(sql);
    try { return (await db.query(sql, values)).rows; }
    catch (error) { if (error.code === "23505") error.code = "P2002"; throw error; }
  }
  function where(input, start = 1) {
    const keys = Object.keys(input);
    return { sql: keys.map((key, index) => `${quote(key)} = $${start + index}`).join(" AND "), values: keys.map((key) => input[key]) };
  }
  for (const [model, table] of Object.entries(tables)) {
    const sqlTable = quote(table);
    const methods = {
      async findUnique({ where: input }) { const filter = where(input); return (await run(`SELECT * FROM ${sqlTable} WHERE ${filter.sql}`, filter.values))[0] ?? null; },
      async findUniqueOrThrow(args) { const row = await methods.findUnique(args); if (!row) throw Error("Missing row"); return row; },
      async findMany({ where: input = {}, orderBy = [] } = {}) {
        const filter = where(input);
        const order = orderBy.flatMap((item) => Object.entries(item).map(([key, direction]) => `${quote(key)} ${direction === "desc" ? "DESC" : "ASC"}`)).join(", ");
        return run(`SELECT * FROM ${sqlTable}${filter.sql ? ` WHERE ${filter.sql}` : ""}${order ? ` ORDER BY ${order}` : ""}`, filter.values);
      },
      async create({ data }) {
        if (options.failEvent && model === "proveedorAdministrativoEvento") throw Error("Synthetic audit failure");
        const keys = Object.keys(data);
        return (await run(`INSERT INTO ${sqlTable} (${keys.map(quote).join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")}) RETURNING *`, keys.map((key) => value(key, data[key]))))[0];
      },
      async update({ where: input, data }) {
        const keys = Object.keys(data);
        const values = keys.map((key) => data[key] && typeof data[key] === "object" && "increment" in data[key] ? data[key].increment : value(key, data[key]));
        const expressions = keys.map((key, index) => `${quote(key)} = ${data[key] && typeof data[key] === "object" && "increment" in data[key] ? `${quote(key)} + ` : ""}$${index + 1}`);
        const filter = where(input, keys.length + 1);
        return (await run(`UPDATE ${sqlTable} SET ${expressions.join(",")} WHERE ${filter.sql} RETURNING *`, [...values, ...filter.values]))[0];
      },
      async upsert({ where: input, create }) {
        const keys = Object.keys(create); const conflict = Object.keys(input)[0];
        return (await run(`INSERT INTO ${sqlTable} (${keys.map(quote).join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT (${quote(conflict)}) DO UPDATE SET ${quote(conflict)} = EXCLUDED.${quote(conflict)} RETURNING *`, keys.map((key) => value(key, create[key]))))[0];
      },
    };
    client[model] = methods;
  }
  client.$queryRaw = async (strings, ...values) => run(strings.reduce((sql, part, index) => sql + (index ? `$${index}` : "") + part, ""), values);
  client.$transaction = (callback) => db.transaction((tx) => callback(adapter(tx, calls, options)));
  return client;
}

async function setup(options = {}) {
  const db = new PGlite();
  await db.exec('CREATE TABLE "Venta" (id INTEGER PRIMARY KEY); CREATE TABLE "RegistroVendedorVenta" (id INTEGER PRIMARY KEY, "ventaIdRelacionada" INTEGER);');
  await db.exec(migration);
  const calls = [];
  const prisma = adapter(db, calls, options);
  const loader = modules(prisma, { session: options.session === undefined ? admin : options.session });
  return { db, calls, prisma, loader, service: loader.load("lib/invoice-providers.ts") };
}
const create = (name = "Proveedor Élite", requestId = "provider-create-001") => ({ requestId, name });
const request = (method, body, origin = "https://conectamos.test") => new Request("https://conectamos.test/api/pago-facturas/providers", {
  method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const context = (id) => ({ params: Promise.resolve({ id: String(id) }) });

test("catálogo crea y reintenta sin duplicar, conserva alias al renombrar y rechaza nombre ocupado", async () => {
  const { db, service } = await setup();
  try {
    const first = await service.createInvoiceProvider(create(), admin);
    assert.deepEqual(first.provider, { id: 1, name: "Proveedor Élite", active: true, version: 1 });
    assert.equal((await service.createInvoiceProvider(create(), admin)).replayed, true);
    await assert.rejects(service.createInvoiceProvider(create("Otro"), admin), (error) => error.code === "IDEMPOTENCY_CONFLICT");
    await assert.rejects(service.createInvoiceProvider(create("proveedor elite", "provider-duplicate-001"), admin), (error) => error.code === "DUPLICATE_PROVIDER");
    const renamed = await service.renameInvoiceProvider(1, { requestId: "provider-rename-001", version: 1, name: "Nombre nuevo" }, admin);
    assert.equal(renamed.provider.version, 2);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "ProveedorAdministrativoAlias"')).rows[0].n, 2);
    await assert.rejects(service.createInvoiceProvider(create("Proveedor Élite", "provider-oldname-001"), admin), (error) => error.code === "DUPLICATE_PROVIDER");
    assert.equal((await service.readInvoiceProviders(admin)).items[0].name, "Nombre nuevo");
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "ProveedorAdministrativoEvento"')).rows[0].n, 2);
  } finally { await db.close(); }
});

test("desactivar y reactivar conserva identidad, versión y respuesta idempotente", async () => {
  const { db, service } = await setup();
  try {
    await service.createInvoiceProvider(create(), admin);
    const command = { requestId: "provider-remove-001", version: 1 };
    const removed = await service.deactivateInvoiceProvider(1, command, admin);
    assert.equal(removed.provider.active, false);
    assert.equal((await service.readInvoiceProviders(admin)).items.length, 0);
    assert.equal((await service.deactivateInvoiceProvider(1, command, admin)).replayed, true);
    const restored = await service.createInvoiceProvider(create("proveedor elite", "provider-reactivate-001"), admin);
    assert.equal(restored.provider.id, 1); assert.equal(restored.provider.version, 3); assert.equal(restored.provider.active, true);
    await assert.rejects(service.renameInvoiceProvider(1, { requestId: "provider-stale-001", version: 1, name: "Nuevo" }, admin), (error) => error.code === "STALE_VERSION");
    const replay = await service.deactivateInvoiceProvider(1, command, admin);
    assert.equal(replay.provider.active, false, "Replay conserva respuesta original, no ejecuta otra eliminación");
    assert.equal((await service.readInvoiceProviders(admin)).items.length, 1);
  } finally { await db.close(); }
});

test("resolver bloquea nuevas facturas inactivas, conserva snapshot existente y reconoce nombres antiguos", async () => {
  const { db, service, prisma, calls } = await setup();
  try {
    await service.createInvoiceProvider(create(), admin);
    await service.renameInvoiceProvider(1, { requestId: "provider-rename-001", version: 1, name: "Nuevo" }, admin);
    const oldName = await prisma.$transaction((tx) => service.resolveInvoiceProvider(tx, { provider: "proveedor elite" }));
    assert.deepEqual(oldName, { id: 1, name: "Nuevo" });
    await service.deactivateInvoiceProvider(1, { requestId: "provider-remove-001", version: 2 }, admin);
    await assert.rejects(prisma.$transaction((tx) => service.resolveInvoiceProvider(tx, { providerId: 1 })), (error) => error.code === "PROVIDER_INACTIVE");
    const historical = await prisma.$transaction((tx) => service.resolveInvoiceProvider(tx, { providerId: 1, existing: { providerId: 1, provider: "Proveedor Élite" } }));
    assert.deepEqual(historical, { id: 1, name: "Proveedor Élite" });
    const legacy = await prisma.$transaction((tx) => service.resolveInvoiceProvider(tx, { provider: "Proveedor nuevo" }));
    assert.equal(legacy.name, "Proveedor nuevo");
    assert.ok(calls.some((sql) => sql.includes('FROM "ProveedorAdministrativo"') && sql.endsWith("FOR UPDATE")));
  } finally { await db.close(); }
});

test("fallo en auditoría revierte creación y alias", async () => {
  const { db, service } = await setup({ failEvent: true });
  try {
    await assert.rejects(service.createInvoiceProvider(create(), admin), /audit failure/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "ProveedorAdministrativo"')).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "ProveedorAdministrativoAlias"')).rows[0].n, 0);
  } finally { await db.close(); }
});

test("rutas catálogo requieren administrador central y origen, devuelven errores de dominio", async () => {
  for (const session of [null, { ...admin, rolNombre: "AUDITOR" }, { ...admin, perfilTipo: "VENDEDOR" }, { ...admin, perfilTipo: "SUPERVISOR_TIENDA" }]) {
    const { db, loader, calls } = await setup({ session });
    try {
      const list = loader.load("app/api/pago-facturas/providers/route.ts");
      const item = loader.load("app/api/pago-facturas/providers/[id]/route.ts");
      const responses = await Promise.all([list.GET(), list.POST(request("POST", create())),
        item.PATCH(request("PATCH", { requestId: "provider-edit-001", version: 1, name: "Nuevo" }), context(1)),
        item.DELETE(request("DELETE", { requestId: "provider-remove-001", version: 1 }), context(1))]);
      assert.ok(responses.every((response) => response.status === (session ? 403 : 401)));
      assert.equal(calls.length, 0);
    } finally { await db.close(); }
  }
  const { db, loader } = await setup();
  try {
    const route = loader.load("app/api/pago-facturas/providers/route.ts");
    assert.equal((await route.POST(request("POST", create(), "https://ajeno.test"))).status, 403);
    assert.equal((await route.POST(request("POST", create()))).status, 201);
    assert.equal((await route.POST(request("POST", create()))).status, 200);
    assert.equal((await route.POST(request("POST", create("Proveedor Élite", "provider-other-001")))).status, 409);
    assert.equal((await route.GET()).headers.get("cache-control"), "private, no-store");
  } finally { await db.close(); }
});

test("migración real conserva facturas históricas, soporta app antigua y reserva identidad tras rename", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Venta" (id INTEGER PRIMARY KEY); CREATE TABLE "RegistroVendedorVenta" (id INTEGER PRIMARY KEY, "ventaIdRelacionada" INTEGER);');
    await db.exec(`${migration.slice(0, catalogStart)}COMMIT;`);
    const insert = 'INSERT INTO "FacturaAdministrativa" ("number","numberNormalized","provider","providerNormalized","date","amount","createRequestId","createRequestHash","createdById","createdBy") VALUES ($1,$1,$2,$3,\'2026-12-31\',100,$4,\'hash\',1,\'Administrador QA\') RETURNING *';
    await db.query(insert, ["FAC-1", "Nombre anterior", "NOMBRE ANTERIOR", "invoice-legacy-001"]);
    await db.exec('UPDATE "FacturaAdministrativa" SET "paidAmount" = 25, "version" = 2; INSERT INTO "PagoFacturaAdministrativa" ("invoiceId","requestId","requestHash","responseSnapshot","date","mode","amount","balanceBefore","balanceAfter","invoiceNumberSnapshot","providerSnapshot","invoiceAmountSnapshot","createdById","createdBy") VALUES (1,\'historical-payment\',\'hash\',\'{}\',\'2027-01-02\',\'partial\',25,100,75,\'FAC-1\',\'Nombre anterior\',100,1,\'Administrador QA\');');
    await db.exec(migration);
    const before = (await db.query('SELECT * FROM "FacturaAdministrativa"')).rows[0];
    assert.ok(before.providerId); assert.equal(before.provider, "Nombre anterior");
    assert.equal(Number(before.paidAmount), 25); assert.equal(before.version, 2);
    const calls = []; const prisma = adapter(db, calls); const service = modules(prisma).load("lib/invoice-providers.ts");
    await service.renameInvoiceProvider(before.providerId, { requestId: "rename-provider-001", version: 1, name: "Nombre actual" }, admin);
    await db.exec(migration);
    const retained = (await db.query('SELECT * FROM "FacturaAdministrativa"')).rows[0];
    assert.equal(retained.provider, before.provider); assert.equal(retained.providerId, before.providerId);
    const payment = (await db.query('SELECT * FROM "PagoFacturaAdministrativa"')).rows[0];
    assert.equal(Number(payment.amount), 25); assert.equal(payment.providerSnapshot, "Nombre anterior");
    const second = (await db.query(insert, ["FAC-2", "Nombre anterior", "NOMBRE ANTERIOR", "invoice-legacy-002"])).rows[0];
    assert.equal(second.providerId, before.providerId, "Una alta del app antiguo posterior al backfill recibe identidad estable");
    await assert.rejects(db.query(insert, ["FAC-1", "Nombre actual", "NOMBRE ACTUAL", "invoice-duplicate-001"]), (error) => error.code === "23505");
    const other = await service.createInvoiceProvider(create("Otra identidad", "provider-other-001"), admin);
    await db.query('INSERT INTO "FacturaAdministrativa" ("number","numberNormalized","provider","providerNormalized","providerId","date","amount","createRequestId","createRequestHash","createdById","createdBy") VALUES (\'FAC-1\',\'FAC-1\',\'Nombre anterior\',\'NOMBRE ANTERIOR\',$1,\'2026-12-31\',100,\'invoice-other-identity\',\'hash\',1,\'Administrador QA\')', [other.provider.id]);
    await db.exec(migration);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "FacturaAdministrativa" WHERE "number" = \'FAC-1\'')).rows[0].n, 2,
      "Reejecutar no recrea el antiguo índice por snapshot: identidades distintas pueden conservar nombres históricos iguales");
    await service.deactivateInvoiceProvider(before.providerId, { requestId: "remove-provider-001", version: 2 }, admin);
    await assert.rejects(db.query(insert, ["FAC-3", "Nombre anterior", "NOMBRE ANTERIOR", "invoice-inactive-001"]), (error) => error.code === "23514");
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "FacturaAdministrativa"')).rows[0].n, 3);
  } finally { await db.close(); }
});
