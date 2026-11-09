import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, imports = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", "console", outputText)(
    name => {
      assert.ok(name in imports, `Dependencia inesperada: ${name}`);
      return imports[name];
    },
    loadedModule,
    loadedModule.exports,
    { error() {} },
  );
  return loadedModule.exports;
}

const access = load("lib/access-control.ts");
const operator = { id: 42, rolNombre: "BODEGA", perfilNombre: "Operadora de Bodega", nombre: "Usuario", usuario: "qa" };
const actor = { id: operator.id, nombre: operator.perfilNombre };
const equipo = { imei: "001234567890123", referencia: "Equipo de prueba" };
const payload = { proveedorId: 8, numeroFactura: "FAC-QA-1", imeis: [equipo.imei], valor: "100.01" };
const debt = {
  id: 31, fecha: "2026-11-09", diasDeuda: 0,
  numeroFactura: payload.numeroFactura, proveedor: "Proveedor de prueba",
  valor: payload.valor, abonado: "0.00", saldo: payload.valor,
  equipos: [equipo], pagos: [],
};
const payment = { deudaId: debt.id, valor: "25.01", claveIdempotencia: "pago-qa-123" };
const updated = {
  ...debt, abonado: "25.01", saldo: "75.00",
  pagos: [{ id: 1, fecha: "2026-11-09", valor: payment.valor, registradoPor: actor.nombre }],
};

