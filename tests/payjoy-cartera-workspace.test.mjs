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
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', 'console', ...Object.keys(injected), output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {}, warn() {} }, ...Object.values(injected));
  return loaded.exports;
}

class NextResponse extends Response {
  static json(body, options = {}) { return new NextResponse(JSON.stringify(body), { ...options, headers: { 'Content-Type': 'application/json' } }); }
}
const administrator = { id: 41, nombre: 'Administrador QA', usuario: 'admin-qa', sedeId: 1, sedeNombre: 'SEDE QA', rolNombre: 'ADMIN' };
const auditor = { ...administrator, id: 42, rolNombre: 'AUDITOR' };
const XLSX = require('xlsx');
const parser = load('lib/payjoy-cartera-import.ts', { xlsx: XLSX });
const header = ['Transaction time', 'Merchant name', 'Device', 'Device family', 'IMEI', 'National id'];
const recordA = ['2026-09-01T12:00:00Z', 'Tienda QA', 'DQA001', 'IPHONE QA 128GB', '035123456789012', '001234567'];
const recordB = ['2026-09-01T12:00:00Z', 'Sede QA 2', 'DQA002', 'ANDROID QA 256GB', '861234567890123', '987654321'];
const recordC = ['2026-09-15T12:00:00Z', 'Tienda QA', 'DQA001', 'IPHONE QA 128GB', '035123456789012', '001234567'];
const textFile = (name, rows, delimiter = ',') => new File([[header, ...rows].map(row => row.join(delimiter)).join('\n')], name, { type: name.endsWith('.csv') ? 'text/csv' : 'text/plain' });
function workbookBuffer(rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Hoja auxiliar sin transacciones']]), 'Ayuda');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Transacciones');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
function importProbe(user = administrator, { snapshot } = {}) {
  const calls = [];
  const route = load('app/api/payjoy/cartera/route.ts', {
    'next/server': { NextResponse }, '@/lib/auth': { getSessionUser: async () => user },
    '@/lib/payjoy-cartera-import': parser,
    '@/lib/payjoy': { getPayJoyPaymentSnapshot: async device => {
      calls.push(device);
      return snapshot ? snapshot(device) : { validThrough: new Date(device === 'DQA002' ? '2026-09-19T12:00:00Z' : '2026-10-01T12:00:00Z'), remainingBalance: 2000000.75, cost14: 123456.78, currency: 'COP', paidInFull: false, message: null };
    } },
  });
  return { calls, async post(files = [], fields = {}) {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    const response = await route.POST({ formData: async () => form });
    return { response, body: await response.json() };
  } };
}

