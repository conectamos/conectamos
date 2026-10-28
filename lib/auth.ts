import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import {
  esPerfilAdministrador,
  esPerfilAuditor,
  esPerfilBodega,
  esRolBodega,
  esSedeBodegaPrincipal,
} from "@/lib/access-control";
import { etiquetaTipoPerfilVendedor } from "@/lib/vendor-profiles";
import { isSessionIdle } from "@/lib/session-state";

export async function getSessionUser(sessionTokenOverride?: string) {
  const sessionToken = typeof sessionTokenOverride === "string"
    ? sessionTokenOverride
    : (await cookies()).get(SESSION_COOKIE_NAME)?.value;

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
      activeSessionKey: true,
      activeSessionLastSeenAt: true,
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
          activa: true,
          soloInventarioPorCobrar: true,
        },
      },
    },
  });

  if (!user || !user.activo || user.sede?.activa === false) return null;

  if (!session.profileId) {
    if (!session.sessionKey || user.activeSessionKey !== session.sessionKey) {
      return null;
    }

    if (isSessionIdle(user.activeSessionLastSeenAt)) {
      return null;
    }
  }

  let perfil:
    | {
        id: number;
        nombre: string;
        tipo: string;
        activeSessionKey: string | null;
        activeSessionLastSeenAt: Date | null;
      }
    | null = null;

  if (session.profileId) {
    perfil = await prisma.perfilVendedor.findFirst({
      where: {
        id: session.profileId,
        activo: true,
        OR: [
          { tipo: { in: ["ADMINISTRADOR", "AUDITOR"] } },
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
        activeSessionKey: true,
        activeSessionLastSeenAt: true,
      },
    });

    if (!perfil) {
      return null;
    }

    if (!session.sessionKey || perfil.activeSessionKey !== session.sessionKey) {
      return null;
    }

    if (isSessionIdle(perfil.activeSessionLastSeenAt)) {
      return null;
    }
  }

  const usuarioBodega = esRolBodega(user.rol?.nombre);
  const perfilBodega = esPerfilBodega(perfil?.tipo);

  // A warehouse identity never inherits the administrative role of its base login.
  if (usuarioBodega || perfilBodega) {
    if (!esSedeBodegaPrincipal(user.sede?.nombre)) return null;
    if (usuarioBodega && perfil && !perfilBodega) return null;
  }

  const rolNombre = perfilBodega || usuarioBodega
    ? "BODEGA"
    : esPerfilAdministrador(perfil?.tipo)
    ? "ADMIN"
    : esPerfilAuditor(perfil?.tipo)
      ? "AUDITOR"
      : user.rol?.nombre ?? "";

  return {
    id: user.id,
    nombre: user.nombre,
    usuario: user.usuario,
    activo: user.activo,
    sedeId: user.sedeId,
    sedeNombre: user.sede?.nombre ?? "Sede sin configurar",
    sedeSoloInventarioPorCobrar: Boolean(user.sede?.soloInventarioPorCobrar),
    rolId: user.rolId,
    rolNombre,
    sessionKey: session.sessionKey ?? null,
    perfilId: perfil?.id ?? null,
    perfilNombre: perfil?.nombre ?? null,
    perfilTipo: perfil?.tipo ?? null,
    perfilTipoLabel: perfil?.tipo
      ? etiquetaTipoPerfilVendedor(perfil.tipo as Parameters<typeof etiquetaTipoPerfilVendedor>[0])
      : null,
  };
}
