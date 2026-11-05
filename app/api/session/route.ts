import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { consultarPermisoIngresoInventario } from "@/lib/inventory-intake-policy";

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401 }
    );
  }

  const options = { headers: { "Cache-Control": "no-store" } };
  if (new URL(request.url).searchParams.get("permiso") !== "ingreso-inventario") {
    return NextResponse.json(user, options);
  }

  return NextResponse.json({
    ...user,
    puedeIngresarInventario: await consultarPermisoIngresoInventario(user),
  }, options);
}
