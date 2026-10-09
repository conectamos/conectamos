import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const source = path => readFileSync(join(ROOT, path), 'utf8');
function load(path, imports = {}, injected = {}, transform = text => text) {
  const output = ts.transpileModule(transform(source(path)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', 'console', ...Object.keys(injected), output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loadedModule, loadedModule.exports, { error() {}, warn() {} }, ...Object.values(injected));
  return loadedModule.exports;
}
const access = load('lib/access-control.ts');
const sedes = load('lib/sedes.ts');
const administrator = { id: 10, nombre: 'Administrador QA', rolNombre: 'ADMIN', perfilTipo: 'ADMINISTRADOR', sedeId: 1, sedeNombre: 'SEDE 1' };
const supervisor = { ...administrator, rolNombre: 'SUPERVISOR', perfilTipo: 'SUPERVISOR_TIENDA' };
const principalRows = [
  { id: 1, referencia: 'iPhone 13', estado: 'BODEGA' },
  { id: 2, referencia: '  iphone   13  ', estado: 'BODEGA' },
  { id: 3, referencia: 'Motorola G55', estado: 'TRASLADO' },
  { id: 4, referencia: 'Samsung A16', estado: 'VENDIDO' },
  { id: 5, referencia: 'Infinix HOT 50', estado: 'BODEGA' },
];
const sedeRows = [
  { id: 11, inventarioPrincipalId: 3, referencia: 'Motorola G55', estadoActual: 'BODEGA', sede: { nombre: 'SEDE 1' } },
  { id: 12, referencia: 'IPHONE 13', estadoActual: 'BODEGA', sede: { nombre: 'SEDE 1' } },
  { id: 13, referencia: 'Honor X8', estadoActual: 'BODEGA', sede: { nombre: 'SEDE 4' } },
  { id: 14, referencia: 'Samsung A16', estadoActual: 'PRESTAMO', sede: { nombre: 'SEDE 1' } },
  { id: 15, referencia: 'Tecno Spark 50', estadoActual: 'BODEGA', sede: { nombre: 'Stand Solutions' } },
  { id: 16, referencia: 'ZTE A75', estadoActual: 'BODEGA', sede: { nombre: 'TROPAS' } },
  { id: 17, referencia: 'Samsung A16', estadoActual: 'BODEGA', sede: { nombre: 'SEDE 2' } },
];
function summaryProbe({ principal = principalRows, branches = sedeRows, fail = false } = {}) {
  const calls = [];
  const database = {
    inventarioPrincipal: { findMany: async args => { calls.push({ model: 'principal', ...args }); if (fail) throw Error('Inventario QA no disponible'); return principal.filter(row => row.estado === args.where.estado); } },
    inventarioSede: { findMany: async args => { calls.push({ model: 'sede', ...args }); if (fail) throw Error('Inventario QA no disponible'); return branches.filter(row => row.estadoActual === args.where.estadoActual); } },
  };
  const library = load('lib/dashboard-inventory-summary.ts', { '@/lib/prisma': { __esModule: true, default: database }, '@/lib/sedes': sedes });
  return { calls, database, ...library };
}

test('disponibilidad conserva BODEGA y no duplica un traslado de principal a sede', async () => {
  const instance = summaryProbe();
  const result = await instance.getAdminInventorySummary();
  assert.equal(result.totalBodegaPrincipal, 3); assert.equal(result.totalSedes, 6); assert.equal(result.totalBodega, 9);
  assert.equal(result.referenciasEnBodega, 7);
  assert.deepEqual(instance.calls.map(call => call.where), [{ estado: 'BODEGA' }, { estadoActual: 'BODEGA' }]);
  const motorola = result.marcas.find(brand => brand.marca === 'MOTOROLA');
  assert.equal(motorola.total, 1); assert.equal(motorola.referencias[0].bodegaPrincipal, 0); assert.equal(motorola.referencias[0].sedes, 1);
  const apple = result.marcas.find(brand => brand.marca === 'APPLE');
  assert.equal(apple.total, 3); assert.equal(apple.referencias.length, 1); assert.equal(apple.referencias[0].referencia, 'IPHONE 13');
  assert.deepEqual(apple.referencias[0].sedesDetalle, [{ sede: 'SEDE 1', total: 1 }]);
  assert.equal(result.marcas.reduce((total, brand) => total + brand.total, 0), result.totalBodega);
  for (const brand of result.marcas) for (const ref of brand.referencias) {
    assert.equal(ref.bodegaPrincipal + ref.sedes, ref.total);
    assert.equal(ref.sedesDetalle.reduce((total, sede) => total + sede.total, 0), ref.sedes);
  }
});

test('supervisor conserva ocultación de puntos retirados sin cambiar la bodega principal', async () => {
  const instance = summaryProbe();
  const result = await instance.getAdminInventorySummary({ ocultarPuntosRetiradosSupervisor: true });
  assert.equal(result.totalBodegaPrincipal, 3); assert.equal(result.totalSedes, 3); assert.equal(result.totalBodega, 6);
  assert.deepEqual(result.marcas.flatMap(brand => brand.referencias.flatMap(ref => ref.sedesDetalle)).map(row => row.sede).sort(), ['SEDE 1', 'SEDE 1', 'SEDE 2']);
  assert.equal(result.marcas.find(brand => brand.marca === 'HONOR').total, 0);
});

test('detalle de referencia agrupa y ordena cantidades por sede sin perder su total', async () => {
  const branches = [
    ...Array.from({ length: 3 }, () => ({ referencia: 'IPHONE QA', estadoActual: 'BODEGA', sede: { nombre: 'SEDE B' } })),
    ...Array.from({ length: 2 }, () => ({ referencia: ' iphone   qa ', estadoActual: 'BODEGA', sede: { nombre: 'SEDE A' } })),
    { referencia: 'IPHONE QA', estadoActual: 'VENDIDO', sede: { nombre: 'SEDE C' } },
  ];
  const summary = await summaryProbe({ principal: [{ referencia: 'IPHONE QA', estado: 'BODEGA' }], branches }).getAdminInventorySummary();
  const { buildRadarView } = viewLibrary();
  const result = buildRadarView(summary, { search: 'QA', location: 'TODAS', brand: 'APPLE' }, 1);
  assert.equal(result.references.length, 1); const ref = result.references[0];
  assert.equal(ref.bodegaPrincipal, 1); assert.equal(ref.sedes, 5); assert.equal(ref.total, 6);
  assert.deepEqual(ref.sedesDetalle, [{ sede: 'SEDE B', total: 3 }, { sede: 'SEDE A', total: 2 }]);
  assert.equal(ref.sedesDetalle.reduce((total, row) => total + row.total, ref.bodegaPrincipal), ref.total);
});

function reference(referencia, principal, branches, name = 'SEDE QA') {
  return { referencia, total: principal + branches, bodegaPrincipal: principal, sedes: branches, sedesDetalle: branches ? [{ sede: name, total: branches }] : [] };
}
function fixtures() {
  const apple = Array.from({ length: 17 }, (_, index) => reference(`IPHONE QA ${String(index + 1).padStart(2, '0')}`, index % 3, index + 1, index % 2 ? 'SEDE 1' : 'SEDE 2'));
  const brands = [
    { marca: 'APPLE', referencias: apple },
    { marca: 'HONOR', referencias: [reference('HONOR QA PRO', 8, 0), reference('HONOR QA LITE', 0, 3)] },
    { marca: 'SAMSUNG', referencias: [reference('SAMSUNG QA A16', 1, 2), reference('SAMSUNG QA A26', 0, 5)] },
    { marca: 'MOTOROLA', referencias: [reference('MOTOROLA QA G55', 4, 0)] },
    { marca: 'XIAOMI', referencias: [reference('XIAOMI QA NOTE', 0, 7)] },
    { marca: 'INFINIX', referencias: [reference('INFINIX QA HOT', 2, 2)] },
    { marca: 'TECNO', referencias: [reference('TECNO QA SPARK', 0, 1)] },
    { marca: 'OPPO', referencias: [] },
    { marca: 'ZTE', referencias: [reference('ZTE QA A75', 1, 0)] },
    { marca: 'OTRAS REFERENCIAS', referencias: [reference('DISPOSITIVO QA NFC', 0, 4)] },
  ].map(brand => ({ ...brand, total: brand.referencias.reduce((total, ref) => total + ref.total, 0) }));
  const rows = brands.flatMap(brand => brand.referencias);
  return { marcas: brands, totalBodega: rows.reduce((total, ref) => total + ref.total, 0), totalBodegaPrincipal: rows.reduce((total, ref) => total + ref.bodegaPrincipal, 0), totalSedes: rows.reduce((total, ref) => total + ref.sedes, 0), referenciasEnBodega: rows.length };
}
const data = fixtures();
function viewLibrary() { return load('lib/radar-inventory-view.ts'); }

const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
const nullComponent = { __esModule: true, default: () => null };
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
function pageProbe(user = administrator) {
  const path = 'app/dashboard/radar/page.tsx'; const input = source(path);
  const ast = ts.createSourceFile(path, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
  const locals = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations].filter(declaration => ts.isIdentifier(declaration.name)).map(declaration => declaration.name.text) : []);
  const finalReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(finalReturn);
  const calls = []; let captured;
  const imports = {
    'react/jsx-runtime': jsx,
    'next/navigation': { redirect(url) { throw Error(`REDIRECT:${url}`); } },
    'next/link': nullComponent, 'next/image': nullComponent,
    '@/lib/access-control': access,
    '@/lib/page-access': { requireSessionPage: async () => { if (!user) throw Error('UNAUTHENTICATED'); return user; } },
    '@/lib/dashboard-inventory-summary': { getAdminInventorySummary: async options => { calls.push(options); return data; } },
    '@/app/dashboard/_components/operations-dashboard': { DashboardSidebar: () => null },
    '@/app/dashboard/_components/dashboard-icon': nullComponent,
    '@/app/dashboard/_components/logout-button': nullComponent,
    '@/app/ventas/_components/sales-dashboard-parts': { SalesProfile: () => null },
    './workspace': nullComponent,
  };
  for (const node of ast.statements) if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.endsWith('.css')) imports[node.moduleSpecifier.text] = css;
  const page = load(path, imports, { __capture: value => { captured = value; } }, text => text.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(',')}});\n` + text.slice(finalReturn.getStart(ast)));
  return { calls, async render() { return page.default(); }, get view() { return captured; } };
}

test('página conserva permisos, navegación disponible y exclusión de puntos retirados por perfil', async () => {
  const admin = pageProbe(); await admin.render();
  assert.deepEqual(admin.calls, [{ ocultarPuntosRetiradosSupervisor: false }]);
  assert.ok(admin.view.navigationItems.some(item => item.href === '/dashboard/sedes'));
  assert.ok(admin.view.navigationItems.some(item => item.href === '/dashboard/reportes'));
  const restricted = pageProbe(supervisor); await restricted.render();
  assert.deepEqual(restricted.calls, [{ ocultarPuntosRetiradosSupervisor: true }]);
  assert.ok(!restricted.view.navigationItems.some(item => item.href === '/dashboard/sedes'));
  assert.ok(restricted.view.navigationItems.some(item => item.href === '/dashboard/analitico'));
  const support = pageProbe({ ...administrator, rolNombre: 'VENDEDOR', perfilTipo: 'APOYO_OPERATIVO' }); await support.render();
  assert.deepEqual(support.calls, [{ ocultarPuntosRetiradosSupervisor: false }]);
  assert.deepEqual(support.view.navigationItems.map(item => item.href), ['/dashboard', '/vendedor/registros', '/dashboard/radar', '/vendedor/lista-negra', '/vendedor/lista-precios']);
  for (const user of [null, { ...administrator, rolNombre: 'VENDEDOR', perfilTipo: 'VENDEDOR' }, { ...administrator, rolNombre: 'FACTURADOR', perfilTipo: 'FACTURADOR' }]) {
    const instance = pageProbe(user); await assert.rejects(instance.render(), /UNAUTHENTICATED|REDIRECT:\/dashboard/); assert.deepEqual(instance.calls, []);
  }
});

test('consulta completa distingue unidades y referencias y pagina como máximo 10 sin alterar totales', () => {
  const { buildRadarView } = viewLibrary();
  const first = buildRadarView(data, { search: '', location: 'TODAS', brand: 'TODAS' }, 1);
  const second = buildRadarView(data, { search: '', location: 'TODAS', brand: 'TODAS' }, 2);
  assert.equal(first.references.length, data.referenciasEnBodega); assert.equal(first.totalReferences, data.referenciasEnBodega);
  assert.equal(first.pageRows.length, 10); assert.equal(second.pageRows.length, 10);
  assert.equal(first.pageCount, Math.ceil(data.referenciasEnBodega / 10));
  assert.deepEqual(first.metrics, { totalBodega: data.totalBodega, totalBodegaPrincipal: data.totalBodegaPrincipal, totalSedes: data.totalSedes, referenciasEnBodega: data.referenciasEnBodega });
  assert.deepEqual(second.metrics, first.metrics); assert.equal(first.totalUnits, data.totalBodega);
  assert.ok(first.metrics.totalBodega > first.metrics.referenciasEnBodega);
  assert.equal(new Set([...first.pageRows, ...second.pageRows].map(row => `${row.marca}/${row.referencia}`)).size, 20);
});

test('búsqueda y filtros combinados consultan todo el inventario antes de paginar', () => {
  const { buildRadarView } = viewLibrary();
  const queried = buildRadarView(data, { search: '  iphóne qa 17  ', location: 'SEDES', brand: 'APPLE' }, 2);
  assert.equal(queried.totalReferences, 1); assert.equal(queried.page, 1); assert.equal(queried.pageRows[0].referencia, 'IPHONE QA 17');
  assert.equal(queried.pageRows[0].total, 17); assert.equal(queried.pageRows[0].bodegaPrincipal, 0); assert.equal(queried.metrics.totalBodega, 17);
  assert.deepEqual(queried.pageRows[0].sedesDetalle, [{ sede: 'SEDE 2', total: 17 }]);
  const combined = buildRadarView(data, { search: 'QA', location: 'PRINCIPAL', brand: 'HONOR' }, 1);
  assert.equal(combined.references.length, 1); assert.equal(combined.references[0].referencia, 'HONOR QA PRO');
  assert.equal(combined.references[0].total, 8); assert.equal(combined.references[0].sedes, 0); assert.deepEqual(combined.references[0].sedesDetalle, []);
  assert.deepEqual(combined.metrics, { totalBodega: 8, totalBodegaPrincipal: 8, totalSedes: 0, referenciasEnBodega: 1 });
  assert.equal(buildRadarView(data, { search: 'SAMSUNG', location: 'TODAS', brand: 'APPLE' }, 1).totalReferences, 0);
});

test('marcas muestran unidades del alcance de búsqueda y ubicación, sin confundirlas con referencias', () => {
  const { buildRadarView } = viewLibrary();
  const result = buildRadarView(data, { search: 'QA', location: 'PRINCIPAL', brand: 'APPLE' }, 1);
  const honor = result.brands.find(brand => brand.marca === 'HONOR');
  assert.equal(honor.total, 8); assert.equal(honor.referencias.length, 1);
  assert.equal(result.brands.find(brand => brand.marca === 'OPPO').total, 0);
  assert.ok(result.brands.some(brand => brand.marca === 'OTRAS REFERENCIAS'));
  assert.equal(result.brands.reduce((total, brand) => total + brand.total, 0), result.totalUnits);
  assert.equal(result.metrics.totalBodega, data.marcas.find(brand => brand.marca === 'APPLE').referencias.reduce((total, ref) => total + ref.bodegaPrincipal, 0));
  assert.ok(result.totalUnits > result.metrics.totalBodega);
});

test('página fuera de rango se ajusta y consulta vacía conserva ceros consistentes sin mutar el resumen', () => {
  const { buildRadarView } = viewLibrary(); const before = JSON.stringify(data);
  for (const page of [-10, 0, 999]) {
    const result = buildRadarView(data, { search: '', location: 'TODAS', brand: 'APPLE' }, page);
    assert.ok(result.page >= 1 && result.page <= result.pageCount); assert.ok(result.pageRows.length <= 10);
  }
  const empty = buildRadarView(data, { search: 'NO EXISTE QA', location: 'SEDES', brand: 'TODAS' }, 99);
  assert.equal(empty.page, 1); assert.equal(empty.pageCount, 1); assert.equal(empty.totalReferences, 0); assert.equal(empty.totalUnits, 0);
  assert.deepEqual(empty.pageRows, []); assert.deepEqual(empty.metrics, { totalBodega: 0, totalBodegaPrincipal: 0, totalSedes: 0, referenciasEnBodega: 0 });
  assert.equal(JSON.stringify(data), before);
});

test('paginación normaliza números no finitos y fracciones sin dejar referencias inaccesibles', () => {
  const { buildRadarView } = viewLibrary();
  for (const page of [NaN, Infinity, -Infinity]) {
    assert.equal(buildRadarView(data, { search: '', location: 'TODAS', brand: 'TODAS' }, page).page, 1);
  }
  assert.equal(buildRadarView(data, { search: '', location: 'TODAS', brand: 'TODAS' }, 2.8).page, 2);
  const pages = Array.from({ length: 3 }, (_, index) => buildRadarView(data, { search: '', location: 'TODAS', brand: 'TODAS' }, index + 1));
  assert.equal(pages.flatMap(page => page.pageRows).length, data.referenciasEnBodega);
  assert.equal(new Set(pages.flatMap(page => page.pageRows).map(row => `${row.marca}/${row.referencia}`)).size, data.referenciasEnBodega);
});

const ExcelJS = require('exceljs');
class NextResponse extends Response {
  static json(body, options = {}) { return new NextResponse(JSON.stringify(body), { ...options, headers: { 'Content-Type': 'application/json' } }); }
}
function exportProbe(user = administrator, options = {}) {
  const summary = summaryProbe(options);
  const route = load('app/api/dashboard/radar/export/route.ts', {
    exceljs: { __esModule: true, default: ExcelJS }, 'next/server': { NextResponse },
    '@/lib/auth': { getSessionUser: async () => user }, '@/lib/access-control': access,
    '@/lib/prisma': { __esModule: true, default: summary.database },
    '@/lib/dashboard-inventory-summary': summary,
    '@/lib/radar-inventory-view': viewLibrary(), '@/lib/radar-inventory-export': load('lib/radar-inventory-export.ts'),
    '@/lib/sedes': sedes,
  });
  return { calls: summary.calls, async request(query = '') {
    return route.GET(new Request(`http://qa.local/api/dashboard/radar/export${query}`));
  } };
}
async function readWorkbook(response) {
  assert.equal(response.status, 200); assert.match(response.headers.get('Content-Type'), /spreadsheetml/);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await response.arrayBuffer())); return workbook;
}
const values = sheet => sheet.getSheetValues().slice(1).map(row => row.slice(1));

