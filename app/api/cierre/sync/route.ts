import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runCierreSyncBatch } from "@/lib/cierre-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret = String(process.env.CRON_SECRET || "");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret) return NextResponse.json({ error: "Sincronización no configurada" }, { status: 503 });
  if (Buffer.byteLength(provided) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try { return NextResponse.json(await runCierreSyncBatch(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Sincronización pendiente; revisa la migración y la conexión local." }, { status: 503 }); }
}
