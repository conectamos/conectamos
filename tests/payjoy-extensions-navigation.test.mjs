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
const navigation = load("../lib/payjoy-navigation.ts", { "@/lib/access-control": access });
const baseSession = {
  id: 3, nombre: "Cuenta QA", usuario: "qa", rolNombre: "SEDE", sedeId: 2,
  sedeNombre: "SEDE QA", sedeSoloInventarioPorCobrar: false,
  perfilTipo: "SUPERVISOR_TIENDA", perfilTipoLabel: "Supervisor de tienda",
  perfilId: 7, perfilNombre: "Perfil QA", sessionKey: "never-sent-to-client",
};
const EXTENSIONS = "/vendedor/payjoy/extensiones";
const FOLLOW_UP = "/vendedor/payjoy/seguimiento";
const hrefs = element => element.props.navigation.map(item => item.href);

async function pageFor(session, query = {}, page = "extensiones") {
  const calls = [];
  const Page = load(`../app/vendedor/payjoy/${page}/page.tsx`, {
    "react/jsx-runtime": jsx,
    "next/navigation": { redirect(path) { const error = new Error("redirect"); error.path = path; throw error; } },
    "@/lib/page-access": { async requireVendorPage() { calls.push("requireVendorPage"); return session; } },
    "@/lib/access-control": access,
    "@/lib/payjoy-extensions-access": extensionsAccess,
    "@/lib/payjoy-navigation": navigation,
    "./workspace": { __esModule: true, default: () => null },
  }).default;
  let element;
  try { element = await Page({ searchParams: Promise.resolve(query) }); }
  finally { assert.deepEqual(calls, ["requireVendorPage"]); }
  assert.equal(new Set(hrefs(element)).size, hrefs(element).length);
  return element;
}

test("ADMIN y AUDITOR conservan sus módulos operativos y el acceso PayJoy sin duplicar destinos", async () => {
  const expected = ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/cierre", "/dashboard/aprobaciones", "/dashboard/reportes", "/dashboard/sedes", FOLLOW_UP, EXTENSIONS];
  for (const rolNombre of ["ADMIN", "AUDITOR"]) {
    const element = await pageFor({ ...baseSession, rolNombre, perfilTipo: null, perfilId: null, perfilNombre: null, perfilTipoLabel: null });
    assert.deepEqual(hrefs(element), expected);
    assert.equal(element.props.canManage, true);
    assert.equal(element.props.session.nombre, baseSession.nombre);
    assert.equal(element.props.session.roleLabel, rolNombre);
  }
});

test("el perfil vendedor prevalece sobre ADMIN y no recibe enlaces operativos ni búsqueda de registros ajenos", async () => {
  const expected = ["/dashboard", "/cierre", "/vendedor/registros", "/vendedor/lista-negra", "/vendedor/lista-precios", FOLLOW_UP, EXTENSIONS];
  for (const rolNombre of ["ADMIN", "AUDITOR", "SEDE"]) {
    const element = await pageFor({ ...baseSession, rolNombre, perfilTipo: "VENDEDOR", perfilTipoLabel: "Vendedora" });
    assert.deepEqual(hrefs(element), expected);
    assert.equal(element.props.canManage, true);
    assert.equal(element.props.session.roleLabel, "Vendedora");
  }
});

test("apoyo operativo conserva Radar y sus herramientas comerciales sin heredar los módulos del login ADMIN", async () => {
  const element = await pageFor({ ...baseSession, rolNombre: "ADMIN", perfilTipo: "APOYO_OPERATIVO", perfilTipoLabel: "Apoyo operativo" });
  assert.deepEqual(hrefs(element), ["/dashboard", "/cierre", "/vendedor/registros", "/dashboard/radar", "/vendedor/lista-negra", "/vendedor/lista-precios", FOLLOW_UP, EXTENSIONS]);
  assert.equal(element.props.navigation.find(item => item.href === "/vendedor/registros").label, "Registrar ventas");
});

