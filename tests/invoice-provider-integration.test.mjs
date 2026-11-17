import test from "node:test";
import assert from "node:assert/strict";
import { modules, database, admin, invoice } from "./invoice-payments-test-helpers.mjs";

const create = (overrides = {}) => ({ requestId: "create-invoice-001", number: "FAC-1", providerId: 1, date: "2026-11-01", amount: 100, ...overrides });
function setup(seed = {}) {
  const db = database({ proveedorAdministrativo: [{ id: 1, name: "Proveedor original", nameNormalized: "PROVEEDOR ORIGINAL", active: true, version: 1 }], ...seed });
  const loader = modules(db.prisma);
  return { db, service: loader.load("lib/invoice-payments.ts"), providers: loader.load("lib/invoice-providers.ts") };
}

test("identidad estable evita duplicar factura al renombrar proveedor y conserva snapshots e idempotencia", async () => {
  const { db, service, providers } = setup();
  const original = await service.createAdministrativeInvoice(create(), admin);
  await providers.renameInvoiceProvider(1, { requestId: "rename-provider-001", version: 1, name: "Proveedor nuevo" }, admin);
  const retry = await service.createAdministrativeInvoice(create(), admin);
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.invoice, original.invoice);
  assert.equal(db.tables.facturaAdministrativa[0].provider, "Proveedor original");
  await assert.rejects(service.createAdministrativeInvoice(create({ requestId: "duplicate-after-rename" }), admin), (error) => error.code === "DUPLICATE_INVOICE");
  await assert.rejects(service.createAdministrativeInvoice({ ...create({ requestId: "legacy-after-rename", providerId: undefined }), provider: "Proveedor original" }, admin), (error) => error.code === "DUPLICATE_INVOICE");
  const second = await service.createAdministrativeInvoice(create({ requestId: "another-after-rename", number: "FAC-2" }), admin);
  assert.equal(second.invoice.providerId, 1);
  assert.equal(second.invoice.provider, "Proveedor nuevo");
  const edited = await service.editAdministrativeInvoice(1, { ...create({ requestId: "edit-old-snapshot", amount: 120 }), version: 1, dueDate: null }, admin);
  assert.equal(edited.invoice.provider, "Proveedor original");
  assert.equal(db.tables.invoiceAdminEvent[0].snapshot.before.provider, "Proveedor original");
});

test("proveedor inactivo bloquea nuevas facturas pero permite conservar su identidad histórica en edición", async () => {
  const { db, service, providers } = setup();
  await service.createAdministrativeInvoice(create(), admin);
  await providers.deactivateInvoiceProvider(1, { requestId: "deactivate-provider-001", version: 1 }, admin);
  await assert.rejects(service.createAdministrativeInvoice(create({ requestId: "inactive-new-invoice", number: "FAC-2" }), admin), (error) => error.code === "PROVIDER_INACTIVE");
  await assert.rejects(service.createAdministrativeInvoice({ ...create({ requestId: "inactive-legacy-invoice", number: "FAC-3", providerId: undefined }), provider: "Proveedor original" }, admin), (error) => error.code === "PROVIDER_INACTIVE");
  const edited = await service.editAdministrativeInvoice(1, { ...create({ requestId: "edit-inactive-invoice", amount: 125 }), version: 1 }, admin);
  assert.equal(edited.invoice.providerId, 1);
  assert.equal(edited.invoice.amount, 125);
  const paid = await service.recordAdministrativeInvoicePayment(1, { requestId: "pay-inactive-invoice", version: 2, date: "2026-11-16", mode: "full" }, admin);
  assert.equal(paid.invoice.status, "PAGADA");
  assert.equal(db.tables.pagoFacturaAdministrativa[0].providerSnapshot, "Proveedor original");
});

test("cambio de proveedor valida existencia, activa y unicidad por identidad; no altera pagos ni factura ante rechazo", async () => {
  const { db, service } = setup({ proveedorAdministrativo: [
    { id: 1, name: "Proveedor original", nameNormalized: "PROVEEDOR ORIGINAL", active: true, version: 1 },
    { id: 2, name: "Segundo proveedor", nameNormalized: "SEGUNDO PROVEEDOR", active: true, version: 1 },
    { id: 3, name: "Inactivo", nameNormalized: "INACTIVO", active: false, version: 1 },
  ] });
  await service.createAdministrativeInvoice(create(), admin);
  await service.createAdministrativeInvoice(create({ requestId: "second-provider-invoice", providerId: 2 }), admin);
  const before = structuredClone(db.tables.facturaAdministrativa);
  for (const [providerId, code] of [[2, "DUPLICATE_INVOICE"], [3, "PROVIDER_INACTIVE"], [999, "PROVIDER_NOT_FOUND"]]) {
    await assert.rejects(service.editAdministrativeInvoice(1, { ...create({ requestId: `invalid-edit-${providerId}`, providerId }), version: 1 }, admin), (error) => error.code === code);
  }
  assert.deepEqual(db.tables.facturaAdministrativa, before);
  assert.equal(db.tables.invoiceAdminEvent.length, 0);
  for (const providerId of ["1", -1, 0, 1.5, true]) assert.throws(() => service.parseAdministrativeInvoice(create({ providerId })));
});

test("factura eliminada mantiene detección de duplicado tras renombre; origen de error catálogo conserva HTTP 409", async () => {
  const { service, providers } = setup({ facturaAdministrativa: [invoice(1, { providerId: 1, provider: "Proveedor original", providerNormalized: "PROVEEDOR ORIGINAL", number: "FAC-1", numberNormalized: "FAC-1", deletedAt: new Date() })] });
  await providers.renameInvoiceProvider(1, { requestId: "rename-deleted-provider", version: 1, name: "Nombre actual" }, admin);
  await assert.rejects(service.createAdministrativeInvoice(create(), admin), (error) => error.code === "DUPLICATE_DELETED_INVOICE");
  const response = service.invoiceErrorResponse(new providers.InvoiceProviderError("Proveedor inactivo", 409, "PROVIDER_INACTIVE"));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "PROVIDER_INACTIVE");
});
