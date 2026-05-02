import prisma from "@/lib/prisma";

export type ReferenciaInventarioCatalogo = {
  id: number;
  nombre: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function normalizarReferenciaInventario(valor: unknown) {
  return String(valor || "").replace(/\s+/g, " ").trim();
}

export function claveReferenciaInventario(valor: unknown) {
  return normalizarReferenciaInventario(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export async function asegurarTablaCatalogoReferenciasInventario() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CatalogoReferenciaInventario" (
      "id" SERIAL PRIMARY KEY,
      "nombre" TEXT NOT NULL,
      "nombreNormalizado" TEXT NOT NULL UNIQUE,
      "activo" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function sincronizarCatalogoReferenciasInventario() {
  await asegurarTablaCatalogoReferenciasInventario();

  const totalCatalogo = await prisma.catalogoReferenciaInventario.count();

  if (totalCatalogo > 0) {
    return;
  }

  const referenciasActuales = await prisma.inventarioPrincipal.findMany({
    distinct: ["referencia"],
    where: {
      referencia: {
        not: "",
      },
    },
    select: {
      referencia: true,
    },
  });

  for (const item of referenciasActuales) {
    const nombre = normalizarReferenciaInventario(item.referencia);
    const nombreNormalizado = claveReferenciaInventario(nombre);

    if (!nombre || !nombreNormalizado) {
      continue;
    }

    await prisma.catalogoReferenciaInventario.upsert({
      where: { nombreNormalizado },
      update: {},
      create: {
        nombre,
        nombreNormalizado,
      },
    });
  }
}

export async function obtenerCatalogoReferenciasInventario(options?: {
  incluirInactivas?: boolean;
}) {
  await sincronizarCatalogoReferenciasInventario();

  return prisma.catalogoReferenciaInventario.findMany({
    where: options?.incluirInactivas ? {} : { activo: true },
    orderBy: [
      { activo: "desc" },
      { nombre: "asc" },
    ],
  });
}

export async function buscarReferenciaInventarioActiva(nombre: string) {
  const nombreNormalizado = claveReferenciaInventario(nombre);

  if (!nombreNormalizado) {
    return null;
  }

  await sincronizarCatalogoReferenciasInventario();

  return prisma.catalogoReferenciaInventario.findFirst({
    where: {
      nombreNormalizado,
      activo: true,
    },
  });
}
