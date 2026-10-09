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
const salesFinance = load('lib/ventas-financieras.ts');
const dates = load('lib/ventas-utils.ts', { '@/lib/ventas-financieras': salesFinance });
const caja = load('lib/caja-movimientos.ts', { '@/lib/ventas-utils': dates });
const paymentAmounts = load('lib/proveedores-pagos.ts');
const supervisor = { id: 10, nombre: 'Supervisor QA', sedeId: 1, sedeNombre: 'SEDE 1', rolNombre: 'SUPERVISOR', perfilTipo: 'SUPERVISOR_TIENDA' };
const administrator = { ...supervisor, nombre: 'Administrador QA', rolNombre: 'ADMIN', perfilTipo: 'ADMINISTRADOR' };
const auditor = { ...administrator, rolNombre: 'AUDITOR', perfilTipo: 'AUDITOR' };
const manualMovement = { id: 1, tipo: 'INGRESO', concepto: 'Movimiento manual QA', valor: 1234567.89, descripcion: 'Descripción completa QA', sedeId: 1, sede: { nombre: 'SEDE 1' }, createdAt: '2026-10-09T15:34:27.123Z' };
const payload = { tipo: 'EGRESO', concepto: '  Transporte QA  ', valor: 1234567.89, descripcion: '  Descripción QA  ', sedeId: 2 };
function request(body = payload, method = 'POST', url = '/api/caja/registrar') {
  return new Request(`http://qa.local${url}`, { method, headers: { 'Content-Type': 'application/json' }, ...(method !== 'DELETE' ? { body: JSON.stringify(body) } : {}) });
}
function apiProbe(user = administrator, { fail = false, existing = manualMovement } = {}) {
  const calls = [];
  const database = { cajaMovimiento: {
    create: async args => { calls.push({ method: 'create', ...args }); if (fail) throw Error('No se guardó QA'); return { ...manualMovement, ...args.data }; },
    findUnique: async args => { calls.push({ method: 'findUnique', ...args }); return existing; },
    update: async args => { calls.push({ method: 'update', ...args }); return { ...manualMovement, ...args.data }; },
    delete: async args => { calls.push({ method: 'delete', ...args }); return { id: args.where.id }; },
  } };
  const imports = {
    'next/server': { NextResponse: { json: (body, options = {}) => Response.json(body, options) } },
    '@/lib/prisma': { __esModule: true, default: database }, '@/lib/auth': { getSessionUser: async () => user },
    '@/lib/access-control': access, '@/lib/caja-movimientos': caja,
  };
  return { POST: load('app/api/caja/registrar/route.ts', imports).POST, ...load('app/api/caja/route.ts', imports), calls };
}

test('registro de ingreso y egreso conserva tipo, centavos y descripción; el servidor fuerza la sede del supervisor', async () => {
  for (const user of [supervisor, administrator, auditor]) {
    for (const tipo of ['INGRESO', 'EGRESO']) {
      const instance = apiProbe(user);
      const response = await instance.POST(request({ ...payload, tipo: ` ${tipo.toLowerCase()} ` }));
      const body = await response.json();
      assert.equal(response.status, 200); assert.equal(body.ok, true); assert.equal(body.movimiento.tipo, tipo);
      assert.equal(instance.calls.length, 1);
      assert.deepEqual(instance.calls[0].data, { tipo, concepto: 'Transporte QA', valor: 1234567.89, descripcion: 'Descripción QA', sedeId: user === supervisor ? 1 : 2 });
      assert.ok(!('createdAt' in instance.calls[0].data));
    }
  }
});

test('registro rechaza usuarios no autenticados o perfiles sin acceso antes de crear movimientos', async () => {
  for (const user of [null, ...['VENDEDOR', 'APOYO_OPERATIVO', 'FACTURADOR'].map(perfilTipo => ({ ...administrator, perfilTipo }))]) {
    const instance = apiProbe(user); const response = await instance.POST(request());
    assert.equal(response.status, user ? 403 : 401); assert.ok((await response.json()).error); assert.deepEqual(instance.calls, []);
  }
});

