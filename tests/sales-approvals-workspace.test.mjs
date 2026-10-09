import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const jsx = require('react/jsx-runtime');
const workspacePath = 'app/ventas/aprobaciones/workspace.tsx';
const apiPath = 'app/api/ventas/aprobaciones/route.ts';
const css = { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
const nullComponent = { __esModule: true, default: () => null };
const session = { nombre: 'Ana QA', sedeNombre: 'SEDE 1', rolNombre: 'ADMIN', perfilNombre: 'Perfil QA', perfilTipoLabel: 'Administrador' };
const apiSession = { id: 10, sedeId: 1, sedeNombre: 'SEDE 1', rolNombre: 'SUPERVISOR', perfilTipo: 'SUPERVISOR_TIENDA' };
const record = {
  id: 51, createdAt: '2026-10-07T15:45:00.000Z', sedeId: 1, sede: { nombre: 'SEDE 1' }, sedeNombre: 'SEDE 1', puntoVenta: 'Punto autorizado QA',
  clienteNombre: 'Cliente con nombre extenso QA', tipoDocumento: 'CC', documentoNumero: '001110444117',
  referenciaEquipo: 'SAMSUNG GALAXY A17 256GB', serialImei: '0035642010001001', tipoProducto: 'TELEFONIA',
  asesorNombre: 'Asesor completo QA', jaladorNombre: 'Jalador completo QA', observacion: 'Observación completa\nSegunda línea que debe permanecer visible',
  numeroFactura: 'FACT-QA-102', estadoFacturacion: 'PENDIENTE', estadoVentaRegistro: 'PENDIENTE', ventaIdRelacionada: null, eliminadoEn: null,
  plataformaCredito: 'PAYJOY', creditoAutorizado: '1234567.89', cuotaInicial: '123456.75',
  medioPago1Tipo: 'EFECTIVO', medioPago1Valor: '150000.5', medioPago2Tipo: 'TRANSFERENCIA', medioPago2Valor: '50000.25',
  financierasDetalle: [
    { plataformaCredito: 'PAYJOY', creditoAutorizado: '1234567.89', cuotaInicial: '123456.75', tipoPagoInicial: 'EFECTIVO', valorCuota: '22222.5', numeroCuotas: 13, frecuenciaCuota: 'MENSUAL' },
    { plataformaCredito: 'SUMASPAY', creditoAutorizado: '550000', cuotaInicial: '0', tipoPagoInicial: 'TRANSFERENCIA', valorCuota: '55000', numeroCuotas: 10, frecuenciaCuota: 'QUINCENAL' },
  ],
};

function load(path, imports = {}, injected = {}, transform = value => value) {
  const output = ts.transpileModule(transform(readFileSync(join(ROOT, path), 'utf8')), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'console', ...Object.keys(injected), output)(name => {
    if (name === 'react/jsx-runtime') return jsx;
    if (name.endsWith('.module.css')) return css;
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, module, module.exports, { error() {}, warn() {} }, ...Object.values(injected));
  return module.exports;
}

const access = load('lib/access-control.ts');
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(part => matches(row, part));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const actual = value.mode === 'insensitive' ? String(row[key] ?? '').toLowerCase() : row[key];
      const expected = input => value.mode === 'insensitive' ? String(input).toLowerCase() : input;
      if ('contains' in value) return String(actual ?? '').includes(expected(value.contains));
      if ('equals' in value) return actual === expected(value.equals);
      if ('in' in value) return value.in.some(item => actual === expected(item));
      if ('notIn' in value) return !value.notIn.some(item => actual === expected(item));
      if ('not' in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
}
function project(row, select) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]) => [key,
    value === true || row[key] == null ? row[key] : project(row[key], value.select),
  ]));
}
const dataset = [
  ...Array.from({ length: 127 }, (_, index) => ({
    ...record, id: index + 1, clienteNombre: `Cliente QA ${String(index + 1).padStart(3, '0')}`,
    referenciaEquipo: index === 126 ? 'INFINIX REFERENCIA EXCLUSIVA FUERA DE TOP 100' : record.referenciaEquipo,
    createdAt: new Date(Date.UTC(2026, 9, 9, 15, 0, -index)),
  })),
  { ...record, id: 201, sedeId: 2, sede: { nombre: 'SEDE 2' }, puntoVenta: 'SEDE 2', clienteNombre: 'Cliente fuera de alcance' },
  { ...record, id: 202, sedeId: null, sede: null, puntoVenta: '  SEDE 1  ', clienteNombre: 'Punto con espacios no equivalente' },
  { ...record, id: 203, sedeId: null, sede: null, puntoVenta: 'sede 1', clienteNombre: 'Legacy autorizado por punto' },
  { ...record, id: 204, sedeId: 1, puntoVenta: null, clienteNombre: 'Sede autorizada sin punto' },
  { ...record, id: 205, eliminadoEn: new Date(), clienteNombre: 'Borrado no visible' },
  { ...record, id: 206, ventaIdRelacionada: 999, clienteNombre: 'Vinculado no visible' },
  { ...record, id: 207, estadoVentaRegistro: ' cancelado ', clienteNombre: 'Cancelado no visible' },
  { ...record, id: 208, estadoVentaRegistro: ' convertido_en_venta ', clienteNombre: 'Convertido no visible' },
  { ...record, id: 209, estadoVentaRegistro: null, clienteNombre: 'Abierto legacy null' },
  { ...record, id: 210, estadoVentaRegistro: ' OTRO_ESTADO_ABIERTO ', clienteNombre: 'Abierto legacy custom' },
  { ...record, id: 211, sedeId: null, sede: null, puntoVenta: null, clienteNombre: 'Sin sede administrativa' },
];
function expectedOpen(user) {
  const global = access.esPerfilAdministrativo(user.perfilTipo) || access.esRolAdministrativo(user.rolNombre);
  return dataset.filter(row => row.eliminadoEn === null && row.ventaIdRelacionada === null)
    .filter(row => !['CONVERTIDO_EN_VENTA', 'CANCELADO'].includes(String(row.estadoVentaRegistro || '').trim().toUpperCase()))
    .filter(row => global || row.sedeId === user.sedeId || String(row.puntoVenta || '').toLowerCase() === user.sedeNombre.toLowerCase());
}
function apiProbe(user = apiSession, { fail = false, rows = dataset } = {}) {
  const calls = []; let schemaCalls = 0;
  const query = async args => {
    calls.push(args);
    if (fail) throw Error('Fallo de datos QA');
    let found = rows.filter(row => matches(row, args.where));
    if (args.orderBy?.createdAt) found = [...found].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    found = found.slice(args.skip ?? 0, args.take ? (args.skip ?? 0) + args.take : undefined);
    return found.map(row => project(row, args.select));
  };
  const route = load(apiPath, {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status ?? 200 }) } },
    '@/lib/auth': { getSessionUser: async () => user }, '@/lib/access-control': access,
    '@/lib/prisma': { __esModule: true, default: { registroVendedorVenta: { findMany: query, findFirst: async args => (await query(args))[0] || null } } },
    '@/lib/vendor-profile-schema': { ensureVendorProfilesSchema: async () => { schemaCalls++; } },
  });
  return { ...route, calls, get schemaCalls() { return schemaCalls; } };
}
async function get(probe, params = '') {
  const response = await probe.GET(new Request(`http://qa.local/api/ventas/aprobaciones${params ? `?${params}` : ''}`));
  return { response, body: await response.json() };
}

