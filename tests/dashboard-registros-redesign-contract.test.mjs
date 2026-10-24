import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const WORKSPACE_PATH = "app/facturador/registros/workspace.tsx";
const require = createRequire(import.meta.url);
const jsxRuntime = require("react/jsx-runtime");

function parseSource(relativePath) {
  const absolutePath = join(ROOT, relativePath);
  const sourceText = readFileSync(absolutePath, "utf8");

  return {
    relativePath,
    sourceText,
    sourceFile: ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    ),
  };
}

function descendants(node, predicate) {
  const matches = [];

  const visit = (current) => {
    if (predicate(current)) {
      matches.push(current);
    }

    ts.forEachChild(current, visit);
  };

  visit(node);
  return matches;
}

function variableNamed(parsed, name) {
  const matches = descendants(
    parsed.sourceFile,
    (node) =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
  );

  assert.equal(
    matches.length,
    1,
    `Se esperaba una variable ${name} en ${parsed.relativePath}`
  );

  return matches[0];
}

function functionOrVariableNamed(parsed, name) {
  const functions = descendants(
    parsed.sourceFile,
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name
  );
  const variables = descendants(
    parsed.sourceFile,
    (node) =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
  );

  assert.equal(
    functions.length + variables.length,
    1,
    `Se esperaba una funcion o variable ${name} en ${parsed.relativePath}`
  );

  return functions[0] ?? variables[0];
}

test("el listado pagina localmente de 25 en 25 y renderiza solo la pagina activa", () => {
  const parsed = parseSource(WORKSPACE_PATH);
  const pageSize = variableNamed(parsed, "REGISTROS_POR_PAGINA");
  const paginated = variableNamed(parsed, "registrosPaginados");
  const pageSizeValue = pageSize.initializer?.getText(parsed.sourceFile);
  const paginationLogic = paginated.initializer?.getText(parsed.sourceFile) ?? "";

  assert.equal(
    pageSizeValue,
    "25",
    "El rediseño debe limitar cada pagina local a 25 registros"
  );
  assert.ok(
    paginationLogic.includes("registrosFiltrados.slice"),
    "registrosPaginados debe derivarse del resultado ya filtrado"
  );
  assert.ok(
    paginationLogic.includes("paginaActual") &&
      paginationLogic.includes("REGISTROS_POR_PAGINA"),
    "La ventana visible debe depender de la pagina actual y del tamaño configurado"
  );
  assert.ok(
    parsed.sourceText.includes("registrosPaginados.map((registro)"),
    "La tabla debe renderizar registrosPaginados y no todos los registros filtrados"
  );
  assert.ok(
    parsed.sourceText.includes("setPaginaActual"),
    "El listado debe conservar controles que permitan cambiar la pagina"
  );
});

