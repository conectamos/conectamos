import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const jsx = require('react/jsx-runtime');
const workspacePath = 'app/dashboard/payjoy/_components/payjoy-cartera-workspace.tsx';
const source = path => readFileSync(join(ROOT, path), 'utf8');
function load(path, imports, injected = {}, transform = value => value) {
  const output = ts.transpileModule(transform(source(path)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', 'console', ...Object.keys(injected), output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {}, warn() {} }, ...Object.values(injected));
  return loaded.exports;
}
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
  return typeof node === 'object' ? textOf(node.props?.children) : String(node);
}
const user = { id: 41, nombre: 'Administrador QA', usuario: 'admin-qa', rolNombre: 'ADMIN', sedeNombre: 'Sede QA' };
const baseRow = {
  corteName: 'Corte Alfa', transactionTime: '2026-09-01T12:00:00.000Z', merchantName: 'Comercio Norte',
  device: 'DQA001', deviceFamily: 'REFERENCIA QA 128GB', imei: '035123456789012', nationalId: '001234567',
  installmentAmount: 123456.78, paymentDueDate: '2026-09-15T12:00:00.000Z', devicePaymentDate: '2026-09-30T12:00:00.000Z',
  paidInFull: false, status: 'MORA', maximumPaymentDate: '2026-09-19T12:00:00.000Z', currency: 'COP', lookupMessage: null,
};
const statuses = (...groups) => groups.flatMap(([status, length]) => Array(length).fill(status));
const rows = [
  ...statuses(['MORA', 6], ['GESTIONAR', 3], ['PAGO', 5], ['PAGO X', 2]).map(status => ({ ...baseRow, status, merchantName: 'Comercio Norte' })),
  ...statuses(['MORA', 2], ['GESTIONAR', 4], ['PAGO', 1], ['PAGO X', 6]).map(status => ({ ...baseRow, status, merchantName: 'Comercio Sur', corteName: 'Corte Beta' })),
  { ...baseRow, status: 'PAGO X', merchantName: ' ' },
].map((row, index) => ({ ...row, localId: `qa-${index}`, device: `DQA${index + 1}`, imei: `0${String(index + 1).padStart(14, '0')}`, nationalId: `00${String(index + 1).padStart(7, '0')}`, manualStatus: row.status }));
const processedData = { ok: true, totalSources: 2, sourceNames: ['Corte Alfa', 'Corte Beta'], rawRows: 51, uniqueRows: 30, duplicatesRemoved: 21, summary: { mora: 15, pago: 6, pagoX: 9 }, rows };
const cut = { id: 71, recordName: 'Corte QA real', totalSources: 2, sourceNames: processedData.sourceNames, rawRows: 51, uniqueRows: 30, duplicatesRemoved: 21, summary: processedData.summary, savedById: 41, savedByName: user.nombre, savedByUser: user.usuario, savedAt: '2026-10-09T14:00:00.000Z', updatedAt: '2026-10-09T14:00:00.000Z', rows };

function workspaceProbe({ initial = {}, fetchImpl, exportFailure = false } = {}) {
  const input = source(workspacePath);
  const ast = ts.createSourceFile(workspacePath, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(component?.body);
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const states = declarations.flatMap(entry => ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === 'useState' ? [entry.name.elements[0].name.getText(ast)] : []);
  const locals = declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text);
  const finalReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(finalReturn);
  const state = { data: processedData, rows, savedCuts: [cut], savedCutsLoading: false, ...initial };
  const refs = []; const calls = []; const exports = []; let cursor = 0; let refCursor = 0; let captured;
  const imports = {
    react: {
      useState(value) { const name = states[cursor++]; assert.ok(name); if (!(name in state)) state[name] = typeof value === 'function' ? value() : value; return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
      useDeferredValue: value => value, useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
      useRef(value) { return refs[refCursor++] ??= { current: value }; },
    },
    'react/jsx-runtime': jsx,
    'next/image': { __esModule: true, default: props => jsx.jsx('img', { src: props.src, alt: props.alt, width: props.width, height: props.height }) },
    'next/link': { __esModule: true, default: props => jsx.jsx('a', { href: props.href, className: props.className, 'aria-label': props['aria-label'], 'aria-current': props['aria-current'], children: props.children }) },
    '@/app/dashboard/_components/dashboard-icon': { __esModule: true, default: () => null },
    '@/app/ventas/_components/sales-dashboard-parts': { SalesProfile: () => null },
    xlsx: { ...XLSX, writeFile(workbook, name) { if (exportFailure) throw Error('Descarga QA no disponible'); exports.push({ workbook, name }); } },
  };
  for (const node of ast.statements) if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.endsWith('.css')) imports[node.moduleSpecifier.text] = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
  const workspace = load(workspacePath, imports, {
    __capture: value => { captured = value; },
    window: { setTimeout(fn) { fn(); return 1; }, clearTimeout() {}, scrollTo() {}, confirm() { return true; } },
    document: { getElementById() { return null; }, activeElement: null },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const result = fetchImpl ? await fetchImpl(url, options) : { ok: true, data: { ok: true, cortes: [cut] } };
      return result instanceof Response ? result : { ok: result.ok, json: async () => result.data };
    },
  }, text => text.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(',')}});\n` + text.slice(finalReturn.getStart(ast)));
  const instance = {
    state, calls, exports,
    render() { cursor = 0; refCursor = 0; return resolve(workspace.default({ user, puedeEliminar: true })); },
    get view() { return captured; },
  };
  instance.render(); return instance;
}

test('análisis conserva todas las transacciones únicas, filas originales y duplicados, incluso más de diez registros', () => {
  const instance = workspaceProbe();
  assert.equal(instance.view.filteredRows.length, 30); assert.equal(instance.view.filteredMerchantSummaries.length, 3);
  assert.deepEqual(instance.view.summaryCards, { mora: 15, pago: 6, pagoX: 9 });
  assert.deepEqual(instance.view.filteredRows.map(row => row.localId), rows.map(row => row.localId));
  assert.equal(instance.state.data.rawRows, 51); assert.equal(instance.state.data.duplicatesRemoved, 21);
  const table = elements(instance.render()).find(node => node.type === 'table' && elements(node).some(child => child.props?.['aria-label'] === `Tienda de ${rows[0].imei}`));
  assert.ok(table); assert.equal(elements(table).filter(node => node.type === 'tr').length, 31);
});

test('búsqueda de comercio consulta todas las filas y selección conserva su precedencia actual', () => {
  const instance = workspaceProbe({ initial: { merchantQuery: '  COMERCIO SUR  ' } });
  assert.equal(instance.view.filteredRows.length, 13); assert.deepEqual(instance.view.summaryCards, { mora: 6, pago: 1, pagoX: 6 });
  assert.ok(instance.view.filteredRows.some(row => row.localId === 'qa-28'));
  instance.view.handleMerchantSelection('Comercio Norte'); instance.render();
  assert.equal(instance.state.merchantQuery, ''); assert.equal(instance.view.filteredRows.length, 16);
  instance.state.merchantQuery = 'No coincide'; instance.render();
  assert.equal(instance.view.filteredRows.length, 16, 'El comercio seleccionado tiene prioridad sobre texto residual');
  instance.view.handleMerchantSelection('TODOS'); instance.render(); assert.equal(instance.view.filteredRows.length, 30);
});

test('cinco estados mantienen conteos separados y el total global aunque cambie el filtro', () => {
  const instance = workspaceProbe();
  const expected = {
    TODOS: [30, { mora: 15, pago: 6, pagoX: 9 }],
    PAGO: [6, { mora: 0, pago: 6, pagoX: 0 }],
    MORA: [8, { mora: 8, pago: 0, pagoX: 0 }],
    GESTIONAR: [7, { mora: 7, pago: 0, pagoX: 0 }],
    'PAGO X': [9, { mora: 0, pago: 0, pagoX: 9 }],
  };
  for (const [status, [count, summary]] of Object.entries(expected)) {
    instance.state.selectedStatus = status; instance.render();
    assert.equal(instance.view.filteredRows.length, count, status); assert.deepEqual(instance.view.summaryCards, summary, status);
    assert.deepEqual(instance.view.liveSummary, { mora: 15, pago: 6, pagoX: 9 });
  }
  instance.state.selectedStatus = 'GESTIONAR'; instance.view.handleMerchantSelection('Comercio Sur'); instance.render();
  assert.equal(instance.view.filteredRows.length, 4); assert.ok(instance.view.filteredRows.every(row => row.status === 'GESTIONAR' && row.merchantName === 'Comercio Sur'));
});

test('mora por comercio conserva MORA más GESTIONAR sobre créditos activos y excluye PAGO X', () => {
  const instance = workspaceProbe();
  assert.deepEqual(instance.view.filteredMerchantSummaries.map(row => [row.merchantName, row.records, row.activeCredits, row.overdueCredits, row.pagoXCredits]), [
    ['Comercio Norte', 16, 14, 9, 2], ['Comercio Sur', 13, 7, 6, 6], ['Sin merchant', 1, 0, 0, 1],
  ]);
  assert.equal(instance.view.filteredMerchantSummaries[0].delinquencyRate, 9 / 14 * 100);
  assert.equal(instance.view.filteredMerchantSummaries[1].delinquencyRate, 6 / 7 * 100);
  assert.equal(instance.view.filteredMerchantSummaries[2].delinquencyRate, 0);
  instance.state.selectedStatus = 'PAGO X'; instance.render();
  assert.ok(instance.view.filteredMerchantSummaries.every(row => row.activeCredits === 0 && row.delinquencyRate === 0));
});

test('limpiar filtros recupera la cartera completa sin tocar datos, nombre del corte o estados editados', () => {
  const instance = workspaceProbe({ initial: { selectedMerchant: 'Comercio Sur', selectedStatus: 'MORA', merchantQuery: 'sur', saveName: 'Nombre conservado', activeSavedCutId: 71 } });
  assert.equal(instance.view.filteredRows.length, 2);
  instance.view.clearFilters(); instance.render();
  assert.equal(instance.state.selectedMerchant, 'TODOS'); assert.equal(instance.state.selectedStatus, 'TODOS'); assert.equal(instance.state.merchantQuery, '');
  assert.equal(instance.view.filteredRows.length, 30); assert.equal(instance.state.rows, rows); assert.equal(instance.state.data, processedData);
  assert.equal(instance.state.saveName, 'Nombre conservado'); assert.equal(instance.state.activeSavedCutId, 71);
});

test('Excel contiene todos los resultados filtrados, con IMEI como texto y cuota numérica precisa', async () => {
  const instance = workspaceProbe({ initial: { merchantQuery: 'norte' } });
  await instance.view.exportVisibleRowsToExcel();
  assert.equal(instance.exports.length, 1); assert.equal(instance.exports[0].name, 'Corte Alfa.xlsx');
  const sheet = instance.exports[0].workbook.Sheets['Cartera PayJoy'];
  const exported = XLSX.utils.sheet_to_json(sheet);
  assert.equal(exported.length, 16); assert.equal(exported.at(-1).IMEI, rows[15].imei);
  assert.ok(exported.every(row => row.TIENDA === 'Comercio Norte'));
  assert.equal(sheet.B2.t, 's'); assert.equal(sheet.B2.z, '@'); assert.equal(sheet.B2.v, rows[0].imei);
  assert.equal(sheet.C2.v, rows[0].nationalId); assert.equal(sheet.K2.t, 'n'); assert.equal(sheet.K2.v, 123456.78);
  assert.deepEqual(instance.calls, []); assert.equal(instance.state.exportingExcel, false);
});

test('Excel combinado por comercio y estado no añade filas de otros resultados ni pierde filtros', async () => {
  const instance = workspaceProbe({ initial: { selectedMerchant: 'Comercio Sur', selectedStatus: 'PAGO X', saveName: 'Corte conservado' } });
  await instance.view.exportVisibleRowsToExcel();
  const exported = XLSX.utils.sheet_to_json(instance.exports[0].workbook.Sheets['Cartera PayJoy']);
  assert.equal(exported.length, 6); assert.ok(exported.every(row => row.TIENDA === 'Comercio Sur' && row.ESTADO === 'PAGO X'));
  assert.equal(instance.exports[0].name, 'Corte Beta.xlsx'); assert.equal(instance.state.selectedMerchant, 'Comercio Sur');
  assert.equal(instance.state.selectedStatus, 'PAGO X'); assert.equal(instance.state.saveName, 'Corte conservado');
});

test('sin resultados y error de exportación no simulan una descarga correcta ni borran la cartera', async () => {
  const missing = workspaceProbe({ initial: { merchantQuery: 'No existe' } });
  await missing.view.exportVisibleRowsToExcel(); assert.equal(missing.exports.length, 0); assert.match(missing.state.message, /No hay filas/);
  const failed = workspaceProbe({ exportFailure: true });
  await failed.view.exportVisibleRowsToExcel(); assert.equal(failed.exports.length, 0); assert.match(failed.state.message, /No fue posible exportar/);
  assert.equal(failed.state.rows, rows); assert.equal(failed.state.data, processedData); assert.equal(failed.state.exportingExcel, false);
});

class NextResponse extends Response {
  static json(body, options = {}) { return new NextResponse(JSON.stringify(body), { ...options, headers: { 'Content-Type': 'application/json' } }); }
}
function reloadProbe() {
  const previousRows = ['MORA', 'GESTIONAR', 'MORA', 'PAGO', 'PAGO X', 'MORA'].map((status, index) => ({ ...baseRow, device: `DRELOAD${index + 1}`, imei: `03512345678900${index}`, status, manualStatus: ['MORA', 'GESTIONAR'].includes(status) ? status : null }));
  const previous = { ...cut, rows: previousRows, uniqueRows: 6 };
  const calls = []; let stored;
  const route = load('app/api/payjoy/cartera/cortes/route.ts', {
    'next/server': { NextResponse }, '@/lib/auth': { getSessionUser: async () => user },
    '@/lib/payjoy': { getPayJoyPaymentSnapshot: async device => {
      calls.push(device);
      if (device === 'DRELOAD6') throw Error('Consulta QA fallida');
      return { validThrough: new Date(['DRELOAD1', 'DRELOAD5'].includes(device) ? '2026-09-30T12:00:00Z' : '2026-09-20T12:00:00Z'), remainingBalance: 987654.32, cost14: 123456.78, currency: 'COP', paidInFull: false, message: null };
    } },
    '@/lib/payjoy-cortes-store': {
      getStoredPayJoyCutById: async () => previous,
      updateStoredPayJoyCut: async input => { stored = { ...previous, ...input }; return stored; },
      listStoredPayJoyCuts: async () => [previous], saveStoredPayJoyCut: async () => previous, deleteStoredPayJoyCutById: async () => false,
    },
  });
  return { calls, get stored() { return stored; }, async reload() {
    const response = await route.PUT(new Request('http://qa.local/api/payjoy/cartera/cortes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 71 }) }));
    return { response, body: await response.json() };
  } };
}

test('recarga real distingue las cinco transiciones y conserva otros cambios sin inventar cifras', async () => {
  const instance = reloadProbe(); const { response, body } = await instance.reload();
  assert.equal(response.status, 200); assert.equal(body.ok, true);
  assert.deepEqual(body.resumenRecarga, { total: 6, movedToPago: 1, keptPago: 1, keptPagoX: 1, stayedGestionar: 1, stayedMora: 1, otherChanges: 1 });
  assert.deepEqual(body.corte.rows.map(row => row.status), ['PAGO', 'GESTIONAR', 'MORA', 'PAGO', 'PAGO X', 'PAGO X']);
  assert.deepEqual(body.corte.summary, { mora: 2, pago: 2, pagoX: 2 }); assert.equal(instance.calls.length, 6);
  assert.equal(body.corte.rows[5].lookupMessage, 'Consulta QA fallida');
  assert.equal(instance.stored, undefined, 'Recargar consulta PayJoy; el guardado sigue siendo una acción explícita');
});

test('interfaz consume recarga confirmada por servidor y el resumen permanece global al filtrar', async () => {
  const server = reloadProbe();
  const instance = workspaceProbe({ fetchImpl: async (_url, options) => {
    assert.equal(options.method, 'PUT'); assert.deepEqual(JSON.parse(options.body), { id: 71 });
    const result = await server.reload(); return { ok: result.response.ok, data: result.body };
  } });
  await instance.view.reloadStoredCut(71); instance.render();
  assert.equal(instance.state.activeSavedCutId, 71); assert.equal(instance.state.rows.length, 6);
  assert.deepEqual(instance.state.reloadSummary, { total: 6, movedToPago: 1, keptPago: 1, keptPagoX: 1, stayedGestionar: 1, stayedMora: 1, otherChanges: 1 });
  const summary = instance.state.reloadSummary;
  instance.state.selectedStatus = 'PAGO X'; instance.render();
  assert.equal(instance.view.filteredRows.length, 2); assert.equal(instance.state.reloadSummary, summary);
  assert.equal(instance.state.reloadSummary.total, 6); assert.deepEqual(instance.view.summaryCards, { mora: 0, pago: 0, pagoX: 2 });
});

test('recarga fallida conserva filas, filtros y resumen anterior y nunca confirma cambios', async () => {
  const reloadSummary = { total: 30, movedToPago: 3, keptPago: 6, keptPagoX: 9, stayedGestionar: 5, stayedMora: 7, otherChanges: 0 };
  const instance = workspaceProbe({ initial: { selectedMerchant: 'Comercio Sur', selectedStatus: 'MORA', reloadSummary }, fetchImpl: async () => ({ ok: false, data: { error: 'Recarga QA no disponible' } }) });
  await instance.view.reloadStoredCut(71); instance.render();
  assert.equal(instance.state.rows, rows); assert.equal(instance.state.data, processedData); assert.equal(instance.state.reloadSummary, reloadSummary);
  assert.equal(instance.state.selectedMerchant, 'Comercio Sur'); assert.equal(instance.state.selectedStatus, 'MORA');
  assert.equal(instance.state.message, 'Recarga QA no disponible'); assert.equal(instance.state.reloadingCutId, null);
});

function byLabel(tree, label) { return elements(tree).find(node => node.props?.['aria-label'] === label); }
function analysisFilters(tree) { return elements(tree).find(node => node.props?.['aria-labelledby'] === 'payjoy-analysis-filters-title'); }
function metricValues(tree) { return elements(byLabel(tree, 'Resultados de cartera')).filter(node => node.type === 'strong').map(textOf); }

test('franja muestra métricas de la consulta con porcentaje colombiano y maneja denominador cero', () => {
  const instance = workspaceProbe();
  assert.deepEqual(metricValues(instance.render()), ['30', '6', '15', '71,4 %']);
  assert.match(textOf(byLabel(instance.render(), 'Resultados de cartera')), /51\s+filas originales/);
  assert.match(textOf(analysisFilters(instance.render())), /21\s+duplicados removidos/);
  instance.state.selectedMerchant = 'Comercio Norte'; instance.render();
  assert.deepEqual(metricValues(instance.render()), ['16', '5', '9', '64,3 %']);
  instance.state.selectedStatus = 'PAGO X'; instance.render();
  assert.deepEqual(metricValues(instance.render()), ['2', '0', '0', '0,0 %']);
  instance.state.selectedMerchant = 'No existe'; instance.render();
  assert.deepEqual(metricValues(instance.render()), ['0', '0', '0', '0,0 %']);
});

test('controles visibles aplican búsqueda, selección, cinco pestañas y limpieza sobre la misma consulta', () => {
  const instance = workspaceProbe();
  let tree = instance.render();
  const input = elements(analysisFilters(tree)).find(node => node.type === 'input');
  assert.equal(input.props.placeholder, 'Nombre del comercio...'); input.props.onChange({ target: { value: 'sur' } }); tree = instance.render();
  assert.equal(instance.view.filteredRows.length, 13);
  const filterGroup = byLabel(tree, 'Filtrar por estado'); const tabs = elements(filterGroup).filter(node => node.type === 'button');
  assert.deepEqual(tabs.map(textOf), ['Todos', 'Pago', 'Mora', 'Gestionar', 'Pago X']);
  tabs.find(node => textOf(node) === 'Gestionar').props.onClick(); tree = instance.render();
  assert.equal(instance.view.filteredRows.length, 4); assert.equal(elements(byLabel(tree, 'Filtrar por estado')).find(node => textOf(node) === 'Gestionar' && node.type === 'button').props['aria-pressed'], true);
  byLabel(tree, 'Filtrar por tienda').props.onChange({ target: { value: 'Comercio Norte' } }); tree = instance.render();
  assert.equal(instance.state.merchantQuery, ''); assert.equal(instance.view.filteredRows.length, 3);
  elements(analysisFilters(tree)).find(node => node.type === 'button' && textOf(node) === 'Limpiar filtros').props.onClick(); instance.render();
  assert.equal(instance.view.filteredRows.length, 30); assert.equal(instance.state.selectedStatus, 'TODOS'); assert.equal(instance.state.selectedMerchant, 'TODOS');
});

test('comercio seleccionado sin filas para el estado permanece visible y no presenta otro comercio como seleccionado', () => {
  const onlyPagoX = [{ ...rows[0], merchantName: 'Comercio solo Pago X', status: 'PAGO X', manualStatus: 'PAGO X' }, ...rows.slice(1)];
  const instance = workspaceProbe({ initial: { rows: onlyPagoX, selectedMerchant: 'Comercio solo Pago X', selectedStatus: 'MORA' } });
  const tree = instance.render(); const selector = byLabel(tree, 'Filtrar por tienda');
  assert.equal(selector.props.value, 'Comercio solo Pago X'); assert.equal(instance.view.filteredRows.length, 0);
  const selectedOption = elements(selector).filter(node => node.type === 'option' && node.props.value === selector.props.value);
  assert.equal(selectedOption.length, 1); assert.equal(textOf(selectedOption[0]), 'Comercio solo Pago X');
  assert.match(textOf(tree), /No hay filas para mostrar con el filtro actual/);
  assert.deepEqual(metricValues(tree), ['0', '0', '0', '0,0 %']);
});

test('abrir y cerrar tiendas conserva la cartera, filtros y nombre y los registros abren la selección correcta', () => {
  const instance = workspaceProbe({ initial: { merchantQuery: 'sur', selectedStatus: 'PAGO X', saveName: 'Corte no guardado', activeSavedCutId: 71 } });
  let tree = instance.render();
  assert.ok(!elements(tree).some(node => node.props?.id === 'payjoy-merchant-summary'));
  const toggle = elements(tree).find(node => node.type === 'button' && textOf(node) === 'Ver tiendas');
  assert.equal(toggle.props['aria-expanded'], false); assert.equal(toggle.props['aria-controls'], 'payjoy-merchant-summary');
  toggle.props.onClick(); tree = instance.render();
  const shops = elements(tree).find(node => node.props?.id === 'payjoy-merchant-summary'); assert.ok(shops);
  assert.equal(elements(shops).filter(node => node.type === 'tr').length, 2);
  assert.match(textOf(shops), /Comercio Sur/);
  elements(tree).find(node => node.type === 'button' && textOf(node) === 'Ocultar tiendas').props.onClick(); instance.render();
  assert.equal(instance.state.merchantSummaryExpanded, false); assert.equal(instance.state.merchantQuery, 'sur'); assert.equal(instance.state.selectedStatus, 'PAGO X');
  assert.equal(instance.state.rows, rows); assert.equal(instance.state.data, processedData); assert.equal(instance.state.saveName, 'Corte no guardado'); assert.equal(instance.state.activeSavedCutId, 71);
  assert.deepEqual(instance.calls, []);
  instance.state.merchantSummaryExpanded = true; tree = instance.render();
  elements(elements(tree).find(node => node.props?.id === 'payjoy-merchant-summary')).find(node => node.type === 'button' && textOf(node).trim() === 'Ver registros').props.onClick(); instance.render();
  assert.equal(instance.state.selectedMerchant, 'Comercio Sur'); assert.equal(instance.state.merchantQuery, ''); assert.equal(instance.view.filteredRows.length, 6);
});

test('resumen de recarga muestra cinco cantidades del servidor, otros cambios y total sin reducirlos por filtro', () => {
  const reloadSummary = { total: 30, movedToPago: 3, keptPago: 6, keptPagoX: 9, stayedGestionar: 5, stayedMora: 7, otherChanges: 2 };
  const instance = workspaceProbe({ initial: { selectedMerchant: 'Comercio Sur', selectedStatus: 'PAGO X', reloadSummary } });
  const summary = byLabel(instance.render(), 'Resumen de recarga'); assert.ok(summary);
  assert.deepEqual(elements(summary).filter(node => node.type === 'strong').map(textOf), ['3', '5', '7', '6', '9']);
  assert.match(textOf(summary), /30\s+revisados/); assert.match(textOf(summary), /2\s+registros tuvieron otros cambios/);
  assert.equal(instance.view.filteredRows.length, 6);
  instance.state.reloadSummary = null; assert.ok(!byLabel(instance.render(), 'Resumen de recarga'));
  instance.state.data = null; const noData = instance.render(); assert.ok(!byLabel(noData, 'Resultados de cartera')); assert.ok(!analysisFilters(noData));
});