test('GET rechaza falta de sesión, vendedor, apoyo y facturador antes de consultar datos', async () => {
  for (const user of [null, ...['VENDEDOR', 'APOYO_OPERATIVO', 'FACTURADOR'].map(perfilTipo => ({ ...apiSession, perfilTipo }))]) {
    for (const params of ['paginated=1', 'id=51', 'q=Cliente']) {
      const probe = apiProbe(user); const { response } = await get(probe, params);
      assert.equal(response.status, user ? 403 : 401); assert.equal(probe.calls.length, 0); assert.equal(probe.schemaCalls, 0);
    }
  }
});
test('la paginación cuenta todos los abiertos autorizados, sin límite previo de cien', async () => {
  const probe = apiProbe(); const { response, body } = await get(probe, 'paginated=1');
  assert.equal(response.status, 200); assert.equal(body.totalPendientes, expectedOpen(apiSession).length);
  assert.equal(body.total, expectedOpen(apiSession).length); assert.equal(body.pageSize, 10); assert.equal(body.page, 1);
  assert.equal(body.totalPages, Math.ceil(body.total / 10)); assert.equal(body.registros.length, 10);
  assert.ok(body.total > 100); assert.ok(!body.sedes.some(sede => sede.value === 'id:2'));
  assert.ok(body.sedes.some(sede => sede.value === 'id:1')); assert.ok(body.sedes.some(sede => sede.value === 'point:sede 1'));
});
test('ADMIN, AUDITOR y perfil administrativo conservan el alcance global real', async () => {
  for (const user of [
    { ...apiSession, rolNombre: 'ADMIN', perfilTipo: 'ADMINISTRADOR' },
    { ...apiSession, rolNombre: 'AUDITOR', perfilTipo: 'AUDITOR' },
    { ...apiSession, rolNombre: 'SUPERVISOR', perfilTipo: 'ADMINISTRADOR' },
  ]) {
    const { response, body } = await get(apiProbe(user), 'paginated=1');
    assert.equal(response.status, 200); assert.equal(body.total, expectedOpen(user).length);
    assert.ok(body.sedes.some(sede => sede.value === 'id:2')); assert.ok(body.sedes.some(sede => sede.value === 'none'));
  }
});
test('búsqueda servidor encuentra cliente, documento textual, IMEI y referencia fuera de las primeras cien filas', async () => {
  for (const [q, expected] of [[' cliente qa 127 ', [127]], ['001110444117', null], ['0035642010001001', null], ['referencia exclusiva', [127]]]) {
    const { response, body } = await get(apiProbe(), `paginated=1&q=${encodeURIComponent(q)}`);
    assert.equal(response.status, 200); assert.equal(body.totalPendientes, expectedOpen(apiSession).length);
    if (expected) { assert.deepEqual(body.registros.map(row => row.id), expected); assert.equal(body.total, expected.length); }
    else { assert.ok(body.total > 100); assert.equal(body.registros[0].documentoNumero, record.documentoNumero); assert.equal(body.registros[0].serialImei, record.serialImei); }
  }
});
test('buscar cédula o IMEI con puntos y espacios encuentra el identificador completo sin perder ceros', async () => {
  const row = { ...record, documentoNumero: '00 111.044.4117', serialImei: '00 356.420 1000.1001' };
  const outside = { ...row, id: 999, sedeId: 2, puntoVenta: 'SEDE 2', sede: { nombre: 'SEDE 2' } };
  for (const q of ['001110444117', ' 00 111.044.4117 ', '0035642010001001', ' 00.356 420.1000 1001 ']) {
    const { response, body } = await get(apiProbe(apiSession, { rows: [row, outside] }), `paginated=1&q=${encodeURIComponent(q)}`);
    assert.equal(response.status, 200); assert.equal(body.total, 1); assert.equal(body.totalPendientes, 1);
    assert.deepEqual(body.registros.map(result => result.id), [51]);
    assert.equal(body.registros[0].documentoNumero, row.documentoNumero); assert.equal(body.registros[0].serialImei, row.serialImei);
    assert.ok(!body.sedes.some(sede => sede.value === 'id:2'));
  }
  assert.equal((await get(apiProbe(apiSession, { rows: [row] }), 'paginated=1&q=CC001110444117')).body.total, 0);
});
test('sede y búsqueda se combinan sin modificar el alcance ni las opciones autorizadas', async () => {
  const all = (await get(apiProbe(), 'paginated=1')).body;
  const selected = (await get(apiProbe(), 'paginated=1&sede=id%3A1&q=referencia%20exclusiva')).body;
  assert.equal(selected.total, 1); assert.deepEqual(selected.registros.map(row => row.id), [127]);
  assert.equal(selected.totalPendientes, expectedOpen(apiSession).filter(row => row.sedeId === 1).length);
  assert.deepEqual(selected.sedes, all.sedes); assert.equal(selected.cobertura, 'SEDE 1');
  for (const sede of ['id:2', 'point:SEDE 2', 'id:999999', 'none']) {
    const { response, body } = await get(apiProbe(), `paginated=1&sede=${encodeURIComponent(sede)}`);
    assert.equal(response.status, 200); assert.equal(body.total, 0); assert.equal(body.totalPendientes, 0); assert.deepEqual(body.registros, []);
  }
});
test('páginas sucesivas no repiten filas; la última página, tamaños e índices inválidos son coherentes', async () => {
  const seen = new Set(); const initial = (await get(apiProbe(), 'paginated=1&pageSize=20')).body;
  for (let page = 1; page <= initial.totalPages; page++) {
    const body = (await get(apiProbe(), `paginated=1&pageSize=20&page=${page}`)).body;
    assert.equal(body.page, page); assert.equal(body.pageSize, 20); assert.equal(body.total, initial.total);
    assert.equal(body.registros.length, Math.min(20, body.total - (page - 1) * 20));
    for (const row of body.registros) { assert.ok(!seen.has(row.id), `Duplicado en páginas: ${row.id}`); seen.add(row.id); }
  }
  assert.equal(seen.size, initial.total);
  for (const page of ['-1', '0', 'abc', '1.5']) assert.equal((await get(apiProbe(), `paginated=1&page=${page}`)).body.page, 1);
  const beyond = (await get(apiProbe(), 'paginated=1&page=999999&pageSize=20')).body;
  assert.equal(beyond.page, beyond.totalPages);
  for (const size of ['0', '7', '9999', 'abc']) assert.equal((await get(apiProbe(), `paginated=1&pageSize=${size}`)).body.pageSize, 10);
  for (const size of [10, 20, 50]) assert.equal((await get(apiProbe(), `paginated=1&pageSize=${size}`)).body.pageSize, size);
});
test('sin coincidencias conserva total pendiente por sede y devuelve paginación vacía válida', async () => {
  const body = (await get(apiProbe(), 'paginated=1&q=NoExisteQA')).body;
  assert.equal(body.total, 0); assert.equal(body.totalPendientes, expectedOpen(apiSession).length);
  assert.deepEqual(body.registros, []); assert.equal(body.page, 1); assert.ok(body.totalPages === 0 || body.totalPages === 1);
});
test('consulta de Completar venta por ID conserva permisos, estados y detalle financiero íntegro', async () => {
  const probe = apiProbe(); const { response, body } = await get(probe, 'id=51');
  assert.equal(response.status, 200); assert.equal(body.registro.id, 51); assert.equal(body.registro.serialImei, record.serialImei);
  assert.equal(body.registro.documentoNumero, record.documentoNumero); assert.deepEqual(body.registro.financierasDetalle, record.financierasDetalle);
  for (const key of ['medioPago1Tipo', 'medioPago1Valor', 'medioPago2Tipo', 'medioPago2Valor', 'numeroFactura', 'estadoFacturacion']) assert.equal(body.registro[key], record[key], key);
  for (const id of [201, 205, 206, 207, 208, 99999]) assert.equal((await get(apiProbe(), `id=${id}`)).response.status, 404, `ID protegido ${id}`);
});
test('serialización conserva financiera legacy e inicial cero, y mantiene el tratamiento de contado', async () => {
  for (const plataformaCredito of ['FINANCIERA LEGACY QA', 'CONTADO', 'CONTADO CLARO', 'CONTADO LIBRES']) {
    const row = { ...record, financierasDetalle: null, plataformaCredito, creditoAutorizado: '1715000', cuotaInicial: '0' };
    const body = (await get(apiProbe(apiSession, { rows: [row] }), 'paginated=1')).body;
    assert.equal(body.registros.length, 1);
    const result = body.registros[0];
    assert.equal(result.medioPago1Valor, record.medioPago1Valor); assert.equal(result.medioPago2Valor, record.medioPago2Valor);
    if (plataformaCredito.startsWith('CONTADO')) assert.deepEqual(result.financierasDetalle, []);
    else {
      assert.equal(result.financierasDetalle.length, 1); assert.equal(result.financierasDetalle[0].plataformaCredito, plataformaCredito);
      assert.equal(result.financierasDetalle[0].creditoAutorizado, '1715000'); assert.equal(result.financierasDetalle[0].cuotaInicial, '0');
      assert.equal(result.financierasDetalle[0].tipoPagoInicial, 'EFECTIVO');
    }
  }
});
test('la rama legacy conserva respuesta y límite originales; un fallo de datos presenta error sin éxito falso', async () => {
  const legacy = apiProbe(); const { response, body } = await get(legacy);
  assert.equal(response.status, 200); assert.equal(body.ok, true); assert.ok(Array.isArray(body.registros)); assert.equal(legacy.calls[0].take, 100);
  assert.ok(!('total' in body));
  const failed = await get(apiProbe(apiSession, { fail: true }), 'paginated=1');
  assert.equal(failed.response.status, 500); assert.ok(failed.body.error); assert.ok(!failed.body.ok);
});

