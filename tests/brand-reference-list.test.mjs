import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function compile(relative) {
  return ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
}
const helperModule = { exports: {} };
new Function('require', 'module', 'exports', compile('../lib/reference-sales-ranking.ts'))(() => { throw new Error('Unexpected helper import'); }, helperModule, helperModule.exports);
const compiled = compile('../app/dashboard/top-marcas-vendidas/brand-reference-list.tsx');
const fixture = () => Array.from({ length: 17 }, (_, index) => ({ nombre: index === 15 ? 'MÓDELO   Prueba 16' : `REFERENCIA QA ${String(index + 1).padStart(2, '0')}`, total: 17 - index, porcentaje: index === 15 ? 7.345 : (17 - index) / 153 * 100 }));

function environment(initialItems = fixture(), label = 'OTRAS MARCAS') {
  const slots = [];
  let cursor = 0;
  let tree;
  let items = initialItems;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useMemo(callback) { return callback(); },
    useId() { const index = cursor++; if (!(index in slots)) slots[index] = `qa-search-${index}`; return slots[index]; },
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const componentModule = { exports: {} };
  const requireMock = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === '@/lib/reference-sales-ranking') return helperModule.exports;
    if (name.includes('dashboard-icon')) return { __esModule: true, default: 'icon' };
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    throw new Error('Unexpected component import: ' + name);
  };
  new Function('require', 'module', 'exports', compiled)(requireMock, componentModule, componentModule.exports);
  const Component = componentModule.exports.default;
  function render(nextItems) { if (nextItems) items = nextItems; cursor = 0; tree = Component({ items, label }); return tree; }
  function all(node = tree, list = []) { if (node == null || typeof node === 'boolean') return list; if (Array.isArray(node)) { node.forEach(item => all(item, list)); return list; } if (typeof node === 'object') { list.push(node); if (node.props?.children !== undefined) all(node.props.children, list); } return list; }
  function text(node = tree) { if (node == null || typeof node === 'boolean') return ''; if (Array.isArray(node)) return node.map(text).join(''); if (typeof node === 'object') return node.props?.children === undefined ? '' : text(node.props.children); return String(node); }
  function one(predicate) { const node = all().find(predicate); assert.ok(node, 'Missing node. Rendered: ' + text()); return node; }
  function button(name) { return one(node => node.type === 'button' && text(node) === name); }
  function search(value) { one(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value } }); render(); }
  function rows() { return all(one(node => node.type === 'tbody')).filter(node => node.type === 'tr'); }
  render();
  return { render, all, text, one, button, search, rows };
}

test('pagina todas las 17 referencias en grupos de 10 y conserva el orden del servidor', () => {
  const env = environment();
  assert.equal(env.rows().length, 10);
  assert.ok(env.text().includes('REFERENCIA QA 01'));
  assert.ok(env.text().includes('REFERENCIA QA 10'));
  assert.ok(!env.text().includes('REFERENCIA QA 11'));
  assert.equal(env.button('Anterior').props.disabled, true);
  assert.equal(env.button('Siguiente').props.disabled, false);
  env.button('Siguiente').props.onClick(); env.render();
  assert.equal(env.rows().length, 7);
  assert.ok(env.text().includes('REFERENCIA QA 11'));
  assert.ok(env.text().includes('REFERENCIA QA 17'));
  assert.ok(env.text().includes('Mostrando 11–17 de 17 referencias'));
  assert.equal(env.button('Siguiente').props.disabled, true);
});

test('la búsqueda incluye referencias de otras páginas, normaliza tildes y espacios y vuelve a la primera página', () => {
  const env = environment();
  env.button('Siguiente').props.onClick(); env.render();
  env.search('   modelo   prueba 16  ');
  assert.equal(env.rows().length, 1);
  assert.ok(env.text().includes('MÓDELO   Prueba 16'));
  assert.ok(env.text().includes('Mostrando 1–1 de 1 referencias'));
  assert.ok(env.text().includes('Página 1 de 1'));
  assert.equal(env.button('Anterior').props.disabled, true);
  env.search('');
  assert.equal(env.rows().length, 10);
  assert.ok(env.text().includes('REFERENCIA QA 01'));
});

test('muestra las unidades y participación recibidas sin recalcular el porcentaje de la búsqueda', () => {
  const items = fixture();
  const before = JSON.stringify(items);
  items.forEach(Object.freeze); Object.freeze(items);
  const env = environment(items, 'ELECTRODOMÉSTICOS');
  env.search('modelo prueba 16');
  const cells = env.all(env.rows()[0]).filter(node => node.type === 'td');
  assert.equal(env.text(cells[0]), '2');
  assert.equal(env.text(cells[1]), '7,3%');
  assert.ok(env.text().includes('Participación dentro de electrodomésticos'));
  assert.equal(env.one(node => node.type === 'section').props['aria-label'], 'Referencias de ELECTRODOMÉSTICOS');
  assert.equal(JSON.stringify(items), before);
});

test('sin referencias y sin coincidencias muestra estados vacíos y controles deshabilitados coherentes', () => {
  const empty = environment([]);
  assert.ok(empty.text().includes('No hay referencias vendidas en este grupo para la consulta.'));
  assert.ok(empty.text().includes('0 referencias'));
  assert.equal(empty.button('Anterior').props.disabled, true);
  assert.equal(empty.button('Siguiente').props.disabled, true);
  const env = environment(); env.search('no existe');
  assert.ok(env.text().includes('No hay referencias que coincidan con la búsqueda.'));
  assert.ok(env.text().includes('Página 1 de 1'));
  assert.equal(env.button('Anterior').props.disabled, true);
  assert.equal(env.button('Siguiente').props.disabled, true);
});

test('si la consulta recibida reduce el listado, la página se ajusta sin dejar registros ocultos', () => {
  const env = environment();
  env.button('Siguiente').props.onClick(); env.render();
  env.render([{ nombre: 'ZTE QA ÚNICA', total: 8, porcentaje: 100 }]);
  assert.equal(env.rows().length, 1);
  assert.ok(env.text().includes('ZTE QA ÚNICA'));
  assert.ok(env.text().includes('Página 1 de 1'));
});

