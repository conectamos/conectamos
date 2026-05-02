import { NextResponse } from "next/server";
import { esRolAdmin } from "@/lib/access-control";
import { getSessionUser } from "@/lib/auth";
import {
  asegurarTablaCatalogoReferenciasInventario,
  claveReferenciaInventario,
  normalizarReferenciaInventario,
  obtenerCatalogoReferenciasInventario,
} from "@/lib/inventory-references";
import prisma from "@/lib/prisma";

async function requireUser() {
  const user = await getSessionUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  return { ok: true as const, user };
}

function serializarReferencias(
  referencias: Awaited<ReturnType<typeof obtenerCatalogoReferenciasInventario>>
) {
  return referencias.map((referencia) => ({
    id: referencia.id,
    nombre: referencia.nombre,
    activo: referencia.activo,
    createdAt: referencia.createdAt.toISOString(),
    updatedAt: referencia.updatedAt.toISOString(),
  }));
}

async function respuestaCatalogo() {
  const referencias = await obtenerCatalogoReferenciasInventario({
    incluirInactivas: true,
  });

  return serializarReferencias(referencias);
}

export async function GET() {
  try {
    const session = await requireUser();

    if (!session.ok) {
      return session.response;
    }

    const referencias = await respuestaCatalogo();

    return NextResponse.json({
      referencias,
      puedeGestionar: esRolAdmin(session.user.rolNombre),
    });
  } catch (error) {
    console.error("ERROR GET REFERENCIAS INVENTARIO:", error);
    return NextResponse.json(
      { error: "Error cargando referencias de inventario" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireUser();

    if (!session.ok) {
      return session.response;
    }

    if (!esRolAdmin(session.user.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el administrador puede gestionar referencias" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const nombre = normalizarReferenciaInventario(body.nombre);
    const nombreNormalizado = claveReferenciaInventario(nombre);

    if (!nombre) {
      return NextResponse.json(
        { error: "La referencia es obligatoria" },
        { status: 400 }
      );
    }

    await asegurarTablaCatalogoReferenciasInventario();

    const existente = await prisma.catalogoReferenciaInventario.findUnique({
      where: { nombreNormalizado },
    });

    if (existente?.activo) {
      return NextResponse.json(
        { error: "Esa referencia ya existe en el catalogo" },
        { status: 400 }
      );
    }

    if (existente) {
      await prisma.catalogoReferenciaInventario.update({
        where: { id: existente.id },
        data: {
          nombre,
          activo: true,
        },
      });
    } else {
      await prisma.catalogoReferenciaInventario.create({
        data: {
          nombre,
          nombreNormalizado,
        },
      });
    }

    const referencias = await respuestaCatalogo();

    return NextResponse.json({
      ok: true,
      mensaje: "Referencia agregada correctamente",
      referencias,
    });
  } catch (error) {
    console.error("ERROR POST REFERENCIAS INVENTARIO:", error);
    return NextResponse.json(
      { error: "Error guardando referencia" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireUser();

    if (!session.ok) {
      return session.response;
    }

    if (!esRolAdmin(session.user.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el administrador puede gestionar referencias" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const id = Number(body.id);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "Referencia invalida" },
        { status: 400 }
      );
    }

    await asegurarTablaCatalogoReferenciasInventario();

    const existente = await prisma.catalogoReferenciaInventario.findUnique({
      where: { id },
    });

    if (!existente) {
      return NextResponse.json(
        { error: "Referencia no encontrada" },
        { status: 404 }
      );
    }

    const data: {
      nombre?: string;
      nombreNormalizado?: string;
      activo?: boolean;
    } = {};

    if ("nombre" in body) {
      const nombre = normalizarReferenciaInventario(body.nombre);
      const nombreNormalizado = claveReferenciaInventario(nombre);

      if (!nombre) {
        return NextResponse.json(
          { error: "La referencia es obligatoria" },
          { status: 400 }
        );
      }

      const duplicada = await prisma.catalogoReferenciaInventario.findFirst({
        where: {
          nombreNormalizado,
          id: { not: id },
        },
        select: { id: true },
      });

      if (duplicada) {
        return NextResponse.json(
          { error: "Ya existe otra referencia con ese nombre" },
          { status: 400 }
        );
      }

      data.nombre = nombre;
      data.nombreNormalizado = nombreNormalizado;
    }

    if ("activo" in body) {
      data.activo = Boolean(body.activo);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No hay cambios para guardar" },
        { status: 400 }
      );
    }

    await prisma.catalogoReferenciaInventario.update({
      where: { id },
      data,
    });

    const referencias = await respuestaCatalogo();

    return NextResponse.json({
      ok: true,
      mensaje: "Referencia actualizada correctamente",
      referencias,
    });
  } catch (error) {
    console.error("ERROR PATCH REFERENCIAS INVENTARIO:", error);
    return NextResponse.json(
      { error: "Error actualizando referencia" },
      { status: 500 }
    );
  }
}
