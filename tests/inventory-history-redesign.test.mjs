import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PAGE = "app/inventario/historial/page.tsx";
const PARTS = "app/inventario/historial/traceability-parts.tsx";
const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const IMEI = "001234567890123";
const admin = { id: 91, nombre: "Administradora QA", perfilNombre: "Perfil QA", rolNombre: "ADMIN", sedeId: 3, sedeNombre: "SEDE QA 3" };
const at = hour => new Date(`2026-10-14T${String(hour).padStart(2, "0")}:30:00.000Z`);
const sedes = [{ id: 1, nombre: "BODEGA PRINCIPAL" }, { id: 3, nombre: "SEDE QA 3" }];
const fixture = {
  principal: { id: 901, imei: IMEI, referencia: "IPHONE QA 128GB", color: "NEGRO", costo: 1200000.25, estado: "PRESTAMO", estadoCobro: "PENDIENTE", sedeDestinoId: 3, numeroFactura: "0000123", distribuidor: "Distribuidor QA", observacion: "Ingreso de prueba", createdAt: at(0), fechaEnvio: at(1) },
  inventarios: [{ id: 902, imei: IMEI, sedeId: 3, sede: sedes[1], referencia: "IPHONE QA 128GB", estadoActual: "BODEGA", estadoAnterior: "TRASLADO", estadoFinanciero: "DEUDA", deboA: "", origen: "PRINCIPAL", costo: 1300000.75, observacion: "Ingreso en sede QA", createdAt: at(2), updatedAt: at(3) }],
  movimientos: [
    { id: 903, imei: IMEI, referencia: "IPHONE QA 128GB", color: "NEGRO", costo: 1200000.25, tipoMovimiento: "SALIDA_PRINCIPAL_A_SEDE", sedeId: 3, deboA: "BODEGA PRINCIPAL", estadoFinanciero: "DEUDA", origen: "PRINCIPAL", observacion: "Salida de prueba", createdAt: at(4) },
    { id: 904, imei: IMEI, referencia: "IPHONE QA 128GB", tipoMovimiento: "EDICION_PRINCIPAL", sedeId: 1, observacion: "Fecha inválida de prueba", createdAt: new Date("invalid") },
  ],
  prestamos: [{ id: 905, imei: IMEI, sedeOrigenId: 1, sedeDestinoId: 3, estado: "APROBADO", costo: 1200000.25, montoPago: 1200000.25, createdAt: at(5), fechaSolicitudPago: at(6), fechaAprobacionPago: at(7) }],
  caja: [
    { id: 906, sedeId: 3, sede: sedes[1], tipo: "INGRESO", concepto: `Recaudo ${IMEI}`, descripcion: "Recaudo de prueba", valor: 2000000.25, createdAt: at(8) },
    { id: 907, sedeId: 3, sede: sedes[1], tipo: "EGRESO", concepto: `Egreso ${IMEI}`, descripcion: "Egreso de prueba", valor: 150000.5, createdAt: at(9) },
  ],
  cajaSede: [{ id: 908, sedeId: 1, sede: sedes[0], prestamoId: 905, tipo: "INGRESO", concepto: "Préstamo interno de prueba", valor: 999999, createdAt: at(10) }],
  registros: [{ id: 909, serialImei: IMEI, sedeId: 3, sede: sedes[1], clienteNombre: "Cliente QA de nombre completo", plataformaCredito: "PAYJOY", estadoFacturacion: "PENDIENTE", estadoVentaRegistro: "PENDIENTE", ventaIdRelacionada: null, asesorNombre: "Asesor QA", jaladorNombre: "Jalador QA", cerradorNombre: "Cerrador QA", createdAt: at(11), updatedAt: at(11) }],
  ventas: [{ id: 910, serial: IMEI, sedeId: 3, sede: sedes[1], idVenta: "V-0000910", servicio: "FINANCIERA", inventarioSedeId: null, usuario: { nombre: "Usuario QA" }, ingreso: 2000000.25, utilidad: 200000, salida: 10000, cajaOficina: 5000, jalador: "Jalador QA", cerrador: "Cerrador QA", fecha: at(12), createdAt: at(12) }],
};

