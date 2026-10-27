import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const jsx = require("react/jsx-runtime");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path, imports = {}) {
  const source = ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const loaded = { exports: {} };
  const requireMock = name => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsx;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    assert.ok(name in imports, `Importación inesperada: ${name}`);
    return imports[name];
  };
  // Any added render-time network call fails instead of reaching the system.
  new Function("require", "module", "exports", "fetch", source)(requireMock, loaded, loaded.exports, () => { throw new Error("El render no debe iniciar operaciones de red"); });
  return loaded.exports;
}
const esDefault = value => ({ __esModule: true, default: value });
const Link = ({ children, ...props }) => React.createElement("a", props, children);
const Image = props => { const attributes = { ...props }; delete attributes.priority; return React.createElement("img", attributes); };
const icon = load("app/dashboard/_components/dashboard-icon.tsx");
const financials = load("lib/ventas-financieras.ts");
const utils = load("lib/ventas-utils.ts", { "@/lib/ventas-financieras": financials });
const logout = load("app/dashboard/_components/logout-button.tsx", {
  "next/navigation": { useRouter: () => ({ replace() { throw new Error("Sin navegación durante render"); }, refresh() { throw new Error("Sin navegación durante render"); } }) },
});
const profile = load("app/ventas/_components/sales-dashboard-parts.tsx", {
  "next/link": esDefault(Link),
  "@/app/dashboard/_components/dashboard-icon": icon,
  "@/app/dashboard/_components/logout-button": logout,
  "@/lib/monthly-reports-view": load("lib/monthly-reports-view.ts"),
  "@/lib/ventas-utils": utils,
  "@/lib/ventas-financieras": financials,
});
const Dashboard = load("app/dashboard/_components/sales-role-dashboard.tsx", {
  "next/link": esDefault(Link), "next/image": esDefault(Image),
  "@/app/ventas/_components/sales-dashboard-parts": profile,
  "./dashboard-icon": icon,
}).default;
const earnings = {
  bolsaHabilitada: true, puestoActual: 3, ventasMes: 1023,
  mensajeEstado: "Estado recibido del sistema", periodoLabel: "octubre de 2026",
  totalGanado: 2_046_000, totalVentasConComision: 1007, valorBonoPorVenta: 2000, recientes: [],
};
const activity = { periodo: utils.getBogotaMonthRangeFromInput("2026-10"), registrosPeriodo: 77, pendientes: 9, convertidos: 62 };
const base = { activity, coverageLabel: "SEDE QA", earnings, perfilNombre: "Perfil comercial QA", role: "VENDEDOR", roleLabel: "Vendedor", usuario: "Usuario de prueba" };
const render = changes => renderToStaticMarkup(React.createElement(Dashboard, { ...base, ...changes }));
test("el acceso a extensiones PayJoy solo aparece con el permiso recibido del servidor", () => {
  assert.doesNotMatch(render({}), /href="\/vendedor\/payjoy\/extensiones"/);
  assert.doesNotMatch(render({ puedeVerExtensionesPayJoy: false }), /href="\/vendedor\/payjoy\/extensiones"/);
  assert.match(render({ puedeVerExtensionesPayJoy: true }), /href="\/vendedor\/payjoy\/extensiones"/);
});
const text = html => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
function section(html, label) {
  const found = html.match(new RegExp(`<section\\b[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</section>`));
  assert.ok(found, `Sección ausente: ${label}`); return found[1];
}
function links(html, label) {
  const found = html.match(new RegExp(`<nav\\b[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</nav>`));
  assert.ok(found, `Navegación ausente: ${label}`);
  return [...found[1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map(match => match[1]);
}
function metrics(html) {
  return [...section(html, "Indicadores del perfil").matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map(match => {
    const content = match[1];
    return [text(content.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)[1]), text(content.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/)[1])];
  });
}

test("vendedor conserva todos sus destinos, incluido CIERRE, sin abrir módulos administrativos o Radar", () => {
  const html = render();
  assert.deepEqual(links(html, "Navegación principal"), ["/dashboard", "/cierre", "/vendedor/registros", "/vendedor/lista-negra", "/vendedor/lista-precios"]);
  assert.deepEqual(links(html, "Accesos comerciales"), ["/vendedor/registros", "/vendedor/lista-negra", "/vendedor/lista-precios"]);
  assert.match(html, /href="\/dashboard"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /href="\/(?:inventario-principal|dashboard\/(?:radar|financiero|sedes))"/);
});

test("apoyo conserva Radar y su flujo, sin heredar accesos de administrador", () => {
  const html = render({ role: "APOYO_OPERATIVO", roleLabel: "Apoyo operativo" });
  assert.deepEqual(links(html, "Navegación principal"), ["/dashboard", "/cierre", "/vendedor/registros", "/dashboard/radar", "/vendedor/lista-negra", "/vendedor/lista-precios"]);
  assert.deepEqual(links(html, "Accesos comerciales"), ["/vendedor/registros", "/dashboard/radar", "/vendedor/lista-negra", "/vendedor/lista-precios"]);
  assert.ok(text(html).includes("Flujo operativo"));
  assert.equal((html.match(/id="sales-role-earnings"/g) || []).length, 1);
  assert.doesNotMatch(html, /href="\/(?:inventario-principal|dashboard\/(?:financiero|sedes))"/);
});

test("indicadores vendedor usan ganancias del perfil, sin sustituirlas por actividad o cantidades de la captura", () => {
  assert.deepEqual(metrics(render()), [["Ventas del mes", "1.023"], ["Puesto actual", "#3"], ["Ganancia acumulada", "$ 2.046.000"], ["Ventas con recompensa", "1.007"]]);
});

test("indicadores apoyo usan actividad del perfil y mantienen su bolsa aparte", () => {
  const html = render({ role: "APOYO_OPERATIVO" });
  assert.deepEqual(metrics(html), [["Registros del periodo", "77"], ["Por completar", "9"], ["Convertidos en venta", "62"], ["Cobertura", "SEDE QA"]]);
  assert.ok(text(html).includes("77 en el periodo"));
  assert.ok(text(html).includes("$ 2.046.000"));
});

test("sin ventas y sin puesto muestra cero real y estado fuera del Top 5", () => {
  const html = render({ earnings: { ...earnings, bolsaHabilitada: false, puestoActual: null, ventasMes: 0, totalGanado: 0, totalVentasConComision: 0 } });
  assert.deepEqual(metrics(html), [["Ventas del mes", "0"], ["Puesto actual", "Sin puesto"], ["Ganancia acumulada", "$ 0"], ["Ventas con recompensa", "0"]]);
  assert.ok(text(html).includes("Fuera del Top 5"));
  assert.ok(!text(html).includes("Bolsa habilitada"));
});

test("estados de bolsa y bono respetan los valores recibidos para primero, quinto y fuera del Top", () => {
  for (const [puestoActual, bolsaHabilitada, valorBonoPorVenta] of [[1, true, 3000], [5, true, 2000], [6, false, 2000]]) {
    const html = render({ earnings: { ...earnings, puestoActual, bolsaHabilitada, valorBonoPorVenta } });
    assert.ok(text(html).includes(`#${puestoActual}`));
    assert.ok(text(html).includes(bolsaHabilitada ? "Bolsa habilitada" : "Fuera del Top 5"));
    assert.ok(text(html).includes(`$ ${valorBonoPorVenta.toLocaleString("es-CO")}`));
  }
  // The server is authoritative: rendering must not derive eligibility from rank.
  const inconsistent = text(render({ earnings: { ...earnings, puestoActual: 1, bolsaHabilitada: false } }));
  assert.ok(inconsistent.includes("Fuera del Top 5"));
  assert.ok(!inconsistent.includes("Bolsa habilitada"));
});

test("importes completos colombianos mantienen el redondeo anterior y no usan K o M", () => {
  const html = render({ earnings: { ...earnings, totalGanado: 1_357_500_000.75, valorBonoPorVenta: 3210.6 } });
  assert.ok(text(html).includes("$ 1.357.500.001"));
  assert.ok(text(html).includes("$ 3.211"));
  assert.doesNotMatch(text(html), /\$\s*\d[\d.,]*\s*[KM]\b/);
});

test("nombres, perfil, sede y periodo largos se conservan completos y escapados; perfil incluye cerrar sesión", () => {
  const usuario = "María Fernanda de los Ángeles QA <script> & Asociados";
  const coverageLabel = "SEDE COMERCIAL CON NOMBRE EXTENSO PARA COMPROBAR LA COBERTURA";
  const perfilNombre = "Perfil de ventas — Nombre completo extenso sin abreviar";
  const html = render({ usuario, coverageLabel, perfilNombre });
  assert.ok(html.includes("María Fernanda de los Ángeles QA &lt;script&gt; &amp; Asociados"));
  assert.ok(html.includes(coverageLabel));
  assert.ok(html.includes(perfilNombre));
  assert.ok(text(html).includes("Vendedor · " + coverageLabel));
  assert.ok(text(html).includes(earnings.periodoLabel));
  assert.match(html, /<button\b[^>]*>Cerrar sesion<\/button>/);
  assert.doesNotMatch(html, /<script>/);
  assert.ok(!text(render({ perfilNombre: null })).includes("Perfil:"));
});

test("render repetido no consulta red, escribe datos ni modifica los resúmenes recibidos", () => {
  const props = structuredClone(base);
  const snapshot = structuredClone(props);
  Object.freeze(props.earnings); Object.freeze(props.activity); Object.freeze(props);
  const first = renderToStaticMarkup(React.createElement(Dashboard, props));
  assert.equal(renderToStaticMarkup(React.createElement(Dashboard, props)), first);
  assert.deepEqual(props, snapshot);
});

test("fuente de actividad mantiene perfil, mes Bogotá y conteos originales, sin operaciones de escritura", async () => {
  const periodo = utils.getBogotaMonthRangeFromInput("2026-10"); const calls = [];
  const lib = load("lib/dashboard-sales-role-summary.ts", {
    "@/lib/prisma": esDefault({ registroVendedorVenta: { groupBy: async args => {
      calls.push(args); return [
        { estadoVentaRegistro: "PENDIENTE", _count: { _all: 7 } },
        { estadoVentaRegistro: " convertido_en_venta ", _count: { _all: 4 } },
        { estadoVentaRegistro: "CANCELADO", _count: { _all: 2 } },
        { estadoVentaRegistro: null, _count: { _all: 3 } },
      ];
    } } }),
    "@/lib/ventas-utils": { getCurrentBogotaMonthRange: () => periodo },
  });
  assert.deepEqual(await lib.getSalesRoleActivitySummary(23), { periodo, registrosPeriodo: 16, pendientes: 10, convertidos: 4 });
  assert.deepEqual(calls, [{ by: ["estadoVentaRegistro"], where: { perfilVendedorId: 23, eliminadoEn: null, createdAt: { gte: periodo.start, lt: periodo.end } }, _count: { _all: true } }]);
  assert.deepEqual(await lib.getSalesRoleActivitySummary(0), { periodo, registrosPeriodo: 0, pendientes: 0, convertidos: 0 });
  assert.equal(calls.length, 1);
});

test("fuente de bolsa conserva ranking y bonos actuales; datos de prueba no contactan la BD", async () => {
  const periodo = utils.getBogotaMonthRangeFromInput("2026-10"); const calls = [];
  const records = Array.from({ length: 6 }, (_, index) => Array.from({ length: 6 - index }, (_unused, entry) => ({
    id: (index + 1) * 100 + entry, perfilVendedorId: index + 1, referenciaEquipo: "EQUIPO QA", clienteNombre: "Cliente QA",
    createdAt: new Date("2026-10-03T15:00:00Z"), bolsaGananciaHabilitada: index < 5,
    bolsaGananciaValor: index === 0 ? 3000 : index < 5 ? 2000 : 0,
    bolsaGananciaEstado: index < 5 ? "TOP_HABILITADA" : "FUERA_TOP", bolsaGananciaEvaluadaEn: new Date("2026-10-03T16:00:00Z"),
    perfilVendedor: { nombre: `Perfil QA ${index + 1}`, tipo: index === 2 ? "APOYO_OPERATIVO" : "VENDEDOR" },
  }))).flat();
  const lib = load("lib/vendor-earnings.ts", {
    "@/lib/prisma": esDefault({ registroVendedorVenta: { findMany: async args => { calls.push(args); return structuredClone(records); } } }),
    "@/lib/ventas-utils": { ...utils, getCurrentBogotaMonthRange: () => periodo },
  });
  for (const [perfil, totalGanado, ventasMes, bolsaHabilitada, valorBonoPorVenta] of [[1, 18000, 6, true, 3000], [5, 4000, 2, true, 2000], [6, 0, 1, false, 2000]]) {
    const data = await lib.getVendorEarningsSummary(perfil);
    assert.deepEqual([data.puestoActual, data.totalGanado, data.ventasMes, data.bolsaHabilitada, data.valorBonoPorVenta], [perfil, totalGanado, ventasMes, bolsaHabilitada, valorBonoPorVenta]);
    assert.equal(data.totalVentasConComision, bolsaHabilitada ? ventasMes : 0);
  }
  assert.ok(calls.every(args => args.where.eliminadoEn === null && args.where.NOT.estadoVentaRegistro === "CANCELADO"));
  assert.ok(calls.every(args => args.where.createdAt.gte === periodo.start && args.where.createdAt.lt === periodo.end));
  assert.ok(calls.every(args => !Object.hasOwn(args.where, "sedeId")), "Ranking original abarca perfiles comerciales, no se altera con la sede mostrada");
});
