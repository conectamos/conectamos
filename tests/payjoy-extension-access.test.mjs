import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(relativePath, imports = {}, environment = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "process", output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { env: environment });
  return loaded.exports;
}

const accessControl = load("../lib/access-control.ts");
const {
  puedeConsultarExtensionesPayJoy: puedeConsultar,
  puedeGestionarExtensionesPayJoy: puedeGestionar,
  scopeRegistrosExtensionesPayJoy: scope,
} = load("../lib/payjoy-extensions-access.ts", { "@/lib/access-control": accessControl });

const perfil = (perfilTipo, rolNombre = "SEDE") => ({ perfilTipo, rolNombre, perfilId: 7, sedeId: 3 });
const denegado = { perfilVendedorId: -1, sedeId: -1 };

test("vendedor, apoyo y supervisor consultan y gestionan dentro de su perfil y sede", () => {
  for (const tipo of ["VENDEDOR", "APOYO_OPERATIVO", "SUPERVISOR_TIENDA"]) {
    for (const rol of ["SEDE", "ADMIN"]) {
      const session = perfil(tipo, rol);
      assert.equal(puedeConsultar(session), true);
      assert.equal(puedeGestionar(session), true);
      assert.deepEqual(scope(session), { perfilVendedorId: 7, sedeId: 3 });
    }
  }
});

test("las identidades administrativas explícitas conservan consulta global", () => {
  for (const session of [perfil("ADMINISTRADOR", "ADMIN"), { rolNombre: "ADMIN", perfilId: null }]) {
    assert.equal(puedeConsultar(session), true);
    assert.equal(puedeGestionar(session), true);
    assert.deepEqual(scope(session), {});
  }
  for (const session of [perfil("AUDITOR", "AUDITOR"), { rolNombre: "AUDITOR" }]) {
    assert.equal(puedeConsultar(session), true);
    assert.equal(puedeGestionar(session), false);
    assert.deepEqual(scope(session), {});
  }
});

test("auditor nunca puede gestionar aunque use un perfil comercial", () => {
  const session = perfil("VENDEDOR", "AUDITOR");
  assert.equal(puedeConsultar(session), true);
  assert.equal(puedeGestionar(session), false);
  assert.deepEqual(scope(session), { perfilVendedorId: 7, sedeId: 3 });
});

test("bodega y facturador no heredan permisos del rol administrador", () => {
  for (const tipo of ["BODEGA", "FACTURADOR"]) {
    for (const session of [perfil(tipo, "ADMIN"), perfil("ADMINISTRADOR", tipo), { rolNombre: tipo }]) {
      assert.equal(puedeConsultar(session), false);
      assert.equal(puedeGestionar(session), false);
      assert.deepEqual(scope(session), denegado);
    }
  }
});

test("sesiones incompletas o desconocidas no reciben acceso por defecto", () => {
  const cases = [null, undefined, {}, { rolNombre: "SUPERVISOR" }, perfil("DESCONOCIDO", "ADMIN"),
    { rolNombre: "ADMIN", perfilId: 7 }, { perfilTipo: "VENDEDOR", rolNombre: "ADMIN" }];
  for (const invalidId of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "7"]) {
    cases.push({ ...perfil("VENDEDOR", "ADMIN"), perfilId: invalidId });
  }
  for (const session of cases) {
    assert.equal(puedeConsultar(session), false);
    assert.equal(puedeGestionar(session), false);
    assert.deepEqual(scope(session), denegado);
  }
});

test("el scope comercial se cierra si falta una sede válida", () => {
  for (const sedeId of [undefined, null, 0, -1, 2.5, "3"]) {
    assert.deepEqual(scope({ ...perfil("VENDEDOR", "ADMIN"), sedeId }), denegado);
  }
});

test("normaliza los nombres sin ampliar el alcance del perfil seleccionado", () => {
  const session = perfil(" vendedor ", " admin ");
  assert.equal(puedeConsultar(session), true);
  assert.equal(puedeGestionar(session), true);
  assert.deepEqual(scope(session), { perfilVendedorId: 7, sedeId: 3 });
});

