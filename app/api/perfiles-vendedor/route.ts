import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import {
  actualizarPerfilVendedor,
  crearPerfilVendedor,
  normalizarCorreoPerfilVendedor,
  normalizarDocumentoPerfilVendedor,
  normalizarNombrePerfilVendedor,
  normalizarSedeIdsPerfilVendedor,
  normalizarTelefonoPerfilVendedor,
  normalizarTipoPerfilVendedor,
  obtenerPerfilesVendedor,
} from "@/lib/vendor-profiles";

function esAdmin(rolNombre: string) {
  return String(rolNombre || "").trim().toUpperCase() === "ADMIN";
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
  const [perfiles, sedes] = await Promise.all([
    obtenerPerfilesVendedor(),
    prisma.sede.findMany({
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

    await crearPerfilVendedor({
      nombre,
      documento,
      telefono,
      correo,
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
    const message =
      error instanceof Error ? error.message : "Error creando perfil";

    console.error("ERROR POST PERFILES VENDEDOR:", error);

    return NextResponse.json({ error: message }, { status: 500 });
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

    await actualizarPerfilVendedor(perfilId, {
      nombre,
      documento,
      telefono,
      correo,
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
    const message =
      error instanceof Error ? error.message : "Error actualizando perfil";

    console.error("ERROR PATCH PERFILES VENDEDOR:", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
