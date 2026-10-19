import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { esRolBodega, esSedeBodegaPrincipal, puedeGestionarBodegaPrincipal } from "@/lib/access-control";
import { getBodegaDashboard } from "@/lib/bodega-dashboard";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
    if (!puedeGestionarBodegaPrincipal(user.rolNombre)
      || (esRolBodega(user.rolNombre) && !esSedeBodegaPrincipal(user.sedeNombre))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403, headers });
    }
    const data = await getBodegaDashboard();
    return NextResponse.json({ ok: true, ...data }, { headers });
  } catch (error) {
    console.error("ERROR DASHBOARD BODEGA:", error);
    return NextResponse.json({ error: "No se pudo cargar el resumen de bodega principal." }, { status: 500, headers });
  }
}
