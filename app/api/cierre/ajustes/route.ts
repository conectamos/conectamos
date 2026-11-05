import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { CierreInputError } from "@/lib/cierre-domain";
import { cierreFilters, CierreRequestError } from "@/lib/cierre-report";
import { canManageCierreAccounting, CierreAccountingError, cierreAccountingTrustedOrigin,
  parseCierreAccountingPatch, saveCierreAccounting } from "@/lib/cierre-accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!canManageCierreAccounting(session)) return NextResponse.json({ error: "Solo un administrador puede ajustar el cierre." }, { status: 403 });
    if (!cierreAccountingTrustedOrigin(request)) return NextResponse.json({ error: "Origen de la solicitud no permitido." }, { status: 403 });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return NextResponse.json({ error: "Envía el ajuste como JSON." }, { status: 415 });
    }
    const { period, sedeId } = cierreFilters(new URL(request.url).searchParams, session);
    let body: unknown;
    try { body = await request.json(); } catch { throw new CierreAccountingError("Los datos del ajuste no son válidos."); }
    const patch = parseCierreAccountingPatch(body);
    const adjustment = await prisma.$transaction((tx) => saveCierreAccounting(tx, { from: period.desde, to: period.hasta, sedeId }, session, patch), { timeout: 15_000 });
    return NextResponse.json({ adjustment }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CierreAccountingError || error instanceof CierreRequestError || error instanceof CierreInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Otro usuario cambió este cierre. Actualiza y revisa los valores antes de guardar." }, { status: 409 });
    }
    return NextResponse.json({ error: "No fue posible guardar el ajuste. Intenta de nuevo." }, { status: 503 });
  }
}
