import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const jsx = require('react/jsx-runtime');
const PAGE = 'app/ventas/nuevo/page.tsx';
const source = file => readFileSync(join(ROOT, file), 'utf8');
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const admin = { nombre: 'Administrador QA', usuario: 'admin.qa', rolNombre: 'ADMIN', sedeId: 7, sedeNombre: 'SEDE QA' };
const supervisor = { ...admin, nombre: 'Supervisor QA', usuario: 'sede.qa', rolNombre: 'SUPERVISOR' };
const catalog = [
  { id: 1, nombre: 'PAYJOY', aplicaIntermediacion: false, porcentajeIntermediacion: 0 },
  { id: 2, nombre: 'ADDI', aplicaIntermediacion: true, porcentajeIntermediacion: 8 },
  { id: 3, nombre: 'SISTECREDITO', aplicaIntermediacion: true, porcentajeIntermediacion: 2 },
  { id: 4, nombre: 'FINSER PAY', aplicaIntermediacion: true, porcentajeIntermediacion: 10 },
  { id: 5, nombre: 'FINANCIERA QA', aplicaIntermediacion: true, porcentajeIntermediacion: 3.5 },
];
const record = {
  id: 94001, sedeId: 7, puntoVenta: 'SEDE QA', clienteNombre: 'Cliente sintético de revisión', tipoDocumento: 'CC', documentoNumero: '00.111.044.4117',
  serialImei: '001234567890123', correo: 'cliente.sintetico.revision@example.test', whatsapp: '3001234567', telefono: '3107654321',
  direccion: 'Dirección de prueba', barrio: 'Barrio QA', referenciaContacto: 'Contacto QA', referenciaEquipo: 'INFINIX NOTE 60 PRO 256GB',
  asesorNombre: 'Cerrador QA', jaladorNombre: 'Jalador QA', observacion: 'Observación completa del asesor de prueba, que no debe perderse.',
  plataformaCredito: 'PAYJOY', creditoAutorizado: '1450583', cuotaInicial: '250000', medioPago1Tipo: 'TRANSFERENCIA', medioPago1Valor: '250000',
  medioPago2Tipo: null, medioPago2Valor: null, estadoVentaRegistro: 'LISTO_PARA_VENTA', ventaIdRelacionada: null,
  financierasDetalle: [{ plataformaCredito: 'PAYJOY', creditoAutorizado: '1450583', cuotaInicial: '250000', tipoPagoInicial: 'TRANSFERENCIA', valorCuota: '196700', numeroCuotas: '12', frecuenciaCuota: 'QUINCENAL' }],
  createdAt: '2026-10-10T14:00:00.000Z', updatedAt: '2026-10-10T14:01:00.000Z',
};
const inventory = { id: 81001, imei: record.serialImei, referencia: record.referenciaEquipo, color: 'Plata', costo: 1350000, sedeId: 7, sedeNombre: 'SEDE QA', estadoActual: 'BODEGA', origen: 'INVENTARIO_SEDE' };

function load(file, imports = {}, injected = {}, transform = text => text) {
  const output = ts.transpileModule(transform(source(file)), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(injected), output)(name => {
    if (name in imports) return imports[name];
    if (name.endsWith('.module.css')) return css;
    const local = name.startsWith('@/lib/') ? `${name.slice(2)}.ts` : name.startsWith('.') ? join(dirname(file), `${name}.ts`) : null;
    assert.ok(local, `Dependencia inesperada: ${name}`);
    return load(local);
  }, loaded, loaded.exports, ...Object.values(injected));
  return loaded.exports;
}
function elements(node) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== 'object') return [node];
  if (typeof node.type === 'function') return [node, ...elements(node.type(node.props))];
  return [node, ...elements(node.props?.children)];
}
function textOf(node) { return elements(node).filter(value => typeof value === 'string' || typeof value === 'number').join(' ').replace(/\s+/g, ' ').trim(); }
function displayed(tree) { return `${textOf(tree)} ${elements(tree).filter(node => node?.props && ['input', 'textarea', 'select'].includes(node.type)).map(node => node.props.value ?? '').join(' ')}`; }
function control(tree, predicate) { const found = elements(tree).find(node => typeof node === 'object' && predicate(node)); assert.ok(found, 'Control esperado no encontrado'); return found; }
function approve(tree) { return control(tree, node => node.type === 'button' && /^Aprobar y guardar/.test(textOf(node))); }
function field(tree, name) {
  const label = control(tree, node => node.type === 'label' && textOf(node).toLowerCase() === name.toLowerCase());
  if (label.props.htmlFor) return control(tree, node => node.props?.id === label.props.htmlFor);
  return control(label, node => ['input', 'select', 'textarea'].includes(node.type));
}