test('registro conserva validaciones y admite descripción opcional sin confirmar errores de servidor', async () => {
  for (const change of [{ tipo: 'OTRO' }, { concepto: '  ' }, { valor: 0 }, { valor: -1 }, { sedeId: 0 }]) {
    const instance = apiProbe(); const response = await instance.POST(request({ ...payload, ...change }));
    assert.equal(response.status, 400); assert.ok((await response.json()).error); assert.deepEqual(instance.calls, []);
  }
  const optional = apiProbe(); const response = await optional.POST(request({ ...payload, descripcion: '' }));
  assert.equal(response.status, 200); assert.equal(optional.calls[0].data.descripcion, null);
  const failed = apiProbe(administrator, { fail: true }); const error = await failed.POST(request()); const body = await error.json();
  assert.equal(error.status, 500); assert.ok(body.error); assert.ok(!body.ok); assert.ok(!body.movimiento); assert.ok(!body.mensaje);
});

test('automáticos con mayúsculas o espacios continúan bloqueados para editar y eliminar en el servidor', async () => {
  for (const concept of caja.CONCEPTOS_PROTEGIDOS) {
    for (const concepto of [concept, `  ${concept.toLowerCase()}  `]) {
      for (const user of [administrator, auditor]) {
        const instance = apiProbe(user, { existing: { ...manualMovement, concepto } });
        const response = await instance.PUT(request({ ...payload, concepto: 'Manual reemplazado QA' }, 'PUT', '/api/caja?id=1'));
        assert.equal(response.status, 403); assert.ok((await response.json()).error); assert.ok(!instance.calls.some(call => call.method === 'update'));
      }
      const instance = apiProbe(administrator, { existing: { ...manualMovement, concepto } });
      assert.equal((await instance.DELETE(request(null, 'DELETE', '/api/caja?id=1'))).status, 403);
      assert.ok(!instance.calls.some(call => call.method === 'delete'));
    }
  }
});

const historyRows = [
  ...Array.from({ length: 347 }, (_, index) => ({ ...manualMovement, id: index + 1, concepto: `Manual ${index + 1} QA` })),
  ...Array.from({ length: 22 }, (_, index) => ({ ...manualMovement, id: 400 + index, concepto: index % 2 ? '  abono financiera  ' : 'PAGO PRESTAMO ENTRE SEDES', valor: 777.75 })),
  { ...manualMovement, id: 500, concepto: 'GASTO CARTERA' },
  { ...manualMovement, id: 501, sedeId: 2, sede: { nombre: 'SEDE 2' }, concepto: 'Manual sede ajena QA' },
  { ...manualMovement, id: 502, sedeId: 2, sede: { nombre: 'SEDE 2' }, concepto: 'ABONO TRANSFERENCIA' },
];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(part => matches(row, part));
    if (value && typeof value === 'object') return matches(row[key] || {}, value);
    return row[key] === value;
  });
}
function historyProbe(user = administrator, { rows = historyRows, fail = false } = {}) {
  const calls = [];
  const matching = args => rows.filter(row => matches(row, args.where));
  const model = {
    count: async args => { calls.push({ operation: 'count', ...args }); return matching(args).length; },
    groupBy: async args => {
      calls.push({ operation: 'groupBy', ...args });
      if (fail) throw Error('Historial no disponible QA');
      const key = args.by[0]; const groups = new Map();
      for (const row of matching(args)) { const group = groups.get(row[key]) || { amount: 0, count: 0 }; group.amount += Number(row.valor); group.count++; groups.set(row[key], group); }
      return [...groups].map(([name, group]) => ({ [key]: name, ...(args._sum ? { _sum: { valor: group.amount } } : {}), ...(args._count ? { _count: { _all: group.count } } : {}) }));
    },
    findFirst: async args => { calls.push({ operation: 'findFirst', ...args }); return [...matching(args)].sort((a, b) => b.id - a.id)[0] || null; },
    findMany: async args => { calls.push({ operation: 'findMany', ...args }); const found = [...matching(args)].sort((a, b) => b.id - a.id); return found.slice(args.skip || 0, args.take == null ? undefined : (args.skip || 0) + args.take); },
  };
  const handler = load('app/api/caja/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => Response.json(body, options) } },
    '@/lib/prisma': { __esModule: true, default: { cajaMovimiento: model } },
    '@/lib/auth': { getSessionUser: async () => user }, '@/lib/access-control': access, '@/lib/caja-movimientos': caja,
  });
  return { calls, async get(params = '') { const response = await handler.GET(new Request(`http://qa.local/api/caja?${params}`)); return { response, body: await response.json() }; } };
}

