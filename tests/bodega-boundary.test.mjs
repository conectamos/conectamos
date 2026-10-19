import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => mocks[name] ?? require(name), Set, URL });
  return exports;
}
const access = load("lib/access-control.ts");
const paths = load("lib/bodega-route-access.ts");
function harness(user) {
  const calls = [];
  const NextResponse = {
    next: () => ({ status: 200, next: true }),
    redirect: (url, status = 307) => ({ status, location: String(url) }),
    json: (body, init) => ({ body, ...init }),
  };
  const { proxy } = load("proxy.ts", {
    "next/server": { NextResponse },
    "@/lib/auth": { getSessionUser: async token => { calls.push(token); return user; } },
    "@/lib/access-control": access,
    "@/lib/session": { SESSION_COOKIE_NAME: "session" },
    "@/lib/bodega-route-access": paths,
  });
  const request = (path, method = "GET", token = "signed-session", host = "conectamos.app") => {
    const url = new URL(path, `https://${host}`);
    url.clone = () => new URL(url);
    return { method, url: String(url), nextUrl: url,
      headers: new Headers({ host, "x-role": "ADMIN" }),
      cookies: { has: () => Boolean(token), get: () => token ? { value: token } : undefined },
    };
  };
  return { proxy, request, calls };
}

test("BODEGA no se convierte en administrativo ni recibe permisos financieros o de eliminación", () => {
  assert.equal(access.puedeGestionarBodegaPrincipal("BODEGA"), true);
  assert.equal(access.esRolAdministrativo("BODEGA"), false);
  assert.equal(access.esPerfilAdministrativo("BODEGA"), false);
  assert.equal(access.puedeEliminarRegistros("BODEGA"), false);
  assert.equal(access.puedeGestionarProveedores("BODEGA", "BODEGA"), false);
  assert.equal(access.puedeAccederPanelVendedor("BODEGA", "BODEGA"), false);
  assert.equal(access.puedeAccederPanelFacturador("BODEGA", "BODEGA"), false);
});

test("allowlist permite operaciones logísticas concretas y rechaza métodos alternativos", () => {
  for (const [path, verb] of [
    ["/dashboard", "GET"], ["/dashboard/radar", "GET"],
    ["/api/dashboard/bodega", "GET"], ["/api/dashboard/bodega", "HEAD"],
    ["/api/dashboard/radar/export", "GET"], ["/api/dashboard/radar/export", "HEAD"],
    ["/inventario-principal", "GET"], ["/inventario/nuevo", "GET"],
    ["/inventario/historial", "GET"], ["/prestamos", "GET"],
    ["/api/inventario-principal", "POST"], ["/api/inventario-principal/actualizar", "PATCH"],
    ["/api/inventario-principal/restaurar-bodega", "POST"],
    ["/api/prestamos/devolver", "POST"], ["/api/sedes", "GET"],
    ["/api/login/perfil/cambiar-pin", "POST"], ["/api/session/heartbeat", "POST"],
  ]) assert.equal(paths.puedeAccederRutaBodega(path, verb), true, `${verb} ${path}`);
  for (const [path, verb] of [
    ["/dashboard", "POST"], ["/dashboard/radar", "PATCH"],
    ["/api/dashboard/bodega", "POST"], ["/api/dashboard/bodega", "PATCH"],
    ["/api/dashboard/bodega", "DELETE"], ["/api/dashboard/radar/export", "POST"],
    ["/api/dashboard/radar/export", "PATCH"], ["/api/dashboard/radar/export", "DELETE"],
    ["/inventario-principal", "POST"], ["/api/sedes", "POST"],
    ["/api/inventario-principal", "DELETE"], ["/api/inventario-principal/referencias", "DELETE"],
    ["/api/inventario-principal/referencias", "PATCH"],
    ["/api/inventario-principal/eliminar", "POST"],
    ["/api/prestamos/solicitar-pago", "POST"], ["/api/prestamos/aprobar-pago-lote", "POST"],
    ["/api/financiero/acceso", "GET"], ["/api/financiero/acceso", "POST"],
  ]) assert.equal(paths.puedeAccederRutaBodega(path, verb), false, `${verb} ${path}`);
});

test("proxy deniega todos los módulos ajenos con sesión efectiva, sin confiar en encabezados del navegador", async () => {
  const h = harness({ rolNombre: "BODEGA", perfilTipo: "BODEGA" });
  for (const path of ["/api/caja", "/api/caja/registrar", "/api/ventas", "/api/financiero/cartera",
    "/api/proveedores", "/api/perfiles-vendedor", "/api/sedes/admin", "/api/cierre",
    "/api/vendedor/registros", "/api/dashboard", "/api/dashboard/financiero", "/api/dashboard/bodega/export", "/api/auditoria",
    "/api/inventario", "/api/inventario/listado", "/api/payjoy/cartera", "/api/lista-precios",
    "/api/inventario-principal/eliminar", "/api/prestamos/pagar", "/api/proveedores/1/abonos/2/recibo"]) {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      const response = await h.proxy(h.request(path, method));
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal(response.headers["Cache-Control"], "private, no-store");
    }
  }
  assert.ok(h.calls.every(token => token === "signed-session"));
});

