import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { esRolBodega } from "@/lib/access-control";
import { BodegaSupplierDebtError } from "@/lib/bodega-supplier-debt";

type Actor = { id: number; nombre: string };

export function jsonDeudaBodega(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function conAccesoDeudaBodega(
  operar: (actor: Actor) => Promise<Response>,
) {
  try {
    const session = await getSessionUser();
    if (!session) return jsonDeudaBodega({ error: "No autenticado." }, 401);
    if (!esRolBodega(session.rolNombre)) {
      return jsonDeudaBodega({ error: "Esta operación corresponde al rol Bodega." }, 403);
    }
    return await operar({
      id: session.id,
      nombre: session.perfilNombre || session.nombre || session.usuario,
    });
  } catch (error) {
    if (error instanceof BodegaSupplierDebtError) {
      return jsonDeudaBodega({ error: error.message }, error.status);
    }
    console.error("ERROR DEUDA BODEGA:", error);
    return jsonDeudaBodega({ error: "No se pudo completar la operación de deuda. Intenta nuevamente." }, 500);
  }
}

export async function leerSolicitudDeudaBodega(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BodegaSupplierDebtError("La solicitud no es válida.", 400);
  }
  return body as Record<string, unknown>;
}
