import type { Prisma } from "@/app/generated/prisma/client";

export class EntidadOperativaInactivaError extends Error {
  readonly status = 409;
}

// Keep the row locks until the operation commits; removal locks the same rows FOR UPDATE.
export async function validarSedesActivasOperacion(tx: Prisma.TransactionClient, ids: number[]) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    await tx.$queryRaw`SELECT "id" FROM "Sede" WHERE "id" = ${id} FOR KEY SHARE`;
    const sede = await tx.sede.findUnique({ where: { id }, select: { activa: true } });
    if (!sede?.activa) throw new EntidadOperativaInactivaError("La sede está inactiva o fue eliminada. Selecciona una sede habilitada.");
  }
}

export async function validarPerfilActivoOperacion(tx: Prisma.TransactionClient, id: number) {
  await tx.$queryRaw`SELECT "id" FROM "PerfilVendedor" WHERE "id" = ${id} FOR KEY SHARE`;
  const perfil = await tx.perfilVendedor.findUnique({ where: { id }, select: { activo: true } });
  if (!perfil?.activo) throw new EntidadOperativaInactivaError("El perfil está inactivo o fue eliminado. Ingresa con un perfil habilitado.");
}
