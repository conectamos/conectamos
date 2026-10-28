import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = path => readFileSync(join(ROOT, path), "utf8");
function load(path, imports = {}) {
  const compiled = ts.transpileModule(source(path), {
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
const avatars = load("lib/profile-avatars.ts");
const warehouse = { id: 1, nombre: "BODEGA PRINCIPAL", activa: true, eliminadoEn: null };
const branch = { id: 2, nombre: "SEDE 2", activa: true, eliminadoEn: null };
const clone = value => structuredClone(value);
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(item => matches(row, item));
    if (key === "sedes") return row.sedes.some(item => matches(item, value.some));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return value.not !== row[key];
      return matches(row[key] ?? {}, value);
    }
    return value === row[key];
  });
}
const profile = (id, tipo, sedeIds = [1]) => ({
  id, tipo, nombre: `${tipo} QA`, pinHash: "pin:1234", activo: true, eliminadoEn: null, avatarKey: "SUPERVISOR",
  debeCambiarPin: false, activeSessionKey: "profile-key", activeSessionLastSeenAt: new Date(),
  sedes: sedeIds.map(sedeId => ({ sedeId, sede: sedeId === 1 ? warehouse : branch })),
});
function profilesProbe(rows = [profile(10, "BODEGA"), profile(20, "AUDITOR", []), profile(30, "VENDEDOR", [2])]) {
  const state = { rows: clone(rows), creates: [], updates: [], links: [], schemaCalls: 0 };
  const prisma = {
    sede: {
      findUnique: async ({ where }) => clone([warehouse, branch].find(item => item.id === where.id) ?? null),
      count: async ({ where }) => [warehouse, branch].filter(item => where.id.in.includes(item.id)).length,
      findMany: async ({ where } = {}) => clone([warehouse, branch].filter(item => !where || matches(item, where))),
    },
    perfilVendedor: {
      findMany: async ({ where }) => clone(state.rows.filter(item => matches(item, where))),
      findFirst: async ({ where }) => clone(state.rows.find(item => matches(item, where)) ?? null),
      create: async ({ data }) => { state.creates.push(clone(data)); return { id: 99 }; },
      update: async ({ where, data }) => { state.updates.push({ where, data }); return {}; },
    },
    perfilVendedorSede: {
      deleteMany: async () => {},
      createMany: async ({ data }) => state.links.push(clone(data)),
    },
  };
  prisma.$queryRaw = async () => [];
  prisma.$transaction = async callback => callback(prisma);
  const service = load("lib/vendor-profiles.ts", {
    "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/access-control": access,
    "@/lib/active-operational-entities": load("lib/active-operational-entities.ts"),
    "@/lib/profile-avatars": avatars,
    "@/lib/password": { verifyPassword: (pin, hash) => hash === `pin:${pin}` },
    "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: async () => state.schemaCalls++ },
  });
  return { state, prisma, service };
}
function authProbe({ base = "USUARIO", tipo = "BODEGA", sede = warehouse, profileId = 10, validKey = true, idle = false, active = true, profileActive = true } = {}) {
  const user = { id: 1, nombre: "Acceso QA", usuario: "qa", activo: active, sedeId: sede.id, sede, rolId: 2, rol: { nombre: base }, activeSessionKey: "user-key", activeSessionLastSeenAt: new Date() };
  const perfil = tipo ? profile(10, tipo, [sede.id]) : null;
  if (perfil) perfil.activo = profileActive;
  const state = { cookieReads: 0, profileWhere: null };
  const auth = load("lib/auth.ts", {
    "next/headers": { cookies: async () => { state.cookieReads++; return { get: () => ({ value: "valid-token" }) }; } },
    "@/lib/prisma": { __esModule: true, default: {
      usuario: { findUnique: async () => clone(user) },
      perfilVendedor: { findFirst: async ({ where }) => { state.profileWhere = where; return perfil && matches(perfil, where) ? clone(perfil) : null; } },
    } },
    "@/lib/session": { SESSION_COOKIE_NAME: "session", verifySessionToken: token => token === "valid-token" ? { userId: 1, profileId, sessionKey: validKey ? profileId ? "profile-key" : "user-key" : "invalid" } : null },
    "@/lib/access-control": access,
    "@/lib/vendor-profiles": { etiquetaTipoPerfilVendedor: tipo => tipo === "BODEGA" ? "Bodega" : tipo },
    "@/lib/session-state": { isSessionIdle: () => idle },
  });
  return { ...auth, state };
}
test("BODEGA concede logística sin convertirse en administrativo ni permitir eliminación", () => {
  assert.equal(access.esRolBodega(" bodega "), true);
  assert.equal(access.esPerfilBodega("bodega"), true);
  for (const role of ["BODEGA", "ADMIN", "AUDITOR"]) assert.equal(access.puedeGestionarBodegaPrincipal(role), true);
  for (const role of ["SUPERVISOR", "USUARIO", "VENDEDOR", ""]) assert.equal(access.puedeGestionarBodegaPrincipal(role), false);
  assert.equal(access.esRolAdministrativo("BODEGA"), false);
  assert.equal(access.esPerfilAdministrativo("BODEGA"), false);
  assert.equal(access.puedeEliminarRegistros("BODEGA"), false);
  assert.equal(access.puedeGestionarProveedores("BODEGA", "BODEGA"), false);
  assert.equal(access.puedeAccederPanelVendedor("BODEGA", "BODEGA"), false);
  assert.equal(access.puedeAccederPanelFacturador("BODEGA", "BODEGA"), false);
});
test("solo el nombre completo BODEGA PRINCIPAL identifica la sede", () => {
  assert.equal(access.esSedeBodegaPrincipal("  bodega   principal "), true);
  for (const name of ["PRINCIPAL", "SEDE PRINCIPAL", "BODEGA PRINCIPAL 2", null]) assert.equal(access.esSedeBodegaPrincipal(name), false);
});
test("sesión BODEGA con PIN no hereda ADMIN ni AUDITOR del usuario base", async () => {
  for (const base of ["USUARIO", "ADMIN", "AUDITOR"]) {
    const auth = authProbe({ base });
    const result = await auth.getSessionUser("valid-token");
    assert.equal(result.rolNombre, "BODEGA"); assert.equal(result.perfilTipo, "BODEGA");
    assert.equal(result.perfilTipoLabel, "Bodega"); assert.equal(auth.state.cookieReads, 0);
  }
});
test("usuario base BODEGA sin perfil conserva acceso BODEGA y actividad de sesión", async () => {
  const result = await authProbe({ base: "BODEGA", tipo: null, profileId: null }).getSessionUser();
  assert.equal(result.rolNombre, "BODEGA"); assert.equal(result.perfilId, null);
  assert.equal(await authProbe({ base: "BODEGA", tipo: null, profileId: null, validKey: false }).getSessionUser(), null);
  assert.equal(await authProbe({ base: "BODEGA", tipo: null, profileId: null, idle: true }).getSessionUser(), null);
});
test("BODEGA rechaza sesiones fuera de principal o con elevación a otro perfil", async () => {
  assert.equal(await authProbe({ sede: branch }).getSessionUser(), null);
  assert.equal(await authProbe({ base: "BODEGA", tipo: null, profileId: null, sede: branch }).getSessionUser(), null);
  for (const tipo of ["ADMINISTRADOR", "AUDITOR", "VENDEDOR"]) assert.equal(await authProbe({ base: "BODEGA", tipo }).getSessionUser(), null);
});
test("sesión BODEGA respeta perfil activo, llave vigente e inactividad", async () => {
  assert.equal(await authProbe({ validKey: false }).getSessionUser(), null);
  assert.equal(await authProbe({ idle: true }).getSessionUser(), null);
  assert.equal(await authProbe({ active: false }).getSessionUser(), null);
  assert.equal(await authProbe({ profileActive: false }).getSessionUser(), null);
  assert.equal(await authProbe().getSessionUser(""), null);
});
test("perfiles anteriores mantienen sus roles efectivos", async () => {
  assert.equal((await authProbe({ base: "USUARIO", tipo: "ADMINISTRADOR" }).getSessionUser()).rolNombre, "ADMIN");
  assert.equal((await authProbe({ base: "USUARIO", tipo: "AUDITOR" }).getSessionUser()).rolNombre, "AUDITOR");
  assert.equal((await authProbe({ base: "USUARIO", tipo: "VENDEDOR" }).getSessionUser()).rolNombre, "USUARIO");
});
test("catálogo permite BODEGA y normaliza su avatar sin nuevos recursos", () => {
  const { service } = profilesProbe();
  assert.equal(service.normalizarTipoPerfilVendedor(" bodega "), "BODEGA");
  assert.equal(service.etiquetaTipoPerfilVendedor("BODEGA"), "Bodega");
  assert.equal(service.normalizarAvatarPerfilVendedor("ADMINISTRADOR_HOMBRE", "BODEGA"), "SUPERVISOR");
  assert.ok(avatars.obtenerOpcionesAvatarPorTipo("BODEGA").length > 0);
});
test("solo principal ofrece BODEGA, y un usuario base BODEGA no recibe otros perfiles", async () => {
  const { service } = profilesProbe([profile(10, "BODEGA", [1, 2]), profile(20, "AUDITOR", []), profile(30, "VENDEDOR", [1])]);
  assert.deepEqual((await service.obtenerPerfilesAccesoPorSede(1)).map(item => item.id), [10, 20, 30]);
  assert.deepEqual((await service.obtenerPerfilesAccesoPorSede(2)).map(item => item.id), [20]);
  assert.deepEqual((await service.obtenerPerfilesAccesoPorSede(1, { soloBodega: true })).map(item => item.id), [10]);
  assert.deepEqual(await service.obtenerPerfilesAccesoPorSede(2, { soloBodega: true }), []);
});
test("validación PIN exige asociación a principal, PIN real y perfil BODEGA para base BODEGA", async () => {
  const { service } = profilesProbe([profile(10, "BODEGA", [1, 2]), profile(20, "AUDITOR", [])]);
  assert.equal((await service.validarPerfilAccesoPorSede({ perfilId: 10, sedeId: 1, pin: "1234", soloBodega: true })).tipo, "BODEGA");
  assert.equal(await service.validarPerfilAccesoPorSede({ perfilId: 10, sedeId: 1, pin: "0000" }), null);
  assert.equal(await service.validarPerfilAccesoPorSede({ perfilId: 10, sedeId: 2, pin: "1234" }), null);
  assert.equal(await service.validarPerfilAccesoPorSede({ perfilId: 20, sedeId: 1, pin: "1234", soloBodega: true }), null);
});
const payload = { nombre: "Encargado QA", tipo: "BODEGA", sedeIds: [1], avatarKey: "SUPERVISOR", documento: null, telefono: null, correo: null, pinHash: "hash:qa", activo: true };
test("creación y edición BODEGA rechazan otras sedes sin modificar perfiles", async () => {
  for (const sedeIds of [[], [2], [1, 2]]) {
    const { service, state } = profilesProbe();
    await assert.rejects(service.crearPerfilVendedor({ ...payload, sedeIds }), /únicamente a BODEGA PRINCIPAL/);
    await assert.rejects(service.actualizarPerfilVendedor(10, { ...payload, sedeIds }), /únicamente a BODEGA PRINCIPAL/);
    assert.equal(state.creates.length, 0); assert.equal(state.updates.length, 0); assert.equal(state.links.length, 0);
  }
});
test("BODEGA se guarda ligado a principal y editar sin PIN no cambia su clave", async () => {
  const { service, state } = profilesProbe();
  assert.equal(await service.crearPerfilVendedor(payload), 99);
  assert.equal(state.creates[0].tipo, "BODEGA");
  assert.deepEqual(state.links[0], [{ perfilVendedorId: 99, sedeId: 1 }]);
  await service.actualizarPerfilVendedor(10, { ...payload, pinHash: undefined });
  assert.equal("pinHash" in state.updates[0].data, false);
  assert.equal("debeCambiarPin" in state.updates[0].data, false);
});
class NextResponse extends Response {
  constructor(body, options) {
    super(body, options);
    this.cookieValues = new Map();
    this.cookies = { set: (name, value) => this.cookieValues.set(name, value), delete: name => this.cookieValues.delete(name) };
  }
  static json(body, options = {}) { return new NextResponse(JSON.stringify(body), options); }
}
function managementProbe(rolNombre, tipoActual = "BODEGA") {
  const { service, prisma } = profilesProbe(); const writes = [];
  const route = load("app/api/perfiles-vendedor/route.ts", {
    "next/server": { NextResponse }, "@/lib/auth": { getSessionUser: async () => ({ id: 1, rolNombre }) },
    "@/lib/prisma": { __esModule: true, default: { ...prisma, perfilVendedor: { findUnique: async () => ({ tipo: tipoActual }) } } },
    "@/lib/password": { hashPassword: pin => `hash:${pin}` }, "@/lib/access-control": access,
    "@/lib/admin-entity-removal-access": load("lib/admin-entity-removal-access.ts", { "@/lib/access-control": access }),
    "@/lib/admin-entity-removal": {},
    "@/lib/active-operational-entities": load("lib/active-operational-entities.ts"),
    "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: async () => {} },
    "@/lib/vendor-profiles": { ...service, obtenerPerfilesVendedor: async () => [], crearPerfilVendedor: async data => writes.push(data), actualizarPerfilVendedor: async (id, data) => writes.push({ id, ...data }) },
  });
  return { route, writes };
}
const request = body => new Request("http://qa.invalid/api/perfiles-vendedor", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const profileRequest = { ...payload, id: 10, pin: "1234" };
test("solo ADMIN puede crear o cambiar un perfil a BODEGA", async () => {
  for (const role of ["AUDITOR", "BODEGA", "USUARIO"]) {
    const { route, writes } = managementProbe(role, "VENDEDOR");
    assert.equal((await route.POST(request(profileRequest))).status, 403);
    assert.equal((await route.PATCH(request(profileRequest))).status, 403);
    assert.equal(writes.length, 0);
  }
  const { route, writes } = managementProbe("ADMIN");
  assert.equal((await route.POST(request(profileRequest))).status, 200);
  assert.equal(writes[0].tipo, "BODEGA"); assert.equal(writes[0].debeCambiarPin, true);
});
test("AUDITOR tampoco puede retirar el rol BODEGA de un perfil existente", async () => {
  const { route, writes } = managementProbe("AUDITOR");
  assert.equal((await route.PATCH(request({ ...profileRequest, tipo: "VENDEDOR" }))).status, 403);
  assert.equal(writes.length, 0);
});
function loginProbe({ base = "USUARIO", sede = warehouse, rows = [profile(10, "BODEGA"), profile(20, "ADMINISTRADOR", [])], pendingId = 10 } = {}) {
  const { prisma, service, state } = profilesProbe(rows);
  state.sessions = [];
  const user = { id: 1, activo: true, nombre: "Base QA", usuario: "qa", claveHash: "secret", sedeId: sede.id, sede, rol: { nombre: base } };
  const db = { ...prisma, usuario: { findUnique: async () => clone(user), update: async () => assert.fail("No cambiar claves de prueba en este flujo") } };
  const session = {
    SESSION_COOKIE_NAME: "session", PENDING_PROFILE_COOKIE_NAME: "pending", PENDING_PIN_CHANGE_COOKIE_NAME: "pending-pin",
    getSessionCookieOptions: () => ({}), createPendingProfileToken: () => "pending-token",
    createPendingPinChangeToken: () => "pending-pin-token", createSessionToken: (...args) => { state.sessions.push(args); return "session-token"; },
    verifyPendingProfileToken: token => token === "pending-token" ? { userId: 1 } : null,
    verifyPendingPinChangeToken: token => token === "pending-pin-token" ? { userId: 1, profileId: pendingId } : null,
  };
  const imports = {
    "next/server": { NextResponse },
    "next/headers": { cookies: async () => ({ get: name => ({ value: name === "pending" ? "pending-token" : "pending-pin-token" }) }) },
    "@/lib/prisma": { __esModule: true, default: db }, "@/lib/vendor-profiles": service,
    "@/lib/access-control": access, "@/lib/session": session,
    "@/lib/password": { verifyPassword: (pin, hash) => hash === pin || hash === `pin:${pin}`, hashPassword: pin => `pin:${pin}`, isPasswordHash: () => true },
    "@/lib/session-state": { createProfileSession: async () => "profile-key", createUserSession: async () => "user-key" },
  };
  return { state, login: load("app/api/login/route.ts", imports), profileLogin: load("app/api/login/perfil/route.ts", imports), changePin: load("app/api/login/perfil/cambiar-pin/route.ts", imports) };
}
test("login base BODEGA presenta solo sus perfiles y nunca da sesión antes de validar PIN", async () => {
  const { login, state } = loginProbe({ base: "BODEGA" });
  const response = await login.POST(request({ usuario: "qa", clave: "secret" }));
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.requiresProfile, true);
  assert.deepEqual(data.perfiles.map(item => item.tipo), ["BODEGA"]);
  assert.equal(state.sessions.length, 0); assert.equal(response.cookieValues.get("session"), "");
});
test("login base BODEGA fuera de principal no abre sesión; sin perfiles conserva login directo", async () => {
  const rejected = loginProbe({ base: "BODEGA", sede: branch });
  assert.equal((await rejected.login.POST(request({ usuario: "qa", clave: "secret" }))).status, 403);
  assert.equal(rejected.state.sessions.length, 0);
  const allowed = loginProbe({ base: "BODEGA", rows: [] });
  const response = await allowed.login.POST(request({ usuario: "qa", clave: "secret" }));
  assert.equal((await response.json()).requiresProfile, false);
  assert.deepEqual(allowed.state.sessions, [[1, null, "user-key"]]);
});
test("login de perfil mantiene PIN y bloquea BODEGA fuera de principal y elevación de base BODEGA", async () => {
  const allowed = loginProbe();
  const response = await allowed.profileLogin.POST(request({ perfilId: 10, pin: "1234" }));
  assert.equal(response.status, 200); assert.equal((await response.json()).perfil.tipo, "BODEGA");
  assert.deepEqual(allowed.state.sessions, [[1, 10, "profile-key"]]);
  for (const probe of [loginProbe({ sede: branch, rows: [profile(10, "BODEGA", [1, 2])] }), loginProbe({ base: "BODEGA", rows: [profile(10, "ADMINISTRADOR", [])] })]) {
    assert.equal((await probe.profileLogin.POST(request({ perfilId: 10, pin: "1234" }))).status, 401);
    assert.equal(probe.state.sessions.length, 0);
  }
});
test("BODEGA conserva cambio obligatorio de PIN y abre sesión solo después de guardarlo", async () => {
  const row = { ...profile(10, "BODEGA"), debeCambiarPin: true };
  const probe = loginProbe({ rows: [row] });
  const first = await probe.profileLogin.POST(request({ perfilId: 10, pin: "1234" }));
  assert.equal((await first.json()).requiresPinChange, true); assert.equal(probe.state.sessions.length, 0);
  const invalid = await probe.changePin.POST(request({ nuevoPin: "9876", confirmarPin: "9875" }));
  assert.equal(invalid.status, 400); assert.equal(probe.state.updates.length, 0);
  const response = await probe.changePin.POST(request({ nuevoPin: "9876", confirmarPin: "9876" }));
  assert.equal(response.status, 200); assert.equal(probe.state.updates[0].data.pinHash, "pin:9876");
  assert.equal(probe.state.updates[0].data.debeCambiarPin, false);
  assert.deepEqual(probe.state.sessions, [[1, 10, "profile-key"]]);
});
test("cambio PIN pendiente BODEGA revalida sede y tipo antes de tocar el PIN", async () => {
  const invalidScopes = [
    { sede: branch, rows: [{ ...profile(10, "BODEGA", [1, 2]), debeCambiarPin: true }] },
    { base: "BODEGA", rows: [{ ...profile(10, "ADMINISTRADOR", []), debeCambiarPin: true }] },
  ];
  for (const options of invalidScopes) {
    const probe = loginProbe(options);
    assert.equal((await probe.changePin.GET()).status, 401);
    assert.equal((await probe.changePin.POST(request({ nuevoPin: "9876", confirmarPin: "9876" }))).status, 401);
    assert.equal(probe.state.updates.length, 0); assert.equal(probe.state.sessions.length, 0);
  }
});
test("migración idempotente agrega solo rol y enum sin usuarios ni claves", () => {
  const sql = source("scripts/apply-bodega-role-schema.sql");
  assert.match(sql, /ADD VALUE IF NOT EXISTS 'BODEGA'/);
  assert.match(sql, /ON CONFLICT \("nombre"\) DO NOTHING/);
  assert.match(sql, /SET LOCAL lock_timeout = '5s'/);
  assert.match(sql, /SET LOCAL statement_timeout = '30s'/);
  assert.doesNotMatch(sql, /Usuario|claveHash|pinHash|UPDATE|DELETE|DROP/);
});