test('Excel conserva el contrato previo de bodega principal cuando no se solicita consulta completa', async () => {
  const instance = exportProbe(); const workbook = await readWorkbook(await instance.request('?q=iphone'));
  assert.equal(workbook.worksheets.length, 1); assert.equal(workbook.worksheets[0].name, 'Bodega principal');
  assert.deepEqual(values(workbook.worksheets[0]), [['REFERENCIA', 'CANTIDAD DISPONIBLE'], ['IPHONE 13', 2]]);
  assert.deepEqual(instance.calls.map(call => call.where), [{ estado: 'BODEGA' }]);
});

test('Excel de consulta conserva marca, búsqueda, ubicación y distribución con cantidades reales', async () => {
  const instance = exportProbe();
  const workbook = await readWorkbook(await instance.request('?alcance=consulta&q=iph%C3%B3ne&ubicacion=SEDES&marca=APPLE'));
  assert.equal(workbook.worksheets.length, 2);
  assert.deepEqual(values(workbook.getWorksheet('Disponibilidad')), [
    ['MARCA', 'REFERENCIA', 'BODEGA PRINCIPAL', 'UNIDADES EN SEDES', 'TOTAL DISPONIBLE'], ['APPLE', 'IPHONE 13', 0, 1, 1],
  ]);
  assert.deepEqual(values(workbook.getWorksheet('Distribución')), [
    ['MARCA', 'REFERENCIA', 'UBICACIÓN', 'UNIDADES DISPONIBLES'], ['APPLE', 'IPHONE 13', 'SEDE 1', 1],
  ]);
  const principal = await readWorkbook(await exportProbe().request('?alcance=consulta&ubicacion=PRINCIPAL&marca=APPLE'));
  assert.deepEqual(values(principal.getWorksheet('Disponibilidad')).slice(1), [['APPLE', 'IPHONE 13', 2, 0, 2]]);
  assert.deepEqual(values(principal.getWorksheet('Distribución')).slice(1), [['APPLE', 'IPHONE 13', 'Bodega principal', 2]]);
});