function source(file) { return readFileSync(join(ROOT, file), "utf8"); }
function components(node) {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(components);
  if (typeof node !== "object") return [node];
  if (typeof node.type === "function") return node.type.constructor.name === "AsyncFunction" ? [node] : [node, ...components(node.type(node.props))];
  return [node, ...components(node.props?.children)];
}
function textOf(node) { return components(node).filter(value => typeof value === "string" || typeof value === "number").join(" ").replace(/\s+/g, " ").trim(); }
function find(tree, predicate) { const result = components(tree).find(node => typeof node === "object" && predicate(node)); assert.ok(result, "No se encontró el elemento esperado"); return result; }

function probe({ user = admin, data = fixture, imei = IMEI, failModel, pending = false } = {}) {
  const calls = [], pushes = [], cache = new Map();
  let view;
  const models = {
    inventarioPrincipal: { findUnique: () => data.principal },
    inventarioSede: { findMany: () => data.inventarios },
    movimientoInventario: { findMany: args => args.where?.tipoMovimiento?.in ? data.movimientos.filter(row => args.where.tipoMovimiento.in.includes(row.tipoMovimiento) && Number.isFinite(row.createdAt.getTime())) : data.movimientos },
    prestamoSede: { findMany: () => data.prestamos },
    cajaMovimiento: { findMany: () => data.caja },
    movimientoCajaSede: { findMany: () => data.cajaSede },
    registroVendedorVenta: { findMany: () => data.registros },
    venta: { findMany: () => data.ventas },
    sede: { findMany: () => sedes, findFirst: () => sedes[0] },
  };
  const prisma = Object.fromEntries(Object.entries(models).map(([model, methods]) => [model, new Proxy({}, { get(_target, method) {
    assert.ok(method in methods, `La consulta nunca debe mutar ${model}.${String(method)}`);
    return async args => { calls.push({ model, method, args }); if (model === failModel) throw new Error("Error sintético de consulta"); return methods[method](args); };
  } })]));
  const hooks = {
    Fragment: Symbol.for("react.fragment"), useEffect() {}, useRef: value => ({ current: value }),
    useState: value => [typeof value === "function" ? value() : value, () => {}],
    useTransition: () => [pending, callback => callback()],
  };
  const mocks = {
    react: hooks, "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: ({ children, ...props }) => jsx.jsx("a", { ...props, children }) },
    "next/image": { __esModule: true, default: ({ src, alt, width, height }) => jsx.jsx("img", { src, alt, width, height }) },
    "next/navigation": { redirect: href => { throw new Error(`REDIRECT:${href}`); }, useRouter: () => ({ push: href => pushes.push(href) }) },
    "@/app/dashboard/_components/logout-button": { __esModule: true, default: () => jsx.jsx("button", { children: "Cerrar sesión" }) },
    "@/app/dashboard/_components/operations-dashboard": { DashboardSidebar: () => jsx.jsx("aside", {}) },
    "@/app/ventas/_components/sales-dashboard-parts": { SalesProfile: ({ name, role }) => jsx.jsxs("details", { "data-profile": true, children: [name, role, jsx.jsx("button", { children: "Cerrar sesión" })] }) },
    "@/lib/prisma": { __esModule: true, default: prisma },
    "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/prestamos": { NOMBRE_SEDE_BODEGA: "BODEGA PRINCIPAL", etiquetaEstadoInventario: value => String(value).replaceAll("_", " ") },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    let input = source(file);
    if (file === PAGE) {
      const ast = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const page = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "HistorialInventarioPage");
      const lastReturn = page.body.statements.filter(ts.isReturnStatement).at(-1);
      const names = ["imei", "totalEventos", "timelineOrdenado", "ultimoEvento", "cicloDetectado", "ubicacionActual", "estadoActual", "estadoFinancieroActual", "valorEquipo", "totalIngresoCaja", "totalEgresoCaja", "alertasControl", "quickActions", "navigationItems", "cobertura"];
      input = `${input.slice(0, lastReturn.getStart(ast))}__capture({${names.join(",")}});\n${input.slice(lastReturn.getStart(ast))}`;
    }
    const output = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const loaded = { exports: {} }; cache.set(file, loaded.exports);
    const localRequire = name => {
      if (name in mocks) return mocks[name];
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      const target = name.startsWith("@/") ? name.slice(2) : name.startsWith(".") ? join(dirname(file), name) : null;
      assert.ok(target, `Import no cubierto ${name}`);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find(candidate => existsSync(join(ROOT, candidate)));
      assert.ok(resolved, `Módulo no encontrado ${name}`);
      return load(resolved);
    };
    new Function("require", "module", "exports", "__capture", "FormData", output)(localRequire, loaded, loaded.exports, value => { view = value; }, class { constructor(form) { this.form = form; } get(name) { return this.form[name]; } });
    cache.set(file, loaded.exports);
    return loaded.exports;
  }
  return { calls, pushes, load, get view() { return view; }, page: () => load(PAGE).default({ searchParams: Promise.resolve({ imei }) }) };
}

