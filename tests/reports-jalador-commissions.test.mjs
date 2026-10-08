import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const jsxRuntime = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
function loadTypeScript(path, imports = {}) {
  const source = ts.transpileModule(readFileSync(join(ROOT, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const testModule = { exports: {} };
  const requireMock = (name) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  };
  new Function("require", "module", "exports", source)(requireMock, testModule, testModule.exports);
  return testModule.exports;
}
const viewHelpers = loadTypeScript("lib/monthly-reports-view.ts");
const rankItems = [100.25, 0, 50.5, -2.75, 20, 1_000_000_000_000.5, 1].map((monto, index) => ({ nombre: `JALADOR ${index + 1}`, total: 7 - index, monto }));
const rankings = { oficina: [], sede: [], jalador: rankItems, cerrador: [], financiera: [{ nombre: "PAYJOY", total: 8, monto: 7_001_000.25 }] };

function children(node) {
  if (Array.isArray(node)) return node;
  return node?.props?.children == null ? [] : [node.props.children];
}
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of children(node)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
function textContent(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return children(node).map(textContent).join("");
}
function panelProbe(data = rankings) {
  const state = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useRef: () => ({ current: null }), useId: () => "qa-ranking", useEffect() {},
  };
  const styles = new Proxy({}, { get: (_target, key) => String(key) });
  const Panel = loadTypeScript("app/dashboard/reportes/reports-ranking-panel.tsx", {
    react: hooks,
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null },
    "@/lib/monthly-reports-view": viewHelpers,
    "./reports-ranking.module.css": { __esModule: true, default: styles },
  }).default;
  let tree;
  const render = () => { cursor = 0; tree = Panel({ periodLabel: "septiembre de 2026", cobertura: "SEDE 2", rankings: data }); return renderToStaticMarkup(tree); };
  const click = (label) => {
    const button = find(tree, (node) => node?.type === "button" && textContent(node) === label);
    assert.ok(button, `Botón no accesible: ${label}`);
    button.props.onClick({ currentTarget: { focus() {} } });
    return render();
  };
  render();
  return { render, click, get tree() { return tree; } };
}

test("Por jalador muestra inmediatamente sus comisiones reales y total del ranking completo aunque esté en Top 5", () => {
  const panel = panelProbe();
  const html = panel.click("Por jalador");
  assert.match(html, /septiembre de 2026 · SEDE 2/);
  assert.match(html, /<th[^>]*>Comisiones<\/th>/);
  assert.match(html, /\$ 100,25/);
  assert.match(html, /-\$ 2,75/);
  assert.match(html, /Total comisiones registradas/);
  assert.match(html, /\$ 1\.000\.000\.000\.169,50/);
  assert.ok(!html.includes("JALADOR 6"), "Top 5 no debe alterar su alcance de filas");
  assert.deepEqual(rankings.jalador, rankItems);
  const all = panel.click("Todos");
  assert.ok(all.includes("JALADOR 6") && all.includes("JALADOR 7"));
  assert.match(all, /\$ 1\.000\.000\.000\.169,50/);
  const hidden = panel.click("Comisiones");
  assert.ok(!hidden.includes("Total comisiones registradas"));
  assert.ok(!hidden.includes("$ 100,25"));
});

test("las otras pestañas mantienen Montos exclusivo a financiera y no agregan comisiones ficticias", () => {
  const panel = panelProbe();
  const financial = panel.click("Por financiera");
  assert.ok(financial.includes("Montos"));
  assert.ok(!financial.includes("$ 7.001.000,25"));
  const withAmounts = panel.click("Montos");
  assert.match(withAmounts, /\$ 7\.001\.000,25/);
  assert.ok(!withAmounts.includes("Total comisiones registradas"));
  for (const option of ["Por oficina", "Por sede", "Por cerrador"]) {
    const html = panel.click(option);
    assert.ok(!html.includes("Comisiones") && !html.includes("Montos"));
  }
});

