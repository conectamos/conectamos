import prisma from "@/lib/prisma";
import { getDateKeyInColombia } from "@/lib/credit-date-utils";
import { esImeiValido } from "@/lib/inventory-imeis";
import { asegurarCatalogoDistribuidoresInventario } from "@/lib/inventory-distributors";
import {
  centavosADecimalProveedor,
  decimalProveedorACentavos,
  normalizarClaveIdempotenciaProveedor,
  validarAbonoFacturaProveedor,
} from "@/lib/proveedores-pagos";
import {
  diferenciaDiasFechaProveedor,
  normalizarNumeroFacturaProveedor,
  normalizarTextoProveedor,
} from "@/lib/proveedores";

type DebtActor = { id: number; nombre: string };
type DebtEquipment = { imei: string; referencia: string };
type DebtPayment = { id: number; valor: string; fecha: string; registradoPor: string };
type DebtRow = {
  id: number;
  fecha: string;
  numeroFactura: string;
  proveedor: string;
  valor: string;
  abonado: string;
  saldo: string;
  equipos: DebtEquipment[];
  pagos: DebtPayment[];
};
type DebtDatabase = Pick<typeof prisma, "$queryRaw">;

const MAX_IMEIS = 500;
let schemaPromise: Promise<void> | null = null;

export class BodegaSupplierDebtError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "BodegaSupplierDebtError";
  }
}

function asegurarDeudasBodega() {
  if (!schemaPromise) {
    schemaPromise = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended('deudas-proveedor-bodega-schema', 0))::text
      `;
      await tx.$executeRaw`
        CREATE TABLE IF NOT EXISTS "DeudaProveedorBodega" (
          "id" SERIAL PRIMARY KEY,
          "fecha" DATE NOT NULL,
          "numeroFactura" TEXT NOT NULL,
          "numeroFacturaNormalizado" TEXT NOT NULL,
          "proveedorId" INTEGER NOT NULL,
          "proveedor" TEXT NOT NULL,
          "valor" NUMERIC(14, 2) NOT NULL CHECK ("valor" > 0),
          "registradoPorId" INTEGER NOT NULL,
          "registradoPor" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("proveedorId", "numeroFacturaNormalizado")
        )
      `;
      await tx.$executeRaw`
        CREATE TABLE IF NOT EXISTS "DeudaProveedorBodegaEquipo" (
          "deudaId" INTEGER NOT NULL REFERENCES "DeudaProveedorBodega" ("id"),
          "imei" TEXT PRIMARY KEY CHECK ("imei" ~ '^[0-9]{15}$'),
          "referencia" TEXT NOT NULL
        )
      `;
      await tx.$executeRaw`
        CREATE INDEX IF NOT EXISTS "DeudaProveedorBodegaEquipo_deudaId_idx"
        ON "DeudaProveedorBodegaEquipo" ("deudaId")
      `;
      await tx.$executeRaw`
        CREATE TABLE IF NOT EXISTS "PagoDeudaProveedorBodega" (
          "id" SERIAL PRIMARY KEY,
          "deudaId" INTEGER NOT NULL REFERENCES "DeudaProveedorBodega" ("id"),
          "valor" NUMERIC(14, 2) NOT NULL CHECK ("valor" > 0),
          "fecha" DATE NOT NULL,
          "claveIdempotencia" TEXT NOT NULL UNIQUE,
          "registradoPorId" INTEGER NOT NULL,
          "registradoPor" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
      await tx.$executeRaw`
        CREATE INDEX IF NOT EXISTS "PagoDeudaProveedorBodega_deudaId_id_idx"
        ON "PagoDeudaProveedorBodega" ("deudaId", "id")
      `;
    }, { maxWait: 15_000, timeout: 30_000 }).then(() => undefined).catch((error: unknown) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function leerId(value: unknown, etiqueta: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new BodegaSupplierDebtError(`${etiqueta} no válido.`);
  }
  return value;
}

function leerValor(value: unknown) {
  const centavos = typeof value === "string" || typeof value === "number"
    ? decimalProveedorACentavos(value)
    : null;
  if (centavos === null || centavos <= 0) {
    throw new BodegaSupplierDebtError("Ingresa un valor mayor que cero con máximo dos decimales.");
  }
  return centavosADecimalProveedor(centavos)!;
}

