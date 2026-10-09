import prisma from "@/lib/prisma";

let ensureSchemaPromise: Promise<void> | null = null;

type GastoRegistrado = {
  id: number;
  valor: number;
  observacion: string | null;
  sedeId: number;
  createdAt: string;
};

type SolicitudGuardada = {
  solicitud: string;
  resultado: GastoRegistrado | null;
};

export class CarteraRequestConflictError extends Error {
  constructor() {
    super("Este intento ya fue registrado con otros datos. Actualiza la página antes de crear un gasto diferente.");
    this.name = "CarteraRequestConflictError";
  }
}

function ensureCarteraRequestSchema() {
  if (!ensureSchemaPromise) {
    // Ancillary request journal: no changes to the expense or accounting tables.
    ensureSchemaPromise = prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "CarteraRegistroSolicitud" (
        "usuarioId" INTEGER NOT NULL,
        "clave" TEXT COLLATE "C" NOT NULL,
        "solicitud" TEXT NOT NULL,
        "resultado" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CarteraRegistroSolicitud_pkey" PRIMARY KEY ("usuarioId", "clave")
      )
    `.then(() => undefined).catch((error: unknown) => {
      ensureSchemaPromise = null;
      throw error;
    });
  }

  return ensureSchemaPromise;
}

export async function registrarGastoCarteraUnaVez(input: {
  usuarioId: number;
  clave: string;
  sedeId: number;
  valor: number;
  observacion: string | null;
}) {
  await ensureCarteraRequestSchema();
  const { usuarioId, clave, sedeId, valor, observacion } = input;
  const solicitud = JSON.stringify({ sedeId, valor, observacion });

  return prisma.$transaction(async (tx) => {
    // The unique insert waits for a concurrent attempt to commit or roll back.
    // The journal and expense are committed together, including the response.
    await tx.$executeRaw`
      INSERT INTO "CarteraRegistroSolicitud" ("usuarioId", "clave", "solicitud")
      VALUES (${usuarioId}, ${clave}, ${solicitud})
      ON CONFLICT ("usuarioId", "clave") DO NOTHING
    `;
    const requests = await tx.$queryRaw<SolicitudGuardada[]>`
      SELECT "solicitud", "resultado"
      FROM "CarteraRegistroSolicitud"
      WHERE "usuarioId" = ${usuarioId} AND "clave" = ${clave}
      FOR UPDATE
    `;
    const request = requests[0];

    if (!request) throw new Error("No se pudo reservar el intento de registro");
    if (request.solicitud !== solicitud) throw new CarteraRequestConflictError();
    if (request.resultado) return { item: request.resultado, replayed: true };

    const gasto = await tx.gastoCartera.create({
      data: { valor, observacion, sedeId },
      select: { id: true, valor: true, observacion: true, sedeId: true, createdAt: true },
    });
    const resultado = JSON.stringify(gasto);
    await tx.$executeRaw`
      UPDATE "CarteraRegistroSolicitud"
      SET "resultado" = ${resultado}::jsonb
      WHERE "usuarioId" = ${usuarioId} AND "clave" = ${clave}
    `;

    return { item: JSON.parse(resultado) as GastoRegistrado, replayed: false };
  }, { maxWait: 10_000, timeout: 20_000 });
}
