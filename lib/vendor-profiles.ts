import prisma from "@/lib/prisma";

export const TIPOS_PERFIL_VENDEDOR = [
  "ADMINISTRADOR",
  "FACTURADOR",
  "SUPERVISOR_TIENDA",
] as const;

export type TipoPerfilVendedor = (typeof TIPOS_PERFIL_VENDEDOR)[number];

type PerfilVendedorPayload = {
  nombre: string;
  documento: string | null;
  telefono: string | null;
  correo: string | null;
  pinHash?: string;
  activo: boolean;
  tipo: TipoPerfilVendedor;
  sedeIds: number[];
  debeCambiarPin?: boolean;
};

export function normalizarNombrePerfilVendedor(valor: unknown) {
  return String(valor || "").replace(/\s+/g, " ").trim();
}

export function normalizarDocumentoPerfilVendedor(valor: unknown) {
  const documento = String(valor || "").replace(/\s+/g, "").trim();
  return documento || null;
}

export function normalizarTelefonoPerfilVendedor(valor: unknown) {
  const telefono = String(valor || "").replace(/\s+/g, " ").trim();
  return telefono || null;
}

export function normalizarCorreoPerfilVendedor(valor: unknown) {
  const correo = String(valor || "").replace(/\s+/g, "").trim().toLowerCase();
  return correo || null;
}

export function normalizarSedeIdsPerfilVendedor(valor: unknown) {
  const values = Array.isArray(valor) ? valor : [];

  return Array.from(
    new Set(
      values
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
}

export function normalizarTipoPerfilVendedor(
  valor: unknown
): TipoPerfilVendedor | null {
  const tipo = String(valor || "").trim().toUpperCase().replace(/\s+/g, "_");
  return TIPOS_PERFIL_VENDEDOR.includes(tipo as TipoPerfilVendedor)
    ? (tipo as TipoPerfilVendedor)
    : null;
}

export function etiquetaTipoPerfilVendedor(tipo: TipoPerfilVendedor) {
  if (tipo === "ADMINISTRADOR") return "Administrador";
  if (tipo === "FACTURADOR") return "Facturador";
  return "Supervisor de tienda";
}

async function validarSedesExistentes(sedeIds: number[]) {
  if (!sedeIds.length) {
    return;
  }

  const total = await prisma.sede.count({
    where: {
      id: {
        in: sedeIds,
      },
    },
  });

  if (total !== sedeIds.length) {
    throw new Error("Hay sedes invalidas en la asignacion");
  }
}

async function validarDuplicadosPerfil(
  payload: PerfilVendedorPayload,
  perfilId?: number
) {
  if (payload.documento) {
    const perfilDocumento = await prisma.perfilVendedor.findFirst({
      where: {
        documento: payload.documento,
        ...(perfilId ? { id: { not: perfilId } } : {}),
      },
      select: { id: true },
    });

    if (perfilDocumento) {
      throw new Error("Ya existe un perfil con ese documento");
    }
  }

  if (payload.correo) {
    const perfilCorreo = await prisma.perfilVendedor.findFirst({
      where: {
        correo: payload.correo,
        ...(perfilId ? { id: { not: perfilId } } : {}),
      },
      select: { id: true },
    });

    if (perfilCorreo) {
      throw new Error("Ya existe un perfil con ese correo");
    }
  }
}

async function syncPerfilSedes(perfilId: number, sedeIds: number[]) {
  await prisma.perfilVendedorSede.deleteMany({
    where: {
      perfilVendedorId: perfilId,
    },
  });

  if (!sedeIds.length) {
    return;
  }

  await prisma.perfilVendedorSede.createMany({
    data: sedeIds.map((sedeId) => ({
      perfilVendedorId: perfilId,
      sedeId,
    })),
    skipDuplicates: true,
  });
}

export async function obtenerPerfilesVendedor(options?: {
  soloActivos?: boolean;
}) {
  const perfiles = await prisma.perfilVendedor.findMany({
    where: options?.soloActivos ? { activo: true } : undefined,
    select: {
      id: true,
      nombre: true,
      documento: true,
      telefono: true,
      correo: true,
      activo: true,
      tipo: true,
      debeCambiarPin: true,
      sedes: {
        select: {
          sede: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
        orderBy: {
          sede: {
            nombre: "asc",
          },
        },
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  return perfiles.map((perfil) => ({
    id: perfil.id,
    nombre: perfil.nombre,
    documento: perfil.documento,
    telefono: perfil.telefono,
    correo: perfil.correo,
    activo: perfil.activo,
    tipo: perfil.tipo,
    tipoLabel: etiquetaTipoPerfilVendedor(perfil.tipo as TipoPerfilVendedor),
    debeCambiarPin: perfil.debeCambiarPin,
    sedeIds: perfil.sedes.map((item) => item.sede.id),
    sedes: perfil.sedes.map((item) => ({
      id: item.sede.id,
      nombre: item.sede.nombre,
    })),
    createdAt: perfil.createdAt,
    updatedAt: perfil.updatedAt,
  }));
}

export async function crearPerfilVendedor(payload: PerfilVendedorPayload) {
  await validarSedesExistentes(payload.sedeIds);
  await validarDuplicadosPerfil(payload);

  const perfil = await prisma.perfilVendedor.create({
    data: {
      nombre: payload.nombre,
      documento: payload.documento,
      telefono: payload.telefono,
      correo: payload.correo,
      pinHash: String(payload.pinHash || ""),
      activo: payload.activo,
      tipo: payload.tipo,
      debeCambiarPin: payload.debeCambiarPin ?? true,
    },
    select: {
      id: true,
    },
  });

  await syncPerfilSedes(perfil.id, payload.sedeIds);

  return perfil.id;
}

export async function actualizarPerfilVendedor(
  perfilId: number,
  payload: PerfilVendedorPayload
) {
  await validarSedesExistentes(payload.sedeIds);
  await validarDuplicadosPerfil(payload, perfilId);

  await prisma.perfilVendedor.update({
    where: { id: perfilId },
    data: {
      nombre: payload.nombre,
      documento: payload.documento,
      telefono: payload.telefono,
      correo: payload.correo,
      activo: payload.activo,
      tipo: payload.tipo,
      ...(payload.pinHash ? { pinHash: payload.pinHash } : {}),
      ...(payload.debeCambiarPin !== undefined
        ? { debeCambiarPin: payload.debeCambiarPin }
        : {}),
    },
  });

  await syncPerfilSedes(perfilId, payload.sedeIds);
}