function probe({ user = admin, row = record, item = inventory, queryId = String(record.id), fetchImpl, initial = {} } = {}) {
  const input = source(PAGE), ast = ts.createSourceFile(PAGE, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(component?.body, 'Componente de revisión no encontrado');
  const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
  const stateNames = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useState' ? [node.name.elements[0].name.getText(ast)] : []);
  const captureNames = [...declarations.filter(node => ts.isIdentifier(node.name)).map(node => node.name.text), ...component.body.statements.filter(ts.isFunctionDeclaration).map(node => node.name.text)];
  const lastReturn = component.body.statements.find(ts.isReturnStatement); assert.ok(lastReturn);
  const state = { ...initial }, calls = [], effects = [], deps = [], refs = [], events = [], focus = [];
  let cursor = 0, effectCursor = 0, refCursor = 0, eventCursor = 0, captured, revision = 0;
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    useState(value) { const name = stateNames[cursor++]; assert.ok(name, 'Estado inesperado'); if (!(name in state)) state[name] = typeof value === 'function' ? value() : value; return [state[name], next => { const value = typeof next === 'function' ? next(state[name]) : next; if (!Object.is(state[name], value)) { state[name] = value; revision++; } }]; },
    useMemo: callback => callback(), useCallback: callback => callback,
    useRef(value) { return refs[refCursor++] ??= { current: value }; },
    useEffect(callback, nextDeps) { const index = effectCursor++; if (!deps[index] || !equal(deps[index], nextDeps)) effects.push(callback); deps[index] = nextDeps || []; },
    useEffectEvent(callback) { const index = eventCursor++; const event = events[index] ??= { current: callback, invoke: (...args) => event.current(...args) }; event.current = callback; return event.invoke; },
  };
  const imports = {
    react: hooks, 'react/jsx-runtime': jsx,
    'next/navigation': { useSearchParams: () => ({ get: key => key === 'registroId' ? queryId : null }) },
    'next/link': { __esModule: true, default: ({ children, ...props }) => jsx.jsx('a', { ...props, children }) },
    'next/image': { __esModule: true, default: props => jsx.jsx('img', props) },
    '@/app/dashboard/_components/dashboard-icon': { __esModule: true, default: props => jsx.jsx('svg', { 'data-icon': props.name }) },
    '@/app/dashboard/_components/logout-button': { __esModule: true, default: () => jsx.jsx('button', { children: 'Cerrar sesión' }) },
    '@/app/dashboard/_components/operations-dashboard': { DashboardSidebar: () => jsx.jsx('aside', {}), DashboardTopbar: () => null },
    '@/app/ventas/_components/sales-dashboard-parts': { SalesProfile: props => jsx.jsx('div', { 'data-profile': true, children: `${props.name} ${props.role}` }) },
  };
  const Workspace = load(PAGE, imports, {
    __capture: value => { captured = value; },
    window: { location: { href: '' }, requestAnimationFrame: callback => callback(), setTimeout: callback => callback() },
    document: { getElementById: id => ({ focus() { focus.push(id); }, scrollIntoView() {} }), querySelector: selector => ({ focus() { focus.push(selector); }, scrollIntoView() {} }) },
    requestAnimationFrame: callback => callback(),
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const custom = fetchImpl ? await fetchImpl(url, options) : null;
      const result = custom ?? { ok: true, data: url === '/api/session' ? user : url === '/api/ventas/catalogo-personal' ? { jaladores: [{ nombre: 'Jalador QA' }], cerradores: [{ nombre: 'Cerrador QA' }], financieras: catalog } : url.startsWith('/api/ventas/aprobaciones?') ? { registro: row } : url === '/api/ventas/buscar-imei' ? { ...item, registroVenta: row } : { ok: true, id: 74001 } };
      return result instanceof Response ? result : { ok: result.ok, status: result.status ?? (result.ok ? 200 : 400), json: async () => result.data };
    },
  }, text => `${text.slice(0, lastReturn.getStart(ast))}__capture({${captureNames.join(',')}});\n${text.slice(lastReturn.getStart(ast))}`).default;
  const instance = {
    state, calls, focus,
    render() { cursor = effectCursor = refCursor = eventCursor = 0; return { tree: Workspace(), view: captured }; },
    get view() { return captured; },
    async settle() {
      let previous = -1;
      for (let count = 0; count < 32; count++) {
        this.render(); const queued = effects.splice(0); for (const callback of queued) callback();
        await new Promise(resolve => setImmediate(resolve));
        if (!effects.length && revision === previous) break;
        previous = revision;
      }
      return this.render().tree;
    },
  };
  instance.render(); return instance;
}

