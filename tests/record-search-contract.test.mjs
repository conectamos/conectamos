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
const workspacePath = process.env.RECORD_TEST_SOURCE || 'app/vendedor/registros/buscar/workspace.tsx';
const baseline = Boolean(process.env.RECORD_TEST_SOURCE);
const css = { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
const nullComponent = { __esModule: true, default: () => null };
const session = { nombre: 'Ana QA', sedeNombre: 'SEDE 1', rolNombre: 'ADMIN', perfilNombre: 'Perfil QA', perfilTipoLabel: 'Administrador' };
const record = {
  id: 51, createdAt: '2026-10-07T15:45:00.000Z', updatedAt: '2026-10-08T17:20:00.000Z', ciudad: 'Ciudad QA',
  puntoVenta: 'SEDE 1', sedeNombre: 'SEDE 1', clienteNombre: 'Cliente QA Completo', tipoDocumento: 'CC', documentoNumero: '001110444117',
  plataformaCredito: 'PAYJOY', financierasDetalle: [
    { plataformaCredito: 'PAYJOY', creditoAutorizado: 1234567.89, cuotaInicial: 123456.75, tipoPagoInicial: 'EFECTIVO', valorCuota: 22222.5, numeroCuotas: 13, frecuenciaCuota: 'MENSUAL' },
    { plataformaCredito: 'SUMASPAY', creditoAutorizado: 550000, cuotaInicial: 0, tipoPagoInicial: 'TRANSFERENCIA', valorCuota: 55000, numeroCuotas: 10, frecuenciaCuota: 'QUINCENAL' },
  ],
  aceptaDeclaracionIntermediacion: true, aceptaPoliticaGarantia: false, aceptaCondicionesCredito: true, dobleCredito: true,
  observacion: 'Observación exclusiva QA', referenciaEquipo: 'SAMSUNG GALAXY A17', almacenamiento: '256 GB', color: 'Violeta QA',
  serialImei: '0035642010001001', tipoEquipo: 'NUEVO', tipoProducto: 'TELEFONÍA', creditoAutorizado: 1234567.89, cuotaInicial: 123456.75,
  valorCuota: 22222.5, numeroCuotas: 13, frecuenciaCuota: 'MENSUAL', correo: 'qa@example.test', whatsapp: '03014023903', telefono: '03014023904',
  fechaNacimiento: '2000-01-20', fechaExpedicion: '2018-03-23', direccion: 'Dirección QA 77', barrio: 'Barrio QA 88',
  referenciaFamiliar1Nombre: 'Contacto Uno QA', referenciaFamiliar1Telefono: '03111111111', referenciaFamiliar2Nombre: 'Contacto Dos QA', referenciaFamiliar2Telefono: '03222222222',
  simCardRegistro1: '89010000000000000001', simCardRegistro2: '89010000000000000002', medioPago1Tipo: 'EFECTIVO', medioPago1Valor: 150000.5,
  medioPago2Tipo: 'TRANSFERENCIA', medioPago2Valor: 50000.25, asesorNombre: 'Asesor QA 99', jaladorNombre: 'Jalador QA 100', cerradorNombre: 'Cerrador QA 101',
  numeroFactura: 'FACT-QA-102', estadoFacturacion: 'PENDIENTE FACTURA QA', estadoVentaRegistro: 'PENDIENTE', ventaIdRelacionada: null,
  firmaClienteDataUrl: '/qa/firma.svg', fotoEntregaDataUrl: '/qa/entrega.svg', facturaFotoDataUrl: '/qa/factura.svg',
  cedulaFrenteDataUrl: '/qa/frente.svg', cedulaReversoDataUrl: '/qa/reverso.svg', clienteSinCedulaFisica: false, confirmacionCliente: true,
  perfilVendedorNombre: 'Perfil vendedor QA', perfilVendedorTipo: 'VENDEDOR', catalogoEquipo: null,
};

function load(source, imports, injected, transform = value => value, sourceText) {
  const output = ts.transpileModule(transform(sourceText ?? readFileSync(join(ROOT, source), 'utf8')), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(injected), output)(name => {
    if (name === 'react/jsx-runtime') return jsx;
    if (name.endsWith('.module.css')) return css;
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, module, module.exports, ...Object.values(injected));
  return module.exports;
}

function workspaceProbe({ initial = {}, user = session, response = { ok: true, data: { resultados: [record] } }, fetchImpl, confirmation = true } = {}) {
  const text = readFileSync(join(ROOT, workspacePath), 'utf8');
  const ast = ts.createSourceFile(workspacePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(entry => entry.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(component?.body);
  const stateNames = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap(entry =>
    ts.isArrayBindingPattern(entry.name) && entry.initializer && ts.isCallExpression(entry.initializer) && entry.initializer.expression.getText(ast) === 'useState' ? [entry.name.elements[0].name.getText(ast)] : []) : []);
  const captureNames = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text) : []);
  const lastReturn = component.body.statements.find(ts.isReturnStatement);
  assert.ok(lastReturn);
  const state = { resultados: [record], buscando: false, busquedaRealizada: true, ...initial };
  const calls = []; const confirmations = []; const effects = []; let cursor = 0; let captured;
  const hooks = {
    useState(value) { const name = stateNames[cursor++]; assert.ok(name, 'Estado inesperado'); if (!(name in state)) state[name] = typeof value === 'function' ? value() : value; return [state[name], next => { state[name] = typeof next === 'function' ? next(state[name]) : next; }]; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => { effects.push(fn); },
  };
  const imports = { react: hooks, 'next/link': { __esModule: true, default: ({ children, ...props }) => jsx.jsx('a', { ...props, children }) }, 'next/image': nullComponent };
  for (const statement of ast.statements.filter(ts.isImportDeclaration)) {
    const name = statement.moduleSpecifier.text;
    if (name in imports || name.endsWith('.module.css')) continue;
    const mock = { ...nullComponent }; const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) mock[entry.propertyName?.text ?? entry.name.text] = () => null;
    imports[name] = mock;
  }
  const Workspace = load(workspacePath, imports, {
    __capture: value => { captured = value; },
    window: { confirm: message => { confirmations.push(message); return confirmation; } },
    fetch: async (url, options) => { calls.push({ url, options }); const result = fetchImpl ? await fetchImpl(url, options) : response; return { ok: result.ok, json: async () => result.data }; },
  }, source => `${source.slice(0, lastReturn.getStart(ast))}__capture({${captureNames.join(',')}});\n${source.slice(lastReturn.getStart(ast))}`, text).default;
  const render = () => { cursor = 0; const tree = Workspace({ session: user }); return { tree, view: captured }; };
  render();
  return { state, calls, confirmations, effects, render, get view() { return captured; } };
}
function elements(node) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== 'object') return [node];
  if (typeof node.type === 'function') return [node, ...elements(node.type(node.props))];
  return [node, ...elements(node.props?.children)];
}
function textOf(tree) { return elements(tree).filter(x => typeof x === 'string' || typeof x === 'number').join(''); }
function control(tree, predicate) { const found = elements(tree).find(x => typeof x === 'object' && predicate(x)); assert.ok(found, 'Control esperado no disponible'); return found; }