test("sin sesión redirige antes de consultar inventario o datos financieros", async () => {
  const instance = probe({ user: null });
  await assert.rejects(instance.page(), /^Error: REDIRECT:\/$/);
  assert.equal(instance.calls.length, 0);
});

test("normaliza IMEI como texto sin perder ceros y consulta todas las fuentes mediante lectura", async () => {
  const instance = probe({ imei: "00 1234567890123" });
  await instance.page();
  assert.equal(instance.view.imei, IMEI);
  for (const model of ["inventarioPrincipal", "inventarioSede", "movimientoInventario", "prestamoSede", "venta", "registroVendedorVenta", "cajaMovimiento", "movimientoCajaSede", "sede"]) assert.ok(instance.calls.some(call => call.model === model), model);
  for (const call of instance.calls.filter(call => ["inventarioPrincipal", "inventarioSede", "movimientoInventario", "prestamoSede"].includes(call.model))) assert.equal(call.args.where.imei, IMEI);
  assert.equal(instance.calls.find(call => call.model === "venta").args.where.serial, IMEI);
  assert.equal(instance.calls.find(call => call.model === "registroVendedorVenta").args.where.serialImei, IMEI);
  assert.deepEqual(instance.calls.find(call => call.model === "cajaMovimiento").args.where.OR, [{ concepto: { contains: IMEI } }, { descripcion: { contains: IMEI } }]);
  assert.deepEqual(instance.calls.find(call => call.model === "movimientoCajaSede").args.where, { prestamoId: { in: [905] } });
  assert.ok(instance.calls.every(call => String(call.method).startsWith("find")));
});

test("línea de tiempo conserva todos los eventos, elimina fechas inválidas y ordena del primero al último", async () => {
  const instance = probe(); const tree = await instance.page();
  const { timelineOrdenado, totalEventos, ultimoEvento, cicloDetectado } = instance.view;
  assert.equal(totalEventos, 13);
  assert.deepEqual(timelineOrdenado.map(row => row.id), ["principal-901", "principal-envio-901", "inventario-sede-902", "inventario-sede-update-902", "movimiento-903", "prestamo-905", "prestamo-solicitud-pago-905", "prestamo-aprobacion-pago-905", "caja-906", "caja-907", "movimiento-caja-sede-908", "registro-venta-909", "venta-910"]);
  assert.equal(ultimoEvento.id, "venta-910");
  assert.ok(cicloDetectado.every(step => step.active));
  const text = textOf(tree);
  for (const label of ["Registro en Bodega Principal", "Ingreso o presencia en sede", "Actualizacion de inventario sede", "SALIDA_PRINCIPAL_A_SEDE", "Prestamo #905", "Solicitud de pago", "Aprobacion de pago", "Ingreso de caja", "Egreso de caja", "Ingreso en caja de prestamo", "Registro comercial #909", "Venta V-0000910", "0000123", "Distribuidor QA", "Cliente QA de nombre completo", "Jalador QA", "Cerrador QA"]) assert.ok(text.includes(label), label);
});