test('revisión muestra navegación blanca, sede real, todos los datos y acciones sin sidebar', async () => {
  const instance = probe(); const tree = await instance.settle();
  const navigation = control(tree, node => node.type === 'nav' && node.props['aria-label'] === 'Navegación principal');
  const paths = elements(navigation).filter(node => node?.type === 'a').map(node => node.props.href);
  assert.deepEqual(paths, ['/dashboard', '/ventas', '/inventario', '/prestamos', '/caja', '/dashboard/aprobaciones', '/dashboard/reportes', '/dashboard/sedes']);
  assert.equal(control(navigation, node => node.type === 'a' && node.props['aria-current'] === 'page').props.href, '/ventas');
  assert.ok(!elements(tree).some(node => node?.type === 'aside'));
  const text = displayed(tree);
  for (const value of ['Revisar venta', String(record.id), 'SEDE QA', record.serialImei, record.clienteNombre, '001110444117', record.whatsapp, record.correo, record.referenciaEquipo, record.observacion, 'Jalador QA', 'Cerrador QA', 'Plata', 'Proyección']) assert.ok(text.includes(value), value);
  for (const section of ['Equipo', 'Cliente', 'Equipo comercial', 'Financiación', 'Ingresos y ajustes', 'Observación']) assert.ok(text.includes(section), section);
  assert.equal(elements(tree).filter(node => node?.type === 'button' && /^Aprobar y guardar/.test(textOf(node))).length, 1);
  assert.equal(elements(tree).filter(node => node?.type === 'a' && textOf(node).includes('Volver a pendientes')).length, 1);
  assert.ok(elements(tree).some(node => node?.type === 'button' && textOf(node) === 'Cancelar'));
});

test('proyección conserva caja, utilidad e intermediación existentes con efectivo, transferencia y voucher', async () => {
  for (const [type, incomeNet, incomeCash] of [['EFECTIVO', 250000, 250000], ['TRANSFERENCIA', 250000, 0], ['VOUCHER', 237500, 237500]]) {
    const instance = probe(); await instance.settle();
    Object.assign(instance.state, { ingreso1Base: '250000', tipoIngreso1: type, ingreso2Base: '100000', tipoIngreso2: 'VOUCHER', usarIngreso2: true, comision: '15000', salida: '20000', finanzas: [{ nombre: 'PAYJOY', valor: '1000000' }, { nombre: 'ADDI', valor: '500000' }, { nombre: 'SISTECREDITO', valor: '100000' }, { nombre: 'FINSER PAY', valor: '200000' }] });
    instance.render();
    assert.equal(instance.view.totalIngresosNetos, incomeNet + 95000);
    assert.equal(instance.view.totalIngresosCaja, incomeCash + 95000);
    assert.equal(instance.view.totalFinancierasNetas, 1000000 + 460000 + 98000 + 180000);
    assert.equal(instance.view.cajaOficina, incomeCash + 95000 - 35000);
    assert.equal(instance.view.utilidad, incomeNet + 95000 + 1738000 - 1350000 - 35000);
  }
});

