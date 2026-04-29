import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { esRolAdmin } from "@/lib/access-control";
import {
  actualizarListaPrecio,
  crearListaPrecio,
  eliminarListaPrecioPorId,
  normalizarPrecioLista,
  normalizarTextoListaPrecio,
  obtenerListaPrecioPorId,
  obtenerListaPrecios,
  type PriceListItem,
} from "@/lib/price-list";

function serializeItem(item: PriceListItem) {
  return {
    id: item.id,
    marca: item.marca,
    referencia: item.referencia,
    precio: item.precio,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

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

function validarDatos(body: Record<string, unknown>) {
  const marca = normalizarTextoListaPrecio(body.marca);
  const referencia = normalizarTextoListaPrecio(body.referencia);
  const precio = normalizarPrecioLista(body.precio);

  if (!marca) {
    return { ok: false as const, error: "La marca es obligatoria" };
  }

  if (!referencia) {
    return { ok: false as const, error: "La referencia es obligatoria" };
  }

  if (!Number.isFinite(precio) || precio < 0) {
    return { ok: false as const, error: "El precio es obligatorio" };
  }

  return { ok: true as const, data: { marca, referencia, precio } };
}

export async function GET() {
  try {
    const session = await requireUser();

    if (!session.ok) {
      return session.response;
    }

    const items = await obtenerListaPrecios();

    return NextResponse.json({
      items: items.map(serializeItem),
      puedeGestionar: esRolAdmin(session.user.rolNombre),
    });
  } catch (error) {
    console.error("ERROR GET LISTA PRECIOS:", error);
    return NextResponse.json(
      { error: "Error cargando lista de precios" },
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
        { error: "Solo el administrador puede gestionar la lista de precios" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const validacion = validarDatos(body);

    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    await crearListaPrecio(validacion.data);
    const items = await obtenerListaPrecios();

    return NextResponse.json({
      ok: true,
      mensaje: "Precio agregado correctamente",
      items: items.map(serializeItem),
    });
  } catch (error) {
    console.error("ERROR POST LISTA PRECIOS:", error);
    return NextResponse.json(
      { error: "Error guardando precio" },
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
        { error: "Solo el administrador puede gestionar la lista de precios" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const id = Number(body.id);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Precio invalido" }, { status: 400 });
    }

    const validacion = validarDatos(body);

    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const actualizado = await actualizarListaPrecio({
      id,
      ...validacion.data,
    });

    if (!actualizado) {
      return NextResponse.json(
        { error: "Precio no encontrado" },
        { status: 404 }
      );
    }

    const items = await obtenerListaPrecios();

    return NextResponse.json({
      ok: true,
      mensaje: "Precio actualizado correctamente",
      items: items.map(serializeItem),
    });
  } catch (error) {
    console.error("ERROR PATCH LISTA PRECIOS:", error);
    return NextResponse.json(
      { error: "Error actualizando precio" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireUser();

    if (!session.ok) {
      return session.response;
    }

    if (!esRolAdmin(session.user.rolNombre)) {
      return NextResponse.json(
        { error: "Solo el administrador puede gestionar la lista de precios" },
        { status: 403 }
      );
    }

    const requestUrl = new URL(req.url);
    const id = Number(requestUrl.searchParams.get("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Precio invalido" }, { status: 400 });
    }

    const existente = await obtenerListaPrecioPorId(id);

    if (!existente) {
      return NextResponse.json(
        { error: "Precio no encontrado" },
        { status: 404 }
      );
    }

    await eliminarListaPrecioPorId(id);
    const items = await obtenerListaPrecios();

    return NextResponse.json({
      ok: true,
      mensaje: "Precio eliminado correctamente",
      items: items.map(serializeItem),
    });
  } catch (error) {
    console.error("ERROR DELETE LISTA PRECIOS:", error);
    return NextResponse.json(
      { error: "Error eliminando precio" },
      { status: 500 }
    );
  }
}