test("navegación ajena a bodega regresa a su dashboard y no ejecuta página financiera", async () => {
  const h = harness({ rolNombre: "BODEGA" });
  for (const path of ["/caja", "/ventas", "/ventas/perfiles", "/dashboard/sedes", "/dashboard/financiero", "/vendedor", "/cierre"]) {
    const response = await h.proxy(h.request(path));
    assert.equal(response.status, 307);
    assert.equal(response.location, "https://conectamos.app/dashboard");
  }
});

test("rutas logísticas conservan sus validaciones de handler y no hacen una segunda lectura de sesión en proxy", async () => {
  const h = harness({ rolNombre: "BODEGA" });
  assert.equal((await h.proxy(h.request("/api/inventario-principal"))).next, true);
  assert.equal((await h.proxy(h.request("/api/inventario-principal/enviar-a-sede", "POST"))).next, true);
  assert.equal((await h.proxy(h.request("/prestamos"))).next, true);
  for (const path of ["/dashboard", "/dashboard/radar", "/api/dashboard/bodega", "/api/dashboard/radar/export"]) {
    assert.equal((await h.proxy(h.request(path))).next, true, path);
  }
  assert.equal(h.calls.length, 0);
});

test("frontera nueva conserva roles existentes, peticiones sin sesión y redirección de dominio", async () => {
  for (const rolNombre of ["ADMIN", "AUDITOR", "SUPERVISOR", "VENDEDOR"]) {
    const h = harness({ rolNombre });
    assert.equal((await h.proxy(h.request("/api/caja"))).next, true);
    assert.equal((await h.proxy(h.request("/ventas"))).next, true);
  }
  const h = harness({ rolNombre: "BODEGA" });
  assert.equal((await h.proxy(h.request("/api/caja", "GET", ""))).next, true);
  const legacy = await h.proxy(h.request("/inventario-principal?a=1", "GET", "", "conectamos-production.up.railway.app"));
  assert.equal(legacy.status, 308);
  assert.equal(legacy.location, "https://conectamos.app/inventario-principal?a=1");
});

test("los recursos públicos no habilitan recibos, archivos privados o rutas API con extensión", () => {
  assert.equal(paths.esRutaPublicaBodega("/_next/static/a.js"), true);
  assert.equal(paths.esRutaPublicaBodega("/branding/conectamos-logo.png"), true);
  assert.equal(paths.esRutaPublicaBodega("/api/proveedores/receipt.png"), false);
  assert.equal(paths.esRutaPublicaBodega("/api/ventas/export.js"), false);
  assert.equal(paths.puedeAccederRutaBodega("/api/inventario-principal/../ventas"), false);
});

test("historial BODEGA valida pertenencia principal antes de consultar movimientos y nunca lee caja o clientes", async () => {
  const calls = [];
  const unexpected = () => { throw new Error("Consulta fuera de inventario principal"); };
  let principal = null;
  const prisma = new Proxy({
    inventarioPrincipal: { findUnique: async args => { calls.push(["principal", args]); return principal; } },
    sede: { findFirst: async () => ({ id: 1, nombre: "BODEGA PRINCIPAL" }), findMany: async () => [{ id: 1, nombre: "BODEGA PRINCIPAL" }] },
    movimientoInventario: { findMany: async args => { calls.push(["movimientos", args]); return []; } },
    prestamoSede: { findMany: async args => { calls.push(["prestamos", args]); return []; } },
  }, { get: (target, key) => target[key] ?? unexpected });
  const { obtenerHistorialBodega } = load("lib/bodega-inventory-history.ts", {
    "@/lib/prisma": { default: prisma }, "@/lib/prestamos": { NOMBRE_SEDE_BODEGA: "BODEGA PRINCIPAL" },
  });
  assert.equal(await obtenerHistorialBodega("1e15"), null);
  assert.equal(calls.length, 0);
  assert.equal(await obtenerHistorialBodega("001234567890123"), null);
  assert.equal(calls.length, 1);
  principal = { id: 5, imei: "001234567890123", sedeDestinoId: 2 };
  const result = await obtenerHistorialBodega(principal.imei);
  assert.equal(result.principal.imei, "001234567890123");
  const movements = calls.find(([name]) => name === "movimientos")[1];
  assert.ok(movements.where.tipoMovimiento.in.every(type => !/PAGO|VENTA/.test(type)));
  const loans = calls.find(([name]) => name === "prestamos")[1];
  assert.deepEqual(JSON.parse(JSON.stringify(loans.where)), { imei: principal.imei, OR: [{ sedeOrigenId: 1 }, { sedeDestinoId: 1 }] });
  assert.equal("montoPago" in loans.select, false);
});


test("navegación compartida de BODEGA solo enlaza sus rutas explícitas y no comparte mutaciones", () => {
  const navigation = load("lib/bodega-navigation.ts");
  const links = navigation.getBodegaNavigation();
  assert.equal(links[0].href, paths.BODEGA_HOME_PATH);
  assert.deepEqual(Array.from(links, item => item.href), [
    "/dashboard", "/inventario-principal", "/inventario/nuevo", "/prestamos",
    "/dashboard/radar", "/dashboard#quien-me-debe",
  ]);
  for (const link of links) {
    assert.equal(paths.puedeAccederRutaBodega(link.href.split("#")[0]), true, link.href);
    assert.ok(link.icon && link.label);
  }
  links[0].label = "Alterado por una vista";
  assert.equal(navigation.getBodegaNavigation()[0].label, "Inicio");
});