test('registro conserva decimales y más de cuatro financieras con su cuota y campos editables', async () => {
  const many = { ...record, medioPago1Valor: '250000.25', financierasDetalle: catalog.map((item, index) => ({ plataformaCredito: item.nombre, creditoAutorizado: String(100000.25 + index * 100000), valorCuota: String(10000.5 + index), cuotaInicial: '0', tipoPagoInicial: 'EFECTIVO' })) };
  const instance = probe({ row: many }); const tree = await instance.settle();
  assert.equal(instance.state.finanzas.length >= 5, true);
  assert.deepEqual(instance.state.finanzas.filter(row => row.nombre).map(row => [row.nombre, Number(row.valor)]), many.financierasDetalle.map(row => [row.plataformaCredito, Number(row.creditoAutorizado)]));
  assert.equal(instance.state.ingreso1Base, '250000.25');
  const text = displayed(tree);
  for (const item of many.financierasDetalle) { assert.ok(text.includes(item.plataformaCredito), item.plataformaCredito); assert.ok(text.includes(Number(item.valorCuota).toLocaleString('es-CO')), `Cuota ${item.plataformaCredito}`); }
  for (const label of ['Ingreso 1 valor', 'Tipo ingreso 1', 'Comisión', 'Salida']) assert.ok(field(tree, label));
});

test('al aprobar se envían todas las financieras registradas sin truncar a cuatro ni redondear créditos', async () => {
  const row = { ...record, medioPago1Valor: '250000.25', financierasDetalle: catalog.map((item, index) => ({ plataformaCredito: item.nombre, creditoAutorizado: String(100000.25 + index * 100000), valorCuota: '12345.5' })) };
  const instance = probe({ row }); await instance.settle(); instance.state.confirmoTransferenciaValidada = true; instance.render();
  await instance.view.guardar();
  const request = instance.calls.find(call => call.url === '/api/ventas'); assert.ok(request);
  const payload = JSON.parse(request.options.body);
  assert.deepEqual(payload.financierasDetalle, row.financierasDetalle.map(fin => ({ nombre: fin.plataformaCredito, valor: Number(fin.creditoAutorizado) })));
  assert.equal(payload.ingreso1Base, 250000.25);
});

test('administrador puede agregar financieras a un registro existente y sede conserva su restricción', async () => {
  const instance = probe(); let tree = await instance.settle();
  assert.equal(instance.state.finanzas.filter(item => item.nombre).length, 1);
  const add = control(tree, node => node.type === 'button' && textOf(node).includes('Agregar financiera'));
  add.props.onClick(); tree = instance.render().tree;
  const next = field(tree, 'Financiera 2'); next.props.onChange({ target: { value: 'ADDI' } }); tree = instance.render().tree;
  field(tree, 'Crédito autorizado 2').props.onChange({ target: { value: '$ 500.000' } }); instance.render();
  assert.deepEqual(instance.state.finanzas.slice(0, 2).map(item => [item.nombre, Number(item.valor)]), [['PAYJOY', 1450583], ['ADDI', 500000]]);
  assert.equal(instance.view.totalFinancierasNetas, 1450583 + 460000);
  const locked = probe({ user: supervisor }); tree = await locked.settle();
  assert.ok(!elements(tree).some(node => node?.type === 'button' && textOf(node).includes('Agregar financiera')));
});

test('permisos de sede conservan sólo lectura de registro, contacto visible y jalador editable', async () => {
  for (const user of [admin, supervisor]) {
    const instance = probe({ user }); const tree = await instance.settle();
    const locked = user.rolNombre === 'SUPERVISOR';
    for (const name of ['IMEI', 'Descripción', 'Ingreso 1 valor']) assert.equal(Boolean(field(tree, name).props.readOnly), locked, name);
    for (const name of ['Servicio', 'Cerrador', 'Tipo ingreso 1']) assert.equal(Boolean(field(tree, name).props.disabled), locked, name);
    assert.equal(Boolean(field(tree, 'Jalador').props.disabled), false);
    for (const name of ['Costo del equipo', 'Color']) assert.equal(field(tree, name).props.readOnly, true, name);
    const paths = elements(tree).filter(node => node?.type === 'a').map(node => node.props.href);
    assert.equal(paths.includes('/dashboard/sedes'), !locked);
    assert.ok(paths.includes(locked ? '/dashboard/analitico' : '/dashboard/reportes'));
    assert.ok(displayed(tree).includes(record.whatsapp)); assert.ok(displayed(tree).includes(record.correo));
  }
});