test('Excel incluye todos los resultados filtrados y sus sedes, sin limitarse a diez referencias', async () => {
  const principal = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, referencia: `SAMSUNG QA ${String(index + 1).padStart(2, '0')}`, estado: 'BODEGA' }));
  const branches = principal.map(row => ({ ...row, estadoActual: 'BODEGA', sede: { nombre: 'SEDE QA' } }));
  const instance = exportProbe(administrator, { principal, branches });
  const workbook = await readWorkbook(await instance.request('?alcance=consulta&q=samsung&ubicacion=TODAS&marca=SAMSUNG&page=2'));
  const exported = values(workbook.getWorksheet('Disponibilidad')).slice(1); const distribution = values(workbook.getWorksheet('Distribución')).slice(1);
  assert.equal(exported.length, 25); assert.equal(distribution.length, 50);
  assert.equal(exported.reduce((total, row) => total + row[4], 0), 50);
  assert.equal(distribution.reduce((total, row) => total + row[3], 0), 50);
  assert.ok(exported.every(row => row[2] === 1 && row[3] === 1 && row[4] === 2));
  assert.ok(instance.calls.every(call => !('take' in call) && !('skip' in call)));
});

test('exportación del supervisor aplica los mismos puntos retirados que la consulta en pantalla', async () => {
  const workbook = await readWorkbook(await exportProbe(supervisor).request('?alcance=consulta&ubicacion=TODAS&marca=TODAS'));
  const exported = values(workbook.getWorksheet('Disponibilidad')).slice(1); const distribution = values(workbook.getWorksheet('Distribución')).slice(1);
  assert.equal(exported.reduce((total, row) => total + row[4], 0), 6);
  assert.ok(distribution.every(row => !['SEDE 4', 'TROPAS', 'Stand Solutions'].includes(row[2])));
  const admin = await readWorkbook(await exportProbe().request('?alcance=consulta&ubicacion=TODAS&marca=TODAS'));
  assert.equal(values(admin.getWorksheet('Disponibilidad')).slice(1).reduce((total, row) => total + row[4], 0), 9);
});

