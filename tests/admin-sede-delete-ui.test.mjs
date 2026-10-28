import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const jsx = createRequire(import.meta.url)('react/jsx-runtime');
function load(path, imports) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => { assert.ok(name in imports, name); return imports[name]; }, mod, mod.exports);
  return mod.exports;
}
const access = load('lib/access-control.ts', {});
const removalAccess = load('lib/admin-entity-removal-access.ts', { '@/lib/access-control': access });
const source = readFileSync(new URL('../app/dashboard/sedes/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('sedes.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword));
const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
const states = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useState' ? [node.name.elements[0].name.getText(ast)] : []);
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function resolve(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === 'function') return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
function textOf(node) { if (node == null || typeof node === 'boolean') return ''; if (Array.isArray(node)) return node.map(textOf).join(' '); return typeof node === 'object' ? textOf(node.props?.children) : String(node); }
function button(tree, text) { const found = elements(tree).find(node => node.type === 'button' && (node.props['aria-label'] === text || textOf(node).trim() === text)); assert.ok(found, `Falta ${text}`); return found; }
function withoutKey(props) { const result = { ...props }; delete result.key; return result; }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const settle = () => new Promise(done => setImmediate(done));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const administrator = { id: 1, nombre: 'Admin QA', usuario: 'adminqa', sedeId: 1, sedeNombre: 'SEDE CENTRAL QA', rolNombre: 'ADMIN', perfilTipo: 'ADMINISTRADOR' };
const sites = [
  { id: 1, nombre: 'SEDE CENTRAL QA', codigo: 'CENTRAL', activa: true, acceso: { id: 11, usuario: 'centralqa', activo: true } },
  { id: 2, nombre: 'SEDE PARA RETIRAR QA', codigo: 'RETIRAR-QA', activa: true, acceso: { id: 22, usuario: 'retirarqa', activo: true } },
  { id: 3, nombre: 'BODEGA PRINCIPAL', codigo: 'BODEGA-PRINCIPAL', activa: true, acceso: { id: 33, usuario: 'bodegaqa', activo: true } },
  { id: 4, nombre: 'OTRA SEDE QA', codigo: 'OTRA-QA', activa: true, acceso: null },
];
function probe({ user = administrator, target = 2, fetchImpl = async () => response({ ok: true, mensaje: 'Sede eliminada correctamente', sedes: sites.filter(site => site.id !== target) }) } = {}) {
  const state = { user, sedes: structuredClone(sites), cargando: false, editor: target, ediciones: {
    [target]: { nombre: 'BORRADOR SIN GUARDAR QA', codigo: 'QA-EDIT', usuario: 'accesoqa', clave: '', soloInventarioPorCobrar: false, facturacionTipoDocumento: 'NIT' },
  } };
  const refs = []; const calls = []; let cursor = 0; let refCursor = 0;
  const imports = {
    react: {
      useState(initial) { const key = states[cursor++]; assert.ok(key); if (!(key in state)) state[key] = typeof initial === 'function' ? initial() : initial; return [state[key], next => { state[key] = typeof next === 'function' ? next(state[key]) : next; }]; },
      useCallback: fn => fn, useEffect() {}, useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
    },
    'react/jsx-runtime': jsx,
    'next/image': { __esModule: true, default: props => jsx.jsx('img', { src: props.src, alt: props.alt }) },
    'next/link': { __esModule: true, default: props => jsx.jsx('a', withoutKey(props)) },
    '@/app/dashboard/_components/dashboard-icon': { __esModule: true, default: () => null },
    '@/app/ventas/_components/sales-dashboard-parts': { SalesProfile: () => null },
    '@/lib/access-control': access,
    '@/lib/admin-entity-removal-access': removalAccess,
    '@/app/_components/admin-delete-dialog': { __esModule: true, default: props => jsx.jsx('qa-delete-dialog', withoutKey(props)) },
    './sedes.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'fetch', output)(name => { assert.ok(name in imports, `Import inesperado ${name}`); return imports[name]; }, mod, mod.exports, async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null }); return fetchImpl(url, options);
  });
  const ui = {
    state, calls,
    render() { cursor = 0; refCursor = 0; return resolve(mod.exports.default()); },
    dialog() { return elements(this.render()).find(node => node.type === 'qa-delete-dialog'); },
    open() { button(this.render(), 'Eliminar sede').props.onClick(); return this.render(); },
  };
  ui.render(); return ui;
}