test('no habilita aprobación sin disponibilidad verificada real ni con IMEI incompleto o sede distinta', async () => {
  const missing = probe({ fetchImpl: url => url === '/api/ventas/buscar-imei' ? { ok: false, data: { referencia: record.referenciaEquipo, color: 'Plata', costo: 1350000, error: 'Equipo no disponible QA' } } : null });
  let tree = await missing.settle(); missing.state.confirmoTransferenciaValidada = true; tree = missing.render().tree;
  assert.equal(approve(tree).props.disabled, true); assert.equal(missing.view.equipoValidado, false);
  for (const item of [{ ...inventory, sedeId: 8 }, { ...inventory, estadoActual: 'VENDIDO' }, { ...inventory, imei: '001234567890999' }]) {
    const instance = probe({ item }); await instance.settle(); instance.state.confirmoTransferenciaValidada = true;
    assert.equal(approve(instance.render().tree).props.disabled, true); assert.equal(instance.view.equipoValidado, false);
  }
  const valid = probe(); await valid.settle(); valid.state.confirmoTransferenciaValidada = true; tree = valid.render().tree;
  assert.equal(valid.view.equipoValidado, true); assert.equal(approve(tree).props.disabled, false);
  valid.state.serial = '00123456789012'; assert.equal(approve(valid.render().tree).props.disabled, true);
});

test('ingresos faltantes y confirmaciones pendientes abren ajustes y bloquean aprobación', async () => {
  const empty = probe({ row: { ...record, medioPago1Valor: null, medioPago2Valor: null, cuotaInicial: null, financierasDetalle: [{ ...record.financierasDetalle[0], cuotaInicial: null }] } });
  let tree = await empty.settle(); assert.equal(approve(tree).props.disabled, true); assert.equal(empty.state.ajustesAbiertos, true);
  const instance = probe(); tree = await instance.settle();
  assert.equal(approve(tree).props.disabled, true); assert.equal(instance.state.ajustesAbiertos, true);
  const confirm = control(tree, node => node.type === 'input' && node.props.type === 'checkbox');
  confirm.props.onChange({ target: { checked: true } }); tree = instance.render().tree;
  assert.equal(approve(tree).props.disabled, false);
  field(tree, 'Ingreso 1 valor').props.onChange({ target: { value: '260000' } }); await instance.settle();
  assert.equal(instance.state.confirmoTransferenciaValidada, false); assert.equal(approve(instance.render().tree).props.disabled, true);
});

test('segundo ingreso efectivo y neto voucher permanecen completos sin sustituir el valor original', async () => {
  const row = { ...record, medioPago1Tipo: 'TRANSFERENCIA', medioPago1Valor: '250000', medioPago2Tipo: 'EFECTIVO', medioPago2Valor: '100000' };
  const instance = probe({ row }); let tree = await instance.settle();
  assert.equal(instance.state.usarIngreso2, true); assert.equal(instance.state.tipoIngreso2, 'EFECTIVO');
  const secondType = field(tree, 'Tipo ingreso 2'); assert.ok(elements(secondType).some(node => node?.type === 'option' && node.props.value === 'EFECTIVO'));
  instance.state.tipoIngreso2 = 'VOUCHER'; tree = instance.render().tree;
  assert.equal(field(tree, 'Ingreso 2 valor').props.value, '$ 100.000'); assert.equal(instance.view.ingreso2Neto, 95000);
  assert.equal(instance.view.totalIngresosNetos, 345000);
});

test('escritura de importes conserva coma decimal y centavos sin perder la posición decimal', async () => {
  const instance = probe(); let tree = await instance.settle();
  for (const [typed, expected, stored] of [['$ 250.000,', '$ 250.000,', '250000.'], ['$ 250.000,2', '$ 250.000,2', '250000.2'], ['$ 250.000,25', '$ 250.000,25', '250000.25']]) {
    field(tree, 'Ingreso 1 valor').props.onChange({ target: { value: typed } }); tree = instance.render().tree;
    assert.equal(field(tree, 'Ingreso 1 valor').props.value, expected); assert.equal(instance.state.ingreso1Base, stored);
  }
  assert.equal(instance.view.totalIngresosNetos, 250000.25);
  field(tree, 'Comisión').props.onChange({ target: { value: '$ 15.000,00' } }); tree = instance.render().tree;
  assert.equal(field(tree, 'Comisión').props.value, '$ 15.000,00'); assert.equal(Number(instance.state.comision), 15000);
});

