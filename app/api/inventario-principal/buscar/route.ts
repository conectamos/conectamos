import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const imei = String(body.imei ?? "").replace(/\D/g, "").slice(0, 15);

    if (!imei) {
      return NextResponse.json({}, { status: 200 });
    }

    const item = await prisma.inventarioPrincipal.findUnique({
      where: { imei },
      select: {
        referencia: true,
        color: true,
        costo: true,
      },
    });

    if (!item) {
      return NextResponse.json({}, { status: 200 });
    }

    return NextResponse.json(item);

  } catch {
    return NextResponse.json({}, { status: 500 });
  }
}
