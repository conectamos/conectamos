import prisma from "@/lib/prisma";

export type PriceListItem = {
  id: number;
  marca: string;
  referencia: string;
  precio: number;
  createdAt: Date;
  updatedAt: Date;
};

let ensurePriceListSchemaPromise: Promise<void> | null = null;

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toPriceListItem(row: Record<string, unknown>): PriceListItem {
  return {
    id: toNumber(row.id),
    marca: String(row.marca || ""),
    referencia: String(row.referencia || ""),
    precio: toNumber(row.precio),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

async function ensurePriceListSchema() {
  if (!ensurePriceListSchemaPromise) {
    ensurePriceListSchemaPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ListaPrecio" (
          "id" SERIAL NOT NULL,
          "marca" TEXT NOT NULL,
          "referencia" TEXT NOT NULL,
          "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ListaPrecio_pkey" PRIMARY KEY ("id")
        );
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ListaPrecio_marca_referencia_idx"
        ON "ListaPrecio"("marca", "referencia");
      `);
    })().catch((error) => {
      ensurePriceListSchemaPromise = null;
      throw error;
    });
  }

  await ensurePriceListSchemaPromise;
}

export function normalizarTextoListaPrecio(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizarPrecioLista(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : Number.NaN;
  }

  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) {
    return Number.NaN;
  }

  const price = Number(digits);
  return Number.isFinite(price) ? Math.max(0, Math.round(price)) : Number.NaN;
}

export async function obtenerListaPrecios() {
  await ensurePriceListSchema();

  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT
        "id",
        "marca",
        "referencia",
        "precio",
        "createdAt",
        "updatedAt"
      FROM "ListaPrecio"
      ORDER BY UPPER("marca") ASC, UPPER("referencia") ASC, "id" ASC
    `
  )) as Array<Record<string, unknown>>;

  return rows.map(toPriceListItem);
}

export async function obtenerListaPrecioPorId(id: number) {
  await ensurePriceListSchema();

  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT
        "id",
        "marca",
        "referencia",
        "precio",
        "createdAt",
        "updatedAt"
      FROM "ListaPrecio"
      WHERE "id" = $1
      LIMIT 1
    `,
    id
  )) as Array<Record<string, unknown>>;

  return rows[0] ? toPriceListItem(rows[0]) : null;
}

export async function crearListaPrecio(params: {
  marca: string;
  referencia: string;
  precio: number;
}) {
  await ensurePriceListSchema();

  const rows = (await prisma.$queryRawUnsafe(
    `
      INSERT INTO "ListaPrecio" ("marca", "referencia", "precio", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING "id", "marca", "referencia", "precio", "createdAt", "updatedAt"
    `,
    params.marca,
    params.referencia,
    params.precio
  )) as Array<Record<string, unknown>>;

  return rows[0] ? toPriceListItem(rows[0]) : null;
}

export async function actualizarListaPrecio(params: {
  id: number;
  marca: string;
  referencia: string;
  precio: number;
}) {
  await ensurePriceListSchema();

  const rows = (await prisma.$queryRawUnsafe(
    `
      UPDATE "ListaPrecio"
      SET
        "marca" = $2,
        "referencia" = $3,
        "precio" = $4,
        "updatedAt" = NOW()
      WHERE "id" = $1
      RETURNING "id", "marca", "referencia", "precio", "createdAt", "updatedAt"
    `,
    params.id,
    params.marca,
    params.referencia,
    params.precio
  )) as Array<Record<string, unknown>>;

  return rows[0] ? toPriceListItem(rows[0]) : null;
}

export async function eliminarListaPrecioPorId(id: number) {
  await ensurePriceListSchema();

  await prisma.$executeRawUnsafe(
    'DELETE FROM "ListaPrecio" WHERE "id" = $1',
    id
  );
}