function originGuard(environment = {}) {
  return load("../lib/payjoy-extensions-origin.ts", { "server-only": {} }, environment).payJoyExtensionRequestHasTrustedOrigin;
}
const deployment = { NODE_ENV: "production", APP_URL: "https://conectamos.example", RAILWAY_PUBLIC_DOMAIN: "conectamos-test.up.railway.app" };
function originRequest(origin, headers = {}, url = "http://0.0.0.0:8080/api/payjoy/extensiones") {
  return new Request(url, { method: "POST", headers: { ...(origin == null ? {} : { origin }), ...headers } });
}

test("acepta los dos orígenes públicos configurados detrás del hostname interno de Railway", () => {
  const allowed = originGuard(deployment);
  for (const origin of ["https://conectamos.example", "https://conectamos-test.up.railway.app"]) {
    assert.equal(allowed(originRequest(origin, { "sec-fetch-site": "same-origin" })), true);
  }
  assert.equal(originGuard({ NODE_ENV: "production", RAILWAY_PUBLIC_DOMAIN: deployment.RAILWAY_PUBLIC_DOMAIN })(originRequest("https://conectamos-test.up.railway.app")), true);
});

test("no amplía confianza usando Host ni encabezados reenviados ni acepta orígenes deformados", () => {
  const allowed = originGuard(deployment);
  for (const origin of [null, "null", "https://evil.example", "https://conectamos.example.evil.example", "http://conectamos.example", "https://conectamos.example:444", "https://conectamos.example/", "https://user@conectamos.example", "https://conectamos.example, https://evil.example", "http://0.0.0.0:8080"]) {
    assert.equal(allowed(originRequest(origin, { host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" })), false, String(origin));
  }
  assert.equal(allowed(originRequest(deployment.APP_URL, { "sec-fetch-site": "cross-site" })), false);
});

test("sin configuración solo admite localhost en desarrollo y mantiene cerrado producción", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const origin = `http://${host}:3000`;
    assert.equal(originGuard({ NODE_ENV: "development" })(originRequest(origin, {}, `${origin}/api/payjoy/extensiones`)), true);
    assert.equal(originGuard({ NODE_ENV: "production" })(originRequest(origin, {}, `${origin}/api/payjoy/extensiones`)), false);
  }
  assert.equal(originGuard({ NODE_ENV: "development" })(originRequest("https://evil.example", {}, "https://evil.example/api/payjoy/extensiones")), false);
  assert.equal(originGuard({ NODE_ENV: "development" })(originRequest("http://localhost:3001", {}, "http://localhost:3000/api/payjoy/extensiones")), false);
  for (const environment of [{ APP_URL: "invalid" }, { APP_URL: "https://user:secret@conectamos.example" }, { RAILWAY_PUBLIC_DOMAIN: "evil.example/path" }]) {
    assert.equal(originGuard({ NODE_ENV: "development", ...environment })(originRequest("http://localhost:3000", {}, "http://localhost:3000/api/payjoy/extensiones")), false);
  }
});

test("la ruta POST aplica el guard antes de buscar, preparar o confirmar operaciones", async () => {
  const calls = [];
  class ExtensionError extends Error {
    constructor(code, status, message) { super(message); this.code = code; this.status = status; }
  }
  const route = load("../app/api/payjoy/extensiones/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/auth": { getSessionUser: async () => ({ id: 1 }) },
    "@/lib/payjoy-extensions-access": { puedeConsultarExtensionesPayJoy: () => true },
    "@/lib/payjoy-extensions-origin": { payJoyExtensionRequestHasTrustedOrigin: originGuard(deployment) },
    "@/lib/payjoy-extensions-service": {
      PayJoyExtensionsError: ExtensionError,
      buscarDispositivosLocalesPayJoy: async () => { calls.push("buscar"); return { devices: [] }; },
      prepararExtensionPayJoy: async () => { calls.push("preparar"); return {}; },
      confirmarExtensionPayJoy: async () => { calls.push("confirmar"); return {}; },
    },
  });
  const request = (action, origin) => new Request("http://0.0.0.0:8080/api/payjoy/extensiones", {
    method: "POST", headers: { origin, "content-type": "application/json", host: "evil.example", "x-forwarded-host": "evil.example" }, body: JSON.stringify({ action }),
  });
  for (const action of ["buscar", "preparar", "confirmar"]) {
    const denied = await route.POST(request(action, "https://evil.example"));
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, "ORIGIN");
  }
  assert.deepEqual(calls, []);
  const accepted = await route.POST(request("buscar", deployment.APP_URL));
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { devices: [] });
  assert.deepEqual(calls, ["buscar"]);
});
