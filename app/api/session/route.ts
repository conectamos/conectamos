import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { consultarPermisoIngresoInventario } from "@/lib/inventory-intake-policy";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ...user,
    puedeIngresarInventario: await consultarPermisoIngresoInventario(user),
  }, { headers: { "Cache-Control": "no-store" } });
}
