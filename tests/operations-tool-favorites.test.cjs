/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS VM harness loads the transpiled component without application dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve('app/dashboard/_components/operations-tool-center.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const states = [];
let index = 0;
let dirty = false;
let effects = [];
let frames = new Map();
let nextFrame = 1;
const store = new Map();
const writes = [];
let storageBlocked = false;
const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const react = {
  useRef(value) { const i = index++; return states[i] ||= { current: value }; },
  useId() { const i = index++; return states[i] ||= 'tools-qa'; },
  useState(value) {
    const i = index++;
    if (!(i in states)) states[i] = typeof value === 'function' ? value() : value;
    return [states[i], update => {
      const next = typeof update === 'function' ? update(states[i]) : update;
      if (!Object.is(next, states[i])) { states[i] = next; dirty = true; }
    }];
  },
  useMemo(factory, deps) {
    const i = index++;
    if (!states[i] || !same(states[i].deps, deps)) states[i] = { deps, value: factory() };
    return states[i].value;
  },
  useEffect(callback, deps) {
    const i = index++;
    if (!states[i] || !same(states[i].deps, deps)) {
      if (states[i]?.cleanup) effects.push(states[i].cleanup);
      states[i] = { deps };
      effects.push(() => { states[i].cleanup = callback(); });
    }
  },
};
const makeElement = (type, props, key) => ({ type, props: props || {}, key });
const exportsObject = {};
vm.runInNewContext(code, {
  exports: exportsObject,
  require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: makeElement, jsxs: makeElement };
    if (name === 'next/link') return { __esModule: true, default: 'Link' };
    if (name === './dashboard-icon') return { __esModule: true, default: 'Icon' };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw Error(name);
  },
  window: {
    localStorage: {
      getItem(key) { if (storageBlocked) throw Error('blocked'); return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { if (storageBlocked) throw Error('blocked'); writes.push([key, value]); store.set(key, value); },
    },
    requestAnimationFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener() {}, removeEventListener() {},
  },
});
const component = exportsObject.default;
const groups = [{ title: 'Inventario y préstamos', description: 'Inventario autorizado', icon: 'inventory', links: [{ href: '/inventario-principal', label: 'Bodega principal' }] }, { title: 'Registro comercial', description: 'Ventas autorizadas', icon: 'sales', links: [{ href: '/ventas/nueva', label: 'Registrar venta' }] }];
const id = (group, href, label) => `${group}::${href}::${label}`;
const bodega = id(groups[0].title, groups[0].links[0].href, groups[0].links[0].label);
const venta = id(groups[1].title, groups[1].links[0].href, groups[1].links[0].label);
const key = user => `conectamos:centro-herramientas:favoritos:${user}`;
let props;
let tree;
function render(next = props) { props = next; index = 0; dirty = false; tree = component(props); return tree; }
function settle() {
  for (let i = 0; i < 10; i++) {
    const tasks = effects; effects = []; tasks.forEach(task => task());
    const raf = [...frames.values()]; frames = new Map(); raf.forEach(task => task());
    if (!dirty) return;
    render();
  }
  throw Error('render loop');
}
function nodes(node) {
  if (arguments.length === 0) node = tree;
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
function frequent() { return nodes().find(n => n.props['aria-label'] === 'Accesos frecuentes'); }
function reset() { states.length = 0; frames.clear(); effects = []; store.clear(); writes.length = 0; storageBlocked = false; }

reset();
store.set(key('ana perez'), JSON.stringify([id('Antigua categoría', '/inventario-principal', 'Bodega principal'), 'No autorizado::/admin/secreto::Secreto']));
render({ groups, storageUserKey: '7:12', legacyStorageUserKey: 'Ana Pérez' }); settle();
assert.deepEqual(JSON.parse(store.get(key('7:12'))), [bodega]);
assert.equal(nodes(frequent()).filter(n => n.type === 'Link').length, 1);
assert.equal(store.get(key('ana perez')).includes('No autorizado'), true);

reset();
store.set(key('7:12'), '[]');
store.set(key('ana perez'), JSON.stringify([venta]));
render({ groups, storageUserKey: '7:12', legacyStorageUserKey: 'Ana Pérez' }); settle();
assert.deepEqual(JSON.parse(store.get(key('7:12'))), []);
assert.equal(nodes(frequent()).filter(n => n.type === 'Link').length, 0);

reset();
render({ groups, storageUserKey: '7:12', legacyStorageUserKey: 'Ana Pérez' }); settle();
assert.deepEqual(JSON.parse(store.get(key('7:12'))), [venta, bodega]);
const nav = nodes().find(n => n.type === 'nav');
let focused = 0;
nav.props.ref.current = { querySelector: () => ({ focus(options) { assert.equal(options.preventScroll, true); focused++; } }) };
nodes(frequent()).find(n => typeof n.props.onToggle === 'function').props.onToggle(); settle();
assert.deepEqual(JSON.parse(store.get(key('7:12'))), [bodega]);
assert.equal(focused, 1);
nodes().find(n => typeof n.props.onToggle === 'function' && n.props.label === 'Bodega principal' && !nodes(frequent()).includes(n)).props.onToggle(); settle();
assert.deepEqual(JSON.parse(store.get(key('7:12'))), []);

store.set(key('9:14'), JSON.stringify([venta]));
const before = writes.length;
render({ groups, storageUserKey: '9:14', legacyStorageUserKey: 'Otra persona' });
const disabled = nodes().find(n => typeof n.props.onToggle === 'function');
assert.equal(disabled.props.disabled, true);
disabled.props.onToggle();
assert.equal(writes.length, before);
settle();
assert.deepEqual(JSON.parse(store.get(key('9:14'))), [venta]);
assert.deepEqual(JSON.parse(store.get(key('7:12'))), []);
assert.ok(writes.slice(before).every(([storage]) => storage === key('9:14')));

reset();
storageBlocked = true;
render({ groups, storageUserKey: '7:12', legacyStorageUserKey: 'Ana Pérez' }); settle();
assert.equal(nodes(frequent()).filter(n => n.type === 'Link').length, 2);
assert.equal(nodes().filter(n => typeof n.props.onToggle === 'function').every(n => !n.props.disabled), true);

reset();
const payjoyLinks = [
  { href: '/vendedor/payjoy/extensiones', icon: 'clock', label: 'Extensiones PayJoy' },
];
const payjoyGroups = [{ title: 'Registro comercial', description: 'PayJoy autorizado', icon: 'sales', links: payjoyLinks }];
render({ groups: payjoyGroups, quickActions: payjoyLinks, storageUserKey: 'auditor:qa' }); settle();
const quick = nodes().find(n => n.props['aria-label'] === 'Acciones rápidas');
assert.deepEqual(nodes(quick).filter(n => n.type === 'Link').map(n => n.props.href), payjoyLinks.map(link => link.href));
for (const link of payjoyLinks) {
  nodes().find(n => n.type === 'input').props.onChange({ target: { value: link.label } }); settle();
  assert.ok(nodes().some(n => n.type === 'Link' && n.props.href === link.href));
  nodes().find(n => typeof n.props.onToggle === 'function' && n.props.label === link.label).props.onToggle(); settle();
}
assert.deepEqual(nodes(frequent()).filter(n => n.type === 'Link').map(n => n.props.href), payjoyLinks.map(link => link.href));
assert.deepEqual(JSON.parse(store.get(key('auditor:qa'))), payjoyLinks.map(link => id('Registro comercial', link.href, link.label)));
render({ groups, quickActions: [], storageUserKey: 'auditor:qa' }); settle();
assert.ok(nodes().filter(n => n.type === 'Link').every(n => !n.props.href.startsWith('/vendedor/payjoy/')));

reset();
const renamedGroups = [...payjoyGroups, {
  title: 'Rutas ambiguas QA', description: 'No deben migrar por URL sola', icon: 'sales',
  links: [{ href: '/ruta-ambigua', label: 'Destino uno' }, { href: '/ruta-ambigua', label: 'Destino dos' }],
}];
store.set(key('auditor:qa'), JSON.stringify([
  id('Registro comercial', '/vendedor/payjoy/credito', 'Crédito y seguimiento PayJoy'),
  id('Registro comercial', '/vendedor/payjoy/credito?tab=seguimiento', 'Seguimiento anterior'),
  id('Registro comercial', '/vendedor/payjoy/seguimiento', 'Seguimiento de extensiones'),
  id('Categoría anterior', '/vendedor/payjoy/extensiones', 'Extensiones PayJoy'),
  id('Antes', '/ruta-ambigua', 'Nombre anterior'),
  id('No autorizado', '/admin/secreto', 'Secreto'),
  id('Registro comercial', '/vendedor/payjoy/credito?tab=ausente', 'Ficha antigua'),
]));
render({ groups: renamedGroups, storageUserKey: 'auditor:qa' }); settle();
const extension = payjoyLinks[0];
assert.deepEqual(JSON.parse(store.get(key('auditor:qa'))), [id('Registro comercial', extension.href, extension.label)]);
assert.deepEqual(nodes(frequent()).filter(n => n.type === 'Link').map(n => n.props.href), [extension.href]);
assert.ok(nodes().filter(n => n.type === 'Link').every(n => !/^\/vendedor\/payjoy\/(?:credito|seguimiento)/.test(n.props.href)));

reset();
const legacyFollowUp = id('Registro comercial', '/vendedor/payjoy/credito?tab=seguimiento', 'Seguimiento de extensiones');
store.set(key('auditor:qa'), JSON.stringify([legacyFollowUp]));
render({ groups, storageUserKey: 'auditor:qa' }); settle();
assert.deepEqual(JSON.parse(store.get(key('auditor:qa'))), []);
assert.ok(nodes().filter(n => n.type === 'Link').every(n => !n.props.href.startsWith('/vendedor/payjoy/')));

reset();
store.set(key('auditor:qa'), JSON.stringify([
  legacyFollowUp,
  id('Registro comercial', '/vendedor/payjoy/seguimiento', 'Seguimiento de extensiones'),
  id('Registro comercial', '/vendedor/payjoy/credito', 'Ficha del crédito PayJoy'),
]));
render({ groups: payjoyGroups, storageUserKey: 'auditor:qa' }); settle();
assert.deepEqual(JSON.parse(store.get(key('auditor:qa'))), []);
assert.equal(nodes(frequent()).filter(n => n.type === 'Link').length, 0);

console.log('PASS: legacy migration + authorized IDs, new empty key precedence, defaults, remove/add persistence and focus, user switch isolation, blocked storage fallback, PayJoy extension favorites preserved, removed ficha/seguimiento favorites disappear without creating replacement favorites, missing/ambiguous routes remain hidden.');