test('buscar normaliza IMEI o cédula a dígitos completos y conserva no-store y el endpoint existente', async () => {
  for (const busqueda of [' 00.356-420 1000 1001 ', 'CC 001.110.444.117']) {
    const probe = workspaceProbe({ initial: { busqueda, resultados: [] } });
    await probe.view.buscarRegistros();
    assert.deepEqual(probe.calls, [{ url: `/api/vendedor/registros?buscar=${busqueda.replace(/\D/g, '')}`, options: { cache: 'no-store' } }]);
    assert.deepEqual(probe.state.resultados, [record]); assert.equal(probe.state.mensajeTipo, 'success');
    assert.equal(probe.state.buscando, false); assert.equal(probe.state.busquedaRealizada, true);
  }
});
test('una búsqueda vacía o sin dígitos no consulta el servidor y conserva la validación', async () => {
  for (const busqueda of ['', '  ', 'abc IMEI']) {
    const probe = workspaceProbe({ initial: { busqueda } }); await probe.view.buscarRegistros();
    assert.equal(probe.calls.length, 0); assert.equal(probe.state.mensajeTipo, 'error'); assert.match(probe.state.mensaje, /Debes ingresar un IMEI o una cédula/);
  }
});
test('HTTP fallido, resultado vacío y error de red conservan mensajes y descartan resultados obsoletos', async () => {
  for (const options of [
    { response: { ok: false, data: { error: 'No autorizado QA' } }, expected: 'No autorizado QA' },
    { response: { ok: false, data: {} }, expected: 'No se pudo consultar el registro.' },
    { response: { ok: true, data: { resultados: [] } }, expected: 'No se encontraron registros con ese IMEI o cédula.' },
    { response: { ok: true, data: { resultados: null } }, expected: 'No se encontraron registros con ese IMEI o cédula.' },
    { fetchImpl: async () => { throw Error('Sin red'); }, expected: 'Error consultando el registro.' },
  ]) {
    const probe = workspaceProbe({ ...options, initial: { busqueda: '123' } }); await probe.view.buscarRegistros();
    assert.deepEqual(probe.state.resultados, []); assert.equal(probe.state.mensajeTipo, 'error'); assert.equal(probe.state.mensaje, options.expected); assert.equal(probe.state.buscando, false);
  }
});
test('durante la consulta el botón queda deshabilitado; la respuesta recupera el estado', async () => {
  let resolveResponse; const waiting = new Promise(resolve => { resolveResponse = resolve; });
  const probe = workspaceProbe({ initial: { busqueda: '123', resultados: [] }, fetchImpl: () => waiting });
  const request = probe.view.buscarRegistros(); assert.equal(probe.state.buscando, true);
  const tree = probe.render().tree;
  assert.equal(control(tree, node => node.type === 'button' && /Buscando/.test(textOf(node))).props.disabled, true);
  resolveResponse({ ok: true, data: { resultados: [record] } }); await request; assert.equal(probe.state.buscando, false);
});
test('limpiar reinicia búsqueda, resultados, mensaje y consulta realizada', () => {
  const probe = workspaceProbe({ initial: { busqueda: '123', mensaje: 'Anterior' } }); probe.view.limpiarBusqueda();
  assert.equal(probe.state.busqueda, ''); assert.deepEqual(probe.state.resultados, []); assert.equal(probe.state.mensaje, ''); assert.equal(probe.state.busquedaRealizada, false);
});
test('solo ADMIN ve eliminar; AUDITOR y supervisor conservan navegación y acceso a modificar', () => {
  for (const rolNombre of [' ADMIN ', 'auditor', 'SUPERVISOR']) {
    const probe = workspaceProbe({ user: { ...session, rolNombre } }); const tree = probe.render().tree;
    const isAdmin = rolNombre.trim().toUpperCase() === 'ADMIN'; const privileged = rolNombre.toUpperCase() !== 'SUPERVISOR';
    assert.equal(probe.view.puedeEliminar, isAdmin); assert.equal(probe.view.esAdministrador, privileged);
    assert.equal(elements(tree).some(node => node?.type === 'button' && textOf(node) === 'Eliminar'), isAdmin);
    assert.ok(elements(tree).some(node => node?.type === 'a' && node.props.href === '/vendedor/registros?editar=51'));
    const routes = probe.view.navigationItems.map(item => item.href);
    for (const route of ['/dashboard', '/ventas', '/inventario', '/prestamos', '/caja', '/dashboard/aprobaciones', '/dashboard/reportes']) assert.ok(routes.includes(route));
    assert.equal(routes.includes('/dashboard/sedes'), privileged);
  }
});
test('eliminar solicita la confirmación original, cancela sin escribir y envía PATCH idéntico al confirmar', async () => {
  const cancelled = workspaceProbe({ confirmation: false }); await cancelled.view.eliminarRegistro(51);
  assert.equal(cancelled.calls.length, 0); assert.equal(cancelled.confirmations.length, 1); assert.match(cancelled.confirmations[0], /Vas a eliminar este registro/);
  const probe = workspaceProbe({ response: { ok: true, data: { mensaje: 'Borrado QA' } }, initial: { resultados: [record, { ...record, id: 52 }] } });
  await probe.view.eliminarRegistro(51);
  assert.deepEqual(probe.calls, [{ url: '/api/vendedor/registros', options: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 51, modo: 'ELIMINAR' }) } }]);
  assert.deepEqual(probe.state.resultados.map(item => item.id), [52]); assert.equal(probe.state.mensaje, 'Borrado QA'); assert.equal(probe.state.eliminandoId, null);
});
test('si la eliminación falla conserva el registro y presenta el error', async () => {
  for (const options of [
    { response: { ok: false, data: { error: 'Permiso denegado QA' } }, expected: 'Permiso denegado QA' },
    { fetchImpl: async () => { throw Error('Sin red'); }, expected: 'Error eliminando el registro.' },
  ]) {
    const probe = workspaceProbe(options); await probe.view.eliminarRegistro(51);
    assert.deepEqual(probe.state.resultados, [record]); assert.equal(probe.state.mensaje, options.expected); assert.equal(probe.state.mensajeTipo, 'error'); assert.equal(probe.state.eliminandoId, null);
  }
});
test('nombre, documento textual, IMEI completo, teléfonos y todos los datos principales permanecen visibles', () => {
  const tree = workspaceProbe().render().tree; const text = textOf(tree);
  for (const key of ['clienteNombre', 'documentoNumero', 'serialImei', 'correo', 'whatsapp', 'telefono', 'ciudad', 'direccion', 'barrio', 'referenciaEquipo', 'almacenamiento', 'color', 'tipoEquipo', 'tipoProducto', 'asesorNombre', 'jaladorNombre', 'cerradorNombre', 'simCardRegistro1', 'simCardRegistro2', 'observacion']) assert.ok(text.includes(record[key]), `Dato perdido: ${key}`);
  assert.ok(text.includes('Datos del cliente')); assert.ok(text.includes('Equipo y trámite'));
  assert.ok(!text.includes('3.564.201.000.1001'), 'El IMEI no se formatea como número');
});
test('conserva todos los ingresos, financieras, importes completos y decimales', () => {
  const text = textOf(workspaceProbe().render().tree);
  for (const label of ['Información financiera', 'Ingreso 1', 'Valor ingreso 1', 'Ingreso 2', 'Valor ingreso 2', 'Crédito autorizado', 'Inicial', 'Pago inicial', 'Valor cuota', 'Plazo', 'Frecuencia']) assert.ok(text.includes(label), label);
  for (const value of ['PAYJOY', 'SUMASPAY', '1.234.567,89', '123.456,75', '150.000,5', '50.000,25', '22.222,5', '550.000', 'MENSUAL', 'QUINCENAL', '13 cuotas', '10 cuotas']) assert.ok(text.includes(value), value);
  const legacy = { ...record, financierasDetalle: null };
  const legacyText = textOf(workspaceProbe({ initial: { resultados: [legacy] } }).render().tree);
  assert.ok(legacyText.includes('PAYJOY')); assert.ok(legacyText.includes('1.234.567,89'));
});
test('referencias, aceptaciones y documentos inferiores conservan ambas ramas financiera y contado', () => {
  let tree = workspaceProbe().render().tree; let text = textOf(tree);
  for (const key of ['referenciaFamiliar1Nombre', 'referenciaFamiliar1Telefono', 'referenciaFamiliar2Nombre', 'referenciaFamiliar2Telefono']) assert.ok(text.includes(record[key]), key);
  for (const label of ['Referencias y validaciones', 'Acepta intermediación', 'Acepta política de garantía', 'Acepta condiciones de crédito', 'Confirmación del cliente', 'Documentos adjuntos']) assert.ok(text.includes(label), label);
  const images = elements(tree).filter(node => node?.type === 'img').map(node => node.props.src);
  for (const key of ['firmaClienteDataUrl', 'fotoEntregaDataUrl', 'cedulaFrenteDataUrl', 'cedulaReversoDataUrl']) assert.ok(images.includes(record[key]), key);
  assert.ok(!images.includes(record.facturaFotoDataUrl));
  tree = workspaceProbe({ initial: { resultados: [{ ...record, plataformaCredito: ' contado ' }] } }).render().tree;
  const cashImages = elements(tree).filter(node => node?.type === 'img').map(node => node.props.src);
  assert.ok(cashImages.includes(record.facturaFotoDataUrl)); assert.ok(!cashImages.includes(record.cedulaFrenteDataUrl));
  tree = workspaceProbe({ initial: { resultados: [{ ...record, clienteSinCedulaFisica: true }] } }).render().tree;
  text = textOf(tree); assert.ok(text.includes('Cliente reportado sin cédula física.'));
  assert.ok(!elements(tree).some(node => node?.type === 'img' && node.props.src === record.cedulaFrenteDataUrl));
});
test('inconsistencias y registrar venta siguen abriendo las rutas originales', () => {
  const tree = workspaceProbe().render().tree;
  for (const href of ['/vendedor/registros/inconsistencias', '/vendedor/registros']) assert.ok(elements(tree).some(node => node?.type === 'a' && node.props.href === href));
});
test('la sede filtra solo los resultados autorizados recibidos sin consultar otro alcance', { skip: baseline }, () => {
  const second = { ...record, id: 52, puntoVenta: 'SEDE 2', sedeNombre: 'SEDE 2' };
  const probe = workspaceProbe({ initial: { resultados: [record, second], sedeFiltro: 'SEDE 2', busqueda: '00123' } });
  const text = textOf(probe.render().tree);
  assert.ok(text.includes('Registro #52')); assert.ok(!text.includes('Registro #51')); assert.equal(probe.calls.length, 0);
  assert.equal(probe.state.busqueda, '00123'); assert.deepEqual(probe.state.resultados, [record, second]);
});
test('el rediseño conserva la búsqueda y la sede durante eliminación y actualización de resultados', { skip: baseline }, async () => {
  const probe = workspaceProbe({ initial: { busqueda: '00123', sedeFiltro: 'SEDE 1' } });
  await probe.view.buscarRegistros(); assert.equal(probe.state.busqueda, '00123'); assert.equal(probe.state.sedeFiltro, 'SEDE 1');
  await probe.view.eliminarRegistro(51); assert.equal(probe.state.busqueda, '00123'); assert.equal(probe.state.sedeFiltro, 'SEDE 1');
});

