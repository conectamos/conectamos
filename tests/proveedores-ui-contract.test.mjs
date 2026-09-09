import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

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