test('exportación rechaza roles ajenos antes de consultar inventario y conserva accesos autorizados', async () => {
  for (const user of [null, { ...administrator, rolNombre: 'VENDEDOR', perfilTipo: 'VENDEDOR' }, { ...administrator, rolNombre: 'FACTURADOR', perfilTipo: 'FACTURADOR' }]) {
    for (const query of ['', '?alcance=consulta']) {
      const instance = exportProbe(user); const response = await instance.request(query);
      assert.equal(response.status, user ? 403 : 401); assert.ok((await response.json()).error); assert.deepEqual(instance.calls, []);
    }
  }
  for (const user of [administrator, { ...administrator, rolNombre: 'AUDITOR', perfilTipo: 'AUDITOR' }, supervisor, { ...administrator, rolNombre: 'VENDEDOR', perfilTipo: 'APOYO_OPERATIVO' }]) {
    assert.equal((await exportProbe(user).request('?alcance=consulta')).status, 200);
  }
});

test('consulta sin coincidencias genera hojas vacías y error del servidor nunca aparenta un Excel correcto', async () => {
  const workbook = await readWorkbook(await exportProbe().request('?alcance=consulta&q=NO_EXISTE_QA'));
  assert.equal(workbook.getWorksheet('Disponibilidad').rowCount, 1); assert.equal(workbook.getWorksheet('Distribución').rowCount, 1);
  const response = await exportProbe(administrator, { fail: true }).request('?alcance=consulta');
  assert.equal(response.status, 500); assert.match(response.headers.get('Content-Type'), /json/); assert.ok((await response.json()).error);
});