test('la cédula se presenta sin puntos ni espacios y mantiene los ceros iniciales', { skip: baseline }, () => {
  const text = textOf(workspaceProbe({ initial: { resultados: [{ ...record, documentoNumero: '00 111.044.4117' }] } }).render().tree);
  assert.ok(text.includes('001110444117')); assert.ok(!text.includes('00 111.044.4117'));
});
test('nacimiento y expedición conservan la fecha calendario aunque cambie la zona horaria del equipo', { skip: baseline }, () => {
  const previousTimeZone = process.env.TZ;
  try {
    for (const timeZone of ['UTC', 'America/Bogota', 'Pacific/Honolulu', 'Asia/Tokyo']) {
      process.env.TZ = timeZone;
      const tree = workspaceProbe({ initial: { resultados: [{ ...record, fechaNacimiento: '2004-07-20T00:00:00.000Z', fechaExpedicion: '2022-03-23T00:00:00.000Z' }] } }).render().tree;
      const birth = control(tree, node => typeof node.type === 'function' && node.props.label === 'Fecha de nacimiento');
      const issue = control(tree, node => typeof node.type === 'function' && node.props.label === 'Fecha de expedición');
      assert.equal(birth.props.value, '20/7/2004', `Nacimiento desplazado en ${timeZone}`);
      assert.equal(issue.props.value, '23/3/2022', `Expedición desplazada en ${timeZone}`);
    }
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});
test('una sede sin coincidencias permite recuperar la cobertura sin perder la consulta', { skip: baseline }, () => {
  const probe = workspaceProbe({ initial: { sedeFiltro: 'SEDE SIN RESULTADOS', busqueda: '00123' } });
  const tree = probe.render().tree;
  assert.ok(textOf(tree).includes('No hay coincidencias en esta sede'));
  assert.ok(!textOf(tree).includes('Sin resultados para esta consulta'));
  control(tree, node => node.type === 'button' && textOf(node) === 'Ver toda la cobertura').props.onClick();
  assert.equal(probe.state.sedeFiltro, ''); assert.equal(probe.state.busqueda, '00123'); assert.deepEqual(probe.state.resultados, [record]);
});

const access = load('lib/access-control.ts', {}, {});
const apiUser = { id: 10, sedeId: 1, sedeNombre: 'SEDE 1', perfilId: 17, perfilTipo: 'SUPERVISOR_TIENDA', rolNombre: 'SUPERVISOR' };
const apiRows = [
  { ...record, perfilVendedorId: 17, eliminadoEn: null, perfilVendedor: { nombre: 'Perfil autorizado', tipo: 'VENDEDOR' }, sede: { nombre: 'SEDE 1' }, fechaNacimiento: new Date('2000-01-20'), fechaExpedicion: new Date('2018-03-23') },
  { ...record, id: 52, perfilVendedorId: 18, eliminadoEn: null, puntoVenta: 'SEDE 2', perfilVendedor: { nombre: 'Perfil distinto', tipo: 'VENDEDOR' }, sede: { nombre: 'SEDE 2' }, fechaNacimiento: null, fechaExpedicion: null },
  { ...record, id: 53, perfilVendedorId: 17, eliminadoEn: new Date('2026-10-09'), perfilVendedor: null, sede: null, fechaNacimiento: null, fechaExpedicion: null },
];
function matches(record, where) {
  return Object.entries(where).every(([key, value]) => key === 'OR' ? value.some(part => matches(record, part))
    : value && typeof value === 'object' && 'contains' in value ? String(record[key] || '').includes(value.contains) : record[key] === value);
}
function apiProbe(user = apiUser, { fail = false } = {}) {
  const source = 'app/api/vendedor/registros/route.ts';
  const text = readFileSync(join(ROOT, source), 'utf8');
  const ast = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = {};
  for (const statement of ast.statements.filter(ts.isImportDeclaration)) {
    const mock = { __esModule: true, default: () => undefined }; const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) mock[entry.propertyName?.text ?? entry.name.text] = () => undefined;
    imports[statement.moduleSpecifier.text] = mock;
  }
  const calls = []; const enrichments = [];
  const query = async args => { calls.push(args); if (fail) throw Error('DB failure QA'); return apiRows.filter(row => matches(row, args.where)).slice(0, args.take ?? 99); };
  imports['next/server'] = { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status ?? 200 }) } };
  imports['@/lib/auth'] = { getSessionUser: async () => user };
  imports['@/lib/access-control'] = access;
  imports['@/lib/prisma'] = { __esModule: true, default: { registroVendedorVenta: { findMany: query, findFirst: async args => (await query(args))[0] || null } } };
  imports['@/lib/vendor-profile-schema'] = { ensureVendorProfilesSchema: async () => {} };
  imports['@/lib/vendor-sale-records'].normalizarTextoCorto = value => String(value ?? '').trim() || null;
  imports['@/lib/record-catalog-media'] = { enriquecerRegistrosConCatalogo: async rows => { enrichments.push(rows); return rows.map(row => ({ ...row, catalogoEquipo: null })); } };
  const route = load(source, imports, { console: { error() {}, warn() {} } }, value => value, text);
  return { ...route, calls, enrichments };
}
test('el GET real rechaza falta de sesión y perfiles no habilitados antes de consultar registros', async () => {
  for (const user of [null, { ...apiUser, perfilTipo: 'FACTURADOR' }, { ...apiUser, perfilTipo: 'SUPERVISOR_TIENDA', perfilId: null }, { ...apiUser, perfilTipo: 'VENDEDOR' }, { ...apiUser, perfilTipo: 'APOYO_OPERATIVO' }]) {
    const probe = apiProbe(user); const response = await probe.GET(new Request('http://qa.local/api/vendedor/registros?buscar=003564'));
    assert.equal(response.status, user ? 403 : 401); assert.equal(probe.calls.length, 0); assert.equal(probe.enrichments.length, 0); assert.ok((await response.json()).error);
  }
});
test('el GET real conserva el scope por perfil autorizado y ADMIN/AUDITOR pueden consultar su alcance global', async () => {
  for (const user of [apiUser, { ...apiUser, rolNombre: 'ADMIN', perfilTipo: 'ADMINISTRADOR', perfilId: null }, { ...apiUser, rolNombre: 'AUDITOR', perfilTipo: 'AUDITOR', perfilId: null }]) {
    const probe = apiProbe(user); const response = await probe.GET(new Request('http://qa.local/api/vendedor/registros?buscar=00-3564'));
    assert.equal(response.status, 200); const body = await response.json(); const query = probe.calls[0];
    const privileged = user.rolNombre !== 'SUPERVISOR';
    assert.equal('perfilVendedorId' in query.where, !privileged); if (!privileged) assert.equal(query.where.perfilVendedorId, 17);
    assert.equal(query.where.eliminadoEn, null); assert.deepEqual(query.where.OR, [{ documentoNumero: { contains: '003564' } }, { serialImei: { contains: '003564' } }]);
    assert.deepEqual(query.orderBy, { createdAt: 'desc' }); assert.equal(query.take, 12);
    assert.deepEqual(body.resultados.map(row => row.id), privileged ? [51, 52] : [51]);
    assert.equal(probe.enrichments.length, 1); assert.deepEqual(probe.enrichments[0].map(row => row.id), body.resultados.map(row => row.id));
    for (const row of body.resultados) { assert.equal(row.serialImei, record.serialImei); assert.equal(row.documentoNumero, record.documentoNumero); assert.equal(row.telefono, record.telefono); assert.equal(row.whatsapp, record.whatsapp); }
  }
});
test('consulta por ID mantiene scope y 404, búsqueda inválida devuelve 400, fallo de datos devuelve 500', async () => {
  const scoped = apiProbe(); const missing = await scoped.GET(new Request('http://qa.local/api/vendedor/registros?id=52'));
  assert.equal(missing.status, 404); assert.equal(scoped.calls[0].where.perfilVendedorId, 17); assert.equal(scoped.enrichments.length, 0);
  const found = apiProbe(); const response = await found.GET(new Request('http://qa.local/api/vendedor/registros?id=51'));
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.registro.id, 51); assert.equal(body.registro.serialImei, record.serialImei); assert.equal(body.registro.sedeNombre, 'SEDE 1'); assert.equal(found.enrichments.length, 1);
  const invalid = apiProbe(); assert.equal((await invalid.GET(new Request('http://qa.local/api/vendedor/registros?buscar=abc'))).status, 400); assert.equal(invalid.calls.length, 0);
  const failed = apiProbe(apiUser, { fail: true }); assert.equal((await failed.GET(new Request('http://qa.local/api/vendedor/registros?buscar=003564'))).status, 500); assert.equal(failed.enrichments.length, 0);
});
