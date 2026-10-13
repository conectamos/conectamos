import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { CierreRequestError, readCierreReport } from "@/lib/cierre-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const report = await readCierreReport(new URL(request.url).searchParams, session);
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CierreRequestError ? error.message : "El cierre está pendiente de preparación. Intenta de nuevo más tarde." }, { status: error instanceof CierreRequestError ? error.status : 503 });
  }
}