function workspaceProbe({ initial = {}, user = session, response, fetchImpl } = {}) {
  const sourceText = readFileSync(join(ROOT, workspacePath), 'utf8');
  const ast = ts.createSourceFile(workspacePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(component?.body);
  const stateNames = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap(entry =>
    ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === 'useState'
      ? [entry.name.elements[0].name.getText(ast)] : []) : []);
  const captureNames = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text) : []);
  const lastReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(lastReturn);
  const summary = { total: 27, totalPendientes: 31, totalPages: 3, page: 1, pageSize: 10, cobertura: 'Cobertura real QA', sedes: [{ value: 'id:1', label: 'SEDE 1' }, { value: 'id:2', label: 'SEDE 2' }] };
  const state = { registros: [record], cargando: false, resumen: summary, ...initial };
  const calls = []; const effects = []; let cursor = 0; let captured;
  const hooks = {
    useState(value) { const name = stateNames[cursor++]; assert.ok(name, 'Estado inesperado'); if (!(name in state)) state[name] = typeof value === 'function' ? value() : value; return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => { effects.push(fn); }, useRef: value => ({ current: value }),
  };
  const imports = { react: hooks, 'next/link': { __esModule: true, default: ({ children, ...props }) => jsx.jsx('a', { ...props, children }) }, 'next/image': nullComponent,
    '@/lib/monthly-reports-view': load('lib/monthly-reports-view.ts'),
  };
  for (const statement of ast.statements.filter(ts.isImportDeclaration)) {
    const name = statement.moduleSpecifier.text;
    if (name in imports || name.endsWith('.module.css')) continue;
    const mock = { ...nullComponent }; const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) mock[entry.propertyName?.text ?? entry.name.text] = () => null;
    imports[name] = mock;
  }
  const Workspace = load(workspacePath, imports, {
    __capture: value => { captured = value; },
    fetch: async (url, options) => { calls.push({ url, options }); const result = fetchImpl ? await fetchImpl(url, options) : response || { ok: true, data: { ok: true, registros: [record], ...summary } }; return { ok: result.ok, json: async () => result.data }; },
  }, text => `${text.slice(0, lastReturn.getStart(ast))}__capture({${captureNames.join(',')}});\n${text.slice(lastReturn.getStart(ast))}`).default;
  const render = () => { cursor = 0; const tree = Workspace({ session: user }); return { tree, view: captured }; };
  render();
  return { state, calls, effects, render, get view() { return captured; }, async update() { render(); effects.at(-1)?.(); for (let i = 0; i < 12; i++) await Promise.resolve(); return render().tree; } };
}
function elements(node) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== 'object') return [node];
  if (typeof node.type === 'function') return [node, ...elements(node.type(node.props))];
  return [node, ...elements(node.props?.children)];
}
function textOf(tree) { return elements(tree).filter(node => typeof node === 'string' || typeof node === 'number').join(''); }
function control(tree, predicate) { const found = elements(tree).find(node => typeof node === 'object' && predicate(node)); assert.ok(found, 'Control esperado no disponible'); return found; }
function completeLinks(tree) { return elements(tree).filter(node => node?.type === 'a' && textOf(node).includes('Completar venta')); }