test('lector real acepta XLSX, CSV y TXT sin alterar IMEI ni cédulas con ceros iniciales', async () => {
  const inputs = [
    { buffer: workbookBuffer([recordA, recordB]), name: 'Corte QA.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { buffer: Buffer.from([header, recordA, recordB].map(row => row.join(',')).join('\n')), name: 'Corte QA.csv', contentType: 'text/csv' },
    { buffer: Buffer.from('\uFEFF' + [header, recordA, recordB].map(row => row.join('\t')).join('\r\n')), name: 'Corte QA.txt', contentType: 'text/plain' },
  ];
  for (const input of inputs) {
    const actual = parser.parsePayJoyImportFile(input.buffer, input.name, input.contentType);
    assert.equal(actual.fileName, input.name); assert.equal(actual.totalRows, 2);
    assert.equal(actual.rows[0].imei, '035123456789012'); assert.equal(actual.rows[0].nationalId, '001234567');
    assert.equal(actual.rows[0].transactionTime.toISOString(), '2026-09-01T12:00:00.000Z');
    assert.equal(actual.rows[1].device, 'DQA002');
  }
});

test('procesamiento múltiple consolida duplicados entre formatos y consulta cada Device Tag una sola vez', async () => {
  const instance = importProbe();
  const cosmeticDuplicate = recordA.map((value, index) => [1, 2, 3].includes(index) ? ` ${value.toLowerCase()} ` : value);
  const { response, body } = await instance.post([
    textFile('corte_primero.csv', [recordA, recordB]), textFile('corte-segundo.txt', [cosmeticDuplicate, recordC], '\t'),
    new File([workbookBuffer([recordA])], 'corte_tercero.xlsx'),
  ]);
  assert.equal(response.status, 200); assert.equal(body.ok, true);
  assert.equal(body.totalSources, 3); assert.equal(body.rawRows, 5); assert.equal(body.uniqueRows, 3); assert.equal(body.duplicatesRemoved, 2);
  assert.deepEqual(body.sourceNames, ['corte primero', 'corte segundo', 'corte tercero']);
  assert.equal(body.rows[0].corteName, 'corte primero | corte segundo | corte tercero');
  assert.deepEqual(instance.calls.sort(), ['DQA001', 'DQA002']);
  assert.deepEqual(body.summary, { mora: 2, pago: 1, pagoX: 0 });
  assert.equal(body.rows[0].installmentAmount, 123456.78); assert.equal(body.rows[0].imei, '035123456789012');
  assert.equal(body.rows[0].paymentDueDate, '2026-09-15T12:00:00.000Z');
  assert.equal(body.rows[0].maximumPaymentDate, '2026-09-19T12:00:00.000Z');
});

test('consolidación conserva transacciones distintas que comparten device o IMEI', async () => {
  const sameDeviceDifferentIdentity = [...recordA]; sameDeviceDifferentIdentity[5] = '123456789';
  const differentStore = [...recordA]; differentStore[1] = 'Otra sede QA';
  const { body } = await importProbe().post([textFile('diferentes.csv', [recordA, recordC, sameDeviceDifferentIdentity, differentStore])]);
  assert.equal(body.rawRows, 4); assert.equal(body.uniqueRows, 4); assert.equal(body.duplicatesRemoved, 0);
});

test('ventana de pago, equipo pagado y fallo de consulta conservan las reglas de estado actuales', async () => {
  for (const [days, expected] of [[9, 'MORA'], [10, 'PAGO'], [14, 'PAGO'], [15, 'MORA']]) {
    const validThrough = new Date('2026-09-19T12:00:00Z'); validThrough.setUTCDate(validThrough.getUTCDate() + days);
    const { body } = await importProbe(administrator, { snapshot: () => ({ validThrough, paidInFull: false, cost14: 100, currency: 'COP' }) }).post([textFile('regla.csv', [recordA])]);
    assert.equal(body.rows[0].status, expected, `Ventana ${days}`);
  }
  const paid = await importProbe(auditor, { snapshot: () => ({ validThrough: null, paidInFull: true, cost14: 100, message: 'Pagado QA' }) }).post([textFile('pagado.csv', [recordA])]);
  assert.equal(paid.body.rows[0].status, 'PAGO'); assert.equal(paid.body.rows[0].lookupMessage, 'Pagado QA');
  const failure = await importProbe(administrator, { snapshot: () => { throw Error('Consulta QA no disponible'); } }).post([textFile('consulta.csv', [recordA])]);
  assert.equal(failure.response.status, 200); assert.equal(failure.body.rows[0].status, 'PAGO X');
  assert.equal(failure.body.rows[0].lookupMessage, 'Consulta QA no disponible'); assert.equal(failure.body.rows[0].installmentAmount, null);
});

test('cargas no autenticadas y roles diferentes de ADMIN/AUDITOR no llegan al lector ni a PayJoy', async () => {
  for (const user of [null, ...['SUPERVISOR', 'VENDEDOR', 'FACTURADOR'].map(rolNombre => ({ ...administrator, rolNombre }))]) {
    const instance = importProbe(user); const { response, body } = await instance.post([textFile('sin-acceso.csv', [recordA])]);
    assert.equal(response.status, user ? 403 : 401); assert.ok(body.error); assert.deepEqual(instance.calls, []);
  }
  const accepted = await importProbe(auditor).post([textFile('auditor.csv', [recordA])]);
  assert.equal(accepted.response.status, 200);
});

test('sin archivos, links deshabilitados y archivos inválidos devuelven error sin simular un procesamiento correcto', async () => {
  const cases = [
    { files: [], status: 400 }, { files: [textFile('qa.csv', [recordA])], fields: { linksText: 'https://ejemplo.invalid/qa.csv' }, status: 400 },
    { files: [new File(['no es una tabla'], 'invalido.csv', { type: 'text/csv' })], status: 500 },
    { files: [textFile('vacio.csv', [])], status: 500 },
  ];
  for (const entry of cases) {
    const instance = importProbe(); const { response, body } = await instance.post(entry.files, entry.fields);
    assert.equal(response.status, entry.status); assert.ok(body.error); assert.ok(!body.ok); assert.ok(!body.rows); assert.deepEqual(instance.calls, []);
  }
});

const storedRow = { corteName: 'Corte QA', transactionTime: '2026-09-01T12:00:00.000Z', merchantName: 'SEDE QA', device: 'DQA001', deviceFamily: 'IPHONE QA 128GB', imei: '035123456789012', nationalId: '001234567', installmentAmount: 123456.78, paymentDueDate: '2026-09-15T12:00:00.000Z', devicePaymentDate: '2026-10-01T12:00:00.000Z', paidInFull: false, status: 'MORA', maximumPaymentDate: '2026-09-19T12:00:00.000Z', currency: 'COP', lookupMessage: null, manualStatus: null };
const cut = { id: 51, recordName: 'Corte QA', totalSources: 1, sourceNames: ['Corte QA'], rawRows: 3, uniqueRows: 2, duplicatesRemoved: 1, summary: { mora: 1, pago: 1, pagoX: 0 }, savedById: 41, savedByName: 'Administrador QA', savedByUser: 'admin-qa', savedAt: '2026-10-09T14:00:00.000Z', updatedAt: '2026-10-09T14:00:00.000Z', rows: [storedRow, { ...storedRow, device: 'DQA002', status: 'PAGO', manualStatus: 'PAGO' }] };
const cutPayload = { ...cut, recordName: '  Corte editado QA  ', sourceNames: ['Corte QA', 'Corte QA', 'Segundo QA'], rawRows: 7, uniqueRows: 999, summary: { mora: 999, pago: 999, pagoX: 999 }, rows: [storedRow, { ...storedRow, status: 'GESTIONAR', manualStatus: 'GESTIONAR' }, { ...storedRow, status: 'PAGO' }, { ...storedRow, status: 'PAGO X' }] };
function cutsProbe(user = administrator, { failure = false, found = cut, removed = true } = {}) {
  const calls = [];
  const record = async (operation, value, result) => { calls.push({ operation, value }); if (failure) throw Error('Persistencia QA no disponible'); return result; };
  const route = load('app/api/payjoy/cartera/cortes/route.ts', {
    'next/server': { NextResponse }, '@/lib/auth': { getSessionUser: async () => user },
    '@/lib/payjoy': { getPayJoyPaymentSnapshot: async () => ({ validThrough: new Date('2026-10-01T12:00:00Z'), paidInFull: false, cost14: 123456.78, currency: 'COP' }) },
    '@/lib/payjoy-cortes-store': {
      listStoredPayJoyCuts: async (...args) => record('list', args, [cut]),
      countStoredPayJoyCuts: async () => record('count', null, 31),
      getStoredPayJoyCutById: async id => record('get', id, found),
      saveStoredPayJoyCut: async input => record('save', input, { ...cut, ...input, id: 52 }),
      updateStoredPayJoyCut: async input => record('update', input, found ? { ...cut, ...input } : null),
      deleteStoredPayJoyCutById: async id => record('delete', id, removed),
    },
  });
  return { calls, async invoke(method, body, query = '') {
    const response = await route[method](new Request(`http://qa.local/api/payjoy/cartera/cortes${query}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }));
    return { response, body: await response.json() };
  } };
}

test('guardar corte recalcula resumen y filas únicas, preserva edición y registra al usuario real', async () => {
  for (const user of [administrator, auditor]) {
    const instance = cutsProbe(user); const { response, body } = await instance.invoke('POST', cutPayload);
    assert.equal(response.status, 200); assert.equal(body.ok, true); assert.equal(body.corte.id, 52);
    const saved = instance.calls.find(call => call.operation === 'save').value;
    assert.equal(saved.recordName, 'Corte editado QA'); assert.equal(saved.uniqueRows, 4); assert.equal(saved.rawRows, 7);
    assert.deepEqual(saved.summary, { mora: 2, pago: 1, pagoX: 1 }); assert.deepEqual(saved.sourceNames, ['Corte QA', 'Segundo QA']);
    assert.deepEqual(saved.savedBy, { id: user.id, nombre: user.nombre, usuario: user.usuario });
    assert.equal(saved.rows[0].imei, '035123456789012'); assert.equal(saved.rows[0].nationalId, '001234567'); assert.equal(saved.rows[0].installmentAmount, 123456.78);
    assert.equal(saved.rows[1].manualStatus, 'GESTIONAR');
  }
});

test('guardar sin filas válidas se rechaza y una falla de persistencia nunca devuelve confirmación', async () => {
  for (const rows of [[], [{ ...storedRow, status: 'ESTADO INVALIDO' }]]) {
    const instance = cutsProbe(); const { response, body } = await instance.invoke('POST', { ...cutPayload, rows });
    assert.equal(response.status, 400); assert.ok(body.error); assert.deepEqual(instance.calls, []);
  }
  const { response, body } = await cutsProbe(administrator, { failure: true }).invoke('POST', cutPayload);
  assert.equal(response.status, 500); assert.ok(body.error); assert.ok(!body.ok); assert.ok(!body.corte); assert.ok(!body.mensaje);
});

test('historial y apertura conservan datos, errores y acceso administrativo en el servidor', async () => {
  for (const user of [administrator, auditor]) {
    const instance = cutsProbe(user); const history = await instance.invoke('GET'); const opened = await instance.invoke('GET', null, '?id=51');
    assert.equal(history.response.status, 200); assert.equal(history.body.cortes[0].id, 51);
    assert.equal(opened.response.status, 200); assert.deepEqual(opened.body.corte.rows, cut.rows);
    assert.ok(instance.calls.some(call => call.operation === 'get' && call.value === 51));
  }
  const missing = await cutsProbe(administrator, { found: null }).invoke('GET', null, '?id=999');
  assert.equal(missing.response.status, 404); assert.ok(missing.body.error); assert.ok(!missing.body.corte);
  const failed = await cutsProbe(administrator, { failure: true }).invoke('GET');
  assert.equal(failed.response.status, 500); assert.ok(failed.body.error); assert.ok(!failed.body.cortes);
});

test('historial completo optativo quita el límite sin cambiar el contrato habitual de 24 cortes', async () => {
  for (const query of ['', '?completo=0', '?completo=true']) {
    const instance = cutsProbe(); const result = await instance.invoke('GET', null, query);
    assert.equal(result.response.status, 200); assert.deepEqual(instance.calls, [{ operation: 'list', value: [] }]);
  }
  for (const user of [administrator, auditor]) {
    const instance = cutsProbe(user); const result = await instance.invoke('GET', null, '?completo=1');
    assert.equal(result.response.status, 200); assert.deepEqual(instance.calls, [{ operation: 'list', value: [null] }]);
  }
  const opened = cutsProbe(); await opened.invoke('GET', null, '?completo=1&id=51');
  assert.deepEqual(opened.calls, [{ operation: 'get', value: 51 }]);
});

test('consulta de almacenamiento completo conserva orden, datos y parametrización sin límite SQL', async () => {
  const calls = [];
  const stored = load('lib/payjoy-cortes-store.ts', { '@/lib/prisma': { __esModule: true, default: {
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async (...args) => {
      calls.push(args);
      return [{ ...cut, sourceNames: JSON.stringify(cut.sourceNames), summaryMora: 1, summaryPago: 1, summaryPagoX: 0 }];
    },
  } } });
  const regular = await stored.listStoredPayJoyCuts();
  assert.equal(regular[0].recordName, cut.recordName); assert.equal(calls.at(-1)[1], 24); assert.match(calls.at(-1)[0], /LIMIT \$1/);
  const complete = await stored.listStoredPayJoyCuts(null);
  assert.equal(complete.length, 1); assert.deepEqual(complete[0].sourceNames, ['Corte QA']); assert.deepEqual(complete[0].summary, cut.summary);
  assert.equal(calls.at(-1).length, 1); assert.doesNotMatch(calls.at(-1)[0], /LIMIT/); assert.match(calls.at(-1)[0], /ORDER BY updated_at DESC, id DESC/);
  await stored.listStoredPayJoyCuts(50); assert.equal(calls.at(-1)[1], 50);
});

test('todas las operaciones del historial rechazan roles ajenos antes de consultar o mutar datos', async () => {
  for (const user of [null, ...['SUPERVISOR', 'VENDEDOR', 'FACTURADOR'].map(rolNombre => ({ ...administrator, rolNombre }))]) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const instance = cutsProbe(user); const { response, body } = await instance.invoke(method, ['POST', 'PUT', 'PATCH'].includes(method) ? cutPayload : null, method === 'DELETE' ? '?id=51' : '');
      assert.equal(response.status, user ? 403 : 401); assert.ok(body.error); assert.deepEqual(instance.calls, []);
    }
  }
});

test('eliminar sigue limitado a ADMIN, valida identificador y confirma únicamente eliminación real', async () => {
  const denied = cutsProbe(auditor); const result = await denied.invoke('DELETE', null, '?id=51');
  assert.equal(result.response.status, 403); assert.deepEqual(denied.calls, []);
  for (const query of ['', '?id=0', '?id=-1', '?id=no-valido']) {
    const instance = cutsProbe(); const invalid = await instance.invoke('DELETE', null, query);
    assert.equal(invalid.response.status, 400); assert.deepEqual(instance.calls, []);
  }
  const missing = await cutsProbe(administrator, { removed: false }).invoke('DELETE', null, '?id=51');
  assert.equal(missing.response.status, 404); assert.ok(!missing.body.ok);
  const success = cutsProbe(); const deleted = await success.invoke('DELETE', null, '?id=51');
  assert.equal(deleted.response.status, 200); assert.equal(deleted.body.ok, true); assert.deepEqual(success.calls, [{ operation: 'delete', value: 51 }]);
});

test('actualizar corte mantiene el payload completo y recargar conserva estados PAGO y PAGO X existentes', async () => {
  const instance = cutsProbe(auditor); const updated = await instance.invoke('PATCH', { ...cutPayload, id: 51 });
  assert.equal(updated.response.status, 200);
  const saved = instance.calls.find(call => call.operation === 'update').value;
  assert.equal(saved.id, 51); assert.equal(saved.rows.length, 4); assert.deepEqual(saved.summary, { mora: 2, pago: 1, pagoX: 1 });
  const previous = { ...cut, rows: [{ ...storedRow, status: 'PAGO', manualStatus: 'PAGO' }, { ...storedRow, status: 'PAGO X', manualStatus: 'PAGO X' }] };
  const reload = await cutsProbe(auditor, { found: previous }).invoke('PUT', { id: 51 });
  assert.equal(reload.response.status, 200); assert.deepEqual(reload.body.corte.rows.map(row => row.status), ['PAGO', 'PAGO X']);
  assert.equal(reload.body.resumenRecarga.keptPago, 1); assert.equal(reload.body.resumenRecarga.keptPagoX, 1);
});

const jsx = require('react/jsx-runtime');
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const nullComponent = { __esModule: true, default: () => null };
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
function workspaceProbe({ initial = {}, fetchImpl, confirmation = true, user = administrator } = {}) {
  const path = 'app/dashboard/payjoy/_components/payjoy-cartera-workspace.tsx';
  const text = source(path); const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const states = declarations.flatMap(entry => ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === 'useState' ? [entry.name.elements[0].name.getText(ast)] : []);
  const locals = declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text);
  const finalReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(finalReturn);
  const state = { savedCuts: [cut], savedCutsLoading: false, ...initial };
  const calls = []; const effects = []; const refs = []; const confirmations = []; let cursor = 0; let refCursor = 0; let captured;
  const react = {
    useState(value) { const name = states[cursor++]; assert.ok(name, 'Estado inesperado'); if (!(name in state)) state[name] = typeof value === 'function' ? value() : value; return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
    useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => effects.push(fn), useDeferredValue: value => value,
    useRef(value) { const index = refCursor++; return refs[index] ??= { current: value }; },
  };
  const imports = {
    react, 'react/jsx-runtime': jsx,
    'next/link': { __esModule: true, default: props => jsx.jsx('a', { ...props, children: props.children }) },
    'next/image': { __esModule: true, default: props => jsx.jsx('img', props) },
    '@/app/dashboard/_components/dashboard-icon': nullComponent,
    '@/app/dashboard/_components/logout-button': nullComponent,
    '@/app/dashboard/_components/operations-dashboard': { DashboardSidebar: () => null },
    '@/app/ventas/_components/sales-dashboard-parts': { SalesProfile: props => jsx.jsx('div', { 'data-profile': true, children: `${props.name} ${props.role}` }) },
    xlsx: XLSX,
  };
  for (const node of ast.statements) if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.endsWith('.css')) imports[node.moduleSpecifier.text] = css;
  const workspace = load(path, imports, {
    __capture: value => { captured = value; },
    window: { setTimeout(fn) { fn(); return 1; }, clearTimeout() {}, scrollTo() {}, confirm(message) { confirmations.push(message); return confirmation; } },
    document: { getElementById() { return null; }, activeElement: null },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const result = fetchImpl ? await fetchImpl(url, options) : { ok: true, data: { ok: true, cortes: [cut] } };
      return result instanceof Response ? result : { ok: result.ok, json: async () => result.data };
    },
  }, input => input.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(',')}});\n` + input.slice(finalReturn.getStart(ast)));
  const instance = {
    state, calls, effects, refs, confirmations,
    render() { cursor = 0; refCursor = 0; effects.length = 0; return { tree: resolve(workspace.default({ user, puedeEliminar: user.rolNombre === 'ADMIN' })) }; },
    get view() { return captured; },
  };
  instance.render(); return instance;
}

const processedData = { ok: true, totalSources: cut.totalSources, sourceNames: cut.sourceNames, rawRows: cut.rawRows, uniqueRows: cut.rows.length, duplicatesRemoved: cut.duplicatesRemoved, summary: cut.summary, rows: cut.rows };
const editableRows = cut.rows.map((row, index) => ({ ...row, localId: `qa-${index}` }));

test('interfaz procesa todos los archivos seleccionados y evita solicitudes duplicadas antes de recibir respuesta', async () => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const files = [textFile('qa-uno.csv', [recordA]), textFile('qa-dos.txt', [recordB], '\t')];
  const instance = workspaceProbe({ initial: { files }, fetchImpl: async () => response });
  const one = instance.view.processSources(); const duplicate = instance.view.processSources();
  assert.equal(instance.calls.length, 1); assert.equal(instance.calls[0].url, '/api/payjoy/cartera');
  assert.equal(instance.calls[0].options.method, 'POST'); assert.deepEqual(instance.calls[0].options.body.getAll('files').map(file => file.name), files.map(file => file.name));
  assert.equal(instance.state.loading, true); assert.equal(instance.state.data, null);
  release({ ok: true, data: processedData }); await Promise.all([one, duplicate]);
  assert.equal(instance.state.loading, false); assert.equal(instance.state.data.uniqueRows, 2); assert.equal(instance.state.rows.length, 2);
  assert.equal(instance.state.rows[0].imei, '035123456789012'); assert.equal(instance.state.activeSavedCutId, null);
});

test('interfaz no procesa sin archivos y conserva la cartera existente ante un error de procesamiento', async () => {
  const missing = workspaceProbe(); await missing.view.processSources(); assert.deepEqual(missing.calls, []); assert.ok(missing.state.message);
  const files = [textFile('qa-error.csv', [recordA])];
  const instance = workspaceProbe({ initial: { files, data: processedData, rows: editableRows }, fetchImpl: async () => ({ ok: false, data: { error: 'Carga QA inválida' } }) });
  await instance.view.processSources();
  assert.equal(instance.state.loading, false); assert.equal(instance.state.message, 'Carga QA inválida');
  assert.equal(instance.state.data, processedData); assert.equal(instance.state.rows, editableRows); assert.equal(instance.state.files, files);
});

test('guardar requiere cartera procesada y conserva todas las filas aunque estén filtradas', async () => {
  const missing = workspaceProbe(); await missing.view.saveCurrentCut(); assert.deepEqual(missing.calls, []); assert.ok(missing.state.message);
  const instance = workspaceProbe({ initial: { data: processedData, rows: editableRows, saveName: '  Guardado QA  ', selectedMerchant: 'NO COINCIDE', selectedStatus: 'MORA' } });
  const payload = instance.view.buildCurrentCutPayload();
  assert.equal(instance.view.filteredRows.length, 0); assert.equal(payload.rows.length, 2); assert.equal(payload.uniqueRows, 2); assert.equal(payload.recordName, 'Guardado QA');
  assert.deepEqual(payload.summary, { mora: 1, pago: 1, pagoX: 0 }); assert.equal(payload.rows[0].imei, '035123456789012');
  assert.ok(payload.rows.every(row => !('localId' in row)));
});

test('guardado evita doble envío, espera confirmación y después actualiza el historial completo', async () => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const instance = workspaceProbe({ initial: { data: processedData, rows: editableRows, saveName: 'Guardado QA' }, fetchImpl: async (_url, options) => options.method === 'POST' ? response : { ok: true, data: { ok: true, cortes: [{ ...cut, id: 52 }] } } });
  const one = instance.view.saveCurrentCut(); const duplicate = instance.view.saveCurrentCut();
  assert.equal(instance.calls.length, 1); assert.equal(instance.state.savingCut, true); assert.equal(instance.state.activeSavedCutId, null); assert.ok(!instance.state.message);
  const payload = JSON.parse(instance.calls[0].options.body); assert.equal(payload.rows.length, 2); assert.equal(payload.rows[0].installmentAmount, 123456.78);
  release({ ok: true, data: { ok: true, corte: { ...cut, id: 52, recordName: 'Guardado QA' }, mensaje: 'Guardado confirmado QA' } });
  await Promise.all([one, duplicate]);
  assert.equal(instance.state.savingCut, false); assert.equal(instance.state.activeSavedCutId, 52); assert.equal(instance.state.message, 'Guardado confirmado QA');
  assert.equal(instance.state.savedCuts[0].id, 52); assert.ok(instance.calls.some(call => call.url === '/api/payjoy/cartera/cortes?completo=1' && call.options.method === 'GET'));
});

test('error de guardado o apertura no borra carga, filas, nombre ni filtros actuales', async () => {
  for (const action of ['saveCurrentCut', 'loadStoredCut']) {
    const files = [textFile('carga-en-curso.csv', [recordA])];
    const instance = workspaceProbe({ initial: { files, data: processedData, rows: editableRows, saveName: 'Carga QA', selectedMerchant: 'SEDE QA', selectedStatus: 'MORA' }, fetchImpl: async () => ({ ok: false, data: { error: 'Servidor QA no disponible' } }) });
    await instance.view[action](51);
    assert.equal(instance.state.message, 'Servidor QA no disponible'); assert.equal(instance.state.data, processedData); assert.equal(instance.state.rows, editableRows);
    assert.equal(instance.state.saveName, 'Carga QA'); assert.equal(instance.state.selectedMerchant, 'SEDE QA'); assert.equal(instance.state.selectedStatus, 'MORA'); assert.equal(instance.state.files, files);
    assert.equal(instance.state.activeSavedCutId, null);
  }
});

test('historial consulta todos los cortes sin reemplazar ni descartar una carga en curso', async () => {
  const files = [textFile('pendiente.csv', [recordA])];
  const instance = workspaceProbe({ initial: { files, data: processedData, rows: editableRows, savedCutsExpanded: false } });
  const toggle = () => elements(instance.render().tree).find(node => node.type === 'button' && /^(Ver|Ocultar) historial/.test(textOf(node)));
  assert.ok(toggle()); toggle().props.onClick(); assert.equal(instance.state.savedCutsExpanded, true);
  toggle().props.onClick(); assert.equal(instance.state.savedCutsExpanded, false);
  await instance.view.loadSavedCuts();
  assert.deepEqual(instance.calls.map(call => call.url), ['/api/payjoy/cartera/cortes?completo=1']);
  assert.equal(instance.state.data, processedData); assert.equal(instance.state.rows, editableRows); assert.equal(instance.state.files, files);
  assert.equal(instance.state.savedCutsExpanded, false);
});

test('selección múltiple permite añadir y retirar archivos antes de procesar sin descartar cartera anterior', () => {
  const first = textFile('primero.csv', [recordA]); const second = textFile('segundo.txt', [recordB], '\t');
  const instance = workspaceProbe({ initial: { data: processedData, rows: editableRows } });
  instance.view.selectFiles([first, second]); instance.render();
  assert.deepEqual(instance.state.files, [first, second]); assert.equal(instance.view.totalSelectedFiles, 2);
  instance.view.selectFiles([first]); instance.render(); assert.deepEqual(instance.state.files, [first, second]);
  instance.view.removeFile(0); instance.render(); assert.deepEqual(instance.state.files, [second]);
  assert.equal(instance.state.data, processedData); assert.equal(instance.state.rows, editableRows); assert.deepEqual(instance.calls, []);
});

test('operación en curso bloquea cambios de archivos y una operación distinta simultánea', async () => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const files = [textFile('en-proceso.csv', [recordA])];
  const instance = workspaceProbe({ initial: { files, data: processedData, rows: editableRows }, fetchImpl: async () => response });
  const processing = instance.view.processSources();
  instance.view.removeFile(0); instance.view.selectFiles([textFile('posterior.csv', [recordB])]);
  await instance.view.saveCurrentCut();
  assert.deepEqual(instance.state.files, files); assert.equal(instance.calls.length, 1); assert.equal(instance.state.savingCut, false);
  release({ ok: true, data: processedData }); await processing;
});

test('filtros por tienda y estado conservan denominadores y análisis por tienda existentes', () => {
  const rows = [...editableRows, { ...storedRow, localId: 'qa-extra', merchantName: 'SEDE QA 2', status: 'GESTIONAR', manualStatus: 'GESTIONAR' }, { ...storedRow, localId: 'qa-x', merchantName: 'SEDE QA 2', status: 'PAGO X', manualStatus: 'PAGO X' }];
  const instance = workspaceProbe({ initial: { data: processedData, rows, selectedMerchant: 'SEDE QA 2', selectedStatus: 'TODOS' } });
  assert.equal(instance.view.filteredRows.length, 2); assert.deepEqual(instance.view.liveSummary, { mora: 2, pago: 1, pagoX: 1 });
  assert.deepEqual(instance.view.visibleSummary, { mora: 1, pago: 0, pagoX: 1 });
  assert.equal(instance.view.filteredMerchantSummaries.length, 1);
  assert.equal(instance.view.filteredMerchantSummaries[0].records, 2); assert.equal(instance.view.filteredMerchantSummaries[0].delinquencyRate, 100);
  instance.view.clearFilters(); instance.render(); assert.equal(instance.view.filteredRows.length, 4);
  instance.state.merchantQuery = 'sede qa 2'; instance.render(); assert.equal(instance.view.filteredRows.length, 2);
});

test('ediciones conservan IMEI y cédula como texto y recalculan fechas derivadas sin cambiar las demás filas', () => {
  const instance = workspaceProbe({ initial: { data: processedData, rows: editableRows } });
  instance.view.updateRowField('qa-0', 'imei', '000123456789012'); instance.render();
  assert.equal(instance.state.rows[0].imei, '000123456789012'); assert.equal(instance.state.rows[1], editableRows[1]);
  instance.view.updateRowField('qa-0', 'nationalId', '001234567'); instance.render(); assert.equal(instance.state.rows[0].nationalId, '001234567');
  instance.view.updateRowField('qa-0', 'transactionTime', '2026-10-01T12:00:00.000Z'); instance.render();
  assert.equal(instance.state.rows[0].paymentDueDate, '2026-10-15T12:00:00.000Z'); assert.equal(instance.state.rows[0].maximumPaymentDate, '2026-10-19T12:00:00.000Z');
  instance.view.updateRowField('qa-0', 'status', 'GESTIONAR'); instance.render();
  assert.equal(instance.state.rows[0].status, 'GESTIONAR'); assert.equal(instance.state.rows[0].manualStatus, 'GESTIONAR');
});

test('apertura explícita carga todas las filas y restablece filtros conservando estados manuales', async () => {
  const instance = workspaceProbe({ initial: { files: [textFile('anterior.csv', [recordA])], selectedMerchant: 'OTRA SEDE', selectedStatus: 'MORA', merchantQuery: 'previa' }, fetchImpl: async () => ({ ok: true, data: { ok: true, corte: cut } }) });
  await instance.view.loadStoredCut(51);
  assert.equal(instance.state.activeSavedCutId, 51); assert.equal(instance.state.rows.length, 2); assert.equal(instance.state.saveName, 'Corte QA');
  assert.deepEqual(instance.state.files, []); assert.equal(instance.state.selectedMerchant, 'TODOS'); assert.equal(instance.state.selectedStatus, 'TODOS'); assert.equal(instance.state.merchantQuery, '');
  assert.equal(instance.state.rows[1].manualStatus, 'PAGO'); assert.equal(instance.state.savedCutsExpanded, true);
});

test('eliminación en pantalla exige ADMIN y confirmación; refresca historial sin descartar filas procesadas', async () => {
  const denied = workspaceProbe({ user: auditor }); await denied.view.deleteStoredCut(51, 'Corte QA');
  assert.deepEqual(denied.calls, []); assert.deepEqual(denied.confirmations, []);
  const cancelled = workspaceProbe({ confirmation: false, initial: { savedCutsExpanded: true } });
  const deleteButton = elements(cancelled.render().tree).find(node => node.type === 'button' && textOf(node).trim() === 'Eliminar corte');
  assert.ok(deleteButton); deleteButton.props.onClick();
  assert.deepEqual(cancelled.calls, []); assert.equal(cancelled.confirmations.length, 1);
  assert.ok(cancelled.confirmations[0].includes('"Corte QA"'));
  const instance = workspaceProbe({ initial: { data: processedData, rows: editableRows, activeSavedCutId: 51 }, fetchImpl: async (_url, options) => options.method === 'DELETE' ? { ok: true, data: { ok: true, mensaje: 'Eliminado QA' } } : { ok: true, data: { ok: true, cortes: [] } } });
  await instance.view.deleteStoredCut(51, 'Corte QA');
  assert.equal(instance.state.activeSavedCutId, null); assert.deepEqual(instance.state.savedCuts, []); assert.equal(instance.state.data, processedData); assert.equal(instance.state.rows, editableRows);
  assert.deepEqual(instance.calls.map(call => call.options.method), ['DELETE', 'GET']); assert.equal(instance.state.deletingCutId, null);
});
