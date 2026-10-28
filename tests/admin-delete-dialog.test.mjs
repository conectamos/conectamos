import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const jsx = createRequire(import.meta.url)('react/jsx-runtime');
const source = readFileSync(new URL('../app/_components/admin-delete-dialog.tsx', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
function resolve(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === 'function') return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
function textOf(node) { if (node == null || typeof node === 'boolean') return ''; if (Array.isArray(node)) return node.map(textOf).join(' '); return typeof node === 'object' ? textOf(node.props?.children) : String(node); }
function button(tree, label) { const node = elements(tree).find(item => item.type === 'button' && (item.props['aria-label'] === label || textOf(item).trim() === label)); assert.ok(node, `Falta botón ${label}`); return node; }
function checkbox(tree) { return elements(tree).find(item => item.type === 'input' && item.props.type === 'checkbox'); }

// Mount the real component and its native dialog refs without a browser, network or database.
function probe(overrides = {}) {
  const calls = { showModal: 0, close: 0, focus: 0, cancel: 0, confirm: 0 };
  const props = { entityLabel: 'sede', targetName: 'SEDE <QA> 0007', busy: false, error: '', onCancel: () => calls.cancel++, onConfirm: () => calls.confirm++, ...overrides };
  const refs = []; const states = []; const effects = []; const cleanup = [];
  let stateCursor = 0; let refCursor = 0; let mounted = false;
  const nativeDialog = { open: false, showModal() { calls.showModal++; this.open = true; }, close() { calls.close++; this.open = false; } };
  const imports = {
    react: {
      useState(initial) { const index = stateCursor++; if (!(index in states)) states[index] = initial; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
      useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
      useEffect(effect) { if (!mounted) effects.push(effect); },
    },
    'react/jsx-runtime': jsx,
    '@/app/dashboard/_components/dashboard-icon': { __esModule: true, default: () => null },
    './admin-delete-dialog.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => { assert.ok(name in imports, name); return imports[name]; }, mod, mod.exports);
  return {
    calls, props, nativeDialog,
    render(next = {}) {
      Object.assign(props, next); stateCursor = 0; refCursor = 0;
      const tree = resolve(mod.exports.default(props));
      for (const node of elements(tree)) {
        if (node.props.ref && !node.props.ref.current) node.props.ref.current = node.type === 'dialog' ? nativeDialog : { focus() { calls.focus++; } };
      }
      for (const effect of effects.splice(0)) cleanup.push(effect());
      mounted = true; return tree;
    },
    unmount() { for (const effect of cleanup.splice(0)) effect?.(); },
  };
}

test('confirmación real: abre diálogo accesible, enfoca cancelar y exige marcar confirmación explícita', () => {
  const ui = probe(); let tree = ui.render();
  assert.equal(tree.type, 'dialog'); assert.equal(tree.props.role, 'alertdialog'); assert.equal(tree.props['aria-modal'], 'true');
  assert.ok(elements(tree).some(node => node.props.id === tree.props['aria-labelledby']));
  assert.ok(elements(tree).some(node => node.props.id === tree.props['aria-describedby']));
  assert.equal(ui.calls.showModal, 1); assert.equal(ui.calls.focus, 1); assert.equal(ui.nativeDialog.open, true);
  assert.match(textOf(tree), /SEDE <QA> 0007/); assert.match(textOf(tree), /registros históricos se conservan/);
  assert.match(textOf(tree), /No se eliminará si tiene equipos, cobros o solicitudes pendientes/);
  assert.equal(checkbox(tree).props.checked, false); assert.equal(button(tree, 'Eliminar sede').props.disabled, true);
  button(tree, 'Eliminar sede').props.onClick(); assert.equal(ui.calls.confirm, 0);
  checkbox(tree).props.onChange({ target: { checked: true } }); tree = ui.render();
  assert.equal(button(tree, 'Eliminar sede').props.disabled, false); button(tree, 'Eliminar sede').props.onClick();
  assert.equal(ui.calls.confirm, 1); assert.equal(ui.calls.showModal, 1); assert.equal(ui.calls.focus, 1);
  ui.unmount(); assert.equal(ui.calls.close, 1); assert.equal(ui.nativeDialog.open, false);
});

test('confirmación real: procesamiento bloquea cierre, Escape, checkbox y confirmación duplicada', () => {
  const ui = probe(); let tree = ui.render(); checkbox(tree).props.onChange({ target: { checked: true } });
  tree = ui.render({ busy: true });
  assert.equal(checkbox(tree).props.checked, true); assert.equal(checkbox(tree).props.disabled, true);
  for (const label of ['Cancelar', 'Cerrar confirmación de eliminación', 'Eliminando…']) assert.equal(button(tree, label).props.disabled, true);
  let prevented = false; tree.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(ui.calls.cancel, 0);
  button(tree, 'Eliminando…').props.onClick(); assert.equal(ui.calls.confirm, 0);
  tree = ui.render({ busy: false }); button(tree, 'Eliminar sede').props.onClick(); assert.equal(ui.calls.confirm, 1);
  tree.props.onCancel({ preventDefault() {} }); assert.equal(ui.calls.cancel, 1);
});

test('confirmación real: error del servidor conserva destino y casilla para reintentar; cancelar no confirma', () => {
  const ui = probe({ entityLabel: 'vendedor', targetName: 'Vendedor QA 0009' }); let tree = ui.render();
  assert.doesNotMatch(textOf(tree), /No se eliminará si tiene equipos/);
  checkbox(tree).props.onChange({ target: { checked: true } }); tree = ui.render({ busy: true });
  tree = ui.render({ busy: false, error: 'No se pudo guardar. Inténtalo de nuevo.' });
  assert.equal(checkbox(tree).props.checked, true); assert.equal(button(tree, 'Eliminar vendedor').props.disabled, false);
  const alert = elements(tree).find(node => node.props.role === 'alert'); assert.equal(textOf(alert), ui.props.error);
  assert.match(textOf(tree), /Vendedor QA 0009/); assert.equal(ui.calls.confirm, 0);
  button(tree, 'Cancelar').props.onClick(); assert.equal(ui.calls.cancel, 1); assert.equal(ui.calls.confirm, 0);
  button(tree, 'Cerrar confirmación de eliminación').props.onClick(); assert.equal(ui.calls.cancel, 2);
  ui.nativeDialog.open = false; ui.unmount(); assert.equal(ui.calls.close, 0);
});
