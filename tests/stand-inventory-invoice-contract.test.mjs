import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function source(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("la factura por lote solo opera sobre stands y perfiles autorizados", () => {
  const route = source("app/api/inventario/factura-stand/route.ts");

  assert.match(route, /\["ADMIN", "AUDITOR"\]\.includes\(rol\)/);
  assert.match(route, /sede\?\.soloInventarioPorCobrar/);
  assert.match(route, /La factura debe contener equipos de un solo stand/);
  assert.match(route, /Completa los datos de facturacion/);
});

test("cada IMEI queda trazable e idempotente en una sola factura", () => {
  const schema = source("prisma/schema.prisma");
  const route = source("app/api/inventario/factura-stand/route.ts");

  assert.match(schema, /model FacturaInventarioStand\s*\{/);
  assert.match(schema, /model FacturaInventarioStandItem\s*\{/);
  assert.match(schema, /inventarioSedeId\s+Int\?\s+@unique/);
  assert.match(schema, /imei\s+String\s+@unique/);
  assert.match(schema, /onDelete: SetNull/);
  assert.match(route, /siigoIdempotencyKey: `CSTAND\$\{lote\.id\}N1`/);
  assert.match(route, /Este lote ya fue facturado/);
});

test("Siigo recibe una linea identificable por cada equipo seleccionado", () => {
  const route = source("app/api/inventario/factura-stand/route.ts");
  const siigo = source("lib/siigo.ts");

  assert.match(route, /siigoItems: lote\.items\.map/);
  assert.match(route, /referencia: item\.referencia/);
  assert.match(route, /imei: item\.imei/);
  assert.match(route, /price: Number\(item\.costo\)/);
  assert.match(siigo, /function buildExplicitInvoiceItems/);
  assert.match(siigo, /item\.imei \? `IMEI \$\{String\(item\.imei\)\.trim\(\)\}`/);
  assert.match(siigo, /registro\.siigoIdempotencyKey/);
});

test("emitir la factura no altera ventas, caja, prestamos ni estados de inventario", () => {
  const route = source("app/api/inventario/factura-stand/route.ts");

  assert.equal(route.includes("prisma.venta."), false);
  assert.equal(route.includes("prisma.cajaMovimiento."), false);
  assert.equal(route.includes("prisma.movimientoCajaSede."), false);
  assert.equal(route.includes("prisma.prestamoSede."), false);
  assert.equal(route.includes("prisma.inventarioSede.update"), false);
  assert.equal(route.includes("prisma.inventarioSede.delete"), false);
});

test("inventario confirma el lote y muestra la factura emitida", () => {
  const page = source("app/inventario/page.tsx");
  const inventoryRoute = source("app/api/inventario/route.ts");

  assert.match(page, /Factura electronica/);
  assert.match(page, /Confirmar lote del stand/);
  assert.match(page, /No marca los\s+equipos como pagados/);
  assert.match(page, /\/api\/inventario\/factura-stand/);
  assert.match(page, /Factura emitida/);
  assert.match(inventoryRoute, /facturaStandItem/);
  assert.match(inventoryRoute, /facturaStand:/);
});
