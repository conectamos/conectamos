import prisma from "@/lib/prisma";

export type ListaNegraDocumento = {
  activo: boolean;
  createdAt: string;
  documentoNumero: string;
  id: number;
  motivo: string | null;
  reportadoPorNombre: string | null;
  sedeNombre: string | null;
  updatedAt: string;
};

let listaNegraSchemaReady: Promise<void> | null = null;

export function normalizarDocumentoListaNegra(value: unknown) {
  const documento = String(value || "").replace(/\D/g, "").trim();

  if (documento.length < 5 || documento.length > 15) {
    return null;
  }

  return documento;
}

function normalizarMotivo(value: unknown) {
  const motivo = String(value || "").replace(/\s+/g, " ").trim();
  return motivo ? motivo.slice(0, 500) : null;
}

function serializeRow(row: {
  activo: boolean;
  createdAt: Date | string;
  documentoNumero: string;
  id: number;
  motivo: string | null;
  reportadoPorNombre: string | null;
  sedeNombre: string | null;
  updatedAt: Date | string;
}): ListaNegraDocumento {
  return {
    activo: Boolean(row.activo),
    createdAt: new Date(row.createdAt).toISOString(),
    documentoNumero: row.documentoNumero,
    id: Number(row.id),
    motivo: row.motivo,
    reportadoPorNombre: row.reportadoPorNombre,
    sedeNombre: row.sedeNombre,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

async function runEnsureListaNegraSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ListaNegraDocumento" (
      "id" SERIAL NOT NULL,
      "documentoNumero" TEXT NOT NULL,
      "motivo" TEXT,
      "reportadoPorPerfilId" INTEGER,
      "reportadoPorNombre" TEXT,
      "sedeId" INTEGER,
      "sedeNombre" TEXT,
      "activo" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ListaNegraDocumento_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ListaNegraDocumento_documentoNumero_key"
    ON "ListaNegraDocumento"("documentoNumero");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ListaNegraDocumento_activo_updatedAt_idx"
    ON "ListaNegraDocumento"("activo", "updatedAt");
  `);
}

export async function ensureListaNegraSchema() {
  if (!listaNegraSchemaReady) {
    listaNegraSchemaReady = runEnsureListaNegraSchema().catch((error) => {
      listaNegraSchemaReady = null;
      throw error;
    });
  }

  await listaNegraSchemaReady;
}

export async function buscarDocumentoListaNegra(value: unknown) {
  const documento = normalizarDocumentoListaNegra(value);

  if (!documento) {
    return null;
  }

  await ensureListaNegraSchema();

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      activo: boolean;
      createdAt: Date;
      documentoNumero: string;
      id: number;
      motivo: string | null;
      reportadoPorNombre: string | null;
      sedeNombre: string | null;
      updatedAt: Date;
    }>
  >(
    `
      SELECT
        "id",
        "documentoNumero",
        "motivo",
        "reportadoPorNombre",
        "sedeNombre",
        "activo",
        "createdAt",
        "updatedAt"
      FROM "ListaNegraDocumento"
      WHERE "documentoNumero" = $1
        AND "activo" = true
      LIMIT 1
    `,
    documento
  );

  return rows[0] ? serializeRow(rows[0]) : null;
}

export async function listarDocumentosListaNegra(limit = 80) {
  await ensureListaNegraSchema();

  const safeLimit = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      activo: boolean;
      createdAt: Date;
      documentoNumero: string;
      id: number;
      motivo: string | null;
      reportadoPorNombre: string | null;
      sedeNombre: string | null;
      updatedAt: Date;
    }>
  >(
    `
      SELECT
        "id",
        "documentoNumero",
        "motivo",
        "reportadoPorNombre",
        "sedeNombre",
        "activo",
        "createdAt",
        "updatedAt"
      FROM "ListaNegraDocumento"
      WHERE "activo" = true
      ORDER BY "updatedAt" DESC
      LIMIT $1
    `,
    safeLimit
  );

  return rows.map(serializeRow);
}

export async function guardarDocumentoListaNegra({
  documento,
  motivo,
  reportadoPorNombre,
  reportadoPorPerfilId,
  sedeId,
  sedeNombre,
}: {
  documento: unknown;
  motivo?: unknown;
  reportadoPorNombre?: string | null;
  reportadoPorPerfilId?: number | null;
  sedeId?: number | null;
  sedeNombre?: string | null;
}) {
  const documentoNumero = normalizarDocumentoListaNegra(documento);

  if (!documentoNumero) {
    return { error: "La cedula debe tener entre 5 y 15 digitos" } as const;
  }

  await ensureListaNegraSchema();

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      activo: boolean;
      createdAt: Date;
      documentoNumero: string;
      id: number;
      motivo: string | null;
      reportadoPorNombre: string | null;
      sedeNombre: string | null;
      updatedAt: Date;
    }>
  >(
    `
      INSERT INTO "ListaNegraDocumento" (
        "documentoNumero",
        "motivo",
        "reportadoPorPerfilId",
        "reportadoPorNombre",
        "sedeId",
        "sedeNombre",
        "activo",
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("documentoNumero") DO UPDATE SET
        "motivo" = EXCLUDED."motivo",
        "reportadoPorPerfilId" = EXCLUDED."reportadoPorPerfilId",
        "reportadoPorNombre" = EXCLUDED."reportadoPorNombre",
        "sedeId" = EXCLUDED."sedeId",
        "sedeNombre" = EXCLUDED."sedeNombre",
        "activo" = true,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING
        "id",
        "documentoNumero",
        "motivo",
        "reportadoPorNombre",
        "sedeNombre",
        "activo",
        "createdAt",
        "updatedAt"
    `,
    documentoNumero,
    normalizarMotivo(motivo),
    reportadoPorPerfilId ?? null,
    reportadoPorNombre ?? null,
    sedeId ?? null,
    sedeNombre ?? null
  );

  return { data: serializeRow(rows[0]) } as const;
}
