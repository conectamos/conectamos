import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { ensureSystemConfigSchema } from "@/lib/vendor-welcome-message";
import {
  puedeIngresarInventarioPrincipal,
  puedeIngresarInventarioSede,
  type UsuarioIngresoInventario,
} from "@/lib/inventory-intake-access";

const CONFIG_KEY = "inventario.ingresoDirectoSede";

export async function leerIngresoDirectoSede(tx?: Prisma.TransactionClient) {
  await ensureSystemConfigSchema();
  const rows = tx
    // Keep an authorized creation and a concurrent disable in a definite order.
    ? await tx.$queryRaw<{ valor: unknown }[]>`
        SELECT "valor" FROM "ConfiguracionSistema" WHERE "clave" = ${CONFIG_KEY} FOR SHARE
      `
    : await prisma.$queryRaw<{ valor: unknown }[]>`
        SELECT "valor" FROM "ConfiguracionSistema" WHERE "clave" = ${CONFIG_KEY}
      `;

  return rows[0]?.valor === true;
}

export async function guardarIngresoDirectoSede(habilitado: boolean, usuario: string) {
  await ensureSystemConfigSchema();
  await prisma.$executeRaw`
    INSERT INTO "ConfiguracionSistema" ("clave", "valor", "updatedAt", "updatedBy")
    VALUES (${CONFIG_KEY}, ${JSON.stringify(habilitado)}::jsonb, CURRENT_TIMESTAMP, ${usuario})
    ON CONFLICT ("clave") DO UPDATE SET
      "valor" = EXCLUDED."valor",
      "updatedAt" = EXCLUDED."updatedAt",
      "updatedBy" = EXCLUDED."updatedBy"
  `;
}

export async function consultarPermisoIngresoSede(user: UsuarioIngresoInventario) {
  if (puedeIngresarInventarioSede(user)) return true;
  if (!puedeIngresarInventarioSede(user, true)) return false;
  return leerIngresoDirectoSede();
}

export async function consultarPermisoIngresoInventario(user: UsuarioIngresoInventario) {
  if (puedeIngresarInventarioPrincipal(user)) return true;
  try {
    return await consultarPermisoIngresoSede(user);
  } catch (error) {
    console.error("ERROR CONSULTANDO PERMISO DE INGRESO DE INVENTARIO:", error);
    return false;
  }
}