test('error de guardado conserva datos, sin éxito falso; revalida disponibilidad inmediatamente antes del POST', async () => {
  const instance = probe({ fetchImpl: url => url === '/api/ventas' ? { ok: false, status: 409, data: { error: 'La aprobación cambió. Revisa el registro.' } } : null });
  await instance.settle(); Object.assign(instance.state, { confirmoTransferenciaValidada: true, comision: '15000', salida: '25000' }); instance.render();
  const before = Object.fromEntries(['serial', 'descripcion', 'ingreso1Base', 'jalador', 'cerrador', 'comision', 'salida'].map(key => [key, instance.state[key]]));
  await instance.view.guardar(); await instance.settle();
  assert.deepEqual(Object.fromEntries(Object.keys(before).map(key => [key, instance.state[key]])), before);
  assert.equal(instance.state.guardado, false); assert.ok(instance.state.mensaje.includes('La aprobación cambió'));
  const writes = instance.calls.filter(call => call.options.method === 'POST');
  assert.deepEqual(writes.slice(-2).map(call => call.url), ['/api/ventas/buscar-imei', '/api/ventas']);
  const payload = JSON.parse(writes.at(-1).options.body);
  assert.equal(payload.serial, record.serialImei); assert.equal(payload.registroVendedorId, record.id);
  assert.equal(payload.comision, 15000); assert.equal(payload.salida, 25000);
  assert.equal(payload.registroRevision, record.updatedAt); assert.equal(payload.costoEquipoEsperado, inventory.costo);
});

