import prisma from "@/lib/prisma";

export type ListaNegraTipoReporte = "FRAUDE";
export type ListaNegraObservacion = "PRESTA_NOMBRE";

export type ListaNegraDocumento = {
  activo: boolean;
  createdAt: string;
  documentoNumero: string;
  financieraDeuda: string | null;
  id: number;
  motivo: string | null;
  reportadoPorNombre: string | null;
  sedeNombre: string | null;
  tipoObservacion: ListaNegraObservacion;
  tipoReporte: ListaNegraTipoReporte;
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

export function normalizarObservacionListaNegra(
  value: unknown
): ListaNegraObservacion {
  void value;
  return "PRESTA_NOMBRE";
}

function serializeRow(row: {
  activo: boolean;
  createdAt: Date | string;
  documentoNumero: string;
  financieraDeuda: string | null;
  id: number;
  motivo: string | null;
  reportadoPorNombre: string | null;
  sedeNombre: string | null;
  tipoObservacion: string | null;
  tipoReporte: string | null;
  updatedAt: Date | string;
}): ListaNegraDocumento {
  return {
    activo: Boolean(row.activo),
    createdAt: new Date(row.createdAt).toISOString(),
    documentoNumero: row.documentoNumero,
    financieraDeuda: row.financieraDeuda,
    id: Number(row.id),
    motivo: row.motivo,
    reportadoPorNombre: row.reportadoPorNombre,
    sedeNombre: row.sedeNombre,
    tipoObservacion: normalizarObservacionListaNegra(row.tipoObservacion),
    tipoReporte: "FRAUDE",
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

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ListaNegraDocumento"
    ADD COLUMN IF NOT EXISTS "tipoReporte" TEXT NOT NULL DEFAULT 'FRAUDE';
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ListaNegraDocumento"
    ADD COLUMN IF NOT EXISTS "tipoObservacion" TEXT NOT NULL DEFAULT 'PRESTA_NOMBRE';
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ListaNegraDocumento"
    ADD COLUMN IF NOT EXISTS "financieraDeuda" TEXT;
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
      financieraDeuda: string | null;
      id: number;
      motivo: string | null;
      reportadoPorNombre: string | null;
      sedeNombre: string | null;
      tipoObservacion: string | null;
      tipoReporte: string | null;
      updatedAt: Date;
    }>
  >(
    `
      SELECT
        "id",
        "documentoNumero",
        "tipoReporte",
        "tipoObservacion",
        "financieraDeuda",
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
      financieraDeuda: string | null;
      id: number;
      motivo: string | null;
      reportadoPorNombre: string | null;
      sedeNombre: string | null;
      tipoObservacion: string | null;
      tipoReporte: string | null;
      updatedAt: Date;
    }>
  >(
    `
      SELECT
        "id",
        "documentoNumero",
        "tipoReporte",
        "tipoObservacion",
        "financieraDeuda",
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
  financieraDeuda,
  motivo,
  reportadoPorNombre,
  reportadoPorPerfilId,
  sedeId,
  sedeNombre,
  tipoObservacion,
}: {
  documento: unknown;
  financieraDeuda?: unknown;
  motivo?: unknown;
  reportadoPorNombre?: string | null;
  reportadoPorPerfilId?: number | null;
  sedeId?: number | null;
  sedeNombre?: string | null;
  tipoObservacion?: unknown;
}) {
  const documentoNumero = normalizarDocumentoListaNegra(documento);
  const observacion = normalizarObservacionListaNegra(tipoObservacion);
  void financieraDeuda;

  if (!documentoNumero) {
    return { error: "La cedula debe tener entre 5 y 15 digitos" } as const;
  }

  await ensureListaNegraSchema();

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      activo: boolean;
      createdAt: Date;
      documentoNumero: string;
      financieraDeuda: string | null;
      id: number;
      motivo: string | null;
      reportadoPorNombre: string | null;
      sedeNombre: string | null;
      tipoObservacion: string | null;
      tipoReporte: string | null;
      updatedAt: Date;
    }>
  >(
    `
      INSERT INTO "ListaNegraDocumento" (
        "documentoNumero",
        "tipoReporte",
        "tipoObservacion",
        "financieraDeuda",
        "motivo",
        "reportadoPorPerfilId",
        "reportadoPorNombre",
        "sedeId",
        "sedeNombre",
        "activo",
        "createdAt",
        "updatedAt"
      )
      VALUES ($1, 'FRAUDE', $2, $3, $4, $5, $6, $7, $8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("documentoNumero") DO UPDATE SET
        "tipoReporte" = 'FRAUDE',
        "tipoObservacion" = EXCLUDED."tipoObservacion",
        "financieraDeuda" = EXCLUDED."financieraDeuda",
        "motivo" = EXCLUDED."motivo",
        "reportadoPorPerfilId" = EXCLUDED."reportadoPorPerfilId",
        "reportadoPorNombre" = EXCLUDED."reportadoPorNombre",
        "sedeId" = EXCLUDED."sedeId",
        "sedeNombre" = EXCLUDED."sedeNombre",
        "activo" = true,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "ListaNegraDocumento"."activo" = false
      RETURNING
        "id",
        "documentoNumero",
        "tipoReporte",
        "tipoObservacion",
        "financieraDeuda",
        "motivo",
        "reportadoPorNombre",
        "sedeNombre",
        "activo",
        "createdAt",
        "updatedAt"
    `,
    documentoNumero,
    observacion,
    null,
    normalizarMotivo(motivo),
    reportadoPorPerfilId ?? null,
    reportadoPorNombre ?? null,
    sedeId ?? null,
    sedeNombre ?? null
  );

  if (!rows[0]) {
    return { error: "Esta cedula ya esta en lista negra" } as const;
  }

  return { data: serializeRow(rows[0]) } as const;
}