function resolve(node) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === 'function') return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (typeof node !== 'object') return String(node);
  return textOf(node.props?.children);
}
function workspaceProbe({ initial = {}, fetchImpl, summary = data } = {}) {
  const path = 'app/dashboard/radar/workspace.tsx'; const input = source(path);
  const ast = ts.createSourceFile(path, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const states = declarations.flatMap(entry => ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === 'useState' ? [entry.name.elements[0].name.getText(ast)] : []);
  const locals = declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text);
  const finalReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(finalReturn);
  const state = { ...initial }; const calls = []; const effects = []; const refs = []; const downloads = []; const urls = [];
  let cursor = 0; let refCursor = 0; let captured;
  const react = {
    useState(value) { const name = states[cursor++]; assert.ok(name); if (!(name in state)) state[name] = typeof value === 'function' ? value() : value; return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
    useMemo: fn => fn(), useEffect: fn => effects.push(fn),
    useRef(value) { const index = refCursor++; return refs[index] ??= { current: value }; },
  };
  class BrowserURL extends URL {
    static createObjectURL(blob) { urls.push({ operation: 'create', blob }); return 'blob:qa-radar'; }
    static revokeObjectURL(url) { urls.push({ operation: 'revoke', url }); }
  }
  const document = {
    body: { style: { overflow: '' }, appendChild() {} }, addEventListener() {}, removeEventListener() {},
    createElement(type) { assert.equal(type, 'a'); return { click() { downloads.push({ href: this.href, download: this.download }); }, remove() {} }; },
  };
  const imports = {
    react, 'react/jsx-runtime': jsx,
    '@/app/dashboard/_components/dashboard-icon': nullComponent,
    '@/app/vendedor/registros/buscar/device-visual': { RecordDeviceVisual: () => null },
    '@/lib/radar-inventory-view': viewLibrary(),
  };
  for (const node of ast.statements) if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.endsWith('.css')) imports[node.moduleSpecifier.text] = css;
  const workspace = load(path, imports, {
    __capture: value => { captured = value; }, document, URL: BrowserURL,
    setTimeout(fn) { fn(); return 1; },
    fetch: async (url, options) => { calls.push({ url, options }); return fetchImpl ? fetchImpl(url, options) : new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Disposition': 'attachment; filename="radar-qa.xlsx"' } }); },
  }, text => text.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(',')}});\n` + text.slice(finalReturn.getStart(ast)));
  const instance = {
    state, calls, refs, downloads, urls,
    render() { cursor = 0; refCursor = 0; effects.length = 0; return resolve(workspace.default({ summary, puedeVerBodegaPrincipal: true, puedeVerInventario: true })); },
    get view() { return captured; },
  };
  instance.render(); return instance;
}

test('controles reales reinician página al buscar, cambiar ubicación y seleccionar cualquier marca', () => {
  const instance = workspaceProbe({ initial: { pagina: 2, marcaActiva: 'APPLE' } });
  elements(instance.render()).find(node => node.type === 'input' && node.props.id === 'radar-search').props.onChange({ target: { value: 'QA' } });
  assert.equal(instance.state.busqueda, 'QA'); assert.equal(instance.state.pagina, 1);
  instance.state.pagina = 2;
  elements(instance.render()).find(node => node.type === 'select').props.onChange({ target: { value: 'PRINCIPAL' } });
  assert.equal(instance.state.ubicacion, 'PRINCIPAL'); assert.equal(instance.state.pagina, 1);
  instance.state.pagina = 2;
  const moreMenu = elements(instance.render()).find(node => node.props?.['aria-label'] === 'Todas las marcas'); assert.ok(moreMenu);
  assert.equal(elements(moreMenu).filter(node => node.type === 'button').length, data.marcas.length);
  elements(moreMenu).find(node => node.type === 'button' && /^ZTE\b/.test(textOf(node).trim())).props.onClick();
  assert.equal(instance.state.marcaActiva, 'ZTE'); assert.equal(instance.state.pagina, 1); instance.render();
  assert.equal(instance.view.view.totalReferences, 1); assert.equal(instance.view.view.metrics.totalBodega, 1);
  instance.view.limpiarFiltros(); instance.render();
  assert.equal(instance.state.busqueda, ''); assert.equal(instance.state.ubicacion, 'TODAS'); assert.equal(instance.state.marcaActiva, 'TODAS'); assert.equal(instance.state.pagina, 1);
});

test('detalle abre desde botón o cantidad por sede y al cerrar conserva filtros, página y foco', () => {
  for (const entry of ['detail', 'units']) {
    const instance = workspaceProbe({ initial: { pagina: 2, marcaActiva: 'APPLE', busqueda: 'QA', ubicacion: 'TODAS' } });
    const tree = instance.render(); const target = instance.view.view.pageRows[0]; const focused = [];
    const button = elements(tree).find(node => node.type === 'button' && node.props['aria-label'] === (entry === 'detail' ? `Ver sedes de ${target.referencia}` : `Ver ${target.sedes} unidades en sedes de ${target.referencia}`));
    assert.ok(button); button.props.onClick({ currentTarget: { focus: options => focused.push(options) } });
    assert.equal(instance.state.referenciaActiva, target);
    const opened = instance.render(); const panel = elements(opened).find(node => node.type === 'dialog'); assert.ok(panel);
    assert.ok(textOf(panel).includes(target.referencia)); assert.ok(textOf(panel).includes(target.sedesDetalle[0].sede));
    let closed = false; instance.view.dialogRef.current = { close() { closed = true; } };
    elements(opened).find(node => node.type === 'button' && node.props['aria-label'] === 'Cerrar detalle').props.onClick();
    assert.equal(closed, true); assert.equal(instance.state.referenciaActiva, null); assert.deepEqual(focused, [{ preventScroll: true }]);
    assert.equal(instance.state.pagina, 2); assert.equal(instance.state.marcaActiva, 'APPLE'); assert.equal(instance.state.busqueda, 'QA'); assert.equal(instance.state.ubicacion, 'TODAS');
  }
});

test('exportar usa consulta completa sin página, evita doble descarga y presenta errores sin éxito falso', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const instance = workspaceProbe({ initial: { pagina: 2, marcaActiva: 'APPLE', busqueda: ' QA ', ubicacion: 'SEDES' }, fetchImpl: async () => pending });
  const one = instance.view.exportar(); const duplicate = instance.view.exportar();
  assert.equal(instance.calls.length, 1); assert.equal(instance.state.exportando, true); assert.deepEqual(instance.downloads, []);
  const params = new URL(instance.calls[0].url, 'http://qa.local').searchParams;
  assert.deepEqual(Object.fromEntries(params), { alcance: 'consulta', q: 'QA', ubicacion: 'SEDES', marca: 'APPLE' });
  release(new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Disposition': 'attachment; filename="radar-qa.xlsx"' } }));
  await Promise.all([one, duplicate]); assert.equal(instance.state.exportando, false);
  assert.deepEqual(instance.downloads, [{ href: 'blob:qa-radar', download: 'radar-qa.xlsx' }]); assert.equal(instance.urls.at(-1).operation, 'revoke');
  const failed = workspaceProbe({ fetchImpl: async () => Response.json({ error: 'Exportación QA no disponible' }, { status: 500 }) });
  await failed.view.exportar(); assert.equal(failed.state.errorExportacion, 'Exportación QA no disponible'); assert.equal(failed.state.exportando, false); assert.deepEqual(failed.downloads, []);
  const empty = workspaceProbe({ initial: { busqueda: 'NO_EXISTE_QA' } });
  const button = elements(empty.render()).find(node => node.type === 'button' && textOf(node).trim() === 'Exportar Excel'); assert.ok(button.props.disabled);
  await empty.view.exportar(); assert.deepEqual(empty.calls, []); assert.deepEqual(empty.downloads, []);
});