test('dos clics simultáneos y reintento tras éxito sólo ejecutan una aprobación sintética', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const instance = probe({ fetchImpl: async url => { if (url === '/api/ventas') { await pending; return { ok: true, data: { ok: true, id: 74001 } }; } return null; } });
  await instance.settle(); instance.state.confirmoTransferenciaValidada = true; instance.render();
  const first = instance.view.guardar(), second = instance.view.guardar();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  assert.equal(instance.calls.filter(call => call.url === '/api/ventas').length, 1);
  release(); await Promise.all([first, second]); await instance.settle();
  assert.equal(instance.state.guardado, true); assert.equal(instance.state.serial, record.serialImei); assert.equal(instance.state.registroVendedor.id, record.id);
  assert.equal(control(instance.render().tree, node => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
  await instance.view.guardar(); assert.equal(instance.calls.filter(call => call.url === '/api/ventas').length, 1);
});

test('fallo de disponibilidad al confirmar no envía venta y conserva los ajustes', async () => {
  let lookups = 0;
  const instance = probe({ fetchImpl: url => url === '/api/ventas/buscar-imei' && ++lookups > 1 ? { ok: false, status: 409, data: { error: 'Equipo vendido por otro operador QA' } } : null });
  await instance.settle(); Object.assign(instance.state, { confirmoTransferenciaValidada: true, comision: '11000' }); instance.render();
  await instance.view.guardar(); await instance.settle();
  assert.equal(instance.calls.filter(call => call.url === '/api/ventas').length, 0); assert.equal(instance.state.comision, '11000');
  assert.equal(instance.state.serial, record.serialImei); assert.equal(instance.state.guardado, false);
  assert.ok(instance.state.mensaje.includes('Equipo vendido'));
});

test('si cambia el costo antes de aprobar actualiza proyección y exige revisión sin enviar venta ni borrar ajustes', async () => {
  let lookups = 0;
  const instance = probe({ fetchImpl: url => url === '/api/ventas/buscar-imei' && ++lookups > 1 ? { ok: true, data: { ...inventory, costo: 1400000, registroVenta: record } } : null });
  await instance.settle(); Object.assign(instance.state, { confirmoTransferenciaValidada: true, comision: '11000', salida: '5000', ajustesAbiertos: false }); instance.render();
  const priorIncome = instance.state.ingreso1Base, priorDescription = instance.state.descripcion, priorFinances = structuredClone(instance.state.finanzas);
  await instance.view.guardar(); const tree = await instance.settle();
  assert.equal(instance.calls.filter(call => call.url === '/api/ventas').length, 0); assert.equal(instance.state.guardado, false);
  assert.equal(instance.state.costoEquipo, 1400000); assert.equal(instance.state.equipoConsultado.costo, 1400000);
  assert.equal(instance.view.utilidad, 250000 + 1450583 - 1400000 - 16000);
  assert.equal(instance.state.serial, record.serialImei); assert.equal(instance.state.ingreso1Base, priorIncome); assert.equal(instance.state.descripcion, priorDescription);
  assert.deepEqual(instance.state.finanzas, priorFinances); assert.equal(instance.state.comision, '11000'); assert.equal(instance.state.salida, '5000');
  assert.equal(instance.state.ajustesAbiertos, true); assert.ok(instance.state.mensaje.includes('costo del equipo cambió'));
  assert.ok(displayed(tree).includes('$ 1.400.000'));
});

test('fallo de sesión o catálogo mantiene aprobación deshabilitada y no permite enviar movimientos', async () => {
  for (const endpoint of ['/api/session', '/api/ventas/catalogo-personal']) {
    const instance = probe({ fetchImpl: url => url === endpoint ? { ok: false, status: 503, data: { error: 'Fallo sintético de carga' } } : null });
    let tree = await instance.settle(); instance.state.confirmoTransferenciaValidada = true; tree = instance.render().tree;
    assert.equal(approve(tree).props.disabled, true);
    assert.equal(instance.state[endpoint === '/api/session' ? 'sesionCargada' : 'catalogoCargado'], false);
    await instance.view.guardar(); await instance.settle();
    assert.equal(instance.calls.filter(call => call.url === '/api/ventas').length, 0); assert.equal(instance.state.guardado, false);
    assert.equal(instance.state.serial, record.serialImei); assert.ok(instance.state.mensaje);
  }
});

test('registro actualizado por otro usuario bloquea preaprobación, conserva borrador y exige actualizar explícitamente', async () => {
  let lookups = 0;
  const fresh = { ...record, updatedAt: '2026-10-10T14:02:00.000Z', medioPago1Valor: '450000.25', financierasDetalle: [{ ...record.financierasDetalle[0], creditoAutorizado: '1650583.50' }] };
  const instance = probe({ fetchImpl: url => url === '/api/ventas/buscar-imei' && ++lookups > 1 ? { ok: true, data: { ...inventory, registroVenta: fresh } } : null });
  await instance.settle(); Object.assign(instance.state, { confirmoTransferenciaValidada: true, ingreso1Base: '300000.25', comision: '11000', salida: '5000' }); instance.render();
  const before = { income: instance.state.ingreso1Base, finances: structuredClone(instance.state.finanzas), description: instance.state.descripcion };
  await instance.view.guardar(); let tree = await instance.settle();
  assert.equal(instance.calls.filter(call => call.url === '/api/ventas').length, 0); assert.equal(instance.state.registroDesactualizado, true);
  assert.equal(approve(tree).props.disabled, true); assert.equal(instance.state.registroVendedor.updatedAt, record.updatedAt);
  assert.equal(instance.state.ingreso1Base, before.income); assert.deepEqual(instance.state.finanzas, before.finances); assert.equal(instance.state.descripcion, before.description);
  assert.equal(instance.state.comision, '11000'); assert.equal(instance.state.salida, '5000');
  control(tree, node => node.type === 'button' && textOf(node) === 'Actualizar registro').props.onClick();
  tree = await instance.settle();
  assert.equal(instance.state.registroDesactualizado, false); assert.equal(instance.state.registroVendedor.updatedAt, fresh.updatedAt);
  assert.equal(instance.state.ingreso1Base, '450000.25'); assert.equal(instance.state.finanzas[0].valor, '1650583.5');
  assert.equal(instance.state.comision, '11000'); assert.equal(instance.state.salida, '5000');
  assert.equal(instance.state.confirmoTransferenciaValidada, false); assert.equal(approve(tree).props.disabled, true);
  instance.state.confirmoTransferenciaValidada = true; instance.render(); await instance.view.guardar(); await instance.settle();
  const writes = instance.calls.filter(call => call.url === '/api/ventas'); assert.equal(writes.length, 1);
  const payload = JSON.parse(writes[0].options.body);
  assert.equal(payload.registroRevision, fresh.updatedAt); assert.equal(payload.costoEquipoEsperado, inventory.costo);
  assert.equal(payload.ingreso1Base, 450000.25); assert.equal(payload.financierasDetalle[0].valor, 1650583.5);
  assert.equal(instance.state.guardado, true);
});

test('conflicto de revisión o costo en servidor conserva campos y bloquea reintentos hasta actualizar datos', async () => {
  for (const code of ['REGISTRO_CAMBIO', 'COSTO_CAMBIO']) {
    const instance = probe({ fetchImpl: url => url === '/api/ventas' ? { ok: false, status: 409, data: { code, error: `Conflicto sintético ${code}` } } : null });
    await instance.settle(); Object.assign(instance.state, { confirmoTransferenciaValidada: true, ingreso1Base: '300000.25', comision: '11000', salida: '5000' }); instance.render();
    const keys = ['serial', 'descripcion', 'ingreso1Base', 'tipoIngreso1', 'jalador', 'cerrador', 'comision', 'salida'];
    const before = Object.fromEntries(keys.map(key => [key, instance.state[key]])), finances = structuredClone(instance.state.finanzas);
    await instance.view.guardar(); const tree = await instance.settle();
    assert.deepEqual(Object.fromEntries(keys.map(key => [key, instance.state[key]])), before); assert.deepEqual(instance.state.finanzas, finances);
    assert.equal(instance.state.guardado, false); assert.equal(approve(tree).props.disabled, true); assert.ok(instance.state.mensaje.includes(code));
    if (code === 'REGISTRO_CAMBIO') {
      assert.equal(instance.state.registroDesactualizado, true);
      assert.ok(control(tree, node => node.type === 'button' && textOf(node) === 'Actualizar registro'));
    } else assert.equal(instance.state.equipoConsultado, null);
    await instance.view.guardar(); assert.equal(instance.calls.filter(call => call.url === '/api/ventas').length, 1);
  }
});

test('respuestas tardías de otro IMEI no sustituyen equipo, disponibilidad ni datos del registro vigente', async () => {
  let delayed = false; const pending = [];
  const instance = probe({ fetchImpl: (url, options) => delayed && url === '/api/ventas/buscar-imei' ? new Promise(resolve => pending.push({ body: JSON.parse(options.body), resolve })) : null });
  await instance.settle(); delayed = true;
  const oldLookup = instance.view.buscarIMEI(record.serialImei, record);
  const nextImei = '001234567890999', nextRecord = { ...record, serialImei: nextImei, referenciaEquipo: 'EQUIPO ACTUAL QA' };
  instance.state.serial = nextImei; instance.render();
  const currentLookup = instance.view.buscarIMEI(nextImei, nextRecord);
  assert.equal(pending.length, 2);
  pending[1].resolve({ ok: true, data: { ...inventory, imei: nextImei, referencia: nextRecord.referenciaEquipo, registroVenta: nextRecord } });
  await currentLookup; await instance.settle();
  pending[0].resolve({ ok: true, data: { ...inventory, referencia: 'EQUIPO ANTERIOR QA', registroVenta: record } });
  await oldLookup; await instance.settle();
  assert.equal(instance.state.serial, nextImei); assert.equal(instance.state.equipoConsultado.imei, nextImei);
  assert.equal(instance.state.referencia, nextRecord.referenciaEquipo); assert.equal(instance.state.registroVendedor.serialImei, nextImei);
});

test('contado oculta financiación sin alterar caja y permite ingreso cero registrado cuando corresponda', async () => {
  const row = { ...record, plataformaCredito: 'CONTADO', financierasDetalle: [], medioPago1Tipo: 'EFECTIVO', medioPago1Valor: '0', cuotaInicial: '0' };
  const instance = probe({ row }); const tree = await instance.settle();
  assert.equal(instance.state.ingreso1Base, '0'); assert.equal(instance.view.mostrarFinancieras, false);
  assert.equal(instance.view.totalFinancierasNetas, 0); assert.equal(instance.view.totalIngresosNetos, 0); assert.equal(instance.view.cajaOficina, 0);
  assert.equal(instance.view.utilidad, -inventory.costo); assert.equal(approve(tree).props.disabled, false);
});
