import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeGestionarBodegaPrincipal } from "@/lib/access-control";
import {
  agregarDistribuidorInventario,
  InventoryDistributorError,
  obtenerDistribuidoresInventario,
  retirarDistribuidorInventario,
} from "@/lib/inventory-distributors";

const headers = { "Cache-Control": "private, no-store" };

async function requireWarehouseUser() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
  if (!puedeGestionarBodegaPrincipal(user.rolNombre)) {
    return NextResponse.json({ error: "No autorizado para gestionar distribuidores de bodega principal" }, { status: 403, headers });
  }
  return null;
}

function failed(error: unknown) {
  if (error instanceof InventoryDistributorError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
  }
  console.error("ERROR CATALOGO DISTRIBUIDORES INVENTARIO:", error);
  return NextResponse.json({ error: "No se pudo actualizar el catálogo de distribuidores. Intenta nuevamente." }, { status: 500, headers });
}

export async function GET() {
  try {
    const denied = await requireWarehouseUser();
    if (denied) return denied;
    return NextResponse.json({ ok: true, distribuidores: await obtenerDistribuidoresInventario() }, { headers });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWarehouseUser();
    if (denied) return denied;
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "La solicitud del distribuidor no es válida." }, { status: 400, headers });
    }
    return NextResponse.json({ ok: true, distribuidores: await agregarDistribuidorInventario(body.nombre) }, { headers });
  } catch (error) { return failed(error); }
}

export async function DELETE(request: Request) {
  try {
    const denied = await requireWarehouseUser();
    if (denied) return denied;
    let id: unknown;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      id = (parsed as Record<string, unknown>).id;
    } catch {
      return NextResponse.json({ error: "La solicitud del distribuidor no es válida." }, { status: 400, headers });
    }
    if (typeof id !== "number") {
      return NextResponse.json({ error: "El distribuidor seleccionado no es válido." }, { status: 400, headers });
    }
    return NextResponse.json({ ok: true, distribuidores: await retirarDistribuidorInventario(id) }, { headers });
  } catch (error) { return failed(error); }
}