class BodegaSupplierDebtError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function probe(user, serviceOverrides = {}) {
  const calls = [];
  const record = (operation, value) => async (...args) => {
    calls.push({ operation, args });
    if (serviceOverrides[operation]) return serviceOverrides[operation](...args);
    return value;
  };
  const imports = {
    "next/server": { NextResponse: Response },
    "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/access-control": access,
    "@/lib/bodega-supplier-debt": {
      BodegaSupplierDebtError,
      listarDeudasBodega: record("list", { hoy: debt.fecha, items: [debt] }),
      buscarEquipoDeudaBodega: record("lookup", equipo),
      registrarDeudaBodega: record("register", debt),
      registrarPagoDeudaBodega: record("pay", updated),
    },
  };
  imports["@/app/api/bodega/deudas/access"] = load("app/api/bodega/deudas/access.ts", imports);
  const route = load("app/api/bodega/deudas/route.ts", imports);
  const payments = load("app/api/bodega/deudas/pagos/route.ts", imports);
  const request = (suffix = "", body) => new Request(`https://qa.test/api/bodega/deudas${suffix}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-role": "BODEGA" },
    body,
  });
  return {
    calls,
    list: () => route.GET(request()),
    lookup: () => route.GET(request(`?imei=${equipo.imei}`)),
    register: (body = JSON.stringify(payload)) => route.POST(request("", body)),
    pay: (body = JSON.stringify(payment)) => payments.POST(request("/pagos", body)),
  };
}

test("Deuda exige sesión y el rol efectivo BODEGA para consulta, registro y pagos", async () => {
  for (const user of [null, ...["ADMIN", "AUDITOR", "SUPERVISOR", "VENDEDOR"].map(rolNombre => ({
    ...operator, rolNombre, perfilTipo: "BODEGA",
  }))]) {
    const api = probe(user);
    for (const operation of [api.list, api.lookup, api.register, api.pay]) {
      const response = await operation();
      assert.equal(response.status, user ? 403 : 401);
      assert.match(response.headers.get("cache-control"), /private.*no-store/);
    }
    assert.deepEqual(api.calls, []);
  }
});

test("BODEGA consulta las facturas o busca un IMEI exacto sin perder ceros iniciales", async () => {
  const api = probe(operator);
  const list = await api.list();
  assert.equal(list.status, 200);
  assert.match(list.headers.get("cache-control"), /private.*no-store/);
  assert.deepEqual(await list.json(), { hoy: debt.fecha, items: [debt] });
  const lookup = await api.lookup();
  assert.equal(lookup.status, 200);
  assert.deepEqual(await lookup.json(), { equipo });
  assert.deepEqual(api.calls, [
    { operation: "list", args: [] },
    { operation: "lookup", args: [equipo.imei] },
  ]);
});

test("registro y abonos usan la identidad de la sesión y devuelven el saldo confirmado", async () => {
  const api = probe(operator);
  const spoofed = { ...payload, actor: { id: 999, nombre: "Otro usuario" } };
  const registration = await api.register(JSON.stringify(spoofed));
  assert.equal(registration.status, 201);
  assert.deepEqual(await registration.json(), { item: debt });
  const paid = await api.pay();
  assert.equal(paid.status, 201);
  assert.deepEqual(await paid.json(), { item: updated });
  assert.deepEqual(api.calls, [
    { operation: "register", args: [spoofed, actor] },
    { operation: "pay", args: [payment, actor] },
  ]);
});

test("los cuerpos inválidos se rechazan antes de escribir y se conserva el error de negocio", async () => {
  const api = probe(operator, {
    lookup() { throw new BodegaSupplierDebtError("IMEI no registrado en Bodega Principal.", 404); },
    pay() { throw new BodegaSupplierDebtError("El pago supera el saldo pendiente.", 409); },
  });
  for (const invalid of ["{", "null", "[]", "7"]) {
    assert.equal((await api.register(invalid)).status, 400);
    assert.equal((await api.pay(invalid)).status, 400);
  }
  assert.deepEqual(api.calls, []);
  const lookup = await api.lookup();
  assert.equal(lookup.status, 404);
  assert.deepEqual(await lookup.json(), { error: "IMEI no registrado en Bodega Principal." });
  const denied = await api.pay();
  assert.equal(denied.status, 409);
  assert.deepEqual(await denied.json(), { error: "El pago supera el saldo pendiente." });
});

const dates = load("lib/credit-date-utils.ts");
const money = load("lib/proveedores-pagos.ts");
const suppliers = load("lib/proveedores.ts", {
  "@/lib/credit-date-utils": dates,
  "./proveedores-pagos": money,
});

function withDebtService(steps) {
  const pending = [...steps];
  const queryRaw = async (strings, ...values) => {
    const query = strings.join("?").replace(/\s+/g, " ").trim();
    if (query.includes("pg_advisory_xact_lock")) return [];
    const step = pending.shift();
    assert.ok(step, `Consulta inesperada: ${query}`);
    assert.match(query, step.query);
    if (step.values) assert.deepEqual(values, step.values);
    return step.rows;
  };
  const db = { $queryRaw: queryRaw, $executeRaw: async () => 0 };
  const service = load("lib/bodega-supplier-debt.ts", {
    "@/lib/prisma": { default: { ...db, $transaction: async callback => callback(db) } },
    "@/lib/credit-date-utils": { ...dates, getDateKeyInColombia: () => debt.fecha },
    "@/lib/inventory-imeis": load("lib/inventory-imeis.ts"),
    "@/lib/inventory-distributors": { asegurarCatalogoDistribuidoresInventario: async () => {} },
    "@/lib/proveedores-pagos": money,
    "@/lib/proveedores": suppliers,
  });
  return { service, assertCompleted: () => assert.deepEqual(pending, []) };
}

const supplierLookup = {
  query: /FROM "CatalogoDistribuidorInventario".+"activo" = true/,
  values: [payload.proveedorId], rows: [{ nombre: debt.proveedor }],
};
const inventoryLookup = {
  query: /FROM "InventarioPrincipal".+FOR SHARE/,
  values: [[equipo.imei]], rows: [{ imei: equipo.imei }],
};
const invoiceInsert = {
  query: /INSERT INTO "DeudaProveedorBodega".+ON CONFLICT/,
  values: [debt.fecha, payload.numeroFactura, payload.numeroFactura,
    payload.proveedorId, debt.proveedor, payload.valor, actor.id, actor.nombre],
  rows: [{ id: debt.id }],
};
const invoiceProjection = row => ({
  query: /FROM "DeudaProveedorBodega" d.+sum\(p\."valor"\)/,
  values: [debt.id, debt.id], rows: [row],
});

test("el servidor registra fecha, proveedor e IMEI de Bodega con sus fuentes autorizadas", async () => {
  const fixture = withDebtService([
    supplierLookup, inventoryLookup, invoiceInsert,
    {
      query: /INSERT INTO "DeudaProveedorBodegaEquipo".+SELECT.+"referencia" FROM "InventarioPrincipal"/,
      values: [debt.id, [equipo.imei]], rows: [{ imei: equipo.imei }],
    },
    invoiceProjection(debt),
  ]);
  const saved = await fixture.service.registrarDeudaBodega({
    ...payload, fecha: "2001-01-01", referencia: "Falsa", proveedor: "Falso", imeis: [` ${equipo.imei} `],
  }, actor);
  assert.deepEqual(saved, debt);
  fixture.assertCompleted();
});

test("no crea una deuda para IMEI numérico, repetido, inexistente o ya vinculado", async () => {
  const invalid = withDebtService([]);
  const register = (fixture, imeis) => fixture.service.registrarDeudaBodega({ ...payload, imeis }, actor);
  await assert.rejects(register(invalid, [Number(equipo.imei)]), { status: 400 });
  await assert.rejects(register(invalid, [equipo.imei, ` ${equipo.imei}`]), { status: 400, message: /repetido/ });

  const absent = withDebtService([supplierLookup, { ...inventoryLookup, rows: [] }]);
  await assert.rejects(register(absent, [equipo.imei]), { status: 404, message: /Bodega Principal/ });
  absent.assertCompleted();

  const linked = withDebtService([supplierLookup, inventoryLookup, invoiceInsert, {
    query: /INSERT INTO "DeudaProveedorBodegaEquipo".+ON CONFLICT \("imei"\)/, rows: [],
  }]);
  await assert.rejects(register(linked, [equipo.imei]), { status: 409, message: /otra factura/ });
  linked.assertCompleted();
});

test("abonos bloquean la factura, aceptan parcial y total y protegen contra sobrepago y reintentos", async () => {
  const lock = { query: /FROM "DeudaProveedorBodega".+FOR UPDATE/, values: [debt.id], rows: [{ id: debt.id }] };
  const lookup = (key, rows = []) => ({
    query: /FROM "PagoDeudaProveedorBodega" WHERE "claveIdempotencia"/, values: [key], rows,
  });
  const insert = ({ valor, claveIdempotencia }, id) => ({
    query: /INSERT INTO "PagoDeudaProveedorBodega".+ON CONFLICT \("claveIdempotencia"\)/,
    values: [debt.id, valor, debt.fecha, claveIdempotencia, actor.id, actor.nombre], rows: [{ id }],
  });
  const full = { ...payment, valor: "75.00", claveIdempotencia: "pago-qa-456" };
  const paid = { ...updated, abonado: "100.01", saldo: "0.00", pagos: [
    { ...updated.pagos[0], id: 2, valor: full.valor }, ...updated.pagos,
  ] };
  const over = { ...full, valor: "75.01", claveIdempotencia: "pago-qa-789" };
  const replay = lookup(payment.claveIdempotencia, [{ deudaId: debt.id, valor: payment.valor, registradoPorId: actor.id }]);
  const fixture = withDebtService([
    lock, lookup(payment.claveIdempotencia), invoiceProjection(debt), insert(payment, 1), invoiceProjection(updated),
    lock, replay, invoiceProjection(updated),
    lock, replay,
    lock, lookup(over.claveIdempotencia), invoiceProjection(updated),
    lock, lookup(full.claveIdempotencia), invoiceProjection(updated), insert(full, 2), invoiceProjection(paid),
  ]);
  const pay = request => fixture.service.registrarPagoDeudaBodega(request, actor);
  assert.deepEqual(await pay(payment), updated);
  assert.deepEqual(await pay(payment), updated);
  await assert.rejects(pay({ ...payment, valor: "1.00" }), { status: 409, message: /otro pago/ });
  await assert.rejects(pay(over), { status: 409, message: /superar el saldo pendiente/ });
  assert.deepEqual(await pay(full), paid);
  fixture.assertCompleted();
});
