import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, imports = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)(name => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const access = load("lib/access-control.ts");
const intakeAccess = load("lib/inventory-intake-access.ts", { "@/lib/access-control": access });
const imeis = load("lib/inventory-imeis.ts");
const productTypes = load("lib/product-types.ts");
const operationalEntities = load("lib/active-operational-entities.ts");
const admin = { id: 1, usuario: "admin-qa", rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR", sedeId: 1 };
const supervisor = { id: 2, usuario: "supervisor-qa", rolNombre: "SUPERVISOR", perfilTipo: null, sedeId: 2 };
const supervisorProfile = { ...supervisor, rolNombre: "ADMIN", perfilTipo: "SUPERVISOR_TIENDA" };
const auditor = { ...admin, rolNombre: "AUDITOR", perfilTipo: "AUDITOR" };
const bodega = { ...admin, rolNombre: "BODEGA", perfilTipo: "BODEGA" };
const equipment = {
  imeis: ["001234567890123"], referencia: "TECNO QA", tipoProducto: "TELEFONIA",
  costo: 350000, distribuidor: "QA", numeroFactura: "QA-123", estadoFinanciero: "PAGO",
};

function harness({ user, value, beforeRegister = () => {} }) {
  const state = { user, value, stock: [], movements: [], settingsWrites: [], registrationAttempts: 0 };
  const db = {
    $queryRaw: async (query, key) => {
      assert.match(query.join("?"), /FROM "ConfiguracionSistema"/);
      assert.equal(key, "inventario.ingresoDirectoSede");
      return state.value === undefined ? [] : [{ valor: state.value }];
    },
    $executeRaw: async (query, key, value, actor) => {
      assert.match(query.join("?"), /INSERT INTO "ConfiguracionSistema"/);
      assert.equal(key, "inventario.ingresoDirectoSede");
      state.value = JSON.parse(value);
      state.settingsWrites.push({ value: state.value, actor });
      return 1;
    },
    sede: { findUnique: async () => ({ nombre: "SEDE QA", activa: true }) },
    inventarioSede: { findMany: async () => [] },
    inventarioPrincipal: { findMany: async () => [] },
  };
  const prisma = { "@/lib/prisma": { __esModule: true, default: db } };
  const baseImports = {
    ...prisma,
    "@/lib/access-control": access,
    "@/lib/inventory-intake-access": intakeAccess,
  };
  const policy = load("lib/inventory-intake-policy.ts", {
    ...baseImports,
    "@/lib/vendor-welcome-message": { ensureSystemConfigSchema: async () => {} },
  });
  const registration = load("lib/inventory-intake-registration.ts", {
    ...prisma, "@/lib/inventory-imeis": imeis,
  });
  const captureStock = destination => async ({ data }) => {
    state.stock.push(...data.map(item => ({ destination, ...item })));
    return { count: data.length };
  };
  const tx = {
    $queryRaw: async (query, key) => {
      const sql = query.join("?");
      if (sql.includes('FROM "Sede"')) return [{ id: key }];
      assert.match(sql, /FOR SHARE/);
      return db.$queryRaw(query, key);
    },
    sede: db.sede,
    inventarioPrincipal: { createMany: captureStock("PRINCIPAL") },
    inventarioSede: { createMany: captureStock("SEDE"), findFirst: async () => state.stock.at(-1) },
    movimientoInventario: {
      createMany: async ({ data }) => { state.movements.push(...data); return { count: data.length }; },
    },
  };
  const imports = {
    ...baseImports,
    "next/server": { NextResponse: Response },
    "@/lib/auth": { getSessionUser: async () => state.user },
    "@/lib/inventory-intake-policy": policy,
    "@/lib/product-types": productTypes,
    "@/lib/active-operational-entities": operationalEntities,
    "@/lib/inventory-imeis": imeis,
    "@/lib/inventory-intake-registration": {
      ...registration,
      registrarCargaInventarioUnaVez: async ({ registrar }) => {
        state.registrationAttempts++;
        await beforeRegister(state);
        return registrar(tx);
      },
    },
    "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: async () => {} },
    "@/lib/inventory-references": {
      normalizarReferenciaInventario: value => value,
      buscarReferenciaInventarioActiva: async nombre => ({ nombre }),
    },
    "@/lib/sedes": { esSedeVentas: () => false },
    "@/lib/inventory-creditors": {},
    "@/lib/record-catalog-media": {},
  };
  const setting = load("app/api/admin/inventario-ingreso/route.ts", imports);
  const sede = load("app/api/inventario/route.ts", imports);
  const principal = load("app/api/inventario-principal/route.ts", imports);
  const review = load("app/api/inventario/revisar/route.ts", imports);
  const session = load("app/api/session/route.ts", imports);
  const request = (path, method, body) => new Request(`http://qa.test${path}`, {
    method, headers: { "Content-Type": "application/json", "Idempotency-Key": "policy-test-01" },
    body: JSON.stringify(body),
  });
  return {
    state,
    session: session.GET,
    setting: setting.GET,
    patch: body => setting.PATCH(request("/api/admin/inventario-ingreso", "PATCH", body)),
    sede: body => sede.POST(request("/api/inventario", "POST", { ...equipment, ...body })),
    principal: () => principal.POST(request("/api/inventario-principal", "POST", equipment)),
    review: (destino, sedeId) => review.POST(request("/api/inventario/revisar", "POST", { destino, sedeId, imeis: equipment.imeis })),
  };
}

test("solo el administrador central consulta y modifica el ajuste con booleanos estrictos", async () => {
  const api = harness({ user: admin });
  assert.deepEqual(await (await api.setting()).json(), { habilitado: false });

  for (const identity of [null, auditor, supervisor, supervisorProfile, bodega]) {
    api.state.user = identity;
    const status = identity ? 403 : 401;
    assert.equal((await api.setting()).status, status);
    assert.equal((await api.patch({ habilitado: true })).status, status);
  }
  api.state.user = admin;
  for (const body of [{}, { habilitado: "true" }, { habilitado: 1 }, { habilitado: null }, null]) {
    assert.equal((await api.patch(body)).status, 400);
  }
  assert.deepEqual(api.state.settingsWrites, []);
  for (const habilitado of [true, false]) {
    const response = await api.patch({ habilitado });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { habilitado });
    assert.deepEqual(await (await api.setting()).json(), { habilitado });
  }
  assert.deepEqual(api.state.settingsWrites, [
    { value: true, actor: admin.usuario }, { value: false, actor: admin.usuario },
  ]);
});

test("sin permiso guardado, ambos tipos de supervisor quedan bloqueados en sesión, revisión e ingreso", async () => {
  for (const user of [supervisor, supervisorProfile]) {
    const api = harness({ user });
    assert.equal((await (await api.session()).json()).puedeIngresarInventario, false);
    assert.equal((await api.review("SEDE")).status, 403);
    assert.equal((await api.sede()).status, 403);
    assert.equal((await api.principal()).status, 403);
    assert.equal(api.state.registrationAttempts, 0);
    assert.deepEqual(api.state.stock, []);
  }
});

test("habilitar permite ingresar y revisar solo en la sede propia, incluso con cuenta base ADMIN", async () => {
  const api = harness({ user: admin });
  assert.equal((await api.patch({ habilitado: true })).status, 200);
  api.state.user = supervisorProfile;
  assert.equal((await (await api.session()).json()).puedeIngresarInventario, true);
  assert.equal((await api.review("SEDE", supervisor.sedeId)).status, 200);
  assert.equal((await api.review("SEDE", 3)).status, 403);
  assert.equal((await api.review("PRINCIPAL")).status, 403);
  assert.equal((await api.sede({ sedeId: 3 })).status, 403);
  assert.equal((await api.principal()).status, 403);
  const result = await api.sede({ sedeId: supervisor.sedeId });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).insertados, 1);
  assert.equal(api.state.stock[0].sedeId, supervisor.sedeId);
  assert.equal(api.state.registrationAttempts, 1);

  api.state.user = admin;
  assert.equal((await api.patch({ habilitado: false })).status, 200);
  api.state.user = supervisorProfile;
  assert.equal((await api.sede()).status, 403);
  assert.equal(api.state.registrationAttempts, 1);
});

test("BODEGA ingresa por principal y el ajuste no abre el ingreso directo a sedes", async () => {
  const api = harness({ user: bodega, value: true });
  assert.equal((await (await api.session()).json()).puedeIngresarInventario, true);
  assert.equal((await api.review("SEDE")).status, 403);
  assert.equal((await api.sede()).status, 403);
  assert.equal((await api.review("PRINCIPAL")).status, 200);
  const result = await api.principal();
  assert.equal(result.status, 200);
  assert.equal((await result.json()).insertados, 1);
  assert.equal(api.state.stock[0].destination, "PRINCIPAL");
  assert.equal(api.state.movements[0].tipoMovimiento, "INGRESO_PRINCIPAL");
});

test("deshabilitar mientras se prepara la carga impide crear equipos y movimientos", async () => {
  const api = harness({
    user: supervisor, value: true,
    beforeRegister: state => { state.value = false; },
  });
  const result = await api.sede();
  assert.equal(api.state.registrationAttempts, 1);
  assert.equal(result.status, 403);
  assert.equal((await result.json()).codigo, "INGRESO_DESHABILITADO");
  assert.deepEqual(api.state.stock, []);
  assert.deepEqual(api.state.movements, []);
});
