import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("el esquema crea una cuenta por pagar separada con dinero decimal", () => {
  const schema = read("prisma/schema.prisma");
  const invoice = schema.slice(
    schema.indexOf("model FacturaProveedor"),
    schema.indexOf("model PushSubscriptionProveedor"),
  );

  assert.match(invoice, /valorPagar\s+Decimal\s+@db\.Decimal\(14, 2\)/);
  assert.match(invoice, /fechaVencimiento\s+DateTime\s+@db\.Date/);
  assert.match(invoice, /estado\s+EstadoFacturaProveedor\s+@default\(PENDIENTE\)/);
  assert.match(
    invoice,
    /@@unique\(\[aliadoNormalizado, numeroFacturaNormalizado\]\)/,
  );
  assert.match(invoice, /@@index\(\[estado, fechaVencimiento\]\)/);
});

test("página y APIs comparten el permiso de administrador o supervisor", () => {
  const access = read("lib/access-control.ts");
  const helper = access.slice(access.indexOf("export function puedeGestionarProveedores"));

  assert.match(helper, /esRolAdministrativo\(rolNombre\)/);
  assert.match(helper, /esPerfilAdministrativo\(perfilTipo\)/);
  assert.match(helper, /esPerfilSupervisor\(perfilTipo\)/);

  for (const path of [
    "app/api/proveedores/route.ts",
    "app/api/proveedores/[id]/aprobar-pago/route.ts",
    "app/api/proveedores/push/route.ts",
  ]) {
    assert.match(read(path), /puedeGestionarProveedores/);
  }
});

test("el alta valida duplicados y serializa fechas según Bogotá", () => {
  const api = read("app/api/proveedores/route.ts");
  const helpers = read("lib/proveedores.ts");

  assert.match(api, /validarNuevaFacturaProveedor\(body\)/);
  assert.match(api, /error as \{ code\?: unknown \}\)\.code === "P2002"/);
  assert.match(api, /getDateKeyInColombia\(\)/);
  assert.match(api, /diasAnticipacion: DIAS_ANTICIPACION_AVISO_PROVEEDOR/);
  assert.match(helpers, /DIAS_ANTICIPACION_AVISO_PROVEEDOR = 3/);
  assert.match(helpers, /parseValorPagarProveedor/);
  assert.match(helpers, /dateKeyToDatabaseDate/);
});

test("APROBADO PAGO es idempotente, auditado y no mueve caja ni inventario", () => {
  const approval = read(
    "app/api/proveedores/[id]/aprobar-pago/route.ts",
  );

  assert.match(approval, /tx\.facturaProveedor\.updateMany/);
  assert.match(approval, /estado: ESTADO_FACTURA_PROVEEDOR\.PENDIENTE/);
  assert.match(approval, /pagoAprobadoEn: new Date\(\)/);
  assert.match(approval, /pagoAprobadoPorId: session\.id/);
  assert.match(approval, /"El pago ya estaba aprobado"/);
  assert.doesNotMatch(approval, /cajaMovimiento|inventario|movimientoCaja/i);
});

test("el despacho push es secreto, diario y excluye facturas pagadas", () => {
  const schema = read("prisma/schema.prisma");
  const dispatch = read("app/api/proveedores/notificaciones/route.ts");
  const push = read("lib/proveedores-push.ts");

  assert.match(dispatch, /timingSafeEqual/);
  assert.match(dispatch, /process\.env\.CRON_SECRET/);
  assert.match(dispatch, /estado: ESTADO_FACTURA_PROVEEDOR\.PENDIENTE/);
  assert.match(dispatch, /fechaVencimiento:\s*\{\s*lte: fechaLimite/);
  assert.match(dispatch, /fechaClave = getDateKeyInColombia\(\)/);
  assert.match(
    schema,
    /@@unique\(\[facturaId, pushSubscriptionId, fechaClave\]\)/,
  );
  assert.match(push, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(push, /WEB_PUSH_PRIVATE_KEY/);
  assert.match(push, /server-only/);
});

test("service worker y automatización abren el módulo de proveedores", () => {
  const worker = read("public/proveedores-sw.js");
  const cron = read("scripts/notificar-proveedores.mjs");
  const manifest = read("app/manifest.ts");

  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(worker, /\/dashboard\/proveedores/);
  assert.match(cron, /\/api\/proveedores\/notificaciones/);
  assert.match(cron, /Authorization: `Bearer \$\{cronSecret\}`/);
  assert.match(manifest, /display: "standalone"/);
});

test("el despliegue de tablas de proveedores es aditivo y no borra datos", () => {
  const sql = read("scripts/apply-proveedores-schema.sql");

  for (const table of [
    "FacturaProveedor",
    "PushSubscriptionProveedor",
    "AvisoFacturaProveedor",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  }

  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.doesNotMatch(
    sql,
    /\bDROP\s+(?:TABLE|TYPE|SCHEMA)|\bDELETE\s+FROM|\bTRUNCATE\b/i,
  );
});