test('indicadores de gestión cuentan toda la cobertura, incluyendo registros después de 300, sin depender de la página', async () => {
  const instance = historyProbe();
  for (const page of [1, 2, 35, 37]) {
    const { response, body } = await instance.get(`paginated=1&resumenGestion=1&pageSize=10&page=${page}`);
    assert.equal(response.status, 200); assert.ok(body.movimientos.length <= 10);
    assert.deepEqual(body.gestion, { totalMovimientos: 371, totalManuales: 348, totalAutomaticos: 23 });
    assert.equal(body.total, 371); assert.equal(body.gestion.totalManuales + body.gestion.totalAutomaticos, body.total);
    assert.ok(body.movimientos.every(row => row.editable === caja.esMovimientoEditable(row.concepto)));
    const aggregate = instance.calls.filter(call => call.operation === 'groupBy' && call.by.includes('concepto')).at(-1);
    assert.ok(!('take' in aggregate)); assert.ok(!('skip' in aggregate));
  }
});

test('indicadores de gestión respetan sede forzada del supervisor y sede consultada de los roles administrativos', async () => {
  for (const sedeId of [1, 2, 999]) {
    const own = await historyProbe(supervisor).get(`paginated=1&resumenGestion=1&sedeId=${sedeId}`);
    assert.deepEqual(own.body.gestion, { totalMovimientos: 369, totalManuales: 347, totalAutomaticos: 22 });
    assert.ok(own.body.movimientos.every(row => row.sedeId === 1));
  }
  for (const user of [administrator, auditor]) {
    const instance = historyProbe(user); const { body } = await instance.get('paginated=1&resumenGestion=1&sedeId=2');
    assert.deepEqual(body.gestion, { totalMovimientos: 2, totalManuales: 1, totalAutomaticos: 1 });
    assert.ok(body.movimientos.every(row => row.sedeId === 2));
    assert.ok(instance.calls.every(call => call.where.sedeId === 2));
  }
});

test('sin movimientos gestión devuelve cero; error de consulta nunca se muestra como cobertura vacía', async () => {
  const empty = await historyProbe(administrator, { rows: [] }).get('paginated=1&resumenGestion=1');
  assert.equal(empty.response.status, 200); assert.deepEqual(empty.body.gestion, { totalMovimientos: 0, totalManuales: 0, totalAutomaticos: 0 });
  assert.deepEqual(empty.body.movimientos, []); assert.equal(empty.body.totalPages, 1);
  const failure = await historyProbe(administrator, { fail: true }).get('paginated=1&resumenGestion=1');
  assert.equal(failure.response.status, 500); assert.ok(failure.body.error); assert.ok(!failure.body.gestion);
});

test('resumen de gestión es opcional y no altera los consumidores actuales ni sus consultas', async () => {
  for (const params of ['paginated=1', 'paginated=1&resumenGestion=0', 'paginated=1&resumenGestion=no']) {
    const instance = historyProbe(); const { response, body } = await instance.get(params);
    assert.equal(response.status, 200); assert.ok(!body.gestion);
    assert.ok(!instance.calls.some(call => call.operation === 'groupBy' && call.by.includes('concepto')));
  }
  for (const user of [null, { ...administrator, perfilTipo: 'VENDEDOR' }]) {
    const instance = historyProbe(user); const { response } = await instance.get('paginated=1&resumenGestion=1');
    assert.equal(response.status, user ? 403 : 401); assert.deepEqual(instance.calls, []);
  }
});