export async function actualizarDocumentoListaNegra({
  documento,
  financieraDeuda,
  id,
  motivo,
  tipoObservacion,
}: {
  documento: unknown;
  financieraDeuda?: unknown;
  id: unknown;
  motivo?: unknown;
  tipoObservacion?: unknown;
}) {
  const registroId = Number(id);
  const documentoNumero = normalizarDocumentoListaNegra(documento);
  const observacion = normalizarObservacionListaNegra(tipoObservacion);
  void financieraDeuda;

  if (!Number.isInteger(registroId) || registroId <= 0) {
    return { error: "Registro invalido" } as const;
  }

  if (!documentoNumero) {
    return { error: "La cedula debe tener entre 5 y 15 digitos" } as const;
  }

  await ensureListaNegraSchema();

  const conflicts = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `
      SELECT "id"
      FROM "ListaNegraDocumento"
      WHERE "documentoNumero" = $1
        AND "id" <> $2
      LIMIT 1
    `,
    documentoNumero,
    registroId
  );

  if (conflicts.length > 0) {
    return { error: "Ya existe otro reporte con esa cedula" } as const;
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      activo: boolean;
      createdAt: Date;
      documentoNumero: string;
      financieraDeuda: string | null;
      id: number;
      motivo: string | null;
      reportadoPorNombre: string | null;
      sedeNombre: string | null;
      tipoObservacion: string | null;
      tipoReporte: string | null;
      updatedAt: Date;
    }>
  >(
    `
      UPDATE "ListaNegraDocumento"
      SET
        "documentoNumero" = $1,
        "tipoReporte" = 'FRAUDE',
        "tipoObservacion" = $2,
        "financieraDeuda" = $3,
        "motivo" = $4,
        "activo" = true,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $5
      RETURNING
        "id",
        "documentoNumero",
        "tipoReporte",
        "tipoObservacion",
        "financieraDeuda",
        "motivo",
        "reportadoPorNombre",
        "sedeNombre",
        "activo",
        "createdAt",
        "updatedAt"
    `,
    documentoNumero,
    observacion,
    null,
    normalizarMotivo(motivo),
    registroId
  );

  if (!rows[0]) {
    return { error: "Registro no encontrado" } as const;
  }

  return { data: serializeRow(rows[0]) } as const;
}

export async function desactivarDocumentoListaNegra(id: unknown) {
  const registroId = Number(id);

  if (!Number.isInteger(registroId) || registroId <= 0) {
    return { error: "Registro invalido" } as const;
  }

  await ensureListaNegraSchema();

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      activo: boolean;
      createdAt: Date;
      documentoNumero: string;
      financieraDeuda: string | null;
      id: number;
      motivo: string | null;
      reportadoPorNombre: string | null;
      sedeNombre: string | null;
      tipoObservacion: string | null;
      tipoReporte: string | null;
      updatedAt: Date;
    }>
  >(
    `
      UPDATE "ListaNegraDocumento"
      SET
        "activo" = false,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1
        AND "activo" = true
      RETURNING
        "id",
        "documentoNumero",
        "tipoReporte",
        "tipoObservacion",
        "financieraDeuda",
        "motivo",
        "reportadoPorNombre",
        "sedeNombre",
        "activo",
        "createdAt",
        "updatedAt"
    `,
    registroId
  );

  if (!rows[0]) {
    return { error: "Registro no encontrado" } as const;
  }

  return { data: serializeRow(rows[0]) } as const;
}