test("login, perfil BODEGA y cambio obligatorio de PIN abren su dashboard solo tras confirmar el servidor", async () => {
  const page = source("app/page.tsx");
  const ast = ts.createSourceFile("login.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword));
  const names = ["login", "confirmarPerfil", "confirmarCambioPin"];
  const statements = component.body.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(entry => names.includes(entry.name.getText(ast))));
  const handlersSource = statements.map(node => node.getText(ast)).join("\n");
  for (const [handlerName, endpoint] of [["login", "/api/login"], ["confirmarPerfil", "/api/login/perfil"], ["confirmarCambioPin", "/api/login/perfil/cambiar-pin"]]) {
    const pushes = []; const calls = [];
    let finishRequest;
    const request = new Promise(resolve => { finishRequest = resolve; });
    const noop = () => {};
    const dependencies = {
      router: { push: href => pushes.push(href) },
      setTimeout: fn => fn(),
      fetchLoginApi: async (path, options) => { calls.push({ path, options }); return request; },
      setCargando: noop, setMensaje: noop, setPasoPerfil: noop, setPerfiles: noop,
      setUsuarioPendiente: noop, setClave: noop, setModalModo: noop,
      limpiarEstadoModal: noop, setPerfilId: noop, setBusqueda: noop,
      abrirModalCambioPin: noop,
      loginRequestErrorMessage: () => "Error de prueba",
      usuario: "principal", clave: "clave-qa", perfilId: "10", pin: "1234",
      nuevoPin: "9876", confirmarPin: "9876",
    };
    const handlers = new Function(...Object.keys(dependencies), `${handlersSource}; return { ${names.join(",")} };`)(...Object.values(dependencies));
    const operation = handlers[handlerName]();
    assert.deepEqual(pushes, [], handlerName);
    assert.equal(calls[0].path, endpoint);
    finishRequest({ response: { ok: true }, data: { usuario: { nombre: "Bodega QA", rol: { nombre: "BODEGA" } }, perfil: { id: 10, tipo: "BODEGA" } } });
    await operation;
    assert.deepEqual(pushes, ["/dashboard"], handlerName);
  }
});