test("indicadores conservan la ubicación actual, deuda, precisión y caja real sin sumar dos veces la caja de préstamo", async () => {
  const instance = probe(); const tree = await instance.page();
  const view = instance.view;
  assert.equal(view.ubicacionActual, "SEDE QA 3");
  assert.equal(view.estadoActual, "BODEGA");
  assert.equal(view.estadoFinancieroActual, "DEUDA");
  assert.equal(view.valorEquipo, 1300000.75);
  assert.equal(view.totalIngresoCaja, 2000000.25);
  assert.equal(view.totalEgresoCaja, 150000.5);
  const text = textOf(tree);
  for (const money of ["$ 1.300.000,75", "$ 2.000.000,25", "$ 150.000,5", "$ 999.999"]) assert.ok(text.includes(money), money);
  assert.ok(view.alertasControl.some(row => row.titulo === "Deuda sin acreedor"));
  assert.ok(view.alertasControl.some(row => row.titulo === "Venta con inventario abierto"));
  assert.ok(view.alertasControl.some(row => row.titulo === "Venta sin inventario enlazado"));
  const first = view.timelineOrdenado[0];
  const eventComponent = components(tree).find(node => typeof node === "object" && node.props?.event?.id === first.id);
  assert.ok(eventComponent, "El primer evento se representa con todos sus datos");
  const date = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(first.fecha);
  assert.ok(textOf(eventComponent).includes(date));
  assert.match(date, /13/);
});

test("navegación superior conserva Inventario activo, CIERRE, permisos de configuración, perfil y destinos", async () => {
  for (const role of ["ADMIN", "AUDITOR", "SUPERVISOR"]) {
    const instance = probe({ user: { ...admin, rolNombre: role } }); const tree = await instance.page();
    assert.ok(!components(tree).some(node => node?.type?.name === "DashboardSidebar"), "El rediseño sustituye la navegación lateral");
    const nav = find(tree, node => node.type === "nav" && node.props["aria-label"] === "Navegación principal");
    const links = components(nav).filter(node => node?.type === "a");
    for (const href of ["/dashboard", "/ventas", "/inventario", "/prestamos", "/caja", "/cierre", "/dashboard/aprobaciones"]) assert.ok(links.some(node => node.props.href === href), `${role}: ${href}`);
    assert.equal(find(nav, node => node.type === "a" && node.props["aria-current"] === "page").props.href, "/inventario");
    assert.equal(links.some(node => node.props.href === "/dashboard/sedes"), role !== "SUPERVISOR");
    assert.ok(links.some(node => node.props.href === (role === "SUPERVISOR" ? "/dashboard/analitico" : "/dashboard/reportes")));
    assert.equal(instance.view.cobertura, role === "SUPERVISOR" ? "SEDE QA 3" : "Todas las sedes");
    const text = textOf(tree); for (const label of [admin.nombre, role, "Cerrar sesión"]) assert.ok(text.includes(label));
    assert.ok(components(tree).some(node => node?.type === "img" && node.props.src === "/branding/conectamos-logo.png"));
    const actions = instance.view.quickActions;
    assert.ok(actions.some(row => row.href === "/ventas/editar/910"));
    assert.equal(actions.some(row => row.href === "/dashboard/auditoria"), role !== "SUPERVISOR");
  }
});

test("consulta inicial y sin coincidencias son distintas y no escriben datos", async () => {
  const initial = probe({ imei: "" }); const initialTree = await initial.page();
  assert.equal(initial.calls.length, 0);
  assert.ok(textOf(initialTree).includes("Consulta la historia de tu equipo"));
  const noData = { principal: null, inventarios: [], movimientos: [], prestamos: [], caja: [], cajaSede: [], registros: [], ventas: [] };
  const empty = probe({ data: noData }); const tree = await empty.page();
  assert.equal(empty.view.totalEventos, 0);
  assert.equal(empty.view.ultimoEvento, null);
  assert.ok(textOf(tree).includes("Sin eventos relacionados"));
  assert.ok(empty.view.cicloDetectado.every(step => !step.active));
  assert.ok(empty.view.alertasControl.some(alert => alert.titulo === "IMEI sin trazabilidad"));
  assert.ok(!empty.calls.some(call => call.model === "movimientoCajaSede"));
});

