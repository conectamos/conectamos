import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
function load(path, imports = {}) {
  const compiled = ts.transpileModule(readFileSync(join(ROOT, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "console", compiled)(name => {
    assert.ok(name in imports, `Dependencia inesperada: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, { error() {} });
  return loaded.exports;
}
const access = load("lib/access-control.ts");
const imeis = load("lib/inventory-imeis.ts");
const productTypes = load("lib/product-types.ts");
const activeEntities = load("lib/active-operational-entities.ts");
class NextResponse extends Response {
  static json(body, options = {}) { return new NextResponse(JSON.stringify(body), { ...options, headers: { "Content-Type": "application/json", ...options.headers } }); }
}
const bodega = { id: 52, usuario: "bodega-qa", sedeId: 1, rolNombre: "BODEGA", perfilTipo: null };
const admin = { ...bodega, rolNombre: "ADMIN" };
const auditor = { ...bodega, rolNombre: "AUDITOR" };
const supervisor = { ...bodega, rolNombre: "SUPERVISOR", sedeId: 2, perfilTipo: "SUPERVISOR_TIENDA" };
const baseItem = { id: 1, imei: "001234567890123", referencia: "EQUIPO QA", tipoProducto: "TELEFONIA", color: "Azul", costo: 500000, distribuidor: "Distribuidor QA", numeroFactura: "00001", estado: "BODEGA", sedeDestinoId: null, estadoCobro: null };
const clone = value => structuredClone(value);
function probe({ user = bodega, item = baseItem, ventas = [], records = [], prestamos = [], linked = [] } = {}) {
  const state = { calls: [], item: clone(item), references: [{ id: 1, nombre: "EQUIPO QA", activo: true, eliminado: false, createdAt: new Date("2026-10-19T15:00:00Z"), updatedAt: new Date("2026-10-19T15:00:00Z") }] };
  const record = (name, result) => async args => { state.calls.push({ name, args: clone(args) }); return typeof result === "function" ? result(args) : clone(result); };
  const db = {
    $queryRaw: async () => [],
    inventarioPrincipal: {
      findMany: record("principal.read", () => state.item ? [clone(state.item)] : []),
      findUnique: record("principal.lookup", () => clone(state.item)),
      updateMany: record("principal.updateMany", ({ data }) => { Object.assign(state.item, data); return { count: 1 }; }),
      update: record("principal.update", ({ data }) => { Object.assign(state.item, data); return clone(state.item); }),
      createMany: record("principal.createMany", ({ data }) => ({ count: data.length })),
    },
    sede: {
      findFirst: record("bodega.read", { id: 1, nombre: "BODEGA PRINCIPAL" }),
      findUnique: record("sede.read", ({ where }) => where.id === 2 ? { id: 2, nombre: "SEDE 2", activa: true } : where.id === 1 ? { id: 1, nombre: "BODEGA PRINCIPAL", activa: true } : null),
      findMany: record("sede.list", [{ id: 2, nombre: "SEDE 2" }]),
    },
    inventarioSede: {
      findFirst: record("sede-stock.existing", null),
      findMany: record("sede-stock.read", linked),
      create: record("sede-stock.create", { id: 100 }),
      updateMany: record("sede-stock.update", { count: 1 }),
      deleteMany: record("sede-stock.delete", { count: linked.length }),
    },
    prestamoSede: {
      findFirst: record("loan.existing", null), findMany: record("loan.read", prestamos),
      create: record("loan.create", { id: 200 }), updateMany: record("loan.update", { count: prestamos.length }),
    },
    registroVendedorVenta: { findMany: record("sale-record.read", records) },
    movimientoInventario: {
      create: record("history.create", { id: 300 }), createMany: record("history.createMany", { count: 1 }), updateMany: record("history.update", { count: 1 }),
    },
    catalogoReferenciaInventario: {
      findUnique: record("reference.lookup", ({ where }) => state.references.find(reference => reference.id === where.id || (where.nombreNormalizado && reference.nombre.toUpperCase() === where.nombreNormalizado)) || null), findFirst: record("reference.existing", null),
      create: record("reference.create", { id: 2 }),
      update: record("reference.update", ({ where, data }) => { const ref = state.references.find(reference => reference.id === where.id); Object.assign(ref, data); return clone(ref); }),
    },
    venta: { findMany: record("sales.read", ventas) },
    $transaction: async callback => { state.calls.push({ name: "transaction" }); return typeof callback === "function" ? callback(db) : await Promise.all(callback); },
  };
  const intake = load("lib/inventory-intake-registration.ts", { "@/lib/prisma": { __esModule: true, default: db }, "@/lib/inventory-imeis": imeis });
  const imports = {
    "next/server": { NextResponse }, "@/lib/prisma": { __esModule: true, default: db },
    "@/lib/auth": { getSessionUser: async () => user }, "@/lib/access-control": access,
    "@/lib/product-types": productTypes,
    "@/lib/active-operational-entities": activeEntities,
    "@/lib/vendor-profile-schema": { ensureVendorProfilesSchema: async () => {} },
    "@/lib/record-catalog-media": { enriquecerRegistrosConCatalogo: async rows => rows.map(row => ({ ...row, catalogoEquipo: null })) },
    "@/lib/prestamos": { NOMBRE_SEDE_BODEGA: "BODEGA PRINCIPAL", PROVEEDOR_FINSER: "Proveedor Finser" },
    "@/lib/sedes": { esSedeVentas: name => name === "VENTAS" },
    "@/lib/inventory-imeis": imeis,
    "@/lib/inventory-references": {
      normalizarReferenciaInventario: value => String(value || "").trim(), claveReferenciaInventario: value => String(value || "").trim().toUpperCase(),
      buscarReferenciaInventarioActiva: async nombre => nombre === "EQUIPO QA" ? { nombre } : null,
      asegurarTablaCatalogoReferenciasInventario: async () => {}, obtenerCatalogoReferenciasInventario: async () => clone(state.references),
    },
    "@/lib/inventory-intake-registration": {
      ...intake,
      obtenerImeisExistentes: async () => new Set(),
      registrarCargaInventarioUnaVez: async input => { state.calls.push({ name: "intake", args: { ...input, registrar: undefined } }); return input.registrar(db); },
    },
  };
  return {
    state,
    async invoke(path, method, body = {}) {
      const route = load(`app/api/${path}/route.ts`, imports);
      const response = await route[method](new Request(`http://qa.local/api/${path}`, { method, ...(method !== "GET" ? { headers: { "Content-Type": "application/json", "Idempotency-Key": "bodega-prueba-001" }, body: JSON.stringify(body) } : {}) }));
      return { status: response.status, body: await response.json() };
    },
  };
}
const intakePayload = { imeis: ["001234567890123", "101234567890123"], referencia: "EQUIPO QA", tipoProducto: "TELEFONIA", color: "Azul", costo: 500000, numeroFactura: "00001", distribuidor: "Distribuidor QA" };

test("BODEGA consulta inventario principal y sedes destino con IMEI textual completo", async () => {
  const p = probe({ item: { ...baseItem, estado: "PRESTAMO", sedeDestinoId: 2 } });
  const result = await p.invoke("inventario-principal", "GET");
  assert.equal(result.status, 200); assert.equal(result.body[0].imei, "001234567890123");
  assert.equal(result.body[0].sedeDestinoNombre, "SEDE 2");
  assert.equal(p.state.calls.filter(call => /create|update|delete/.test(call.name)).length, 0);
});

test("BODEGA ingresa un lote únicamente en principal conservando factura e IMEI como texto", async () => {
  const p = probe(); const result = await p.invoke("inventario-principal", "POST", { ...intakePayload, sedeId: 999, destino: "SEDE" });
  assert.equal(result.status, 200); assert.equal(result.body.insertados, 2);
  const intake = p.state.calls.find(call => call.name === "intake");
  assert.equal(intake.args.usuarioId, bodega.id); assert.equal(intake.args.destino, "PRINCIPAL");
  assert.deepEqual(intake.args.imeis, intakePayload.imeis);
  const written = p.state.calls.find(call => call.name === "principal.createMany").args.data;
  assert.equal(written[0].numeroFactura, "00001"); assert.equal(written[0].imei, "001234567890123");
  assert.equal(p.state.calls.some(call => call.name === "sede-stock.create"), false);
});

test("BODEGA conserva validaciones de IMEI, costo y referencias al ingresar", async () => {
  for (const payload of [{ imeis: [123456789012345] }, { imeis: ["001234567890123", "001234567890123"] }, { costo: 0 }, { referencia: "NO EXISTE" }]) {
    const p = probe(); const result = await p.invoke("inventario-principal", "POST", { ...intakePayload, ...payload });
    assert.equal(result.status, 400); assert.equal(p.state.calls.some(call => call.name === "principal.createMany"), false);
  }
});

test("BODEGA revisa IMEI en principal pero no puede usar revisión para ingreso directo a una sede", async () => {
  const p = probe(); const result = await p.invoke("inventario/revisar", "POST", { imeis: intakePayload.imeis, destino: "PRINCIPAL" });
  assert.equal(result.status, 200); assert.equal(result.body.validos, 2); assert.equal(result.body.imeisValidos[0], "001234567890123");
  for (const sedeId of [1, 2, 999]) assert.equal((await p.invoke("inventario/revisar", "POST", { imeis: intakePayload.imeis, destino: "SEDE", sedeId })).status, 403);
});

test("BODEGA edita solo inventario principal y sincroniza sus vínculos existentes", async () => {
  const p = probe(); const result = await p.invoke("inventario-principal/actualizar", "PATCH", { id: 1, referencia: "EQUIPO QA", color: "Negro", costo: 600000, sedeId: 999, estadoCobro: "PAGADO", estado: "PAGO" });
  assert.equal(result.status, 200); assert.equal(result.body.actualizados, 1);
  assert.equal(p.state.item.color, "Negro"); assert.equal(p.state.item.costo, 600000);
  assert.equal(p.state.item.estado, "BODEGA"); assert.equal(p.state.item.estadoCobro, null);
  assert.ok(p.state.calls.some(call => call.name === "history.createMany"));
  const linked = p.state.calls.find(call => call.name === "sede-stock.update");
  assert.deepEqual(linked.args.where, { inventarioPrincipalId: { in: [1] } });
});

test("BODEGA envía a una sede con préstamo y trazabilidad originales, sin caja", async () => {
  const p = probe(); const result = await p.invoke("inventario-principal/enviar-a-sede", "POST", { id: 1, sedeDestinoId: 2 });
  assert.equal(result.status, 200); assert.equal(p.state.item.estado, "PRESTAMO");
  assert.equal(p.state.item.estadoCobro, "PENDIENTE"); assert.equal(p.state.item.sedeDestinoId, 2);
  assert.ok(p.state.calls.some(call => call.name === "sede-stock.create")); assert.ok(p.state.calls.some(call => call.name === "loan.create"));
  assert.ok(p.state.calls.some(call => call.name === "history.create"));
});

test("BODEGA no puede enviar un equipo no disponible ni a la misma bodega", async () => {
  for (const [item, destination] of [[{ ...baseItem, estado: "PRESTAMO" }, 2], [baseItem, 1]]) {
    const p = probe({ item }); const result = await p.invoke("inventario-principal/enviar-a-sede", "POST", { id: 1, sedeDestinoId: destination });
    assert.equal(result.status, 400); assert.equal(p.state.calls.some(call => call.name === "transaction"), false);
  }
});

test("BODEGA devuelve equipos elegibles a bodega con las restricciones originales", async () => {
  const item = { ...baseItem, estado: "PRESTAMO", estadoCobro: "PENDIENTE", sedeDestinoId: 2 };
  const linked = [{ id: 100, imei: item.imei, inventarioPrincipalId: 1, sedeId: 2, estadoActual: "BODEGA", ventas: [] }];
  const prestamos = [{ id: 200, imei: item.imei, estado: "APROBADO", movimientosCaja: [] }];
  const p = probe({ item, linked, prestamos }); const result = await p.invoke("inventario-principal/restaurar-bodega", "POST", { ids: [1] });
  assert.equal(result.status, 200); assert.equal(result.body.restaurados, 1); assert.equal(p.state.item.estado, "BODEGA");
  assert.equal(p.state.item.sedeDestinoId, null); assert.ok(p.state.calls.some(call => call.name === "history.createMany"));
});

test("BODEGA no devuelve vendidos, cobrados, préstamos con caja ni registros comerciales pendientes", async () => {
  const item = { ...baseItem, estado: "PRESTAMO", estadoCobro: "PENDIENTE", sedeDestinoId: 2 };
  const linked = [{ id: 100, imei: item.imei, inventarioPrincipalId: 1, sedeId: 2, estadoActual: "BODEGA", ventas: [] }];
  const options = [
    { item: { ...item, estadoCobro: "PAGADO" } },
    { item, linked: [{ ...linked[0], estadoActual: "VENDIDO", ventas: [{ id: 9 }] }] },
    { item, linked, prestamos: [{ id: 200, imei: item.imei, movimientosCaja: [{ id: 4 }] }] },
    { item, linked, records: [{ id: 3, serialImei: item.imei, clienteNombre: "Cliente privado", sede: { nombre: "SEDE 2" }, perfilVendedor: { nombre: "Asesor privado" } }] },
  ];
  for (const option of options) {
    const p = probe(option); const result = await p.invoke("inventario-principal/restaurar-bodega", "POST", { id: 1 });
    assert.equal(result.status, 400); assert.equal(p.state.calls.some(call => call.name === "transaction"), false);
    assert.doesNotMatch(JSON.stringify(result.body), /Cliente privado|Asesor privado/);
  }
});

test("BODEGA consulta y crea referencias pero no puede editar, activar, ocultar ni eliminar", async () => {
  const p = probe(); const list = await p.invoke("inventario-principal/referencias", "GET");
  assert.equal(list.status, 200); assert.equal(list.body.puedeGestionar, false); assert.equal(list.body.puedeCrear, true); assert.equal(list.body.puedeEliminar, false);
  assert.equal((await p.invoke("inventario-principal/referencias", "POST", { nombre: "NUEVA REFERENCIA QA" })).status, 200);
  for (const payload of [{ id: 1, activo: false }, { id: 1, activo: true }, { id: 1, nombre: "REFERENCIA AJENA" }]) {
    const denied = probe(); const result = await denied.invoke("inventario-principal/referencias", "PATCH", payload);
    assert.equal(result.status, 403); assert.deepEqual(denied.state.calls, []);
  }
  assert.equal((await p.invoke("inventario-principal/referencias", "DELETE", { id: 1 })).status, 403);
  assert.equal((await p.invoke("inventario-principal/eliminar", "POST", { id: 1 })).status, 403);
});

test("operaciones principales rechazan sesión ausente y rol de sede antes de leer o escribir", async () => {
  const operations = [["inventario-principal", "GET"], ["inventario-principal", "POST"], ["inventario-principal/actualizar", "PATCH"], ["inventario-principal/enviar-a-sede", "POST"], ["inventario-principal/restaurar-bodega", "POST"], ["inventario-principal/referencias", "POST"], ["inventario-principal/referencias", "PATCH"]];
  for (const [user, expected] of [[null, 401], [supervisor, 403]]) for (const [path, method] of operations) {
    const p = probe({ user }); const result = await p.invoke(path, method, intakePayload);
    assert.equal(result.status, expected, `${path} ${method}`); assert.equal(p.state.calls.length, 0);
  }
});

test("ADMIN y AUDITOR conservan consulta e ingreso principal", async () => {
  for (const user of [admin, auditor]) {
    const p = probe({ user }); assert.equal((await p.invoke("inventario-principal", "GET")).status, 200);
    assert.equal((await p.invoke("inventario-principal", "POST", intakePayload)).status, 200);
  }
});

function uiProbe(path, { user = bodega, state: initial = {}, refs = {}, fetchImpl } = {}) {
  const source = readFileSync(join(ROOT, path), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(component?.body);
  const hookNames = name => component.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap(entry => {
    if (!entry.initializer || !ts.isCallExpression(entry.initializer) || entry.initializer.expression.getText(ast) !== name) return [];
    return [ts.isArrayBindingPattern(entry.name) ? entry.name.elements[0].name.getText(ast) : entry.name.getText(ast)];
  }) : []);
  const names = hookNames("useState"); const refNames = hookNames("useRef");
  const capturedNames = component.body.statements.flatMap(node => ts.isVariableStatement(node) ? node.declarationList.declarations.filter(entry => ts.isIdentifier(entry.name)).map(entry => entry.name.text) : []);
  const lastReturn = component.body.statements.findLast(ts.isReturnStatement);
  const injected = `${source.slice(0, lastReturn.getStart(ast))}capture({ ${capturedNames.join(",")} });\n${source.slice(lastReturn.getStart(ast))}`;
  const state = { user: user ? { nombre: "Operador QA", sedeNombre: "BODEGA PRINCIPAL", ...user } : null, loading: false, inventoryLoading: false, ...initial };
  const refState = {}; let cursor = 0; let refCursor = 0; let captured;
  const hooks = {
    useState(value) { const name = names[cursor++]; if (!(name in state)) state[name] = typeof value === "function" ? value() : value; return [state[name], next => { state[name] = typeof next === "function" ? next(state[name]) : next; }]; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect() {},
    useRef(value) { const name = refNames[refCursor++]; const ref = { current: name in refs ? refs[name] : value }; refState[name] = ref; return ref; },
  };
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "fragment" };
  const noop = { __esModule: true, default: () => null };
  const imports = {
    react: hooks, "react/jsx-runtime": jsx, "next/link": noop, "next/image": noop,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/lib/bodega-navigation": load("lib/bodega-navigation.ts"),
    "@/lib/access-control": access, "@/lib/prestamos": { NOMBRE_SEDE_BODEGA: "BODEGA PRINCIPAL", PROVEEDOR_FINSER: "Proveedor Finser" },
    "@/lib/product-types": productTypes, "@/lib/inventory-imeis": imeis,
    "@/lib/sedes": { esSedeOperativaInventario: () => true },
    "@/lib/use-live-refresh": { useLiveRefresh() {}, triggerLiveRefresh() {} },
    "@/app/dashboard/_components/operations-dashboard": {}, "@/app/dashboard/_components/dashboard-icon": noop,
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: () => null },
    "@/app/vendedor/registros/buscar/device-visual": { RecordDeviceVisual: () => null },
    "@/lib/warehouse-debt-groups": { agruparDeudasPorSede: () => [], claveSedeDeudora: () => "sede:2" },
    "./warehouse.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
    "./_components/dispatch-confirmation-dialog": noop,
    "./nuevo.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
    "./distributor-selector": { __esModule: true, default: props => jsx.jsx("select", { id: "ingreso-distribuidor", value: props.value, disabled: props.disabled, onChange: event => props.onChange(event.target.value) }) },
  };
  const compiled = ts.transpileModule(injected, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} }; const calls = [];
  const fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : undefined; calls.push({ url, body, options });
    return fetchImpl ? fetchImpl(url, options) : { ok: true, status: 200, json: async () => ({ ok: true, insertados: body?.imeis?.length || 0, omitidos: 0 }) };
  };
  new Function("require", "module", "exports", "capture", "fetch", compiled)(name => { assert.ok(name in imports, `Dependencia UI inesperada: ${name}`); return imports[name]; }, loaded, loaded.exports, value => { captured = value; }, fetch);
  const tree = loaded.exports.default();
  return { tree, state, captured, refs: refState, calls };
}

