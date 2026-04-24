import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isEqualityConfigured, queryEqualityDevice } from "@/lib/equality";

function normalizeDeviceUid(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function canUseEquality(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) {
    return false;
  }

  const rolNombre = String(user.rolNombre || "").toUpperCase();
  const perfilTipo = String(user.perfilTipo || "").toUpperCase();

  return (
    rolNombre === "ADMIN" ||
    rolNombre === "SUPERVISOR" ||
    perfilTipo === "SUPERVISOR_TIENDA"
  );
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!canUseEquality(user)) {
      return NextResponse.json(
        { error: "No tienes permisos para usar Equality Zero Touch" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const deviceUid = normalizeDeviceUid(
      searchParams.get("deviceUid") || searchParams.get("imei")
    );

    if (!isEqualityConfigured()) {
      return NextResponse.json({
        configured: false,
        search: deviceUid,
        result: null,
      });
    }

    if (!deviceUid) {
      return NextResponse.json({
        configured: true,
        search: "",
        result: null,
      });
    }

    const result = await queryEqualityDevice(deviceUid);

    return NextResponse.json({
      configured: true,
      search: deviceUid,
      result,
    });
  } catch (error) {
    console.error("ERROR CONSULTANDO EQUALITY:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error consultando Equality Zero Touch",
      },
      { status: 500 }
    );
  }
}