test("BODEGA mantiene la consulta logística restringida y nunca consulta ventas, registros o caja", async () => {
  const instance = probe({ user: { ...admin, rolNombre: "BODEGA" } }); const tree = await instance.page();
  const bodegaElement = components(tree).find(node => typeof node === "object" && node.type?.name === "BodegaHistory");
  assert.ok(bodegaElement, "El rol BODEGA conserva su componente restringido");
  const result = await bodegaElement.type(bodegaElement.props);
  const nav = find(result, node => node.type === "nav");
  const hrefs = components(nav).filter(node => node?.type === "a").map(node => node.props.href);
  for (const href of ["/dashboard", "/inventario-principal", "/inventario/nuevo", "/prestamos", "/dashboard/radar", "/dashboard#quien-me-debe"]) assert.ok(hrefs.includes(href), href);
  assert.ok(!instance.calls.some(call => ["venta", "registroVendedorVenta", "cajaMovimiento", "movimientoCajaSede", "inventarioSede"].includes(call.model)));
  const movement = instance.calls.find(call => call.model === "movimientoInventario");
  assert.deepEqual(movement.args.where.tipoMovimiento.in, ["INGRESO_PRINCIPAL", "SALIDA_PRINCIPAL_A_SEDE", "EDICION_PRINCIPAL", "CORRECCION_RETORNO_PRINCIPAL"]);
  const loans = instance.calls.find(call => call.model === "prestamoSede");
  assert.deepEqual(loans.args.where.OR, [{ sedeOrigenId: 1 }, { sedeDestinoId: 1 }]);
  assert.ok(!textOf(result).includes("Cliente QA de nombre completo"));
  assert.ok(!textOf(result).includes("Recaudo de prueba"));
});

test("BODEGA no revela equipos ajenos a principal ni consulta otras tablas cuando no existe el IMEI", async () => {
  for (const imei of ["", "123", IMEI]) {
    const instance = probe({ user: { ...admin, rolNombre: "BODEGA" }, data: { ...fixture, principal: null }, imei });
    const tree = await instance.page();
    const bodegaElement = components(tree).find(node => typeof node === "object" && node.type?.name === "BodegaHistory");
    const result = await bodegaElement.type(bodegaElement.props);
    assert.ok(textOf(result).includes("No se encontró un equipo de bodega principal"));
    assert.deepEqual(instance.calls.map(call => call.model), imei === IMEI ? ["inventarioPrincipal"] : []);
  }
});

test("fallo de consulta no puede mostrarse como historial vacío ni operación exitosa", async () => {
  const instance = probe({ failModel: "inventarioPrincipal" });
  await assert.rejects(instance.page(), /Error sintético de consulta/);
  assert.equal(instance.view, undefined);
  assert.ok(instance.calls.every(call => String(call.method).startsWith("find")));
});

test("formulario consulta IMEI completo por GET, preserva ceros y bloquea reenvío mientras carga", () => {
  for (const pending of [false, true]) {
    const instance = probe({ pending });
    const Search = instance.load(PARTS).TraceabilitySearch;
    const tree = Search({ imei: IMEI });
    const form = find(tree, node => node.type === "form");
    const input = find(tree, node => node.type === "input" && node.props.name === "imei");
    const button = find(tree, node => node.type === "button" && node.props.type === "submit");
    assert.equal(input.props.type, "text"); assert.equal(input.props.defaultValue, IMEI);
    assert.equal(form.props.action, "/inventario/historial");
    assert.equal(form.props.method ?? "get", "get");
    assert.equal(button.props.disabled, pending);
    assert.equal(form.props["aria-busy"], pending);
    let prevented = false;
    form.props.onSubmit({ preventDefault() { prevented = true; }, currentTarget: { imei: IMEI } });
    assert.ok(prevented);
    assert.deepEqual(instance.pushes, pending ? [] : [`/inventario/historial?imei=${IMEI}`]);
    assert.ok(textOf(button).includes(pending ? "Consultando…" : "Buscar IMEI"));
    assert.ok(components(tree).some(node => node?.type === "a" && node.props.href === "/inventario/historial"));
  }
});

test("carga y error tienen estados propios y permiten reintentar sin crear operaciones", () => {
  const instance = probe();
  const loading = instance.load("app/inventario/historial/loading.tsx").default();
  assert.equal(find(loading, node => node.type === "main").props["aria-busy"], "true");
  assert.ok(textOf(loading).includes("Consultando el historial del equipo…"));
  let retries = 0;
  const error = instance.load("app/inventario/historial/error.tsx").default({ reset: () => { retries++; } });
  assert.ok(textOf(find(error, node => node.props.role === "alert")).includes("No se pudo consultar el historial"));
  assert.equal(retries, 0);
  find(error, node => node.type === "button" && textOf(node).includes("Reintentar")).props.onClick();
  assert.equal(retries, 1);
  assert.ok(components(error).some(node => node?.type === "a" && node.props.href === "/inventario/historial"));
  assert.equal(instance.calls.length, 0);
});