test("supervisor conserva módulos de su sede y Panel analítico, sin Configuración administrativa", async () => {
  const element = await pageFor(baseSession);
  assert.deepEqual(hrefs(element), ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/cierre", "/dashboard/aprobaciones", "/dashboard/analitico", FOLLOW_UP, EXTENSIONS]);
  assert.equal(element.props.canManage, true);
});

test("sedes de solo inventario conservan su menú restringido, incluidos stands, sin alterar el acceso administrativo", async () => {
  for (const sedeNombre of ["Stand QA", "SEDE QA"]) {
    const element = await pageFor({ ...baseSession, sedeNombre, sedeSoloInventarioPorCobrar: true });
    assert.deepEqual(hrefs(element), ["/dashboard", "/inventario", "/prestamos", "/cierre", FOLLOW_UP, EXTENSIONS]);
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
    for (const page of ["extensiones", "seguimiento", "credito"]) {
      await assert.rejects(pageFor({ ...baseSession, ...config }, {}, page), error => error.path === "/dashboard");
    }
  }
});

test("el cliente recibe solo nombre, sede y etiqueta de rol, sin identificadores de sesión ni permisos brutos", async () => {
  const element = await pageFor(baseSession);
  assert.deepEqual(element.props.session, { nombre: "Perfil QA", sedeNombre: "SEDE QA", roleLabel: "Supervisor de tienda" });
  const serialized = JSON.stringify(element.props);
  assert.doesNotMatch(serialized, /never-sent-to-client|sessionKey|perfilId|rolNombre|sedeSoloInventarioPorCobrar/);
});

test("seguimiento filtra solo identificadores válidos y conserva los permisos y menú de extensiones", async () => {
  const extension = await pageFor(baseSession, { deviceTag: " dqa12345 " });
  assert.equal(extension.props.initialDeviceTag, "DQA12345");
  const followUp = await pageFor(baseSession, { deviceTag: "dqa12345" }, "seguimiento");
  assert.equal(followUp.props.initialIdentifier, "DQA12345");
  assert.deepEqual(hrefs(followUp), hrefs(extension));
  for (const value of ["https://pay.payjoy.com/extensions/device/DQA12345", "12345678", ["DQA12345"]]) {
    assert.equal((await pageFor(baseSession, { deviceTag: value })).props.initialDeviceTag, "");
    assert.equal((await pageFor(baseSession, { identifier: value }, "seguimiento")).props.initialIdentifier, "");
  }
  assert.equal((await pageFor(baseSession, { identifier: "359999999999991" }, "seguimiento")).props.initialIdentifier, "359999999999991");
});

test("el enlace antiguo de crédito redirige al seguimiento sin perder un filtro válido ni mostrar la ficha", async () => {
  for (const [query, suffix] of [
    [{}, ""],
    [{ deviceTag: " dqa12345 ", tab: "seguimiento" }, "?identifier=DQA12345"],
    [{ identifier: "359999999999991", tab: "credito" }, "?identifier=359999999999991"],
    [{ identifier: "DQA12345", deviceTag: "DOTRO123" }, "?identifier=DQA12345"],
    [{ identifier: "https://pay.payjoy.com/extensions/device/DQA12345" }, ""],
    [{ identifier: "12345678" }, ""],
    [{ deviceTag: ["DQA12345"] }, ""],
  ]) {
    await assert.rejects(pageFor(baseSession, query, "credito"), error => error.path === `${FOLLOW_UP}${suffix}`);
  }
});

test("seguimiento es accesible para asesores y auditor seleccionado o base sin exponer la ficha retirada", async () => {
  for (const identity of [
    { rolNombre: "SEDE", perfilTipo: "VENDEDOR" },
    { rolNombre: "AUDITOR", perfilTipo: "VENDEDOR" },
    { rolNombre: "ADMIN", perfilTipo: "AUDITOR" },
    { rolNombre: "AUDITOR", perfilTipo: null, perfilId: null },
  ]) {
    const session = { ...baseSession, ...identity };
    const followUp = await pageFor(session, {}, "seguimiento");
    assert.deepEqual(hrefs(followUp), hrefs(await pageFor(session)));
    assert.ok(hrefs(followUp).includes(FOLLOW_UP));
    assert.ok(hrefs(followUp).includes(EXTENSIONS));
    assert.ok(hrefs(followUp).every(href => !href.startsWith("/vendedor/payjoy/credito")));
  }
});