function leerImeis(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IMEIS) {
    throw new BodegaSupplierDebtError(`Agrega entre 1 y ${MAX_IMEIS} equipos para la factura.`);
  }
  if (!value.every(esImeiValido)) {
    throw new BodegaSupplierDebtError("Cada IMEI debe tener exactamente 15 dígitos.");
  }
  const imeis = value.map((imei) => imei.trim());
  if (new Set(imeis).size !== imeis.length) {
    throw new BodegaSupplierDebtError("La factura contiene un IMEI repetido.");
  }
  return imeis;
}

async function cargarDeudas(db: DebtDatabase, id: number | null, hoy: string) {
  const rows = await db.$queryRaw<DebtRow[]>`
    SELECT d."id", to_char(d."fecha", 'YYYY-MM-DD') AS "fecha",
           d."numeroFactura", d."proveedor", d."valor"::text AS "valor",
           COALESCE(p."abonado", 0)::numeric(14, 2)::text AS "abonado",
           (d."valor" - COALESCE(p."abonado", 0))::numeric(14, 2)::text AS "saldo",
           COALESCE(e."equipos", '[]'::jsonb) AS "equipos",
           COALESCE(p."pagos", '[]'::jsonb) AS "pagos"
    FROM "DeudaProveedorBodega" d
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('imei', e."imei", 'referencia', e."referencia")
                       ORDER BY e."imei") AS "equipos"
      FROM "DeudaProveedorBodegaEquipo" e
      WHERE e."deudaId" = d."id"
    ) e ON true
    LEFT JOIN LATERAL (
      SELECT sum(p."valor") AS "abonado",
             jsonb_agg(jsonb_build_object('id', p."id", 'valor', p."valor"::text,
                       'fecha', to_char(p."fecha", 'YYYY-MM-DD'), 'registradoPor', p."registradoPor")
                       ORDER BY p."id" DESC) AS "pagos"
      FROM "PagoDeudaProveedorBodega" p
      WHERE p."deudaId" = d."id"
    ) p ON true
    WHERE (${id}::integer IS NULL OR d."id" = ${id}::integer)
    ORDER BY d."id" DESC
  `;
  return rows.map((row) => ({
    ...row,
    diasDeuda: Math.max(0, diferenciaDiasFechaProveedor(hoy, row.fecha)),
  }));
}

async function cargarDeuda(db: DebtDatabase, id: number, hoy: string) {
  const [deuda] = await cargarDeudas(db, id, hoy);
  if (!deuda) throw new BodegaSupplierDebtError("No se encontró la deuda.", 404);
  return deuda;
}

export async function listarDeudasBodega() {
  await asegurarDeudasBodega();
  const hoy = getDateKeyInColombia();
  return { hoy, items: await cargarDeudas(prisma, null, hoy) };
}

export async function buscarEquipoDeudaBodega(imei: unknown) {
  if (!esImeiValido(imei)) {
    throw new BodegaSupplierDebtError("El IMEI debe tener exactamente 15 dígitos.");
  }
  const equipo = await prisma.inventarioPrincipal.findUnique({
    where: { imei: imei.trim() },
    select: { imei: true, referencia: true },
  });
  if (!equipo) throw new BodegaSupplierDebtError("Este IMEI no está registrado en Bodega Principal.", 404);
  return equipo;
}

