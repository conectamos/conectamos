import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { etiquetaTipoPerfilVendedor } from "@/lib/vendor-profiles";

export async function getSessionUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const session = verifySessionToken(sessionToken);

  if (!session) return null;

  const user = await prisma.usuario.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      nombre: true,
      usuario: true,
      activo: true,
      sedeId: true,
      rolId: true,
      rol: {
        select: {
          id: true,
          nombre: true,
          descripcion: true,
        },
      },
      sede: {
        select: {
          id: true,
          nombre: true,
        },
      },
    },
  });

  if (!user || !user.activo) return null;

  let perfil:
    | {
        id: number;
        nombre: string;
        tipo: string;
      }
    | null = null;

  if (session.profileId) {
    perfil = await prisma.perfilVendedor.findFirst({
      where: {
        id: session.profileId,
        activo: true,
        OR: [
          { tipo: "ADMINISTRADOR" },
          {
            sedes: {
              some: {
                sedeId: user.sedeId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        nombre: true,
        tipo: true,
      },
    });

    if (!perfil) {
      return null;
    }
  }

  const rolNombre =
    perfil?.tipo === "ADMINISTRADOR" ? "ADMIN" : user.rol?.nombre ?? "";

  return {
    id: user.id,
    nombre: user.nombre,
    usuario: user.usuario,
    activo: user.activo,
    sedeId: user.sedeId,
    sedeNombre: user.sede?.nombre ?? `SEDE ${user.sedeId}`,
    rolId: user.rolId,
    rolNombre,
    perfilId: perfil?.id ?? null,
    perfilNombre: perfil?.nombre ?? null,
    perfilTipo: perfil?.tipo ?? null,
    perfilTipoLabel: perfil?.tipo
      ? etiquetaTipoPerfilVendedor(perfil.tipo as Parameters<typeof etiquetaTipoPerfilVendedor>[0])
      : null,
  };
}
