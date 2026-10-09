import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { puedeAccederModulosOperativos } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import { ensureVendorProfilesSchema } from "@/lib/vendor-profile-schema";
import { esSedeVentas } from "@/lib/sedes";
import { revisarEntradasImeis } from "@/lib/inventory-imeis";
import { obtenerImeisExistentes } from "@/lib/inventory-intake-registration";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const esAdmin = ["ADMIN", "AUDITOR"].includes(user.rolNombre.toUpperCase());
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch { return NextResponse.json({ error: "La lista no es válida." }, { status: 400 }); }
    if (body.destino !== "PRINCIPAL" && body.destino !== "SEDE") {
      return NextResponse.json({ error: "Selecciona un destino válido." }, { status: 400 });
    }
    if ((body.destino === "PRINCIPAL" && !esAdmin) ||
        (body.destino === "SEDE" && !puedeAccederModulosOperativos(user.perfilTipo))) {
      return NextResponse.json({ error: "No tienes permiso para esta carga." }, { status: 403 });
    }
    if (!Array.isArray(body.imeis) || !body.imeis.length) {
      return NextResponse.json({ error: "Debes ingresar al menos un IMEI." }, { status: 400 });
    }
    await ensureVendorProfilesSchema();
    if (body.destino === "SEDE") {
      const sedeId = body.sedeId === undefined ? user.sedeId :
        typeof body.sedeId === "number" || typeof body.sedeId === "string" ? Number(body.sedeId) : NaN;
      if (!Number.isInteger(sedeId) || sedeId <= 0) {
        return NextResponse.json({ error: "Sede inválida." }, { status: 400 });
      }
      if (!esAdmin && sedeId !== user.sedeId) {
        return NextResponse.json({ error: "No tienes permiso para esa sede." }, { status: 403 });
      }
      const sede = await prisma.sede.findUnique({ where: { id: sedeId }, select: { nombre: true } });
      if (!sede || esSedeVentas(sede.nombre)) {
        return NextResponse.json({ error: "La sede no puede recibir equipos." }, { status: 400 });
      }
    }
    const preliminar = revisarEntradasImeis(body.imeis);
    // Other locations are checked for collisions, but their identity and stock are never returned.
    const existentes = await obtenerImeisExistentes(prisma, preliminar.imeisValidos);
    return NextResponse.json({ ok: true, ...revisarEntradasImeis(body.imeis, existentes) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("ERROR REVISAR CARGA INVENTARIO:", error);
    return NextResponse.json({ error: "No se pudo revisar la lista. Conserva los datos y reintenta." }, { status: 500 });
  }
}