test('tabla conserva datos completos, dos financieras, ingresos e información de facturación', () => {
  const tree = workspaceProbe().render().tree; const text = textOf(tree);
  for (const key of ['clienteNombre', 'documentoNumero', 'serialImei', 'referenciaEquipo', 'asesorNombre', 'jaladorNombre', 'observacion', 'numeroFactura']) assert.ok(text.includes(record[key]), key);
  for (const value of ['PAYJOY', 'SUMASPAY', '1.234.567,89', '550.000', '150.000,50', '50.000,25', '123.456,75', 'EFECTIVO', 'TRANSFERENCIA']) assert.ok(text.toUpperCase().includes(value), value);
  assert.equal(completeLinks(tree)[0].props.href, '/ventas/nuevo?registroId=51');
});
test('identificadores conservan ceros iniciales y la cédula elimina puntos sin convertir a número', () => {
  const text = textOf(workspaceProbe({ initial: { registros: [{ ...record, documentoNumero: '00 111.044.4117' }] } }).render().tree);
  assert.ok(text.includes('001110444117')); assert.ok(!text.includes('00 111.044.4117')); assert.ok(text.includes(record.serialImei));
});
test('Gestionar registros y Configuración permanecen reservados a ADMIN/AUDITOR con rutas originales', () => {
  for (const rolNombre of [' ADMIN ', 'auditor', 'SUPERVISOR']) {
    const probe = workspaceProbe({ user: { ...session, rolNombre } }); const tree = probe.render().tree;
    const routes = elements(tree).filter(node => node?.type === 'a').map(node => node.props.href);
    routes.push(...(probe.view.navigationItems || []).map(item => item.href));
    const admin = rolNombre.trim().toUpperCase() !== 'SUPERVISOR';
    assert.equal(routes.includes('/dashboard/registros'), admin); assert.equal(routes.includes('/dashboard/sedes'), admin);
    for (const path of ['/ventas/nuevo', '/ventas', '/dashboard/aprobaciones', admin ? '/dashboard/reportes' : '/dashboard/analitico']) assert.ok(routes.includes(path), path);
    assert.equal(completeLinks(tree)[0].props.href, '/ventas/nuevo?registroId=51');
  }
});
test('cada fila pasa su referencia y tipo reales al SVG de equipo, sin asignar fotografías de otro modelo', () => {
  const records = [
    { ...record, id: 51, referenciaEquipo: '  iPhOnE 14 128GB' },
    { ...record, id: 52, referenciaEquipo: 'INFINIX NOTE 60 PRO 256GB' },
    { ...record, id: 53, referenciaEquipo: 'ACCESORIO SIN SISTEMA', tipoProducto: 'ACCESORIOS' },
  ];
  const tree = workspaceProbe({ initial: { registros: records } }).render().tree;
  const visuals = elements(tree).filter(node => typeof node?.type === 'function' && 'reference' in (node.props || {}) && 'productType' in node.props);
  assert.equal(visuals.length, records.length);
  for (let index = 0; index < records.length; index++) {
    assert.equal(visuals[index].props.reference, records[index].referenciaEquipo);
    assert.equal(visuals[index].props.productType, records[index].tipoProducto);
    assert.ok(!visuals[index].props.imageSrc);
  }
  assert.equal(completeLinks(tree).length, records.length);
});
test('contado conserva ambos ingresos, sus medios e importe total sin abreviaciones', () => {
  for (const plataformaCredito of ['CONTADO', 'CONTADO CLARO', 'CONTADO LIBRES']) {
    const tree = workspaceProbe({ initial: { registros: [{ ...record, plataformaCredito, financierasDetalle: [] }] } }).render().tree;
    const text = textOf(tree).toUpperCase();
    for (const value of ['CONTADO', '200.000,75', '150.000,50', '50.000,25', 'EFECTIVO', 'TRANSFERENCIA']) assert.ok(text.includes(value), value);
    assert.equal(completeLinks(tree)[0].props.href, '/ventas/nuevo?registroId=51');
  }
});
test('una única inicial idéntica al único ingreso aparece una vez, conservando importe y medio', () => {
  for (const value of ['500000', '0']) {
    const row = { ...record, financierasDetalle: [{ plataformaCredito: 'PAYJOY', creditoAutorizado: '1715000', cuotaInicial: value, tipoPagoInicial: ' efectivo ' }],
      medioPago1Tipo: 'EFECTIVO', medioPago1Valor: value, medioPago2Tipo: null, medioPago2Valor: null };
    const tree = workspaceProbe({ initial: { registros: [row] } }).render().tree;
    const cell = control(tree, node => node.type === 'td' && node.props['data-label'] === 'Financiera / Inicial');
    const text = textOf(cell);
    assert.equal(text.split(value === '0' ? '$ 0' : '$ 500.000').length - 1, 1);
    assert.equal(text.split('Inicial:').length - 1, 1); assert.ok(text.includes('EFECTIVO')); assert.ok(!text.includes('Ingreso 1:'));
    assert.ok(text.includes('$ 1.715.000'));
  }
});
test('inicial e ingreso diferentes conservan ambos valores y medios, sin fusionarlos', () => {
  for (const [initialValue, initialMethod] of [['499999', 'EFECTIVO'], ['500000', 'TRANSFERENCIA']]) {
    const row = { ...record, financierasDetalle: [{ plataformaCredito: 'PAYJOY', creditoAutorizado: '1715000', cuotaInicial: initialValue, tipoPagoInicial: initialMethod }],
      medioPago1Tipo: 'EFECTIVO', medioPago1Valor: '500000', medioPago2Tipo: null, medioPago2Valor: null };
    const tree = workspaceProbe({ initial: { registros: [row] } }).render().tree;
    const text = textOf(control(tree, node => node.type === 'td' && node.props['data-label'] === 'Financiera / Inicial'));
    assert.ok(text.includes('Inicial:')); assert.ok(text.includes('Ingreso 1:')); assert.ok(text.includes('$ 500.000')); assert.ok(text.includes(initialMethod));
    if (initialValue !== '500000') assert.ok(text.includes('$ 499.999'));
    else assert.equal(text.split('$ 500.000').length - 1, 2);
  }
});
test('fecha de registro muestra año completo y corresponde a Bogotá independientemente de la zona del dispositivo', () => {
  const previousTimeZone = process.env.TZ;
  try {
    for (const timeZone of ['UTC', 'America/Bogota', 'Asia/Tokyo', 'Pacific/Honolulu']) {
      process.env.TZ = timeZone;
      const tree = workspaceProbe({ initial: { registros: [{ ...record, createdAt: '2026-10-09T01:30:00.000Z' }] } }).render().tree;
      const date = control(tree, node => node.type === 'time');
      assert.equal(date.props.dateTime, '2026-10-09T01:30:00.000Z');
      assert.match(textOf(date), /8\/10\/2026/); assert.match(textOf(date), /8:30/);
    }
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});
test('el resumen usa el total pendiente y la cobertura recibidos, y no la cantidad de filas visibles', () => {
  const tree = workspaceProbe().render().tree; const text = textOf(tree);
  assert.ok(text.includes('31')); assert.ok(text.includes('Cobertura real QA')); assert.ok(text.includes('27'));
  assert.equal(completeLinks(tree).length, 1);
});
test('la consulta usa búsqueda aplicada, sede y página en el servidor con no-store', async () => {
  const probe = workspaceProbe({ initial: { busqueda: 'borrador no aplicado', busquedaAplicada: 'referencia QA', sedeSeleccionada: 'id:2', page: 2, pageSize: 20 } });
  await probe.update(); assert.equal(probe.calls.length, 1);
  const url = new URL(probe.calls[0].url, 'http://qa.local');
  assert.equal(url.pathname, '/api/ventas/aprobaciones'); assert.equal(url.searchParams.get('paginated'), '1');
  assert.equal(url.searchParams.get('q'), 'referencia QA'); assert.equal(url.searchParams.get('sede'), 'id:2');
  assert.equal(url.searchParams.get('page'), '2'); assert.equal(url.searchParams.get('pageSize'), '20'); assert.equal(probe.calls[0].options.cache, 'no-store');
});
test('aplicar búsqueda reinicia página y mantiene la sede sin filtrar solo la página visible', async () => {
  const probe = workspaceProbe({ initial: { busqueda: '  referencia fuera de página  ', busquedaAplicada: 'anterior', sedeSeleccionada: 'id:2', page: 3 } });
  const tree = probe.render().tree;
  const form = elements(tree).find(node => node?.type === 'form');
  if (form?.props.onSubmit) form.props.onSubmit({ preventDefault() {} });
  else control(tree, node => node.type === 'button' && textOf(node) === 'Buscar').props.onClick();
  assert.equal(probe.state.page, 1); assert.equal(probe.state.sedeSeleccionada, 'id:2'); assert.equal(probe.state.busquedaAplicada.trim(), 'referencia fuera de página');
  await probe.update(); assert.equal(new URL(probe.calls[0].url, 'http://qa.local').searchParams.get('q'), 'referencia fuera de página');
});
test('cambiar sede o filas por página reinicia página manteniendo la búsqueda aplicada', () => {
  for (const target of ['sede', 'pageSize']) {
    const probe = workspaceProbe({ initial: { busquedaAplicada: 'cliente QA', sedeSeleccionada: 'id:1', page: 3, pageSize: 10 } });
    const tree = probe.render().tree;
    const select = control(tree, node => node.type === 'select' && (target === 'sede' ? elements(node).some(option => option?.props?.value === 'id:2') : elements(node).some(option => String(option?.props?.value) === '20')));
    select.props.onChange({ target: { value: target === 'sede' ? 'id:2' : '20' } });
    assert.equal(probe.state.page, 1); assert.equal(probe.state.busquedaAplicada, 'cliente QA');
    assert.equal(target === 'sede' ? probe.state.sedeSeleccionada : probe.state.pageSize, target === 'sede' ? 'id:2' : 20);
  }
});
test('los botones de paginación y el contador conservan consulta, filas reales y límites', () => {
  const summary = { total: 27, totalPendientes: 31, totalPages: 3, pageSize: 10, cobertura: 'SEDE 2', sedes: [{ value: 'id:2', label: 'SEDE 2' }] };
  const rows = count => Array.from({ length: count }, (_, index) => ({ ...record, id: index + 1 }));
  for (const page of [1, 2, 3]) {
    const probe = workspaceProbe({ initial: { registros: rows(page === 3 ? 7 : 10), page, busquedaAplicada: 'Cliente QA', sedeSeleccionada: 'id:2', resumen: { ...summary, page } } });
    const tree = probe.render().tree;
    const previous = control(tree, node => node.type === 'button' && node.props['aria-label'] === 'Página anterior');
    const next = control(tree, node => node.type === 'button' && node.props['aria-label'] === 'Página siguiente');
    assert.equal(previous.props.disabled, page === 1); assert.equal(next.props.disabled, page === 3);
    assert.equal(control(tree, node => node.type === 'button' && node.props['aria-label'] === `Página ${page}`).props['aria-current'], 'page');
    const start = (page - 1) * 10 + 1; const end = page === 3 ? 27 : page * 10;
    assert.ok(textOf(tree).includes(`Mostrando ${start}–${end} de 27 registros`));
    if (page < 3) next.props.onClick(); else previous.props.onClick();
    assert.equal(probe.state.page, page < 3 ? page + 1 : page - 1);
    assert.equal(probe.state.busquedaAplicada, 'Cliente QA'); assert.equal(probe.state.sedeSeleccionada, 'id:2');
  }
});
test('limpiar filtros recupera la cobertura inicial y reintentar conserva la consulta que falló', () => {
  const probe = workspaceProbe({ initial: { busqueda: 'borrador', busquedaAplicada: 'Cliente QA', sedeSeleccionada: 'id:2', page: 3 } });
  control(probe.render().tree, node => node.type === 'button' && textOf(node) === 'Limpiar filtros').props.onClick();
  assert.equal(probe.state.busqueda, ''); assert.equal(probe.state.busquedaAplicada, ''); assert.equal(probe.state.sedeSeleccionada, ''); assert.equal(probe.state.page, 1);
  const failure = workspaceProbe({ initial: { mensaje: 'Error QA', registros: [], resumen: null, busquedaAplicada: 'Cliente QA', sedeSeleccionada: 'id:2', page: 2 } });
  control(failure.render().tree, node => node.type === 'button' && textOf(node) === 'Reintentar').props.onClick();
  assert.equal(failure.state.revision, 1); assert.equal(failure.state.busquedaAplicada, 'Cliente QA'); assert.equal(failure.state.sedeSeleccionada, 'id:2'); assert.equal(failure.state.page, 2);
});
test('una respuesta anterior abortada no reemplaza registros, cobertura ni página de la consulta nueva', async () => {
  let release;
  const oldResponse = new Promise(resolve => { release = resolve; });
  const freshRecord = { ...record, id: 999, clienteNombre: 'Respuesta nueva QA' };
  const freshSummary = { ok: true, registros: [freshRecord], total: 1, totalPendientes: 1, totalPages: 1, page: 1, pageSize: 10, cobertura: 'SEDE 2', sedes: [{ value: 'id:2', label: 'SEDE 2' }] };
  const probe = workspaceProbe({ initial: { busquedaAplicada: 'anterior', sedeSeleccionada: 'id:1', page: 3 }, fetchImpl: async url => {
    if (new URL(url, 'http://qa.local').searchParams.get('q') === 'anterior') return oldResponse;
    return { ok: true, data: freshSummary };
  } });
  const controller = new AbortController(); const oldRequest = probe.view.cargarRegistros(controller.signal);
  assert.equal(probe.state.cargando, true); controller.abort();
  Object.assign(probe.state, { busquedaAplicada: 'nueva', sedeSeleccionada: 'id:2', page: 1 }); probe.render();
  await probe.view.cargarRegistros(new AbortController().signal);
  assert.deepEqual(probe.state.registros.map(row => row.id), [999]); assert.equal(probe.state.resumen.cobertura, 'SEDE 2');
  release({ ok: true, data: { ...freshSummary, registros: [record], cobertura: 'SEDE 1', page: 3 } }); await oldRequest;
  assert.deepEqual(probe.state.registros.map(row => row.id), [999]); assert.equal(probe.state.resumen.cobertura, 'SEDE 2'); assert.equal(probe.state.page, 1); assert.equal(probe.state.cargando, false);
});
test('cargando, respuesta vacía y errores no dejan acciones obsoletas activas', async () => {
  const loading = workspaceProbe({ initial: { cargando: true } }).render().tree;
  assert.equal(completeLinks(loading).length, 0); assert.match(textOf(loading), /Cargando|Buscando|Actualizando/);
  const empty = workspaceProbe({ initial: { registros: [], resumen: { total: 0, totalPendientes: 31, totalPages: 1, page: 1, cobertura: 'SEDE 1', sedes: [] } } }).render().tree;
  assert.equal(completeLinks(empty).length, 0); assert.match(textOf(empty), /No hay|Sin resultados/);
  for (const options of [
    { response: { ok: false, data: { error: 'Permiso denegado QA' } } },
    { fetchImpl: async () => { throw Error('Sin red QA'); } },
  ]) {
    const probe = workspaceProbe(options); const tree = await probe.update();
    assert.equal(completeLinks(tree).length, 0); assert.equal(probe.state.cargando, false);
    assert.ok(elements(tree).some(node => node?.props?.role === 'alert')); assert.ok(probe.state.mensaje);
  }
});
