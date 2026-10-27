import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");

function load(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const access = load("../lib/access-control.ts");
const extensionsAccess = load("../lib/payjoy-extensions-access.ts", { "@/lib/access-control": access });
const baseSession = {
  id: 3, nombre: "Cuenta QA", usuario: "qa", rolNombre: "SEDE", sedeId: 2,
  sedeNombre: "SEDE QA", sedeSoloInventarioPorCobrar: false,
  perfilTipo: "SUPERVISOR_TIENDA", perfilTipoLabel: "Supervisor de tienda",
  perfilId: 7, perfilNombre: "Perfil QA", sessionKey: "never-sent-to-client",
};
const EXTENSIONS = "/vendedor/payjoy/extensiones";
const hrefs = element => element.props.navigation.map(item => item.href);

async function pageFor(session) {
  const calls = [];
  const Page = load("../app/vendedor/payjoy/extensiones/page.tsx", {
    "react/jsx-runtime": jsx,
    "next/navigation": { redirect(path) { const error = new Error("redirect"); error.path = path; throw error; } },
    "@/lib/page-access": { async requireVendorPage() { calls.push("requireVendorPage"); return session; } },
    "@/lib/access-control": access,
    "@/lib/payjoy-extensions-access": extensionsAccess,
    "./workspace": { __esModule: true, default: () => null },
  }).default;
  const element = await Page();
  assert.deepEqual(calls, ["requireVendorPage"]);
  assert.equal(new Set(hrefs(element)).size, hrefs(element).length);
  return element;
}

test("ADMIN y AUDITOR conservan sus módulos operativos y el acceso PayJoy sin duplicar destinos", async () => {
  const expected = ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/cierre", "/dashboard/aprobaciones", "/dashboard/reportes", "/dashboard/sedes", EXTENSIONS];
  for (const rolNombre of ["ADMIN", "AUDITOR"]) {
    const element = await pageFor({ ...baseSession, rolNombre, perfilTipo: null, perfilId: null, perfilNombre: null, perfilTipoLabel: null });
    assert.deepEqual(hrefs(element), expected);
    assert.equal(element.props.canManage, rolNombre === "ADMIN");
    assert.equal(element.props.session.nombre, baseSession.nombre);
    assert.equal(element.props.session.roleLabel, rolNombre);
  }
});

test("el perfil vendedor prevalece sobre ADMIN y no recibe enlaces operativos ni búsqueda de registros ajenos", async () => {
  const expected = ["/dashboard", "/cierre", "/vendedor/registros", "/vendedor/lista-negra", "/vendedor/lista-precios", EXTENSIONS];
  for (const rolNombre of ["ADMIN", "SEDE"]) {
    const element = await pageFor({ ...baseSession, rolNombre, perfilTipo: "VENDEDOR", perfilTipoLabel: "Vendedora" });
    assert.deepEqual(hrefs(element), expected);
    assert.equal(element.props.canManage, true);
    assert.equal(element.props.session.roleLabel, "Vendedora");
  }
});

test("apoyo operativo conserva Radar y sus herramientas comerciales sin heredar los módulos del login ADMIN", async () => {
  const element = await pageFor({ ...baseSession, rolNombre: "ADMIN", perfilTipo: "APOYO_OPERATIVO", perfilTipoLabel: "Apoyo operativo" });
  assert.deepEqual(hrefs(element), ["/dashboard", "/cierre", "/vendedor/registros", "/dashboard/radar", "/vendedor/lista-negra", "/vendedor/lista-precios", EXTENSIONS]);
  assert.equal(element.props.navigation.find(item => item.href === "/vendedor/registros").label, "Registrar ventas");
});

test("supervisor conserva módulos de su sede y Panel analítico, sin Configuración administrativa", async () => {
  const element = await pageFor(baseSession);
  assert.deepEqual(hrefs(element), ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/cierre", "/dashboard/aprobaciones", "/dashboard/analitico", EXTENSIONS]);
  assert.equal(element.props.canManage, true);
});

test("sedes de solo inventario conservan su menú restringido, incluidos stands, sin alterar el acceso administrativo", async () => {
  for (const sedeNombre of ["Stand QA", "SEDE QA"]) {
    const element = await pageFor({ ...baseSession, sedeNombre, sedeSoloInventarioPorCobrar: true });
    assert.deepEqual(hrefs(element), ["/dashboard", "/inventario", "/prestamos", "/cierre", EXTENSIONS]);
    assert.equal(element.props.session.sedeNombre, sedeNombre);
  }
  const admin = await pageFor({ ...baseSession, rolNombre: "ADMIN", perfilTipo: "ADMINISTRADOR", sedeSoloInventarioPorCobrar: true });
  assert.ok(hrefs(admin).includes("/dashboard/sedes"));
  const sales = await pageFor({ ...baseSession, perfilTipo: "VENDEDOR", sedeSoloInventarioPorCobrar: true });
  assert.ok(hrefs(sales).includes("/vendedor/registros"));
  assert.ok(!hrefs(sales).includes("/inventario"));
});

test("las identidades restringidas e inválidas son rechazadas por el guard existente antes de renderizar la navegación", async () => {
  for (const config of [
    { perfilTipo: "BODEGA", rolNombre: "BODEGA" },
    { perfilTipo: "FACTURADOR", rolNombre: "ADMIN" },
    { perfilTipo: "DESCONOCIDO", rolNombre: "ADMIN" },
    { perfilTipo: "VENDEDOR", rolNombre: "ADMIN", perfilId: null },
    { perfilTipo: null, rolNombre: "ADMIN", perfilId: 7 },
  ]) {
    await assert.rejects(pageFor({ ...baseSession, ...config }), error => error.path === "/dashboard");
  }
});

test("el cliente recibe solo nombre, sede y etiqueta de rol, sin identificadores de sesión ni permisos brutos", async () => {
  const element = await pageFor(baseSession);
  assert.deepEqual(element.props.session, { nombre: "Perfil QA", sedeNombre: "SEDE QA", roleLabel: "Supervisor de tienda" });
  const serialized = JSON.stringify(element.props);
  assert.doesNotMatch(serialized, /never-sent-to-client|sessionKey|perfilId|rolNombre|sedeSoloInventarioPorCobrar/);
});
