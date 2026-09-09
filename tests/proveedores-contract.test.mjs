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

test("cada abono conserva importes exactos, saldo histórico e idempotencia", () => {
  const schema = read("prisma/schema.prisma");
  const invoice = schema.slice(
    schema.indexOf("model FacturaProveedor"),
    schema.indexOf("model AbonoFacturaProveedor"),
  );
  const payment = schema.slice(
    schema.indexOf("model AbonoFacturaProveedor"),
    schema.indexOf("model PushSubscriptionProveedor"),
  );

  assert.match(invoice, /abonos\s+AbonoFacturaProveedor\[\]/);
  assert.match(payment, /facturaId\s+Int/);
  assert.match(payment, /valor\s+Decimal\s+@db\.Decimal\(14, 2\)/);
  assert.match(payment, /saldoAnterior\s+Decimal\s+@db\.Decimal\(14, 2\)/);
  assert.match(payment, /saldoPosterior\s+Decimal\s+@db\.Decimal\(14, 2\)/);
  assert.match(payment, /valorFacturaSnapshot\s+Decimal\s+@db\.Decimal\(14, 2\)/);
  assert.match(payment, /aliadoSnapshot\s+String/);
  assert.match(payment, /numeroFacturaSnapshot\s+String/);
  assert.match(payment, /claveIdempotencia\s+String\s+@unique/);
  assert.match(payment, /aprobadoPorNombre\s+String/);
  assert.match(payment, /aprobadoEn\s+DateTime/);
  assert.match(payment, /@@index\(\[facturaId, aprobadoEn\]\)/);
  assert.match(payment, /onDelete: Restrict/);
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
    "app/api/proveedores/[id]/abonos/[abonoId]/recibo/route.ts",
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

test("APROBADO PAGO bloquea la factura y aplica un solo abono transaccional", () => {
  const approval = read(
    "app/api/proveedores/[id]/aprobar-pago/route.ts",
  );

  assert.match(approval, /prisma\.\$transaction/);
  assert.match(approval, /FOR UPDATE/);
  assert.match(approval, /validarAbonoFacturaProveedor/);
  assert.match(approval, /normalizarClaveIdempotenciaProveedor/);
  assert.match(approval, /tx\.abonoFacturaProveedor\.create/);
  assert.match(approval, /saldoAnterior:/);
  assert.match(approval, /saldoPosterior:/);
  assert.match(approval, /aliadoSnapshot:/);
  assert.match(approval, /numeroFacturaSnapshot:/);
  assert.match(approval, /valorFacturaSnapshot:/);
  assert.doesNotMatch(approval, /cajaMovimiento|inventario|movimientoCaja/i);
});

test("el pago rechaza sobreabonos y cierra la factura solo con saldo cero", () => {
  const approval = read(
    "app/api/proveedores/[id]/aprobar-pago/route.ts",
  );

  assert.match(approval, /SOBREABONO/);
  assert.match(approval, /SIN_SALDO/);
  assert.match(approval, /status: 409/);
  assert.match(
    approval,
    /saldoPosteriorCentavos\s*===\s*0|saldoPosterior\s*===\s*["']0\.00["']/,
  );
  assert.match(
    approval,
    /estado:\s*ESTADO_FACTURA_PROVEEDOR\.PAGADO/,
  );
  assert.match(approval, /pagoAprobadoEn:/);
  assert.match(approval, /pagoAprobadoPorId:\s*session\.id/);
});

test("la clave idempotente devuelve el mismo abono y detecta otro payload", () => {
  const approval = read(
    "app/api/proveedores/[id]/aprobar-pago/route.ts",
  );
  const schema = read("prisma/schema.prisma");

  assert.match(approval, /headers\.get\(["']Idempotency-Key["']\)/i);
  assert.match(approval, /body\.idempotencyKey/);
  assert.match(approval, /const esSolicitudLegada = rawBody\.length === 0/);
  assert.match(approval, /!esSolicitudLegada && !valorSolicitado/);
  assert.match(approval, /!esSolicitudLegada && !suppliedKey/);
  assert.match(approval, /IDEMPOTENCIA_REQUERIDA/);
  assert.match(approval, /CLAVE_INTERNA_PATTERN/);
  assert.match(approval, /prefijo reservado/);
  assert.match(approval, /claveIdempotencia/);
  assert.match(approval, /tx\.abonoFacturaProveedor\.findUnique/);
  assert.match(approval, /abonoExistente\.facturaId\s*===\s*id/);
  assert.match(
    approval,
    /decimalProveedorACentavos\(abonoExistente\.valor\)\s*===\s*\n?\s*decimalProveedorACentavos\(valorSolicitado\)/,
  );
  assert.match(
    approval,
    /mismoTexto\(abonoExistente\.referencia, referenciaResult\.value\)/,
  );
  assert.match(
    approval,
    /mismoTexto\(abonoExistente\.observacion, observacionResult\.value\)/,
  );
  assert.match(approval, /tipo: "REPETIDA"/);
  assert.match(approval, /resultado\.tipo === "REPETIDA" \? 200 : 201/);
  assert.match(approval, /IDEMPOTENCIA_CONFLICTO/);
  assert.match(approval, /serializarAbonoFacturaProveedor/);
  assert.match(approval, /recibo/);
  assert.match(schema, /claveIdempotencia\s+String\s+@unique/);
});

test("GET entrega el saldo exacto y el historial ordenado de abonos", () => {
  const api = read("app/api/proveedores/route.ts");
  const helpers = read("lib/proveedores.ts");

  assert.match(
    api,
    /include:\s*\{\s*abonos:\s*\{\s*orderBy:/,
  );
  assert.match(helpers, /calcularSaldoFacturaProveedor/);
  assert.match(helpers, /serializarAbonoFacturaProveedor/);
  assert.match(helpers, /valorFactura:/);
  assert.match(helpers, /valorAbonado:/);
  assert.match(helpers, /saldoPendiente:/);
  assert.match(helpers, /cantidadAbonos:/);
  assert.match(helpers, /abonos,/);
  assert.match(helpers, /numeroRecibo/);
  assert.match(helpers, /reciboUrl/);
});

test("resúmenes y notificaciones usan el saldo, sin cerrar pagos parciales", () => {
  const helpers = read("lib/proveedores.ts");
  const dispatch = read("app/api/proveedores/notificaciones/route.ts");
  const push = read("lib/proveedores-push.ts");
  const approval = read(
    "app/api/proveedores/[id]/aprobar-pago/route.ts",
  );

  assert.match(
    helpers,
    /valorPendienteCentavos\s*\+=\s*saldoPendienteCentavos/,
  );
  assert.match(
    helpers,
    /valorVencidoCentavos\s*\+=\s*saldoPendienteCentavos/,
  );
  assert.match(helpers, /decimalProveedorACentavos\(factura\.saldoPendiente\)/);
  assert.match(dispatch, /abonos/);
  assert.match(dispatch, /calcularSaldoFacturaProveedor/);
  assert.match(push, /saldoPendiente/);
  assert.match(
    push,
    /const valor = formatoPesosProveedor\(saldoPendiente\)/,
  );
  assert.match(
    approval,
    /saldoPosteriorCentavos\s*===\s*0|saldoPosterior\s*===\s*["']0\.00["']/,
  );
});

test("el recibo PDF protege acceso, pertenencia y datos históricos", () => {
  const receipt = read(
    "app/api/proveedores/[id]/abonos/[abonoId]/recibo/route.ts",
  );

  assert.match(receipt, /getSessionUser/);
  assert.match(receipt, /puedeGestionarProveedores/);
  assert.match(
    receipt,
    /abonoFacturaProveedor\.findFirst\(\{[\s\S]*where:\s*\{\s*id: abonoId,\s*facturaId,\s*\}/,
  );
  assert.match(receipt, /application\/pdf/);
  assert.match(receipt, /Content-Disposition/);
  assert.match(receipt, /inline; filename=/);
  assert.match(receipt, /Cache-Control/);
  assert.match(receipt, /no-store/);
  assert.match(receipt, /aliadoSnapshot/);
  assert.match(receipt, /numeroFacturaSnapshot/);
  assert.match(receipt, /valorFacturaSnapshot/);
  assert.match(receipt, /saldoAnterior/);
  assert.match(receipt, /saldoPosterior/);
  assert.match(receipt, /aprobadoPorNombre/);
  assert.match(receipt, /aprobadoEn/);
  assert.match(receipt, /referencia/);
  assert.match(receipt, /observacion/);
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
    "AbonoFacturaProveedor",
    "PushSubscriptionProveedor",
    "AvisoFacturaProveedor",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  }

  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /"valor" DECIMAL\(14,2\) NOT NULL/);
  assert.match(sql, /"saldoAnterior" DECIMAL\(14,2\) NOT NULL/);
  assert.match(sql, /"saldoPosterior" DECIMAL\(14,2\) NOT NULL/);
  assert.match(sql, /AbonoFacturaProveedor_claveIdempotencia_key/);
  assert.match(sql, /AbonoFacturaProveedor_saldos_check/);
  assert.match(
    sql,
    /WITH "FacturasPagadasConSaldo"[\s\S]*factura\."estado" = 'PAGADO'[\s\S]*INSERT INTO "AbonoFacturaProveedor"/,
  );
  assert.match(
    sql,
    /SELECT SUM\(abono\."valor"\)[\s\S]*abono\."facturaId" = factura\."id"/,
  );
  assert.match(
    sql,
    /factura\."valorPagar" - factura\."valorAbonado"/,
  );
  assert.match(
    sql,
    /factura\."valorAbonado" < factura\."valorPagar"/,
  );
  assert.match(sql, /LOCK TABLE "FacturaProveedor", "AbonoFacturaProveedor"/);
  assert.match(sql, /ON CONFLICT \("claveIdempotencia"\) DO NOTHING/);
  assert.doesNotMatch(
    sql,
    /\bDROP\s+(?:TABLE|TYPE|SCHEMA)|\bDELETE\s+FROM|\bTRUNCATE\b/i,
  );
});
