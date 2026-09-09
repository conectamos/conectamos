import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

// Run the actual memo callback without mounting the surrounding dashboard.
function evaluateWorkspaceMemo(name, bindings) {
  const source = read("app/dashboard/proveedores/workspace.tsx");
  const sourceFile = ts.createSourceFile(
    "workspace.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === name) {
      declaration = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  assert.ok(declaration && ts.isCallExpression(declaration.initializer));
  const helpers = sourceFile.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        ["normalizeText", "dateKey"].includes(node.name?.text),
    )
    .map((node) => node.getText(sourceFile))
    .join("\n");
  const callback = declaration.initializer.arguments[0].getText(sourceFile);
  const { outputText } = ts.transpileModule(
    helpers + "\nfunction run() { return (" + callback + ")(); }",
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  return new Function(...Object.keys(bindings), outputText + "\nreturn run();")(
    ...Object.values(bindings),
  );
}

const filterInvoices = [
  { id: 1, aliado: "JG COMPANY", numeroFactura: "ONL238", estado: "PAGADO", categoria: "PAGADA", fechaVencimiento: "2026-09-05" },
  { id: 2, aliado: "JG COMPANY", numeroFactura: "ONL236", estado: "PENDIENTE", categoria: "VENCIDA", fechaVencimiento: "2026-09-05" },
  { id: 3, aliado: "JAVIER TROPAS", numeroFactura: "ONL228", estado: "PENDIENTE", categoria: "PENDIENTE", fechaVencimiento: "2026-09-13" },
  { id: 4, aliado: "JG COMPANY SUR", numeroFactura: "ONL236", estado: "PENDIENTE", categoria: "VENCIDA", fechaVencimiento: "2026-09-05" },
  { id: 5, aliado: "JG COMPANY", numeroFactura: "ONL262", estado: "PENDIENTE", categoria: "PENDIENTE", fechaVencimiento: "2026-09-18" },
];

function filteredInvoiceIds(overrides = {}) {
  return evaluateWorkspaceMemo("filteredInvoices", {
    visibleInvoices: filterInvoices,
    allyFilter: "",
    query: "",
    statusFilter: "TODAS",
    ...overrides,
  }).map((invoice) => invoice.id);
}

test("el selector de aliado es exacto y Todos los aliados conserva todas las facturas", () => {
  assert.deepEqual(filteredInvoiceIds({ allyFilter: "JG COMPANY" }), [2, 5, 1]);
  assert.deepEqual(filteredInvoiceIds(), [2, 4, 3, 5, 1]);
  assert.deepEqual(filterInvoices.map((invoice) => invoice.id), [1, 2, 3, 4, 5]);
});

test("aliado, búsqueda y estado se combinan sin perder pagos aprobados ni estados vacíos", () => {
  assert.deepEqual(
    filteredInvoiceIds({ allyFilter: "JG COMPANY", query: "onl236", statusFilter: "VENCIDA" }),
    [2],
  );
  assert.deepEqual(
    filteredInvoiceIds({ allyFilter: "JG COMPANY", query: "onl", statusFilter: "PAGADA" }),
    [1],
  );
  assert.deepEqual(
    filteredInvoiceIds({ allyFilter: "JAVIER TROPAS", statusFilter: "VENCIDA" }),
    [],
  );
  assert.deepEqual(
    filteredInvoiceIds({ allyFilter: "JG COMPANY", query: "inexistente" }),
    [],
  );
});

test("las opciones de aliados son únicas, ordenadas y parten de todas las facturas", () => {
  assert.deepEqual(
    evaluateWorkspaceMemo("knownAllies", {
      invoices: filterInvoices,
      filteredInvoices: [],
      allyFilter: "JG COMPANY",
      query: "inexistente",
      statusFilter: "VENCIDA",
    }),
    ["JAVIER TROPAS", "JG COMPANY", "JG COMPANY SUR"],
  );
});

test("el selector accesible comparte catálogo y limpiar filtros también restablece el aliado", () => {
  const source = read("app/dashboard/proveedores/workspace.tsx");
  assert.match(source, /Aliado\s*<select\s*value=\{allyFilter\}/);
  assert.match(source, /onChange=\{\(event\) => setAllyFilter\(event\.target\.value\)\}/);
  assert.match(source, /<option value="">Todos los aliados<\/option>/);
  assert.match(source, /knownAllies\.map\(\(ally\) => \(\s*<option key=\{ally\} value=\{ally\}>/);
  assert.match(source, /\[allyFilter, query, statusFilter, visibleInvoices\]/);
  assert.match(source, /setQuery\(""\);\s*setAllyFilter\(""\);\s*setStatusFilter\("TODAS"\);/);
  assert.match(source, /\{filteredInvoices\.length\} de \{visibleInvoices\.length\}/);
  assert.match(source, /selecciona todos los aliados y estados/);
  assert.match(source, /sm:grid-cols-2 xl:grid-cols-/);
});

test("Proveedores reemplaza Funciones sin perder Radar ni Inconsistencias", () => {
  const source = read("app/dashboard/_components/operations-dashboard.tsx");
  const inventoryStart = source.indexOf('title: "Inventario y préstamos"');
  const cashStart = source.indexOf('title: "Caja y finanzas"');
  const commercialStart = source.indexOf('title: "Registro comercial"');
  const suppliersStart = source.indexOf('title: "Proveedores"');

  assert.ok(inventoryStart >= 0 && cashStart > inventoryStart);
  assert.ok(commercialStart >= 0 && suppliersStart > commercialStart);
  assert.match(source.slice(inventoryStart, cashStart), /Abrir radar/);
  assert.match(
    source.slice(commercialStart, suppliersStart),
    /Inconsistencias de créditos/,
  );
  assert.doesNotMatch(source, /title: "Funciones"/);
  assert.match(
    source.slice(suppliersStart),
    /href: "\/dashboard\/proveedores"[\s\S]*label: "Gestionar proveedores"/,
  );
});

test("Proveedores conserva su posición final en el centro de herramientas", () => {
  const source = read(
    "app/dashboard/_components/operations-tool-center.tsx",
  );

  assert.match(
    source,
    /"Análisis",\s*"Proveedores",\s*\];/,
  );
});

test("la página servidor protege la ruta con la capacidad de proveedores", () => {
  const source = read("app/dashboard/proveedores/page.tsx");

  assert.match(source, /await requireSessionPage\(\)/);
  assert.match(
    source,
    /puedeGestionarProveedores\(session\.perfilTipo, session\.rolNombre\)/,
  );
  assert.match(source, /redirect\("\/dashboard"\)/);
});

test("el workspace cubre alta, pago confirmado y configuración push", () => {
  const source = read("app/dashboard/proveedores/workspace.tsx");

  assert.match(source, /fetch\("\/api\/proveedores"/);
  assert.match(
    source,
    /`\/api\/proveedores\/\$\{approvalInvoice\.id\}\/aprobar-pago`/,
  );
  assert.match(source, /APROBAR PAGO/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /register\("\/proveedores-sw\.js"/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /Probar notificación/);
  assert.match(source, /recordatorio-local/);
});

test("la tabla y las tarjetas muestran total, abonado y saldo por factura", () => {
  const source = read("app/dashboard/proveedores/workspace.tsx");
  const desktopStart = source.indexOf("<table");
  const desktopEnd = source.indexOf("</table>", desktopStart);
  const mobileStart = source.indexOf('className="grid gap-3 lg:hidden"');
  const mobileEnd = source.indexOf("</section>", mobileStart);

  assert.ok(desktopStart >= 0 && desktopEnd > desktopStart);
  assert.ok(mobileStart >= 0 && mobileEnd > mobileStart);

  const desktop = source.slice(desktopStart, desktopEnd);
  const mobile = source.slice(mobileStart, mobileEnd);

  for (const view of [desktop, mobile]) {
    assert.match(view, /(?:Valor|Total)(?: de la)? factura|Total/i);
    assert.match(view, /Abonado/i);
    assert.match(view, /Saldo/i);
    assert.match(view, /invoice\.valorFactura/);
    assert.match(view, /invoice\.valorAbonado/);
    assert.match(view, /invoice\.saldoPendiente/);
  }

  assert.match(source, /cantidadAbonos/);
  assert.match(source, /ABONAR \/ PAGAR/);
});

test("el modal aplica un abono a la factura elegida y anticipa el nuevo saldo", () => {
  const source = read("app/dashboard/proveedores/workspace.tsx");
  const modalStart = source.indexOf("approvalInvoice &&");
  const modal = source.slice(modalStart);

  assert.ok(modalStart >= 0);
  const paymentType = source.slice(
    source.indexOf("type FormularioPago"),
    source.indexOf("type ReciboSeleccionado"),
  );
  assert.match(paymentType, /valorAbono: string;/);
  assert.match(paymentType, /referencia: string;/);
  assert.match(paymentType, /observacion: string;/);
  assert.match(source, /openPaymentDialog\(invoice\)/);
  assert.match(modal, /paymentForm\.valorAbono/);
  assert.match(modal, /paymentForm\.referencia/);
  assert.match(modal, /paymentForm\.observacion/);
  assert.match(modal, /paymentAmountFocused/);
  assert.match(modal, /onFocus=\{\(\) => setPaymentAmountFocused\(true\)\}/);
  assert.match(modal, /onBlur=\{\(\) => setPaymentAmountFocused\(false\)\}/);
  assert.match(modal, /inputType === "insertFromPaste"/);
  assert.match(modal, /inputType === "insertFromDrop"/);
  assert.match(modal, /Saldo (?:despu[eé]s|restante)/i);
  assert.match(modal, /APROBAR PAGO/);
});

test("cada intento reutiliza una UUID y la envía en header y body", () => {
  const source = read("app/dashboard/proveedores/workspace.tsx");
  const openStart = source.indexOf("const openPaymentDialog");
  const approveStart = source.indexOf("const approvePayment");
  const approveEnd = source.indexOf("\n  const ", approveStart + 10);
  const openBlock = source.slice(openStart, approveStart);
  const approveBlock = source.slice(
    approveStart,
    approveEnd > approveStart ? approveEnd : source.length,
  );

  assert.ok(openStart >= 0 && approveStart > openStart);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(openBlock, /createPaymentIdempotencyKey\(\)/);
  assert.match(openBlock, /setPaymentIdempotencyKey/);
  assert.doesNotMatch(approveBlock, /randomUUID\(\)/);
  assert.match(approveBlock, /"Idempotency-Key": idempotencyKey/);
  assert.match(approveBlock, /idempotencyKey,/);
  assert.match(approveBlock, /const valorAbono = paymentForm\.valorAbono/);
  assert.match(approveBlock, /\{ referencia \}/);
  assert.match(approveBlock, /\{ observacion \}/);
});

test("respuestas ambiguas conservan el intento exacto hasta confirmarlo", () => {
  const source = read("app/dashboard/proveedores/workspace.tsx");

  assert.match(source, /response\.status === 408/);
  assert.match(source, /response\.status >= 500/);
  assert.match(source, /if \(!respuestaAmbigua\) \{[\s\S]*setPaymentAttempt\(null\)/);
  assert.match(source, /if \(!updated \|\| !receipt\)/);
  assert.match(source, /paymentAmountToCents\(attempt\.valorAbono\)/);
  assert.match(
    source,
    /if \(approvingId !== null \|\| paymentAttempt\) return;/,
  );
  assert.match(
    source,
    /disabled=\{approvingId !== null \|\| Boolean\(paymentAttempt\)\}/,
  );
});

test("el pago exitoso conserva historial y permite abrir cada recibo", () => {
  const source = read("app/dashboard/proveedores/workspace.tsx");

  assert.match(source, /payload\.recibo/);
  assert.match(source, /setReceiptPayment/);
  assert.match(source, /receiptHistoryInvoice/);
  assert.match(source, /RECIBOS \(\{invoice\.cantidadAbonos\}\)/);
  assert.match(source, /Recibos de la factura/);
  assert.match(source, /ABRIR \/ IMPRIMIR RECIBO/);
  assert.match(source, /openReceipt\(.*reciboUrl/);
  assert.match(
    source,
    /window\.open\(url,\s*["']_blank["'],\s*["']noopener,noreferrer["']\)/,
  );
});