test('sedes UI: eliminar exige administrador central y protege bodega y sede de la sesión', () => {
  for (const user of [administrator, { ...administrator, perfilTipo: null }]) {
    const ui = probe({ user }); const tree = ui.render();
    assert.equal(button(tree, 'Eliminar sede').props.disabled, false);
  }
  for (const user of [
    { ...administrator, rolNombre: 'AUDITOR', perfilTipo: 'AUDITOR' },
    { ...administrator, perfilTipo: 'VENDEDOR' },
    { ...administrator, perfilTipo: 'APOYO_OPERATIVO' },
    { ...administrator, perfilTipo: 'SUPERVISOR_TIENDA' },
  ]) {
    const ui = probe({ user });
    assert.equal(elements(ui.render()).some(node => node.type === 'button' && textOf(node).trim() === 'Eliminar sede' && !node.props.disabled), false);
    assert.equal(ui.calls.length, 0);
  }
  for (const target of [1, 3]) {
    const ui = probe({ target });
    assert.equal(elements(ui.render()).some(node => node.type === 'button' && textOf(node).trim() === 'Eliminar sede' && !node.props.disabled), false);
  }
  for (const protectedSite of [
    { nombre: 'Almacén QA', codigo: 'BODEGA-PRINCIPAL' },
    { nombre: 'Almacén QA', codigo: 'PRINCIPAL' },
  ]) {
    const ui = probe({ target: 3 }); Object.assign(ui.state.sedes[2], protectedSite);
    assert.equal(elements(ui.render()).some(node => node.type === 'button' && textOf(node).trim() === 'Eliminar sede' && !node.props.disabled), false);
  }
});

test('sedes UI: abrir y cancelar la confirmación no envía solicitudes ni pierde el borrador', () => {
  const ui = probe(); const before = structuredClone(ui.state.ediciones);
  ui.open(); const dialog = ui.dialog();
  assert.ok(dialog); assert.equal(dialog.props.targetName, sites[1].nombre); assert.equal(dialog.props.entityLabel, 'sede');
  assert.equal(ui.calls.length, 0); dialog.props.onCancel();
  assert.equal(ui.dialog(), undefined); assert.deepEqual(ui.state.ediciones, before);
});

test('sedes UI: confirma una sola eliminación y actualiza listado, resumen y editor solo tras respuesta íntegra', async () => {
  const pending = deferred(); const ui = probe({ fetchImpl: () => pending.promise });
  ui.open(); const confirm = ui.dialog().props.onConfirm;
  confirm(); confirm(); let tree = ui.render();
  assert.equal(ui.calls.length, 1);
  assert.deepEqual(ui.calls[0].body, { sedeId: 2, confirmed: true }); assert.equal(ui.calls[0].options.method, 'DELETE'); assert.equal(ui.calls[0].url, '/api/sedes/admin');
  assert.equal(ui.dialog().props.busy, true); assert.equal(ui.state.sedes.length, 4); assert.equal(ui.state.editor, 2);
  assert.equal(elements(tree).find(node => node.type === 'button' && textOf(node).trim().endsWith('Nueva sede')).props.disabled, true);
  pending.resolve(response({ ok: true, mensaje: 'Sede eliminada correctamente', sedes: sites.filter(site => site.id !== 2) })); await settle(); tree = ui.render();
  assert.equal(ui.dialog(), undefined); assert.equal(ui.state.editor, null); assert.equal(ui.state.sedes.length, 3);
  assert.equal(ui.state.sedes.some(site => site.id === 2), false); assert.match(textOf(tree), /Sede eliminada correctamente/);
  const summary = elements(tree).find(node => node.type === 'section' && node.props['aria-label'] === 'Resumen de sedes');
  assert.match(textOf(summary), /3 Sedes registradas/);
});

test('sedes UI: rechazo por pendientes o fallo de red conserva confirmación, edición y listado para reintentar', async () => {
  for (const fetchImpl of [
    async () => response({ error: 'La sede tiene préstamos pendientes' }, 409),
    async () => { throw Error('Conexión interrumpida QA'); },
    async () => new Response('No disponible', { status: 502 }),
    async () => response({ ok: true }),
    async () => response({ ok: true, sedes: sites }),
  ]) {
    const ui = probe({ fetchImpl }); const before = structuredClone(ui.state.ediciones);
    ui.open(); ui.dialog().props.onConfirm(); await settle(); ui.render();
    assert.ok(ui.dialog()); assert.ok(ui.dialog().props.error); assert.equal(ui.dialog().props.busy, false);
    assert.deepEqual(ui.state.ediciones, before); assert.equal(ui.state.editor, 2); assert.equal(ui.state.sedes.length, 4);
    assert.doesNotMatch(ui.state.mensaje, /eliminada correctamente/i);
    ui.dialog().props.onConfirm(); await settle();
    assert.equal(ui.calls.length, 2); assert.deepEqual(ui.calls[1].body, ui.calls[0].body);
  }
});