test("el rediseño usa navegación superior con identidad oficial y conserva el perfil con cierre de sesión", () => {
  const parsed = parseSource(WORKSPACE_PATH);
  assert.ok(!parsed.sourceText.includes("<DashboardSidebar"), "La petición sustituye la barra lateral");
  assert.ok(!parsed.sourceText.includes('className="lg:pl-[252px]"'), "No debe quedar una reserva vacía para el sidebar");
  assert.ok(parsed.sourceText.includes("<SalesProfile"), "Reutiliza el perfil compartido que permite cerrar sesión");
  assert.ok(parsed.sourceText.includes("/branding/conectamos-logo.png"), "El logo es el recurso oficial");
  const styles = readFileSync(join(ROOT, "app/facturador/registros/workspace.module.css"), "utf8");
  assert.match(styles, /#f5f6f8/i);
  assert.match(styles, /#(?:11161d|2d343e|252c36)/i, "La franja usa grafito");
});

test("el rediseño conserva los endpoints y las acciones operativas de registros y Siigo", () => {
  const parsed = parseSource(WORKSPACE_PATH);
  const requiredFunctions = [
    "cargarRegistros",
    "guardarFactura",
    "emitirFacturaSiigo",
    "reenviarCorreoSiigo",
    "facturarPendientesSiigo",
    "consultarReporteSiigo",
    "emitirNotaCreditoSiigo",
    "quitarFacturaBorradaSiigo",
    "guardarEdicion",
    "eliminarRegistro",
  ];

  for (const name of requiredFunctions) {
    functionOrVariableNamed(parsed, name);
  }

  for (const endpoint of [
    '"/api/facturador/registros"',
    '"/api/facturador/siigo"',
    "`/api/facturador/siigo/reporte?${params}`",
    '"/api/ventas/catalogo-personal"',
  ]) {
    assert.ok(
      parsed.sourceText.includes(endpoint),
      `Debe conservarse el endpoint ${endpoint}`
    );
  }

  for (const mode of [
    'modo: "REENVIAR_CORREO"',
    'modo: "FACTURAR_PENDIENTES"',
    'modo: "NOTA_CREDITO"',
    'modo: "QUITAR_FACTURA_BORRADA"',
    'modo: "EDITAR"',
    'modo: "ELIMINAR"',
  ]) {
    assert.ok(
      parsed.sourceText.includes(mode),
      `Debe conservarse la accion ${mode}`
    );
  }
});

const moduleCache = new Map();
const componentHooks = { useEffect() {}, useRef: (value) => ({ current: value }), Fragment: Symbol.for("react.fragment") };
const link = { __esModule: true, default: ({ children, ...props }) => jsxRuntime.jsx("a", { ...props, children }) };
const image = { __esModule: true, default: (props) => jsxRuntime.jsx("img", { src: props.src, alt: props.alt, width: props.width, height: props.height }) };
const logout = { __esModule: true, default: () => jsxRuntime.jsx("button", { children: "Cerrar sesión" }) };

function loadSource(relativePath, overrides = {}, injected = {}, sourceText) {
  const output = ts.transpileModule(sourceText ?? readFileSync(join(ROOT, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  const mockRequire = (name) => {
    if (name in overrides) return overrides[name];
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "react") return componentHooks;
    if (name === "next/link") return link;
    if (name === "next/image") return image;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === "@/app/dashboard/_components/logout-button") return logout;
    if (name === "@/app/dashboard/_components/operations-dashboard") return { DashboardSidebar: () => jsxRuntime.jsx("aside", {}) };
    assert.ok(name.startsWith("@/"), `Import no cubierto: ${name}`);
    if (!moduleCache.has(name)) {
      const path = name.slice(2);
      const source = [path + ".ts", path + ".tsx"].find((candidate) => {
        try { readFileSync(join(ROOT, candidate)); return true; } catch { return false; }
      });
      assert.ok(source, `Fuente no encontrada: ${name}`);
      moduleCache.set(name, loadSource(source));
    }
    return moduleCache.get(name);
  };
  new Function("require", "module", "exports", ...Object.keys(injected), output)(mockRequire, loaded, loaded.exports, ...Object.values(injected));
  return loaded.exports;
}

const session = { nombre: "Administradora QA", sedeNombre: "SEDE QA", rolNombre: "ADMIN", perfilNombre: "Administración QA", perfilTipo: "ADMINISTRADOR", perfilTipoLabel: "Administrador" };
const record = {
  id: 101, createdAt: "2026-10-24T17:30:00.000Z", puntoVenta: "SEDE QA", clienteNombre: "Cliente completo de prueba",
  tipoDocumento: "CC", documentoNumero: "0012345678", correo: "cliente.qa.correo.completo@example.com", whatsapp: "3012345678",
  direccion: "Calle de prueba número 123", barrio: "Barrio de prueba", plataformaCredito: "PAYJOY", creditoAutorizado: 1_000_000,
  cuotaInicial: 200_000, medioPago1Tipo: null, medioPago1Valor: null, medioPago2Tipo: null, medioPago2Valor: null,
  referenciaEquipo: "IPHONE REFERENCIA COMPLETA QA", serialImei: "001234567890123", tipoEquipo: "NUEVO", tipoProducto: "TELEFONIA",
  jaladorNombre: "Jalador QA", numeroFactura: null, estadoFacturacion: "PENDIENTE", siigoInvoiceId: null, siigoInvoiceName: null,
  siigoInvoiceStatus: null, siigoInvoiceUrl: null, siigoInvoiceError: null, siigoInvoiceCreatedAt: null, siigoCreditNoteId: null,
  siigoCreditNoteName: null, siigoCreditNoteStatus: null, siigoCreditNoteUrl: null, siigoCreditNoteError: null,
  siigoCreditNoteCreatedAt: null, estadoVentaRegistro: "PENDIENTE", ventaIdRelacionada: null, financierasDetalle: [],
};

function probe({ initial = {}, user = session, responses = {}, confirm = false } = {}) {
  const parsed = parseSource(WORKSPACE_PATH);
  const workspace = parsed.sourceFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "FacturadorRegistrosWorkspace");
  assert.ok(workspace?.body);
  const states = workspace.body.statements.flatMap((node) => ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap((declaration) => {
    return ts.isArrayBindingPattern(declaration.name) && declaration.initializer && ts.isCallExpression(declaration.initializer) && declaration.initializer.expression.getText(parsed.sourceFile) === "useState"
      ? [declaration.name.elements[0].name.getText(parsed.sourceFile)] : [];
  }) : []);
  const captureNames = ["esAdmin", "esAdministrativo", "esFacturador", "puedeVerReporteSiigo", "puedeEliminar", "cargarRegistros", "conteosFiltro", "registrosFiltrados", "registrosPaginados", "totalPaginas", "paginasVisibles", "guardarFactura", "emitirFacturaSiigo", "reenviarCorreoSiigo", "facturarPendientesSiigo", "consultarReporteSiigo", "emitirNotaCreditoSiigo", "quitarFacturaBorradaSiigo", "guardarEdicion", "eliminarRegistro", "navigationItems"];
  const returnNode = workspace.body.statements.find(ts.isReturnStatement);
  assert.ok(returnNode);
  const transformed = `${parsed.sourceText.slice(0, returnNode.getStart(parsed.sourceFile))}__capture({${captureNames.join(",")}});\n${parsed.sourceText.slice(returnNode.getStart(parsed.sourceFile))}`;
  const state = { registros: [record], cargando: false, ...initial };
  const calls = [];
  let captured, cursor = 0, effectCursor = 0, queuedEffects = [];
  const dependencies = [];
  const hooks = {
    useMemo: (fn) => fn(),
    useState(value) {
      const name = states[cursor++];
      assert.ok(name, "El harness debe conocer todos los estados del workspace");
      if (!(name in state)) state[name] = typeof value === "function" ? value() : value;
      return [state[name], (next) => { state[name] = typeof next === "function" ? next(state[name]) : next; }];
    },
    useEffect(fn, deps) {
      const index = effectCursor++;
      if (!dependencies[index] || deps.some((value, dep) => !Object.is(value, dependencies[index][dep]))) queuedEffects.push(fn);
      dependencies[index] = deps;
    },
  };
  const Page = loadSource(WORKSPACE_PATH, { react: hooks }, {
    __capture: (value) => { captured = value; },
    window: { confirm: (message) => { calls.push({ kind: "confirm", message }); return confirm; }, prompt: () => null },
    fetch: async (url, options) => {
      calls.push({ kind: "fetch", url, options });
      const result = await (typeof responses[url] === "function" ? responses[url](url, options) : responses[url] ?? { ok: true, data: { registro: state.registros[0] } });
      return { ok: result.ok, json: async () => result.data };
    },
  }, transformed).default;
  const render = () => { cursor = 0; effectCursor = 0; return Page({ session: user }); };
  render();
  queuedEffects = [];
  return { state, calls, render, get view() { return captured; }, async effects() { const work = queuedEffects; queuedEffects = []; await Promise.all(work.map((fn) => fn())); return render(); } };
}

function elements(node) {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== "object") return [node];
  if (typeof node.type === "function") return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}
function textOf(node) { return elements(node).filter((value) => typeof value === "string" || typeof value === "number").join(""); }
function findButton(tree, title) { return elements(tree).find((node) => node?.type === "button" && textOf(node) === title); }
function rowFor(tree, id) { return elements(tree).find((node) => node?.type === "tr" && node.key === String(id)); }
function visibleCells(row) { return elements(row).filter((node) => node?.type === "td" && !String(node.props.className || "").split(/\s+/).includes("hidden")); }

test("navegación real y perfil conservan módulos autorizados, cierre de sesión y permisos por rol", () => {
  for (const role of ["ADMIN", "AUDITOR", "FACTURADOR", "PERFIL_ADMINISTRATIVO"]) {
    const user = role === "PERFIL_ADMINISTRATIVO" ? { ...session, rolNombre: "SUPERVISOR", perfilTipo: "AUDITOR", perfilTipoLabel: "Auditor" }
      : { ...session, rolNombre: role, perfilTipo: role === "FACTURADOR" ? "FACTURADOR" : "", perfilTipoLabel: role };
    const current = probe({ user });
    const tree = current.render();
    assert.equal(elements(tree).some((node) => node?.type === "aside"), false);
    assert.ok(elements(tree).some((node) => node?.type === "nav" && node.props["aria-label"] === "Navegación principal"));
    assert.ok(textOf(tree).includes("Cerrar sesión"));
    const routes = new Set(elements(tree).filter((node) => node?.type === "a").map((node) => node.props.href));
    assert.ok(routes.has("/dashboard"));
    if (role !== "FACTURADOR") {
      for (const path of ["/ventas", "/inventario", "/prestamos", "/caja", "/cierre", "/dashboard/aprobaciones", "/dashboard/reportes", "/dashboard/sedes", "/ventas/aprobaciones"]) assert.ok(routes.has(path), `Falta ${path} para ${role}`);
    } else {
      assert.ok(routes.has("/facturador/registros"));
      assert.ok(!routes.has("/dashboard/sedes"));
      assert.ok(!routes.has("/ventas/aprobaciones"));
    }
    assert.equal(Boolean(findButton(tree, "Soporte Siigo")), ["ADMIN", "AUDITOR"].includes(role));
    assert.equal(elements(tree).some((node) => node?.type === "input" && node.props["aria-label"] === "Mes del reporte Siigo"), role !== "FACTURADOR");
    assert.equal(current.view.puedeEliminar, role === "ADMIN");
  }
  const accounting = probe({ user: { ...session, rolNombre: "USUARIO", perfilTipo: "FACTURADOR", perfilTipoLabel: "Facturador", perfilNombre: "CONTABILIDAD QA" } });
  assert.equal(accounting.view.puedeVerReporteSiigo, true, "Conserva la consulta autorizada para contabilidad");
  assert.equal(accounting.view.esAdmin, false);
  assert.equal(findButton(accounting.render(), "Soporte Siigo"), undefined);
});

test("tabla conserva cliente, contacto, IMEI textual y todas las financieras con sus importes completos", () => {
  const fixture = { ...record, financierasDetalle: [
    { plataformaCredito: "PAYJOY", creditoAutorizado: 1_000_000, cuotaInicial: 200_000 },
    { plataformaCredito: "FINSER PAY", creditoAutorizado: 800_000, cuotaInicial: null },
  ] };
  const current = probe({ initial: { registros: [fixture] } });
  const tree = current.render();
  const cells = visibleCells(rowFor(tree, fixture.id));
  assert.equal(cells.length, 7);
  const text = cells.map(textOf).join(" ");
  for (const value of [fixture.clienteNombre, fixture.documentoNumero, fixture.correo, fixture.whatsapp, fixture.direccion, fixture.barrio, fixture.serialImei, fixture.referenciaEquipo, "PAYJOY", "FINSER PAY", "$ 1.000.000", "$ 800.000", "$ 200.000"]) assert.ok(text.includes(value), `Se perdió ${value}`);
  assert.equal(current.calls.length, 0, "Renderizar no registra facturas ni pagos");
});

test("filtros se combinan sobre todos los registros antes de paginar y los indicadores conservan cobertura completa", async () => {
  const stock = Array.from({ length: 60 }, (_, index) => ({ ...record, id: index + 1, clienteNombre: index >= 30 ? "Cliente fuera de primera página" : "Otro cliente", numeroFactura: index >= 55 ? "FV-000" + index : null, estadoFacturacion: index >= 55 ? "FACTURADO" : "PENDIENTE" }));
  const current = probe({ initial: { registros: stock, paginaActual: 3 } });
  assert.equal(current.view.registrosPaginados.length, 10);
  current.state.busqueda = "fuera de primera página";
  current.state.filtroActivo = "PENDIENTES";
  current.render();
  const tree = await current.effects();
  assert.equal(current.state.paginaActual, 1);
  assert.equal(current.view.registrosFiltrados.length, 25);
  assert.deepEqual(current.view.registrosPaginados.map((item) => item.id), stock.slice(30, 55).map((item) => item.id));
  assert.equal(current.view.totalPaginas, 1);
  assert.equal(current.view.conteosFiltro.TODOS, 60);
  assert.equal(current.view.conteosFiltro.FACTURADOS, 5);
  assert.ok(textOf(tree).includes("Mostrando 1–25 de 25"));
  assert.equal(current.calls.length, 0);
});

test("acciones de fila mantienen restricciones de conversión, facturación, soporte y eliminación", () => {
  const stock = [
    record,
    { ...record, id: 102, estadoVentaRegistro: "CONVERTIDO_EN_VENTA", ventaIdRelacionada: 7 },
    { ...record, id: 103, estadoVentaRegistro: "CONVERTIDO_EN_VENTA", ventaIdRelacionada: 8, numeroFactura: "FV-0000123", estadoFacturacion: "FACTURADO", siigoInvoiceId: "siigo-103", siigoInvoiceName: "FV-0000123", siigoInvoiceUrl: "https://qa.test/fv123" },
    { ...record, id: 104, estadoFacturacion: "NOTA_CREDITO", siigoCreditNoteId: "nc-104", siigoCreditNoteName: "NC-0000123" },
    { ...record, id: 105, creditoAutorizado: 2_500_000, cuotaInicial: 100_000, ventaIdRelacionada: 9 },
  ];
  for (const rolNombre of ["ADMIN", "AUDITOR", "FACTURADOR"]) {
    const current = probe({ user: { ...session, rolNombre, perfilTipo: rolNombre === "FACTURADOR" ? "FACTURADOR" : "", perfilTipoLabel: rolNombre }, initial: { registros: stock, modoSoporteSiigo: true } });
    const tree = current.render();
    assert.equal(findButton(rowFor(tree, 101), "Pendiente venta").props.disabled, true);
    assert.equal(findButton(rowFor(tree, 102), "Enviar a Siigo").props.disabled, false);
    assert.equal(findButton(rowFor(tree, 102), "Modificar").props.disabled, rolNombre === "FACTURADOR");
    assert.equal(findButton(rowFor(tree, 103), "Emitida en Siigo").props.disabled, true);
    assert.ok(findButton(rowFor(tree, 103), "Reenviar correo"));
    assert.equal(Boolean(findButton(rowFor(tree, 103), "Emitir NC")), rolNombre !== "FACTURADOR");
    assert.equal(Boolean(findButton(rowFor(tree, 103), "Quitar factura borrada")), rolNombre !== "FACTURADOR");
    assert.equal(Boolean(findButton(rowFor(tree, 101), "Eliminar")), rolNombre === "ADMIN");
    assert.equal(Boolean(findButton(rowFor(tree, 104), "Quitar del panel")), rolNombre === "ADMIN");
    assert.equal(findButton(rowFor(tree, 105), "Supera tope").props.disabled, true);
    assert.equal(findButton(rowFor(tree, 104), "Modificar"), undefined);
    assert.equal(current.calls.length, 0);
  }
});

test("consulta de reporte y guardado de número conservan los endpoints; error conserva borrador y confirmación cancelada no envía", async () => {
  const current = probe({ initial: { registros: [{ ...record, ventaIdRelacionada: 7 }], facturasDraft: { 101: "0000123" }, reporteSiigoMes: "2026-10" }, responses: {
    "/api/facturador/registros": { ok: false, data: { error: "Error simulado de guardado" } },
    "/api/facturador/siigo/reporte?month=2026-10": { ok: true, data: { reporte: { neto: 1_000_000, facturas: { cantidad: 1, valor: 1_000_000 }, notasCredito: { cantidad: 0, valor: 0 } } } },
  } });
  await current.view.guardarFactura(101);
  assert.equal(current.state.facturasDraft[101], "0000123");
  assert.equal(current.state.mensaje, "Error simulado de guardado");
  const request = current.calls.find((call) => call.kind === "fetch");
  assert.equal(request.url, "/api/facturador/registros");
  assert.equal(request.options.method, "PATCH");
  assert.deepEqual(JSON.parse(request.options.body), { id: 101, numeroFactura: "0000123" });
  await current.view.consultarReporteSiigo();
  assert.equal(current.state.reporteSiigo.neto, 1_000_000);
  assert.ok(current.calls.some((call) => call.url === "/api/facturador/siigo/reporte?month=2026-10" && call.options.cache === "no-store"));
  const before = current.calls.filter((call) => call.kind === "fetch").length;
  await current.view.emitirFacturaSiigo(101);
  await current.view.emitirNotaCreditoSiigo(101);
  await current.view.eliminarRegistro(101);
  assert.equal(current.calls.filter((call) => call.kind === "fetch").length, before, "Las tres operaciones mantienen su confirmación");
  assert.equal(current.calls.filter((call) => call.kind === "confirm").length, 3);
});

test("carga, ausencia y error permanecen diferenciados y modificar conserva el formulario completo", () => {
  const loading = probe({ initial: { cargando: true } }).render();
  assert.ok(textOf(loading).includes("Cargando registros"));
  const loadingSummary = elements(loading).find((node) => node?.type === "section" && node.props["aria-label"] === "Resumen de registros");
  assert.equal(elements(loadingSummary).filter((node) => node?.type === "strong" && textOf(node) === "—").length, 6, "No presenta ceros ficticios durante la carga");
  assert.ok(textOf(probe({ initial: { registros: [] } }).render()).includes("No hay registros"));
  const failed = probe({ initial: { registros: [], mensajeTipo: "error", mensaje: "Error de consulta QA" } }).render();
  assert.ok(textOf(failed).includes("Error de consulta QA"));
  assert.ok(!textOf(failed).includes("No hay registros guardados"), "Un error no se presenta como inventario vacío");
  assert.ok(findButton(failed, "Reintentar"));
  const errorSummary = elements(failed).find((node) => node?.type === "section" && node.props["aria-label"] === "Resumen de registros");
  assert.equal(elements(errorSummary).filter((node) => node?.type === "strong" && textOf(node) === "—").length, 6);
  const current = probe();
  findButton(rowFor(current.render(), 101), "Modificar").props.onClick();
  const modal = current.render();
  const labels = elements(modal).filter((node) => node?.type === "label").map(textOf).join(" ");
  for (const field of ["Tipo de identificacion", "Numero de cedula", "Nombre completo", "Correo electronico", "WhatsApp", "Direccion", "Barrio", "Referencia", "IMEI", "Numero de factura", "Estado"]) assert.ok(labels.toLowerCase().includes(field.toLowerCase()), `Falta campo de edición: ${field}`);
  assert.ok(findButton(modal, "Guardar cambios"));
  assert.ok(findButton(modal, "Cancelar"));
  assert.equal(current.state.editando.documentoNumero, record.documentoNumero);
  assert.equal(current.state.editando.serialImei, record.serialImei);
  assert.equal(current.calls.length, 0);
});