test("corte sin jaladores usa estado vacío y cero real; otro corte recibe sus propios importes", () => {
  const empty = panelProbe({ ...rankings, jalador: [] }).click("Por jalador");
  assert.match(empty, /Sin movimientos registrados en este periodo/);
  assert.match(empty, /colSpan="4"|colspan="4"/);
  assert.match(empty, /Total comisiones registradas/);
  assert.match(empty, /\$ 0/);
  const other = panelProbe({ ...rankings, jalador: [{ nombre: "JALADOR OTRA SEDE", total: 1, monto: 35_000.5 }] }).click("Por jalador");
  assert.match(other, /\$ 35\.000,50/);
  assert.ok(!other.includes("1.000.000.000.169"));
});

test("el helper real suma Venta.comision sólo en jaladores personales con el mismo mes/sede y mantiene orden previo", async () => {
  const financieras = loadTypeScript("lib/ventas-financieras.ts");
  const utils = loadTypeScript("lib/ventas-utils.ts", { "@/lib/ventas-financieras": financieras });
  const decimal = (value) => ({ toNumber: () => value });
  const row = (sedeId, jalador, comision, fecha = "2026-09-15T17:00:00Z") => ({
    fecha: new Date(fecha), sede: { id: sedeId, nombre: `SEDE ${sedeId}` },
    jalador, comision: decimal(comision), cerrador: null, ingreso: 0, utilidad: 0,
    descripcion: "TECNO SPARK", inventarioSede: null, financierasDetalle: [],
  });
  const ventas = [
    row(2, " JALADOR José ", 25_000.25), row(2, "jalador José", 20_000.5),
    row(3, "JALADOR Pedro", 40_000.25), row(2, "SEDE 1", 8_000),
    row(2, "JALADOR María", -1_000.5), row(2, "JALADOR Otro mes", 999_000, "2026-10-01T05:00:00Z"),
  ];
  const queries = [];
  const selected = (where) => ventas.filter((venta) =>
    venta.fecha >= where.fecha.gte && venta.fecha < where.fecha.lt && (!where.sedeId || venta.sede.id === where.sedeId));
  const prisma = {
    venta: {
      aggregate: async ({ where }) => ({ _count: { id: selected(where).length }, _sum: { utilidad: 0, cajaOficina: 0, ingreso: 0 } }),
      findMany: async (args) => { queries.push(args); return selected(args.where); },
    },
    cajaMovimiento: { groupBy: async () => [] },
  };
  const helper = loadTypeScript("lib/dashboard-commercial-summary.ts", {
    "@/lib/prisma": { __esModule: true, default: prisma }, "@/lib/ventas-utils": utils,
    "@/lib/ventas-financieras": financieras,
  });
  const all = await helper.getMonthlyCommercialSummary({ period: "2026-09" });
  assert.deepEqual(all.topJaladores, [
    { nombre: "JALADOR José", total: 2, monto: 45_000.75 },
    { nombre: "JALADOR Pedro", total: 1, monto: 40_000.25 },
    { nombre: "JALADOR María", total: 1, monto: -1_000.5 },
  ]);
  assert.equal(all.topJaladores.reduce((total, item) => total + item.monto, 0), 84_000.5);
  const scoped = await helper.getMonthlyCommercialSummary({ period: "2026-09", sedeId: 2 });
  assert.deepEqual(scoped.topJaladores, [all.topJaladores[0], all.topJaladores[2]]);
  assert.equal(scoped.topJaladores.reduce((total, item) => total + item.monto, 0), 44_000.25);
  assert.deepEqual(queries[1].where, { fecha: { gte: new Date("2026-09-01T05:00:00Z"), lt: new Date("2026-10-01T05:00:00Z") }, sedeId: 2 });
  assert.equal(queries[1].select.comision, true);
  assert.ok(!scoped.topJaladores.some((item) => ["SEDE 1", "JALADOR Otro mes"].includes(item.nombre)));
});