export async function registrarDeudaBodega(body: Record<string, unknown>, actor: DebtActor) {
  const numeroFactura = typeof body.numeroFactura === "string"
    ? normalizarTextoProveedor(body.numeroFactura)
    : "";
  if (!numeroFactura || numeroFactura.length > 120 || /[\x00-\x1f\x7f]/.test(numeroFactura)) {
    throw new BodegaSupplierDebtError("Escribe un número de factura válido de hasta 120 caracteres.");
  }
  const numeroNormalizado = normalizarNumeroFacturaProveedor(numeroFactura);
  if (!numeroNormalizado) throw new BodegaSupplierDebtError("El número de factura no es válido.");
  const proveedorId = leerId(body.proveedorId, "Proveedor");
  const imeis = leerImeis(body.imeis);
  const valor = leerValor(body.valor);

  await asegurarCatalogoDistribuidoresInventario();
  await asegurarDeudasBodega();
  return prisma.$transaction(async (tx) => {
    const [proveedor] = await tx.$queryRaw<{ nombre: string }[]>`
      SELECT "nombre" FROM "CatalogoDistribuidorInventario"
      WHERE "id" = ${proveedorId} AND "activo" = true FOR SHARE
    `;
    if (!proveedor) throw new BodegaSupplierDebtError("Selecciona un proveedor activo.");

    const equipos = await tx.$queryRaw<{ imei: string }[]>`
      SELECT "imei" FROM "InventarioPrincipal"
      WHERE "imei" = ANY(${imeis}::text[]) ORDER BY "imei" FOR SHARE
    `;
    if (equipos.length !== imeis.length) {
      const existentes = new Set(equipos.map((equipo) => equipo.imei));
      const faltante = imeis.find((imei) => !existentes.has(imei));
      throw new BodegaSupplierDebtError(`El IMEI ${faltante} no está registrado en Bodega Principal.`, 404);
    }

    const hoy = getDateKeyInColombia();
    const [deuda] = await tx.$queryRaw<{ id: number }[]>`
      INSERT INTO "DeudaProveedorBodega"
        ("fecha", "numeroFactura", "numeroFacturaNormalizado", "proveedorId", "proveedor", "valor", "registradoPorId", "registradoPor")
      VALUES (${hoy}::date, ${numeroFactura}, ${numeroNormalizado}, ${proveedorId}, ${proveedor.nombre},
              ${valor}::numeric, ${actor.id}, ${actor.nombre})
      ON CONFLICT ("proveedorId", "numeroFacturaNormalizado") DO NOTHING
      RETURNING "id"
    `;
    if (!deuda) throw new BodegaSupplierDebtError("Ya existe esa factura para el proveedor seleccionado.", 409);

    const vinculados = await tx.$queryRaw<{ imei: string }[]>`
      INSERT INTO "DeudaProveedorBodegaEquipo" ("deudaId", "imei", "referencia")
      SELECT ${deuda.id}, "imei", "referencia" FROM "InventarioPrincipal"
      WHERE "imei" = ANY(${imeis}::text[]) ORDER BY "imei"
      ON CONFLICT ("imei") DO NOTHING
      RETURNING "imei"
    `;
    if (vinculados.length !== imeis.length) {
      const insertados = new Set(vinculados.map((equipo) => equipo.imei));
      const repetido = imeis.find((imei) => !insertados.has(imei));
      throw new BodegaSupplierDebtError(`El IMEI ${repetido} ya está vinculado a otra factura de Bodega.`, 409);
    }
    return cargarDeuda(tx, deuda.id, hoy);
  }, { maxWait: 15_000, timeout: 30_000 });
}

export async function registrarPagoDeudaBodega(body: Record<string, unknown>, actor: DebtActor) {
  const deudaId = leerId(body.deudaId, "Identificador de la deuda");
  const valor = leerValor(body.valor);
  const clave = typeof body.claveIdempotencia === "string"
    ? normalizarClaveIdempotenciaProveedor(body.claveIdempotencia)
    : null;
  if (!clave) throw new BodegaSupplierDebtError("La clave de confirmación del pago no es válida.");

  await asegurarDeudasBodega();
  return prisma.$transaction(async (tx) => {
    // Serialize payments against the same invoice before checking the current balance.
    const [bloqueo] = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "DeudaProveedorBodega" WHERE "id" = ${deudaId} FOR UPDATE
    `;
    if (!bloqueo) throw new BodegaSupplierDebtError("No se encontró la deuda.", 404);

    const [existente] = await tx.$queryRaw<{ deudaId: number; valor: string; registradoPorId: number }[]>`
      SELECT "deudaId", "valor"::text AS "valor", "registradoPorId"
      FROM "PagoDeudaProveedorBodega" WHERE "claveIdempotencia" = ${clave}
    `;
    const hoy = getDateKeyInColombia();
    if (existente) {
      if (existente.deudaId !== deudaId || existente.valor !== valor || existente.registradoPorId !== actor.id) {
        throw new BodegaSupplierDebtError("La clave de confirmación ya se usó para otro pago.", 409);
      }
      return cargarDeuda(tx, deudaId, hoy);
    }

    const deuda = await cargarDeuda(tx, deudaId, hoy);
    const abono = validarAbonoFacturaProveedor(valor, deuda.saldo);
    if (!abono.ok) throw new BodegaSupplierDebtError(abono.error, 409);

    const [pago] = await tx.$queryRaw<{ id: number }[]>`
      INSERT INTO "PagoDeudaProveedorBodega"
        ("deudaId", "valor", "fecha", "claveIdempotencia", "registradoPorId", "registradoPor")
      VALUES (${deudaId}, ${abono.valor}::numeric, ${hoy}::date, ${clave}, ${actor.id}, ${actor.nombre})
      ON CONFLICT ("claveIdempotencia") DO NOTHING
      RETURNING "id"
    `;
    if (!pago) throw new BodegaSupplierDebtError("La clave de confirmación ya se usó para otro pago.", 409);
    return cargarDeuda(tx, deudaId, hoy);
  }, { maxWait: 15_000, timeout: 30_000 });
}