test("las dos pantallas BODEGA exponen solo navegación y destino de bodega principal", () => {
  for (const path of ["app/inventario-principal/page.tsx", "app/inventario/nuevo/page.tsx"]) {
    const ui = uiProbe(path); const navigation = ui.captured.navigation || ui.captured.navigationItems;
    assert.deepEqual(navigation.map(item => item.href), ["/dashboard", "/inventario-principal", "/inventario/nuevo", "/prestamos", "/dashboard/radar", "/dashboard#quien-me-debe"]);
    if (ui.captured.rutaCancelar) { assert.equal(ui.captured.rutaCancelar, "/inventario-principal"); assert.equal(ui.captured.destino, "Bodega principal"); }
    const pending = uiProbe(path, { user: null });
    assert.deepEqual(pending.captured.navigation || pending.captured.navigationItems, []);
  }
});

test("formulario BODEGA guarda la pestaña individual o masiva solo en principal", async () => {
  for (const modo of ["individual", "masiva"]) {
    const entries = modo === "individual" ? ["001234567890123"] : intakePayload.imeis;
    const entrada = modo === "individual" ? entries[0] : entries.join("\n");
    const review = { ok: true, entradas: [], imeisValidos: entries, detectados: entries.length, validos: entries.length, incorrectos: 0, repetidos: 0, existentes: 0 };
    const ui = uiProbe("app/inventario/nuevo/page.tsx", { state: {
      modo, imei: "001234567890123", imeisMasivos: intakePayload.imeis.join("\n"),
      catalogo: [{ id: 1, nombre: "EQUIPO QA", activo: true }], referencia: "EQUIPO QA", tipoProducto: "TELEFONIA", color: "Azul", costo: "500000", numeroFactura: "00001", distribuidor: "Distribuidor QA", review,
    }, refs: { reviewedInput: `${modo}:${entrada}` } });
    await ui.captured.guardar({ preventDefault() {} });
    assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].url, "/api/inventario-principal");
    assert.deepEqual(ui.calls[0].body.imeis, entries); assert.equal(ui.calls[0].body.numeroFactura, "00001");
    assert.equal(ui.calls[0].body.estadoFinanciero, undefined); assert.equal(ui.calls[0].body.deboA, undefined);
    assert.equal(ui.state.resultado, true);
  }
});

