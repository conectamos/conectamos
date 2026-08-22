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
  assert.match(source, /APROBADO PAGO/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /register\("\/proveedores-sw\.js"/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /Probar notificación/);
  assert.match(source, /recordatorio-local/);
});