const jsx = require('react/jsx-runtime');
const nullComponent = { __esModule: true, default: () => null };
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const uiRow = { ...manualMovement, editable: true };
const uiData = {
  movimientos: Array.from({ length: 10 }, (_, index) => ({ ...uiRow, id: 100 - index, ...(index === 1 ? { concepto: 'ABONO FINANCIERA', editable: false } : {}) })),
  resumen: { totalIngresos: 4819431650.87, totalEgresos: 5783649374.75, saldo: -964217723.88, totalMovimientos: 371 },
  gestion: { totalMovimientos: 371, totalManuales: 348, totalAutomaticos: 23 },
  ultimoMovimiento: uiRow, total: 371, page: 1, pageSize: 10, totalPages: 38,
};
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
function control(tree, predicate) { const found = elements(tree).find(predicate); assert.ok(found, 'Control no encontrado'); return found; }
function workspaceProbe({ initial = {}, fetchImpl, confirmation = true } = {}) {
  const path = 'app/caja/gestion/page.tsx';
  const text = source(path); const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const states = declarations.flatMap(entry => ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === 'useState' ? [entry.name.elements[0].name.getText(ast)] : []);
  const locals = declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text);
  const finalReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(finalReturn);
  const state = { user: administrator, sedes: [{ id: 1, nombre: 'SEDE 1' }, { id: 2, nombre: 'SEDE 2' }], sedeId: '1', data: uiData, movimientos: uiData.movimientos, gestion: uiData.gestion, total: uiData.total, totalPages: uiData.totalPages, cargando: false, ...initial };
  const calls = []; const effects = []; const refs = []; const timers = []; const confirmations = []; let cursor = 0; let refCursor = 0; let captured;
  const react = {
    useState(value) { const name = states[cursor++]; assert.ok(name, 'Estado inesperado'); if (!(name in state)) state[name] = typeof value === 'function' ? value() : value; return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
    useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => effects.push(fn),
    useRef(value) { const index = refCursor++; return refs[index] ??= { current: value }; },
  };
  const imports = {
    react, 'react/jsx-runtime': jsx,
    'next/link': { __esModule: true, default: props => jsx.jsx('a', { ...props, children: props.children }) },
    'next/image': { __esModule: true, default: props => jsx.jsx('img', props) },
    '@/app/dashboard/_components/dashboard-icon': nullComponent,
    '@/app/ventas/_components/sales-dashboard-parts': { SalesProfile: props => jsx.jsx('div', { 'data-profile': true, children: `${props.name} ${props.role}` }) },
    '@/lib/proveedores-pagos': paymentAmounts,
    '@/lib/use-live-refresh': { useLiveRefresh() {} },
  };
  for (const node of ast.statements) if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.endsWith('.css')) imports[node.moduleSpecifier.text] = css;
  const workspace = load(path, imports, {
    __capture: value => { captured = value; },
    window: { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {}, scrollTo() {}, confirm(message) { confirmations.push(message); return confirmation; } },
    document: { getElementById() { return null; }, activeElement: null },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const result = fetchImpl ? await fetchImpl(url, options) : { ok: true, data: uiData };
      return result instanceof Response ? result : { ok: result.ok, json: async () => result.data };
    },
  }, input => input.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(',')}});\n` + input.slice(finalReturn.getStart(ast)));
  const instance = {
    state, calls, effects, refs, timers, confirmations,
    render() { cursor = 0; refCursor = 0; effects.length = 0; timers.length = 0; return { tree: resolve(workspace.default()) }; },
    get view() { return captured; },
  };
  instance.render(); return instance;
}

test('interfaz conserva navegación horizontal, sede activa, columnas y datos adicionales completos', () => {
  const { tree } = workspaceProbe().render();
  assert.ok(textOf(tree).includes('Gestión de caja')); assert.ok(textOf(tree).includes('Ingresos y egresos'));
  assert.deepEqual(elements(tree).filter(node => node.type === 'th').map(textOf), ['Fecha', 'Sede', 'Tipo', 'Concepto', 'Valor', 'Origen', 'Acciones']);
  const nav = control(tree, node => node.type === 'nav' && node.props['aria-label'] === 'Navegación principal');
  assert.deepEqual(elements(nav).filter(node => node.type === 'a').map(node => node.props.href), ['/dashboard', '/ventas', '/inventario', '/prestamos', '/caja', '/dashboard/aprobaciones', '/dashboard/reportes', '/dashboard/sedes']);
  assert.equal(control(nav, node => node.type === 'a' && node.props['aria-current'] === 'page').props.href, '/caja');
  assert.ok(elements(tree).some(node => node.props?.['data-profile'] && textOf(node).includes(administrator.nombre)));
  assert.ok(textOf(tree).includes(manualMovement.descripcion)); assert.ok(textOf(tree).includes('$ 1.234.567,89')); assert.ok(elements(tree).some(node => node.type === 'span' && textOf(node).replace(/\s/g, '') === '#100'));
});

test('vista previa cambia tipo, importe colombiano, sede, concepto y descripción sin registrar movimientos', () => {
  const instance = workspaceProbe(); let { tree } = instance.render();
  control(tree, node => node.type === 'button' && textOf(node).trim() === 'Egreso').props.onClick();
  control(tree, node => node.type === 'select').props.onChange({ target: { value: '2' } });
  control(tree, node => node.type === 'input' && node.props['aria-label'] === 'Valor').props.onPaste({ preventDefault() {}, clipboardData: { getData: () => '$ 1.234.567,89' } });
  control(tree, node => node.type === 'input' && node.props.placeholder === 'Escribe el concepto del movimiento…').props.onChange({ target: { value: '  Transporte QA  ' } });
  control(tree, node => node.type === 'textarea').props.onChange({ target: { value: '  Descripción larga QA  ' } });
  tree = instance.render().tree;
  const preview = control(tree, node => node.type === 'aside' && node.props['aria-label'] === 'Vista previa del movimiento');
  for (const value of ['EGRESO', '$ 1.234.567,89', 'SEDE 2', 'Transporte QA', 'Descripción larga QA']) assert.ok(textOf(preview).includes(value));
  assert.equal(instance.state.valor, '1234567.89'); assert.ok(textOf(tree).includes('Registrar egreso')); assert.deepEqual(instance.calls, []);
  control(tree, node => node.type === 'button' && textOf(node) === 'Limpiar').props.onClick();
  tree = instance.render().tree;
  assert.equal(instance.state.tipo, 'INGRESO'); assert.equal(instance.state.valor, ''); assert.equal(instance.state.concepto, ''); assert.equal(instance.state.descripcion, '');
  assert.equal(instance.state.sedeId, '2'); assert.ok(textOf(tree).includes('$ 0')); assert.deepEqual(instance.calls, []);
});

test('registro bloquea doble clic inmediato y solo confirma y limpia cuando el servidor guarda', async () => {
  for (const tipo of ['INGRESO', 'EGRESO']) {
    let resolveSave; const pending = new Promise(resolve => { resolveSave = resolve; });
    const fresh = { ...uiData, total: 372, gestion: { totalMovimientos: 372, totalManuales: 349, totalAutomaticos: 23 } };
    const instance = workspaceProbe({ initial: { tipo, concepto: 'Concepto QA', valor: '1234567.89', descripcion: 'Descripción QA' }, fetchImpl: async (_url, options) => options.method === 'POST' ? pending : { ok: true, data: fresh } });
    const save = instance.view.guardar; const first = save(); const second = save(); await second;
    assert.equal(instance.calls.filter(call => call.options.method === 'POST').length, 1);
    assert.equal(instance.state.guardando, true); assert.equal(instance.state.notice, null); assert.equal(instance.state.concepto, 'Concepto QA');
    assert.equal(control(instance.render().tree, node => node.type === 'fieldset').props.disabled, true);
    const post = instance.calls[0]; assert.equal(post.url, '/api/caja/registrar');
    assert.deepEqual(JSON.parse(post.options.body), { tipo, concepto: 'Concepto QA', valor: 1234567.89, descripcion: 'Descripción QA', sedeId: 1 });
    resolveSave({ ok: true, data: { ok: true, mensaje: 'Guardado confirmado QA' } }); await first;
    assert.deepEqual(instance.state.notice, { text: 'Guardado confirmado QA', error: false });
    assert.equal(instance.state.guardando, false); assert.equal(instance.state.valor, ''); assert.equal(instance.state.concepto, '');
    assert.equal(instance.state.total, 372); assert.deepEqual(instance.state.gestion, fresh.gestion);
    assert.equal(instance.calls.filter(call => !call.options.method).length, 1);
  }
});

test('guardar fallido conserva el formulario, muestra error y permite reintento sin confirmación falsa', async () => {
  for (const failure of ['server', 'network']) {
    const instance = workspaceProbe({ initial: { tipo: 'EGRESO', concepto: 'Concepto QA', valor: '1234567.89', descripcion: 'Detalle QA' }, fetchImpl: async () => { if (failure === 'network') throw Error('Sin red QA'); return { ok: false, data: { error: 'No se guardó QA' } }; } });
    await instance.view.guardar();
    assert.equal(instance.state.notice.error, true); assert.equal(instance.state.guardando, false);
    assert.equal(instance.state.tipo, 'EGRESO'); assert.equal(instance.state.concepto, 'Concepto QA'); assert.equal(instance.state.valor, '1234567.89'); assert.equal(instance.state.descripcion, 'Detalle QA');
    assert.ok(elements(instance.render().tree).some(node => node.props?.role === 'alert'));
    await instance.view.guardar(); assert.equal(instance.calls.length, 2);
    assert.ok(instance.calls.every(call => call.options.method === 'POST'));
  }
});

test('validaciones de formulario bloquean envío vacío, cero, negativo o no finito', async () => {
  for (const change of [{ concepto: ' ' }, { valor: '' }, { valor: '0' }, { valor: '-1' }, { valor: 'Infinity' }, { valor: 'NaN' }, { sedeId: '' }]) {
    const instance = workspaceProbe({ initial: { concepto: 'Concepto QA', valor: '1000.25', ...change } });
    await instance.view.guardar(); assert.deepEqual(instance.calls, []); assert.equal(instance.state.notice.error, true); assert.equal(instance.state.guardando, false);
  }
});

test('paginación consulta diez registros y conserva indicadores de toda la cobertura al cambiar página', async () => {
  const instance = workspaceProbe({ fetchImpl: async url => {
    const page = Number(new URL(url, 'http://qa.local').searchParams.get('page'));
    return { ok: true, data: { ...uiData, page, movimientos: page === 38 ? [uiRow] : uiData.movimientos } };
  } }); let { tree } = instance.render();
  const summary = control(tree, node => node.type === 'section' && node.props['aria-label'] === 'Resumen de gestión de caja');
  for (const count of ['371', '348', '23']) assert.ok(textOf(summary).includes(count));
  assert.ok(textOf(tree).includes('Mostrando 1–10 de 371 registros'));
  assert.equal(elements(tree).filter(node => node.type === 'tr').length, 11);
  control(tree, node => node.type === 'button' && textOf(node).trim() === 'Siguiente').props.onClick();
  assert.equal(instance.state.page, 2); instance.render(); await instance.view.cargarMovimientos();
  const params = new URL(instance.calls.at(-1).url, 'http://qa.local').searchParams;
  assert.equal(params.get('pageSize'), '10'); assert.equal(params.get('page'), '2'); assert.equal(params.get('paginated'), '1'); assert.equal(params.get('resumenGestion'), '1'); assert.equal(params.get('sedeId'), '1');
  assert.deepEqual(instance.state.gestion, uiData.gestion);
  assert.equal(instance.state.page, 2); tree = instance.render().tree;
  assert.ok(textOf(tree).includes('Mostrando 11–20 de 371 registros'));
  control(tree, node => node.type === 'button' && node.props['aria-label'] === 'Página 38').props.onClick(); assert.equal(instance.state.page, 38);
  instance.render(); await instance.view.cargarMovimientos(); assert.equal(new URL(instance.calls.at(-1).url, 'http://qa.local').searchParams.get('page'), '38');
  tree = instance.render().tree;
  assert.ok(textOf(tree).includes('Mostrando 371–371 de 371 registros'));
  assert.equal(elements(tree).filter(node => node.type === 'tr').length, 2);
  assert.equal(control(tree, node => node.type === 'button' && textOf(node).trim() === 'Siguiente').props.disabled, true);
  control(tree, node => node.type === 'select').props.onChange({ target: { value: '2' } });
  assert.equal(instance.state.page, 1); assert.equal(instance.state.sedeId, '2'); assert.equal(instance.state.gestion, null); assert.deepEqual(instance.state.movimientos, []);
});

test('edición y eliminación conservan permisos, centavos, protección y confirmación', async () => {
  for (const [user, edits, deletes] of [[administrator, 9, 9], [auditor, 9, 0], [supervisor, 0, 0]]) {
    const instance = workspaceProbe({ initial: { user } }); const { tree } = instance.render();
    assert.equal(elements(tree).filter(node => node.type === 'button' && textOf(node) === 'Editar').length, edits);
    assert.equal(elements(tree).filter(node => node.type === 'button' && textOf(node) === 'Eliminar').length, deletes);
    instance.view.iniciarEdicion({ ...uiRow, editable: false }); assert.equal(instance.state.editandoId, null);
    instance.view.iniciarEdicion(uiRow);
    assert.equal(instance.state.editandoId, edits ? uiRow.id : null);
    if (edits) assert.equal(instance.state.valor, '1234567.89');
    await instance.view.eliminar({ ...uiRow, editable: false }); assert.deepEqual(instance.calls, []); assert.deepEqual(instance.confirmations, []);
  }
  const cancelled = workspaceProbe({ confirmation: false }); await cancelled.view.eliminar(uiRow); assert.deepEqual(cancelled.calls, []); assert.equal(cancelled.confirmations.length, 1);
  const instance = workspaceProbe({ fetchImpl: async (_url, options) => options.method === 'PUT' ? { ok: true, data: { mensaje: 'Editado QA' } } : { ok: true, data: uiData } });
  instance.view.iniciarEdicion(uiRow); instance.render(); await instance.view.guardar();
  const update = instance.calls.find(call => call.options.method === 'PUT'); assert.equal(update.url, '/api/caja?id=1'); assert.equal(JSON.parse(update.options.body).valor, 1234567.89);
  assert.equal(instance.state.editandoId, null);
});

test('eliminar bloquea clics repetidos, conserva confirmación y actualiza el historial tras el servidor', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const instance = workspaceProbe({ fetchImpl: async (_url, options) => options.method === 'DELETE' ? pending : { ok: true, data: { ...uiData, total: 370, gestion: { ...uiData.gestion, totalMovimientos: 370, totalManuales: 347 } } } });
  const remove = instance.view.eliminar; const first = remove(uiRow); await remove(uiRow);
  assert.equal(instance.confirmations.length, 1); assert.equal(instance.calls.length, 1); assert.equal(instance.calls[0].url, '/api/caja?id=1'); assert.equal(instance.calls[0].options.method, 'DELETE');
  assert.equal(instance.state.eliminandoId, 1); assert.equal(instance.state.notice, null);
  finish({ ok: true, data: { mensaje: 'Eliminado confirmado QA' } }); await first;
  assert.equal(instance.state.eliminandoId, null); assert.equal(instance.state.notice.error, false); assert.equal(instance.state.total, 370);
  assert.equal(instance.calls.length, 2); assert.ok(!instance.calls[1].options.method);
});

test('historial distingue carga, error y vacío y no deja gestionar registros obsoletos', async () => {
  for (const [initial, expected] of [[{ cargando: true }, 'Cargando movimientos…'], [{ historyError: 'Historial falló QA' }, 'Historial falló QA'], [{ movimientos: [], gestion: { totalMovimientos: 0, totalManuales: 0, totalAutomaticos: 0 }, total: 0 }, 'No hay movimientos visibles']]) {
    const { tree } = workspaceProbe({ initial }).render(); assert.ok(textOf(tree).includes(expected));
    assert.equal(elements(tree).filter(node => node.type === 'button' && ['Editar', 'Eliminar'].includes(textOf(node))).length, 0);
  }
  for (const fetchImpl of [async () => ({ ok: false, data: { error: 'Sin permiso QA' } }), async () => { throw Error('Sin red QA'); }]) {
    const instance = workspaceProbe({ fetchImpl }); await instance.view.cargarMovimientos();
    assert.equal(instance.state.cargando, false); assert.ok(instance.state.historyError); assert.equal(instance.state.gestion, null); assert.deepEqual(instance.state.movimientos, []);
    assert.ok(elements(instance.render().tree).some(node => node.props?.role === 'alert'));
    assert.ok(!textOf(instance.render().tree).includes('No hay movimientos visibles'));
  }
});

test('respuesta anterior abortada no reemplaza historial o indicadores de la sede más reciente', async () => {
  let release; const prior = new Promise(resolve => { release = resolve; });
  const fresh = { ...uiData, movimientos: [{ ...uiRow, id: 900, sedeId: 2, sede: { nombre: 'SEDE 2' } }], total: 1, totalPages: 1, gestion: { totalMovimientos: 1, totalManuales: 1, totalAutomaticos: 0 } };
  const instance = workspaceProbe({ fetchImpl: async url => new URL(url, 'http://qa.local').searchParams.get('sedeId') === '1' ? prior : { ok: true, data: fresh } });
  const oldRequest = instance.view.cargarMovimientos(); instance.state.sedeId = '2'; instance.render(); await instance.view.cargarMovimientos();
  assert.deepEqual(instance.state.movimientos.map(row => row.id), [900]); assert.deepEqual(instance.state.gestion, fresh.gestion);
  release({ ok: true, data: uiData }); await oldRequest;
  assert.deepEqual(instance.state.movimientos.map(row => row.id), [900]); assert.deepEqual(instance.state.gestion, fresh.gestion); assert.equal(instance.state.cargando, false);
});
