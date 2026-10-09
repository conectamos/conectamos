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
const XLSX = require('xlsx');
const source = file => readFileSync(join(ROOT, file), 'utf8');
function load(file, imports = {}, injected = {}, transform = value => value) {
  const output = ts.transpileModule(transform(source(file)), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', 'console', ...Object.keys(injected), output)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`); return imports[name];
  }, loadedModule, loadedModule.exports, { error() {}, warn() {} }, ...Object.values(injected));
  return loadedModule.exports;
}
const sedesModule = load('lib/sedes.ts');
const products = load('lib/product-types.ts');
const media = load('lib/record-device-media.ts');
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const administrator = { nombre: 'Administrador de prueba', usuario: 'admin.qa', rolNombre: 'ADMIN' };
const sedes = [{ id: 1, nombre: 'BODEGA PRINCIPAL' }, { id: 2, nombre: 'SEDE 1' }, { id: 3, nombre: 'ONLINE' }, { id: 4, nombre: 'VENTAS' }];
const references = [{ id: 1, nombre: 'TECNO SPARK 50 4G 256GB', activo: true }, { id: 2, nombre: 'IPHONE 16 PRO 256GB', activo: true }, { id: 3, nombre: 'Referencia oculta QA', activo: false }];
const rows = Array.from({ length: 27 }, (_, index) => {
  const estado = index % 7 === 5 ? 'PRESTAMO' : index % 7 === 6 ? 'PAGO' : 'BODEGA';
  const referencia = index === 1 ? '  iPhOnE 16 PRO 256GB' : index === 2 ? 'SAMSUNG GALAXY A17' : index === 3 ? 'Lavadora frontal 12 kg' : 'TECNO SPARK 50 4G 256GB';
  return { id: 9000 - index, imei: index === 0 ? '001234567890123' : String(350735531230000 + index), referencia, tipoProducto: index === 3 ? 'ELECTRODOMESTICO' : 'TELEFONIA', color: 'GRIS', costo: index === 0 ? 1234567.89 : 610000, numeroFactura: index === 24 ? 'FACTURA-FUERA-PAGINA-QA' : 'QA-11241', distribuidor: index === 24 ? 'CORBETA-QA' : 'COMUNICARIBE', estado, sedeDestinoId: estado === 'BODEGA' ? null : index % 2 ? 2 : 3, estadoCobro: estado === 'PRESTAMO' ? 'PENDIENTE' : estado === 'PAGO' ? 'PAGADO' : null, catalogoEquipo: { referencia, imagenUrl: index === 0 ? '/catalogo/equipo-qa.png' : null, sistemaOperativo: index === 3 ? null : 'ANDROID' } };
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
  return typeof node === 'object' ? textOf(node.props?.children) : String(node);
}
function normalizedText(node) { return textOf(node).replace(/\s+/g, ' ').trim(); }
function control(tree, predicate) { const node = elements(tree).find(predicate); assert.ok(node, 'Control no encontrado'); return node; }
function probe({ initial = {}, fetchImpl, confirmation = true } = {}) {
  const file = 'app/inventario-principal/page.tsx', input = source(file);
  const ast = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const states = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useState' ? [node.name.elements[0].name.getText(ast)] : []);
  const locals = declarations.filter(node => ts.isIdentifier(node.name)).map(node => node.name.text);
  const finalReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(finalReturn);
  const state = { items: rows, user: administrator, sedes, referenciasCatalogo: references, puedeEliminar: true, inventoryLoading: false, ...initial };
  const calls = [], effects = [], dependencies = [], callbackMemo = [], captures = [], confirmations = [], refs = [];
  let cursor = 0, effectCursor = 0, callbackCursor = 0, refCursor = 0, captured;
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = {
    useState(value) { const name = states[cursor++]; assert.ok(name, 'Estado inesperado'); if (!(name in state)) state[name] = typeof value === 'function' ? value() : value; return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
    useMemo: callback => callback(),
    useCallback(callback, deps) { const index = callbackCursor++; if (!callbackMemo[index] || !equal(callbackMemo[index].deps, deps)) callbackMemo[index] = { callback, deps }; return callbackMemo[index].callback; },
    // Initial data is supplied by this probe; skip only mount effects, then execute actual dependency changes.
    useEffect(callback, deps) { const index = effectCursor++; if (dependencies[index] && !equal(dependencies[index], deps)) effects.push(callback); dependencies[index] = deps || []; },
    useRef(value) { const index = refCursor++; return refs[index] ??= { current: value }; },
  };
  const imports = {
    react, 'react/jsx-runtime': jsx,
    'next/link': { __esModule: true, default: ({ children, ...props }) => jsx.jsx('a', { ...props, children }) },
    'next/image': { __esModule: true, default: props => jsx.jsx('img', props) },
    '@/lib/prestamos': { NOMBRE_SEDE_BODEGA: 'BODEGA PRINCIPAL' }, '@/lib/product-types': products, '@/lib/sedes': sedesModule,
    '@/lib/use-live-refresh': { useLiveRefresh() {} },
    '@/app/dashboard/_components/dashboard-icon': { __esModule: true, default: () => null },
    '@/app/ventas/_components/sales-dashboard-parts': { SalesProfile: props => jsx.jsx('div', { 'data-profile': true, children: `${props.name} ${props.role}` }) },
    '@/app/vendedor/registros/buscar/device-visual': { RecordDeviceVisual: props => jsx.jsx('div', { 'data-device': media.resolveRecordDeviceVisual(props).kind, 'data-media-props': props }) },
    xlsx: { ...XLSX, writeFile(book, filename) { captures.push({ book, filename }); } },
    './warehouse.module.css': css,
  };
  const workspace = load(file, imports, {
    __capture: value => { captured = value; },
    window: { confirm(message) { confirmations.push(message); return confirmation; } },
    fetch: async (url, options = {}) => {
      calls.push({ url, options }); const result = fetchImpl ? await fetchImpl(url, options) : { ok: true, data: url.endsWith('/referencias') ? { referencias: references, puedeEliminar: true } : rows };
      return result instanceof Response ? result : { ok: result.ok, json: async () => result.data };
    },
  }, text => text.slice(0, finalReturn.getStart(ast)) + `__capture({${locals.join(',')}});\n` + text.slice(finalReturn.getStart(ast)));
  const instance = {
    state, calls, effects, captures, confirmations,
    render() { cursor = effectCursor = callbackCursor = refCursor = 0; return { tree: resolve(workspace.default()) }; },
    flushEffects() { for (let count = 0; effects.length && count < 8; count++) { const queued = effects.splice(0); queued.forEach(effect => effect()); this.render(); } assert.equal(effects.length, 0); },
    get view() { return captured; },
  };
  instance.render(); return instance;
}

test('bodega conserva navegación, perfil, todos los campos y rutas operativas actuales', () => {
  const { tree } = probe().render();
  const nav = control(tree, node => node.type === 'nav' && node.props['aria-label'] === 'Navegación principal');
  assert.deepEqual(elements(nav).filter(node => node.type === 'a').map(node => node.props.href), ['/dashboard', '/ventas', '/inventario', '/prestamos', '/caja', '/dashboard/aprobaciones', '/dashboard/reportes', '/dashboard/sedes']);
  assert.equal(control(nav, node => node.type === 'a' && node.props['aria-current'] === 'page').props.href, '/inventario');
  assert.ok(textOf(control(tree, node => node.props?.['data-profile'])).includes(administrator.nombre));
  assert.equal(control(tree, node => node.type === 'a' && textOf(node).includes('Nuevo inventario')).props.href, '/inventario/nuevo');
  assert.deepEqual(elements(tree).filter(node => node.type === 'th').map(textOf), ['', 'ID', 'Equipo / IMEI', 'Color', 'Costo', 'Factura / Distribuidor', 'Estado', 'Cobro', 'Sede destino', 'Acciones']);
  assert.ok(textOf(tree).includes('001234567890123')); assert.ok(textOf(tree).includes('$ 1.234.567,89'));
  assert.ok(textOf(tree).includes('QA-11241')); assert.ok(textOf(tree).includes('COMUNICARIBE'));
});

test('paginación limita a diez y mantiene indicadores de todo el inventario autorizado', () => {
  const instance = probe();
  const expected = { count: 20, amount: 12824567.89, sent: 7, pending: 4 };
  for (const [pagina, count, first, last] of [[1, 10, 1, 10], [2, 10, 11, 20], [3, 7, 21, 27]]) {
    instance.state.pagina = pagina; const { tree } = instance.render();
    assert.equal(instance.view.itemsPaginados.length, count); assert.equal(instance.view.totalPaginas, 3);
    assert.equal(instance.view.equiposDisponibles.length, expected.count); assert.ok(Math.abs(instance.view.valorEnBodega - expected.amount) < .00001);
    assert.equal(instance.view.equiposEnviados.length, expected.sent); assert.equal(instance.view.pendientesCobro.length, expected.pending);
    assert.ok(normalizedText(tree).includes(`Mostrando ${first} – ${last} de 27`));
    assert.equal(control(tree, node => node.type === 'button' && node.props['aria-label'] === 'Página siguiente').props.disabled, pagina === 3);
  }
});

test('búsqueda por IMEI, referencia, factura y distribuidor encuentra registros fuera de la página visible', () => {
  for (const term of [rows[24].imei, 'FACTURA-FUERA-PAGINA-QA', 'corbeta-qa']) {
    const instance = probe({ initial: { pagina: 2 } });
    const input = control(instance.render().tree, node => node.type === 'input' && node.props.placeholder?.includes('Buscar IMEI'));
    input.props.onChange({ target: { value: term } }); instance.render(); instance.flushEffects();
    assert.equal(instance.state.pagina, 1); assert.equal(instance.view.itemsFiltrados.length, 1); assert.equal(instance.view.itemsPaginados[0].id, rows[24].id);
  }
  const reference = probe({ initial: { busqueda: ' iPhone 16 pro ' } });
  assert.equal(reference.view.itemsFiltrados.length, 1); assert.equal(reference.view.itemsFiltrados[0].id, rows[1].id);
});

test('filtros de deuda, pagados, enviados y sede se combinan antes de paginar sin alterar fórmulas', () => {
  for (const [filter, expected] of [['BODEGA', 20], ['ENVIADOS', 7], ['COBRO_PENDIENTE', 4], ['PAGADOS', 3]]) {
    const instance = probe({ initial: { filtroEstado: filter } });
    assert.equal(instance.view.itemsFiltrados.length, expected); assert.ok(instance.view.itemsPaginados.length <= 10);
    assert.equal(instance.view.equiposDisponibles.length, 20); assert.equal(instance.view.pendientesCobro.length, 4);
  }
  const combined = probe({ initial: { filtroEstado: 'COBRO_PENDIENTE', filtroSedeDestinoId: '2', busqueda: 'comunicaribe' } });
  assert.equal(combined.view.itemsFiltrados.length, 2); assert.ok(combined.view.itemsFiltrados.every(row => row.sedeDestinoId === 2 && row.estadoCobro === 'PENDIENTE'));
  const legacy = probe({ initial: { items: [{ ...rows[0], estado: null }, { ...rows[1], estado: 'GARANTIA', estadoCobro: 'PENDIENTE' }] } });
  assert.equal(legacy.view.equiposDisponibles.length, 1); assert.equal(legacy.view.equiposEnviados.length, 0); assert.equal(legacy.view.pendientesCobro.length, 1);
});

test('Deuda muestra quién debe junto al ID con la sede actual, sin confundir al distribuidor con el deudor', () => {
  const debts = [
    { ...rows[5], sedeDestinoId: 2, sedeDestinoNombre: 'SEDE ACTUAL QA', distribuidor: 'PROVEEDOR ACREEDOR QA' },
    { ...rows[12], sedeDestinoId: 99, sedeDestinoNombre: null },
    { ...rows[19], sedeDestinoId: null, sedeDestinoNombre: null },
  ];
  const instance = probe({ initial: { items: debts, filtroEstado: 'COBRO_PENDIENTE' } });
  const { tree } = instance.render();
  assert.ok(textOf(tree).includes('Equipos con deuda'));
  assert.deepEqual(elements(tree).filter(node => node.type === 'th').map(textOf), ['', 'ID', 'Quién me debe', 'Equipo / IMEI', 'Color', 'Costo', 'Factura / Distribuidor', 'Estado', 'Cobro', 'Acciones']);
  const debtorCells = elements(tree).filter(node => node.type === 'td' && node.props.className === 'debtor').map(normalizedText);
  assert.deepEqual(debtorCells, ['SEDE ACTUAL QA', 'Sede #99', 'Deudor no identificado']);
  assert.ok(textOf(tree).includes('PROVEEDOR ACREEDOR QA'));
  assert.equal(control(tree, node => node.type === 'option' && node.props.value === '').props.children, 'Todos los deudores');
  instance.state.busqueda = 'sede actual qa'; instance.state.sedes = []; instance.render(); instance.flushEffects();
  assert.equal(instance.view.itemsFiltrados.length, 1); assert.equal(instance.view.itemsFiltrados[0].id, debts[0].id);
  instance.state.filtroSedeDestinoId = '3'; instance.render(); instance.flushEffects();
  assert.equal(instance.view.itemsFiltrados.length, 0);
});

test('Excel incluye el deudor actual solo cuando hay cobro pendiente y conserva el destino de equipos pagados', async () => {
  const items = [
    { ...rows[5], sedeDestinoNombre: 'SEDE DEUDORA QA' },
    { ...rows[6], sedeDestinoNombre: 'SEDE PAGADA QA' },
    { ...rows[12], sedeDestinoId: null, sedeDestinoNombre: null },
  ];
  const instance = probe({ initial: { items } });
  await instance.view.exportarInventarioExcel();
  const sheet = instance.captures[0].book.Sheets['Inventario principal'];
  const exported = XLSX.utils.sheet_to_json(sheet);
  assert.deepEqual(exported.map(row => row.DEUDOR), ['SEDE DEUDORA QA', '-', 'Deudor no identificado']);
  assert.deepEqual(exported.map(row => row['SEDE DESTINO']), ['SEDE DEUDORA QA', 'SEDE PAGADA QA', '-']);
  instance.state.filtroEstado = 'COBRO_PENDIENTE'; instance.render();
  await instance.view.exportarInventarioExcel();
  assert.equal(XLSX.utils.sheet_to_json(instance.captures[1].book.Sheets['Inventario principal']).length, 2);
});

test('selección visible conserva otras páginas y mantiene elegibilidad de envío y devolución', () => {
  const instance = probe(); instance.view.alternarSeleccionVisibles(); instance.render();
  assert.equal(instance.state.idsSeleccionados.length, 10); assert.equal(instance.view.todosVisiblesSeleccionados, true);
  instance.state.pagina = 2; instance.render(); assert.equal(instance.view.todosVisiblesSeleccionados, false);
  instance.view.alternarSeleccionVisibles(); instance.render(); assert.equal(instance.state.idsSeleccionados.length, 20);
  assert.equal(instance.view.itemsSeleccionadosDisponibles.length, 15); assert.equal(instance.view.itemsSeleccionadosEnPrestamo.length, 3);
  assert.ok(instance.view.itemsSeleccionadosDisponibles.every(row => row.estado === 'BODEGA'));
  assert.ok(instance.view.itemsSeleccionadosEnPrestamo.every(row => row.estado === 'PRESTAMO'));
  instance.view.alternarSeleccionVisibles(); instance.render(); assert.equal(instance.state.idsSeleccionados.length, 10);
  assert.deepEqual(instance.state.idsSeleccionados, rows.slice(0, 10).map(row => row.id));
  const tree = instance.render().tree;
  for (const row of rows.slice(10, 20)) {
    const tr = control(tree, node => node.type === 'tr' && elements(node).some(child => child.type === 'input' && child.props['aria-label'] === `Seleccionar ${row.imei}`));
    assert.equal(control(tr, node => node.type === 'button' && node.props['aria-label'] === 'Enviar a sede').props.disabled, row.estado !== 'BODEGA');
    assert.equal(control(tr, node => node.type === 'button' && node.props['aria-label'] === 'Volver a bodega').props.disabled, row.estado !== 'PRESTAMO');
  }
});

test('cambiar búsqueda, estado o sede limpia selección y regresa a la primera página', () => {
  for (const change of [{ busqueda: 'TECNO' }, { filtroEstado: 'ENVIADOS' }, { filtroSedeDestinoId: '2' }]) {
    const instance = probe({ initial: { pagina: 2, idsSeleccionados: [rows[0].id, rows[15].id] } });
    Object.assign(instance.state, change); instance.render(); instance.flushEffects();
    assert.equal(instance.state.pagina, 1); assert.deepEqual(instance.state.idsSeleccionados, []);
  }
});

test('exportación usa todas las páginas filtradas y preserva IMEI como texto de Excel y centavos', async () => {
  for (const filter of ['', 'COMUNICARIBE', 'CORBETA-QA']) {
    const instance = probe({ initial: { pagina: 2, busqueda: filter } });
    const expected = instance.view.itemsFiltrados;
    await instance.view.exportarInventarioExcel();
    assert.equal(instance.captures.length, 1); const { book, filename } = instance.captures[0];
    assert.match(filename, /^inventario-principal-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const roundTrip = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true });
    const sheet = roundTrip.Sheets['Inventario principal'];
    assert.equal(XLSX.utils.sheet_to_json(sheet).length, expected.length);
    expected.forEach((row, index) => {
      assert.equal(sheet[`B${index + 2}`].t, 's'); assert.equal(sheet[`B${index + 2}`].v, row.imei);
      assert.equal(sheet[`B${index + 2}`].z, '@'); assert.equal(sheet[`F${index + 2}`].v, row.costo);
      assert.equal(sheet[`F${index + 2}`].z, Number.isInteger(row.costo) ? '"$"#,##0' : '"$"#,##0.00');
    });
    if (!filter) { assert.equal(sheet.B2.v, '001234567890123'); assert.equal(sheet.B28.v, rows[26].imei); assert.equal(sheet.F2.v, 1234567.89); }
    assert.equal(instance.state.exportandoExcel, false); assert.ok(instance.state.mensaje.includes(String(expected.length)));
  }
});

test('catálogo permanece cerrado al ingresar y conserva referencias activas, ocultas y sus acciones', async () => {
  const instance = probe(); let { tree } = instance.render();
  assert.equal(instance.state.mostrarCatalogoReferencias, false); assert.ok(!elements(tree).some(node => node.props?.id === 'warehouse-references'));
  control(tree, node => node.type === 'button' && node.props['aria-controls'] === 'warehouse-references').props.onClick(); tree = instance.render().tree;
  assert.ok(textOf(tree).includes('Referencia oculta QA')); assert.ok(normalizedText(tree).includes('2 activas')); assert.ok(normalizedText(tree).includes('1 ocultas'));
  assert.ok(elements(tree).some(node => node.type === 'button' && textOf(node).includes('Ocultar')));
  assert.ok(elements(tree).some(node => node.type === 'button' && textOf(node).includes('Activar')));
  assert.ok(elements(tree).some(node => node.type === 'input' && node.props.placeholder === 'Nueva referencia...'));
  instance.view.iniciarEdicionReferencia(references[0]); instance.render();
  assert.equal(instance.state.editandoReferenciaId, 1); assert.equal(instance.state.referenciaEditada, references[0].nombre);
  await instance.view.actualizarReferencia(references[2], true);
  assert.equal(instance.calls[0].url, '/api/inventario-principal/referencias'); assert.equal(instance.calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(instance.calls[0].options.body), { id: 3, activo: true });
  const auditor = probe({ initial: { user: { ...administrator, rolNombre: 'AUDITOR' }, puedeEliminar: false } });
  assert.ok(!elements(auditor.render().tree).some(node => node.type === 'button' && node.props['aria-label'] === 'Eliminar'));
});

test('cada equipo entrega su propia imagen de catálogo o alternativa Apple, Android y genérica', () => {
  const devices = elements(probe().render().tree).filter(node => node.props?.['data-media-props']);
  assert.equal(devices.length, 10);
  assert.deepEqual(devices.slice(0, 4).map(node => node.props['data-device']), ['photo', 'apple', 'android', 'device']);
  assert.equal(devices[0].props['data-media-props'].imageSrc, '/catalogo/equipo-qa.png');
  assert.equal(devices[0].props['data-media-props'].catalogReference, rows[0].referencia);
  assert.equal(media.resolveRecordDeviceVisual(devices[0].props['data-media-props'], true).kind, 'android');
  assert.equal(media.resolveRecordDeviceVisual({ ...devices[1].props['data-media-props'], imageSrc: '/fallida.png' }, true).kind, 'apple');
  assert.equal(media.resolveRecordDeviceVisual({ ...devices[0].props['data-media-props'], catalogReference: 'OTRO MODELO' }).kind, 'android');
});

test('carga, error y ausencia de equipos tienen estados distintos y un error permite reintentar', async () => {
  for (const [initial, expected] of [[{ items: [], inventoryLoading: true }, 'Cargando inventario principal…'], [{ items: [], inventoryError: 'Error servidor QA' }, 'El inventario no está disponible'], [{ items: [] }, 'No hay equipos que coincidan']]) {
    const { tree } = probe({ initial }).render(); assert.ok(textOf(tree).includes(expected));
  }
  const failed = probe({ fetchImpl: async () => ({ ok: false, data: { error: 'Sin permiso QA' } }) });
  await failed.view.cargarInventarioPrincipal();
  assert.equal(failed.state.inventoryError, 'Sin permiso QA'); assert.equal(failed.state.inventoryLoading, false);
  assert.ok(elements(failed.render().tree).some(node => node.type === 'button' && textOf(node) === 'Reintentar'));
  const refreshed = probe({ fetchImpl: async () => ({ ok: true, data: [...rows, { ...rows[0], id: 9900, imei: '000000000000001' }] }) });
  await refreshed.view.cargarInventarioPrincipal(); refreshed.render(); assert.equal(refreshed.view.equiposDisponibles.length, 21); assert.equal(refreshed.view.itemsFiltrados.length, 28);
});
