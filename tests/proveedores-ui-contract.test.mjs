import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createElement } from "react";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function workspaceNodes(predicate) {
  const sourceFile = ts.createSourceFile(
    "workspace.tsx",
    read("app/dashboard/proveedores/workspace.tsx"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const matches = [];
  function visit(node) {
    if (predicate(node, sourceFile)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return matches;
}

function evaluateWorkspaceExpression(expression, bindings = {}) {
  const { outputText } = ts.transpileModule(
    "const result = (" + expression + ");",
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
        jsx: ts.JsxEmit.React,
      },
    },
  );
  return new Function(...Object.keys(bindings), outputText + "\nreturn result;")(
    ...Object.values(bindings),
  );
}

function workspaceVariable(name, bindings) {
  const [declaration] = workspaceNodes(
    (node) => ts.isVariableDeclaration(node) && node.name.getText() === name,
  );
  assert.ok(declaration?.initializer, "Missing workspace variable: " + name);
  return evaluateWorkspaceExpression(declaration.initializer.getText(), bindings);
}

function jsxAttribute(node, name) {
  return node.attributes.properties.find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
  );
}

function jsxValue(node, name, bindings = {}) {
  const attribute = jsxAttribute(node, name);
  if (!attribute) return undefined;
  if (!attribute.initializer) return true;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  assert.ok(ts.isJsxExpression(attribute.initializer));
  return evaluateWorkspaceExpression(
    attribute.initializer.expression.getText(),
    bindings,
  );
}

function workspaceControl(valueName) {
  const [control] = workspaceNodes((node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return false;
    return jsxAttribute(node, "value")?.initializer?.getText() === "{" + valueName + "}";
  });
  assert.ok(control, "Missing control: " + valueName);
  return control;
}

function workspaceButton(text) {
  const [button] = workspaceNodes(
    (node) =>
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText() === "button" &&
      node.children.some((child) => ts.isJsxText(child) && child.text.trim() === text),
  );
  assert.ok(button, "Missing button: " + text);
  return button.openingElement;
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
  const changes = [];
  jsxValue(workspaceControl("allyFilter"), "onChange", {
    setAllyFilter: (value) => changes.push(value),
    setSelectedInvoiceIds: () => {},
  })({ target: { value: "JG COMPANY" } });
  assert.deepEqual(changes, ["JG COMPANY"]);
  assert.match(source, /<option value="">Todos los aliados<\/option>/);
  assert.match(source, /knownAllies\.map\(\(ally\) => \(\s*<option key=\{ally\} value=\{ally\}>/);
  assert.match(source, /\[allyFilter, query, statusFilter, visibleInvoices\]/);
  assert.match(source, /setQuery\(""\);\s*setAllyFilter\(""\);\s*setStatusFilter\("TODAS"\);/);
  assert.match(source, /\{filteredInvoices\.length\} de \{visibleInvoices\.length\}/);
  assert.match(source, /selecciona todos los aliados y estados/);
  assert.match(source, /sm:grid-cols-2 xl:grid-cols-/);
});

test("la selección inicia vacía y el resumen usa las facturas filtradas vigentes", () => {
  const [state] = workspaceNodes(
    (node) => ts.isVariableDeclaration(node) &&
      ts.isArrayBindingPattern(node.name) &&
      node.name.elements[0]?.getText() === "selectedInvoiceIds",
  );
  const initial = evaluateWorkspaceExpression(state.initializer.getText(), {
    useState: (value) => typeof value === "function" ? value() : value,
  });
  assert.deepEqual([...initial], []);

  const selectedInvoiceIds = new Set([1, 2, 999]);
  const oldInvoices = [{ id: 1, valorAbonado: 30, saldoPendiente: 70 }];
  const refreshedInvoices = [{ id: 1, valorAbonado: 80, saldoPendiente: 20 }];
  for (const filteredInvoices of [oldInvoices, refreshedInvoices, []]) {
    const result = evaluateWorkspaceMemo("selectionSummary", {
      filteredInvoices,
      selectedInvoiceIds,
      resumirFacturasSeleccionadas: (actualInvoices, actualIds) => {
        assert.equal(actualInvoices, filteredInvoices);
        assert.equal(actualIds, selectedInvoiceIds);
        return { source: actualInvoices };
      },
    });
    assert.equal(result.source, filteredInvoices);
  }
  assert.match(
    read("app/dashboard/proveedores/workspace.tsx"),
    /\[filteredInvoices, selectedInvoiceIds\]/,
  );
});

test("marcar facturas permite pagadas, alterna la selección y descarta IDs ocultos", () => {
  const filteredInvoices = [filterInvoices[0], filterInvoices[1]];
  const originalSelection = new Set([2, 999]);
  let selectedInvoiceIds = originalSelection;
  const toggle = workspaceVariable("toggleInvoiceSelection", {
    filteredInvoices,
    setSelectedInvoiceIds: (update) => {
      selectedInvoiceIds = typeof update === "function" ? update(selectedInvoiceIds) : update;
    },
    fetch: () => assert.fail("Selecting invoices must not write to the API"),
    approvePayment: () => assert.fail("Selecting invoices must not approve payments"),
  });
  toggle(1);
  assert.deepEqual([...selectedInvoiceIds], [2, 1]);
  assert.deepEqual([...originalSelection], [2, 999]);
  toggle(1);
  assert.deepEqual([...selectedInvoiceIds], [2]);
});

test("seleccionar todas toma solo las visibles y admite estados vacío, parcial y completo", () => {
  for (const [count, length, expectedAll, expectedMixed] of [
    [0, 0, false, false],
    [0, 2, false, false],
    [1, 2, false, true],
    [2, 2, true, false],
  ]) {
    const filteredInvoices = filterInvoices.slice(0, length);
    const selectionSummary = { cantidad: count };
    const allVisibleSelected = workspaceVariable("allVisibleSelected", { filteredInvoices, selectionSummary });
    const mixed = workspaceVariable("someVisibleSelected", { selectionSummary, allVisibleSelected });
    assert.equal(allVisibleSelected, expectedAll);
    assert.equal(mixed, expectedMixed);
    let selection;
    workspaceVariable("toggleVisibleSelection", {
      allVisibleSelected,
      filteredInvoices,
      setSelectedInvoiceIds: (value) => { selection = value; },
    })();
    assert.deepEqual(
      [...selection],
      allVisibleSelected ? [] : filteredInvoices.map((invoice) => invoice.id),
    );
  }
});

test("búsqueda, aliado, estado y limpiar filtros descartan toda selección anterior", () => {
  for (const [valueName, setterName, value] of [
    ["query", "setQuery", "ONL236"],
    ["allyFilter", "setAllyFilter", "JG COMPANY"],
    ["statusFilter", "setStatusFilter", "PAGADA"],
  ]) {
    let selection = new Set([1, 2]);
    let actualValue;
    jsxValue(workspaceControl(valueName), "onChange", {
      [setterName]: (next) => { actualValue = next; },
      setSelectedInvoiceIds: (next) => { selection = next; },
    })({ target: { value } });
    assert.equal(actualValue, value);
    assert.deepEqual([...selection], []);
  }

  const values = {};
  let selection = new Set([1, 2]);
  jsxValue(workspaceButton("Limpiar filtros"), "onClick", {
    setQuery: (value) => { values.query = value; },
    setAllyFilter: (value) => { values.allyFilter = value; },
    setStatusFilter: (value) => { values.statusFilter = value; },
    setSelectedInvoiceIds: (value) => { selection = value; },
  })();
  assert.deepEqual(values, { query: "", allyFilter: "", statusFilter: "TODAS" });
  assert.deepEqual([...selection], []);
  selection = new Set([1, 2]);
  jsxValue(workspaceButton("Limpiar selección"), "onClick", {
    setSelectedInvoiceIds: (value) => { selection = value; },
  })();
  assert.deepEqual([...selection], []);
});

test("los checkboxes de escritorio y móvil identifican factura y aliado sin bloquear pagadas", () => {
  const checkboxes = workspaceNodes(
    (node) => ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText() === "InvoiceSelectionCheckbox" &&
      jsxAttribute(node, "label")?.initializer?.getText().includes("invoice.numeroFactura"),
  );
  assert.equal(checkboxes.length, 2);
  const invoice = filterInvoices[0];
  for (const checkbox of checkboxes) {
    const selected = [];
    const bindings = {
      invoice,
      selectedInvoiceIds: new Set([invoice.id]),
      toggleInvoiceSelection: (id) => selected.push(id),
    };
    assert.equal(jsxValue(checkbox, "checked", bindings), true);
    assert.equal(jsxValue(checkbox, "label", bindings), "Seleccionar factura ONL238 de JG COMPANY");
    assert.notEqual(jsxValue(checkbox, "disabled", bindings), true);
    jsxValue(checkbox, "onChange", bindings)();
    assert.deepEqual(selected, [invoice.id]);
  }

  const [toolbar] = workspaceNodes(
    (node) => ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText() === "InvoiceSelectionCheckbox" &&
      jsxAttribute(node, "label")?.initializer?.getText() === '"Seleccionar todas las visibles"',
  );
  assert.ok(toolbar);
  assert.equal(jsxValue(toolbar, "disabled", { loading: true, filteredInvoices: filterInvoices }), true);
  assert.equal(jsxValue(toolbar, "disabled", { loading: false, filteredInvoices: [] }), true);
  assert.equal(jsxValue(toolbar, "disabled", { loading: false, filteredInvoices: filterInvoices }), false);
});

test("el checkbox parcial expone estado mixto accesible y los tres totales se anuncian juntos", () => {
  const [component] = workspaceNodes(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "InvoiceSelectionCheckbox",
  );
  const renderCheckbox = evaluateWorkspaceExpression(component.getText(), { React: { createElement } });
  const checkbox = renderCheckbox({ checked: false, mixed: true, label: "Facturas visibles", onChange: () => {} });
  assert.equal(checkbox.type, "label");
  const [input, label] = checkbox.props.children;
  assert.equal(input.type, "input");
  assert.equal(input.props.type, "checkbox");
  assert.equal(input.props["aria-checked"], "mixed");
  assert.equal(label.props.children, "Facturas visibles");
  const element = { indeterminate: false };
  input.props.ref(element);
  assert.equal(element.indeterminate, true);
  input.props.ref(null);

  const source = read("app/dashboard/proveedores/workspace.tsx");
  const start = source.indexOf('aria-labelledby="supplier-selection-title"');
  const end = source.indexOf("</section>", start);
  const summary = source.slice(start, end);
  assert.match(summary, /aria-live="polite" aria-atomic="true"/);
  assert.match(summary, /selectionSummary\.cantidad/);
  for (const property of ["totalFacturas", "totalAbonado", "totalPendiente"]) {
    assert.ok(summary.includes("formatMoney(selectionSummary." + property + ")"));
  }
  assert.match(summary, />Total facturas</);
  assert.match(summary, />Total abonado</);
  assert.match(summary, />Total pendiente por pagar</);
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
