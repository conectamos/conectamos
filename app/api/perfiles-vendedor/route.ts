import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import { esPerfilBodega, esRolAdmin } from "@/lib/access-control";
import { puedeEliminarEntidadesCentrales } from "@/lib/admin-entity-removal-access";
import { AdminEntityRemovalError, eliminarPerfilComercial } from "@/lib/admin-entity-removal";
import { EntidadOperativaInactivaError } from "@/lib/active-operational-entities";
import {
  actualizarPerfilVendedor,
  crearPerfilVendedor,
  normalizarAvatarPerfilVendedor,
  normalizarCorreoPerfilVendedor,
  normalizarDocumentoPerfilVendedor,
  normalizarNombrePerfilVendedor,
  normalizarSedeIdsPerfilVendedor,
  normalizarTelefonoPerfilVendedor,
  normalizarTipoPerfilVendedor,
  obtenerPerfilesVendedor,
  PerfilBodegaValidationError,
} from "@/lib/vendor-profiles";

function esAdmin(rolNombre: string) {
  return ["ADMIN", "AUDITOR"].includes(String(rolNombre || "").trim().toUpperCase());
}

function pinValido(pin: string) {
  return /^\d{4,6}$/.test(pin);
}

async function requireAdmin() {
  const user = await getSessionUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  if (!esAdmin(user.rolNombre)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Solo el administrador puede gestionar perfiles" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, user };
}

async function cargarRespuestaAdmin() {
  await ensureVendorProfilesSchema();

  const [perfiles, sedes] = await Promise.all([
    obtenerPerfilesVendedor(),
    prisma.sede.findMany({
      where: { eliminadoEn: null, activa: true },
      select: {
        id: true,
        nombre: true,
      },
      orderBy: {
        nombre: "asc",
      },
    }),
  ]);

  return { perfiles, sedes };
}

function validarPayloadPerfil(payload: {
  nombre: string;
  tipo: string | null;
  sedeIds: number[];
}) {
  if (!payload.nombre) {
    return "El nombre del perfil es obligatorio";
  }

  if (!payload.tipo) {
    return "Debes seleccionar el tipo de perfil";
  }

  if (
    payload.tipo !== "ADMINISTRADOR" &&
    payload.tipo !== "AUDITOR" &&
    payload.sedeIds.length === 0
  ) {
    return "Debes asignar al menos una sede para este perfil";
  }

  return null;
}

export async function GET() {
  try {
    const session = await requireAdmin();

    if (!session.ok) {
      return session.response;
    }

    return NextResponse.json(await cargarRespuestaAdmin());
  } catch (error) {
    console.error("ERROR GET PERFILES VENDEDOR:", error);
    return NextResponse.json(
      { error: "Error cargando perfiles" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();

    if (!session.ok) {
      return session.response;
    }

    const body = (await req.json()) as Record<string, unknown>;
    const nombre = normalizarNombrePerfilVendedor(body.nombre);
    const documento = normalizarDocumentoPerfilVendedor(body.documento);
    const telefono = normalizarTelefonoPerfilVendedor(body.telefono);
    const correo = normalizarCorreoPerfilVendedor(body.correo);
    const tipo = normalizarTipoPerfilVendedor(body.tipo);
    const avatarKey = normalizarAvatarPerfilVendedor(body.avatarKey, tipo);
    const sedeIds = normalizarSedeIdsPerfilVendedor(body.sedeIds);
    const activo = Boolean(body.activo ?? true);
    const pin = String(body.pin || "").trim();
    const validationError = validarPayloadPerfil({
      nombre,
      tipo,
      sedeIds,
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (!pinValido(pin)) {
      return NextResponse.json(
        { error: "El PIN inicial debe tener entre 4 y 6 digitos" },
        { status: 400 }
      );
    }

    if (!tipo) {
      return NextResponse.json(
        { error: "Debes seleccionar el tipo de perfil" },
        { status: 400 }
      );
    }

    if (esPerfilBodega(tipo) && !esRolAdmin(session.user.rolNombre)) {
      return NextResponse.json({ error: "Solo el administrador puede asignar el perfil Bodega" }, { status: 403 });
    }

    await crearPerfilVendedor({
      nombre,
      documento,
      telefono,
      correo,
      avatarKey,
      pinHash: hashPassword(pin),
      activo,
      tipo,
      sedeIds,
      debeCambiarPin: true,
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Perfil creado correctamente",
      ...(await cargarRespuestaAdmin()),
    });
  } catch (error) {
    if (error instanceof EntidadOperativaInactivaError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message =
      error instanceof Error ? error.message : "Error creando perfil";

    console.error("ERROR POST PERFILES VENDEDOR:", error);

    return NextResponse.json({ error: message }, { status: error instanceof PerfilBodegaValidationError ? 400 : 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdmin();

    if (!session.ok) {
      return session.response;
    }

    const body = (await req.json()) as Record<string, unknown>;
    const perfilId = Number(body.id || 0);
    const nombre = normalizarNombrePerfilVendedor(body.nombre);
    const documento = normalizarDocumentoPerfilVendedor(body.documento);
    const telefono = normalizarTelefonoPerfilVendedor(body.telefono);
    const correo = normalizarCorreoPerfilVendedor(body.correo);
    const tipo = normalizarTipoPerfilVendedor(body.tipo);
    const avatarKey = normalizarAvatarPerfilVendedor(body.avatarKey, tipo);
    const sedeIds = normalizarSedeIdsPerfilVendedor(body.sedeIds);
    const activo = Boolean(body.activo ?? true);
    const pin = String(body.pin || "").trim();
    const validationError = validarPayloadPerfil({
      nombre,
      tipo,
      sedeIds,
    });

    if (!Number.isInteger(perfilId) || perfilId <= 0) {
      return NextResponse.json(
        { error: "El perfil es invalido" },
        { status: 400 }
      );
    }

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (pin && !pinValido(pin)) {
      return NextResponse.json(
        { error: "El PIN debe tener entre 4 y 6 digitos" },
        { status: 400 }
      );
    }

    if (!tipo) {
      return NextResponse.json(
        { error: "Debes seleccionar el tipo de perfil" },
        { status: 400 }
      );
    }

    const perfilActual = await prisma.perfilVendedor.findUnique({ where: { id: perfilId }, select: { tipo: true, eliminadoEn: true } });
    if (!perfilActual) return NextResponse.json({ error: "El perfil no existe." }, { status: 404 });
    if (perfilActual.eliminadoEn) return NextResponse.json({ error: "El vendedor fue eliminado y no se puede modificar." }, { status: 409 });
    if ((esPerfilBodega(tipo) || esPerfilBodega(perfilActual?.tipo)) && !esRolAdmin(session.user.rolNombre)) {
      return NextResponse.json({ error: "Solo el administrador puede gestionar el perfil Bodega" }, { status: 403 });
    }

    await actualizarPerfilVendedor(perfilId, {
      nombre,
      documento,
      telefono,
      correo,
      avatarKey,
      activo,
      tipo,
      sedeIds,
      ...(pin ? { pinHash: hashPassword(pin), debeCambiarPin: true } : {}),
    });

    return NextResponse.json({
      ok: true,
      mensaje: "Perfil actualizado correctamente",
      ...(await cargarRespuestaAdmin()),
    });
  } catch (error) {
    if (error instanceof EntidadOperativaInactivaError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "El vendedor ya no está disponible para edición. Actualiza el listado." }, { status: 409 });
    }
    const message =
      error instanceof Error ? error.message : "Error actualizando perfil";

    console.error("ERROR PATCH PERFILES VENDEDOR:", error);

    return NextResponse.json({ error: message }, { status: error instanceof PerfilBodegaValidationError ? 400 : 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireAdmin();
    if (!session.ok) return session.response;
    if (!puedeEliminarEntidadesCentrales(session.user)) {
      return NextResponse.json({ error: "Solo el administrador central puede eliminar vendedores." }, { status: 403 });
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch { return NextResponse.json({ error: "La solicitud no es válida." }, { status: 400 }); }
    if (body.confirmed !== true) return NextResponse.json({ error: "Debes confirmar la eliminación del vendedor." }, { status: 400 });
    await eliminarPerfilComercial(session.user, body.id);
    return NextResponse.json({ ok: true, mensaje: "Vendedor eliminado. Se conserva su historial.", ...(await cargarRespuestaAdmin()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AdminEntityRemovalError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("ERROR DELETE PERFILES VENDEDOR:", error);
    return NextResponse.json({ error: "No se pudo confirmar la eliminación del vendedor. Conserva los datos y reintenta." }, { status: 500 });
  }
}