test("formulario BODEGA solicita revisión explícita de IMEI con destino PRINCIPAL", async () => {
  const ui = uiProbe("app/inventario/nuevo/page.tsx", { state: { imei: "001234567890123" }, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, entradas: [], imeisValidos: ["001234567890123"] }) }) });
  await ui.captured.revisarLista();
  assert.equal(ui.calls[0].url, "/api/inventario/revisar"); assert.equal(ui.calls[0].body.destino, "PRINCIPAL");
});


test("POST de BODEGA no reactiva referencias ocultas del catálogo compartido", async () => {
  const p = probe(); p.state.references[0].activo = false;
  const result = await p.invoke("inventario-principal/referencias", "POST", { nombre: "EQUIPO QA" });
  assert.equal(result.status, 403); assert.equal(p.state.references[0].activo, false);
  assert.equal(p.state.calls.some(call => /reference.update|reference.create|transaction/.test(call.name)), false);
});

test("ADMIN y AUDITOR conservan renombrado y activación de referencias compartidas", async () => {
  for (const user of [admin, auditor]) {
    const p = probe({ user });
    const list = await p.invoke("inventario-principal/referencias", "GET");
    assert.equal(list.body.puedeGestionar, true); assert.equal(list.body.puedeCrear, true);
    const hidden = await p.invoke("inventario-principal/referencias", "PATCH", { id: 1, activo: false });
    assert.equal(hidden.status, 200); assert.equal(hidden.body.referencias[0].activo, false);
    const renamed = await p.invoke("inventario-principal/referencias", "PATCH", { id: 1, nombre: "NUEVA REFERENCIA QA" });
    assert.equal(renamed.status, 200); assert.equal(renamed.body.referencias[0].nombre, "NUEVA REFERENCIA QA");
    assert.ok(p.state.calls.some(call => call.name === "sede-stock.update"));
  }
});

function uiNodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(uiNodes);
  return [node, ...uiNodes(node.props?.children)];
}
function uiText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(uiText).join("");
  return typeof node === "object" ? uiText(node.props?.children) : String(node);
}

test("UI BODEGA conserva crear referencia y oculta controles de renombrar, activar u ocultar", async () => {
  const reference = { id: 1, nombre: "EQUIPO QA", activo: true };
  for (const user of [bodega, admin, auditor]) {
    const ui = uiProbe("app/inventario-principal/page.tsx", { user, state: { mostrarCatalogoReferencias: true, referenciasCatalogo: [reference] } });
    const catalog = uiNodes(ui.tree).find(node => node.props?.id === "warehouse-references");
    assert.ok(catalog); const labels = uiNodes(catalog).filter(node => node.type === "button").map(uiText);
    assert.ok(labels.includes("Agregar"));
    assert.equal(labels.includes("Editar"), user.rolNombre !== "BODEGA");
    assert.equal(labels.includes("Ocultar"), user.rolNombre !== "BODEGA");
    if (user.rolNombre === "BODEGA") {
      await ui.captured.actualizarReferencia(reference, false);
      assert.deepEqual(ui.calls, []); assert.match(ui.state.mensaje, /no puede editar/);
    }
  }
});
