import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const jsx = createRequire(import.meta.url)("react/jsx-runtime");
function load(path, imports = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => { assert.ok(name in imports, `Import inesperado ${name}`); return imports[name]; }, loaded, loaded.exports);
  return loaded.exports;
}
const access = load("lib/access-control.ts");
const removalAccess = load("lib/admin-entity-removal-access.ts", { "@/lib/access-control": access });
const avatars = load("lib/profile-avatars.ts");
const source = readFileSync(new URL("../app/ventas/perfiles/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword));
const declarations = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []);
const states = declarations.flatMap(node => ts.isArrayBindingPattern(node.name) && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState" ? [node.name.elements[0].name.getText(ast)] : []);
const finalReturn = component.body.statements.find(ts.isReturnStatement);
const instrumented = source.slice(0, finalReturn.getStart(ast)) + "__capture({crearPerfil,guardarPerfil,eliminarPerfil});\n" + source.slice(finalReturn.getStart(ast));
const compiled = ts.transpileModule(instrumented, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function resolve(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === "function") return resolve(node.type(node.props));
  return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
}
function elements(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
function textOf(node) { if (node == null || typeof node === "boolean") return ""; if (Array.isArray(node)) return node.map(textOf).join(" "); return typeof node === "object" ? textOf(node.props?.children) : String(node); }
function button(tree, name) { const found = elements(tree).find(node => node.type === "button" && (node.props["aria-label"] === name || textOf(node).trim() === name)); assert.ok(found, `Falta ${name}`); return found; }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const admin = { id: 90, nombre: "Admin QA", usuario: "adminqa", rolNombre: "ADMIN", sedeId: 1, sedeNombre: "BODEGA PRINCIPAL", perfilId: null, perfilTipo: null };
const sedes = [{ id: 1, nombre: "BODEGA PRINCIPAL" }, { id: 2, nombre: "SEDE QA" }];
const perfiles = ["VENDEDOR", "APOYO_OPERATIVO", "SUPERVISOR_TIENDA", "ADMINISTRADOR", "AUDITOR", "BODEGA", "FACTURADOR"].map((tipo, index) => ({
  id: index + 1, nombre: `${tipo} QA`, tipo, tipoLabel: tipo, activo: true, documento: `1000000${index}`, telefono: null, correo: null,
  avatarKey: avatars.obtenerAvatarDefaultPorTipo(tipo), debeCambiarPin: false, sedeIds: [2], sedes: [sedes[1]],
}));
function editing(rows) {
  return Object.fromEntries(rows.map(item => [item.id, { nombre: item.nombre, documento: item.documento, telefono: "", correo: "", avatarKey: item.avatarKey, tipo: item.tipo, activo: item.activo, sedeIds: item.sedeIds, pin: "" }]));
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function probe({ user = admin, target = 1, fetchImpl = async () => response({ ok: true, perfiles: perfiles.filter(item => item.id !== target), sedes }) } = {}) {
  const state = { user, perfiles: structuredClone(perfiles), sedes, ediciones: editing(perfiles), cargando: false, perfilAbiertoId: target };
  const refs = []; const calls = []; let cursor = 0; let refCursor = 0; let captured;
  const imports = {
    react: { useState(initial) { const key = states[cursor++]; assert.ok(key); if (!(key in state)) state[key] = typeof initial === "function" ? initial() : initial; return [state[key], next => { state[key] = typeof next === "function" ? next(state[key]) : next; }]; }, useRef(initial) { return refs[refCursor++] ??= { current: initial }; }, useEffect() {} },
    "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: props => jsx.jsx("a", { href: props.href, children: props.children }) },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: () => null },
    "@/app/dashboard/_components/dashboard-icon": { __esModule: true, default: () => null },
    "@/app/dashboard/_components/logout-button": { __esModule: true, default: () => null },
    "@/app/_components/admin-delete-dialog": { __esModule: true, default: props => jsx.jsx("admin-delete-dialog", {
      entityLabel: props.entityLabel, targetName: props.targetName, busy: props.busy, error: props.error,
      onCancel: props.onCancel, onConfirm: props.onConfirm,
    }) },
    "@/lib/admin-entity-removal-access": removalAccess,
    "@/lib/access-control": access,
    "@/lib/profile-avatars": avatars,
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "fetch", "__capture", compiled)(name => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports, async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    return fetchImpl(url, options);
  }, value => { captured = value; });
  const ui = { state, calls, render() { cursor = 0; refCursor = 0; return resolve(loaded.exports.default()); }, get view() { return captured; },
    open() { button(this.render(), `Eliminar vendedor ${perfiles.find(item => item.id === target).nombre}`).props.onClick(); return this.render(); },
    dialog() { return elements(this.render()).find(node => node.type === "admin-delete-dialog"); },
  };
  ui.render(); return ui;
}

test("solo el administrador central ve eliminar vendedores comerciales y nunca su propio perfil", () => {
  for (const user of [admin, { ...admin, perfilTipo: "ADMINISTRADOR", perfilId: 44 }]) {
    for (const target of [1, 2, 3]) {
      const ui = probe({ user, target });
      assert.equal(button(ui.render(), `Eliminar vendedor ${perfiles[target - 1].nombre}`).props.disabled, false);
    }
  }
  for (const user of [{ ...admin, rolNombre: "AUDITOR" }, { ...admin, rolNombre: "BODEGA" }, { ...admin, perfilTipo: "VENDEDOR", perfilId: 55 }, { ...admin, perfilTipo: "SUPERVISOR_TIENDA", perfilId: 55 }, null]) {
    assert.equal(elements(probe({ user }).render()).some(node => node.type === "button" && String(node.props["aria-label"] || "").startsWith("Eliminar vendedor ")), false);
  }
  for (const target of [4, 5, 6, 7]) assert.equal(elements(probe({ target }).render()).some(node => node.type === "button" && String(node.props["aria-label"] || "").startsWith("Eliminar vendedor ")), false);
  assert.equal(elements(probe({ user: { ...admin, perfilTipo: "ADMINISTRADOR", perfilId: 1 } }).render()).some(node => node.type === "button" && String(node.props["aria-label"] || "").startsWith("Eliminar vendedor ")), false);
});

test("abrir o cancelar la confirmación identifica al vendedor sin enviar solicitudes ni borrar borradores", () => {
  const ui = probe(); ui.state.ediciones[1].nombre = "Nombre aún sin guardar";
  ui.open();
  assert.equal(ui.dialog().props.entityLabel, "vendedor");
  assert.equal(ui.dialog().props.targetName, "VENDEDOR QA");
  assert.deepEqual(ui.calls, []);
  ui.dialog().props.onCancel(); ui.render();
  assert.equal(ui.dialog(), undefined); assert.equal(ui.state.ediciones[1].nombre, "Nombre aún sin guardar"); assert.deepEqual(ui.calls, []);
});

test("confirmar envía el ID original una sola vez, espera el servidor y bloquea crear o guardar", async () => {
  const pending = deferred(); const ui = probe({ fetchImpl: () => pending.promise }); ui.open();
  const first = ui.view.eliminarPerfil(); const second = ui.view.eliminarPerfil();
  await ui.view.crearPerfil(); await ui.view.guardarPerfil(2);
  let tree = ui.render();
  assert.deepEqual(ui.calls, [{ url: "/api/perfiles-vendedor", method: "DELETE", body: { id: 1, confirmed: true } }]);
  assert.equal(ui.dialog().props.busy, true); assert.equal(button(tree, "Crear perfil").props.disabled, true); assert.equal(button(tree, "Guardar cambios").props.disabled, true);
  assert.equal(ui.state.perfiles.length, 7); assert.equal(ui.state.mensaje, "");
  ui.dialog().props.onCancel(); assert.ok(ui.state.perfilEliminar);
  pending.resolve(response({ ok: true, mensaje: "Vendedor eliminado con historial conservado", perfiles: perfiles.slice(1), sedes }));
  await Promise.all([first, second]); tree = ui.render();
  assert.equal(ui.state.perfiles.length, 6); assert.equal(ui.state.perfilAbiertoId, null); assert.equal(ui.dialog(), undefined);
  assert.match(textOf(tree), /Vendedor eliminado con historial conservado/); assert.equal(button(tree, "Crear perfil").props.disabled, false);
});

test("los fallos no anuncian éxito ni cambian la lista, el formulario o la confirmación", async () => {
  for (const fetchImpl of [
    async () => response({ error: "No autorizado" }, 403),
    async () => response({ error: "No se pudo eliminar el vendedor" }, 500),
    async () => { throw Error("Conexión interrumpida"); },
    async () => new Response("<html>Error de conexión</html>", { status: 502 }),
    async () => response({ ok: true }),
    async () => response({ ok: false, perfiles: perfiles.slice(1), sedes }),
    async () => response({ ok: true, perfiles, sedes }),
  ]) {
    const ui = probe({ fetchImpl }); ui.state.ediciones[1].nombre = "Borrador preservado"; ui.open();
    await ui.view.eliminarPerfil(); ui.render();
    assert.equal(ui.state.perfiles.length, 7); assert.equal(ui.state.ediciones[1].nombre, "Borrador preservado");
    assert.equal(ui.state.perfilEliminar.id, 1); assert.equal(ui.state.eliminando, false); assert.equal(ui.state.mensaje, ""); assert.ok(ui.dialog().props.error);
  }
});

test("una respuesta perdida permite reintentar el mismo vendedor sin crear ni modificar otro perfil", async () => {
  let attempts = 0;
  const ui = probe({ fetchImpl: async () => { if (++attempts === 1) throw Error("Respuesta perdida"); return response({ ok: true, perfiles: perfiles.slice(1), sedes }); } });
  ui.open(); await ui.view.eliminarPerfil(); ui.render(); assert.ok(ui.dialog().props.error);
  await ui.view.eliminarPerfil(); ui.render();
  assert.deepEqual(ui.calls.map(call => call.body), [{ id: 1, confirmed: true }, { id: 1, confirmed: true }]);
  assert.equal(ui.state.perfiles.length, 6); assert.equal(ui.dialog(), undefined);
});

test("la confirmación vuelve a comprobar el rol y la identidad actual antes de enviar", async () => {
  const ui = probe(); ui.open(); ui.state.user = { ...admin, rolNombre: "AUDITOR" }; ui.render();
  await ui.view.eliminarPerfil(); assert.deepEqual(ui.calls, []);
  const other = probe(); other.open(); other.state.perfiles = perfiles.slice(1); other.render();
  await other.view.eliminarPerfil(); other.render(); assert.deepEqual(other.calls, []); assert.match(other.dialog().props.error, /no se puede eliminar/);
});
