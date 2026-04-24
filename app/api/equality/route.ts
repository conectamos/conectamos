import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  enrollEqualityDevice,
  isEqualityConfigured,
  lockEqualityDevice,
  queryEqualityDevice,
  releaseEqualityDevice,
  unlockEqualityDevice,
} from "@/lib/equality";

function normalizeDeviceUid(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function getUserScope(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) {
    return {
      allowed: false,
      esAdmin: false,
    };
  }

  const rolNombre = String(user.rolNombre || "").toUpperCase();
  const perfilTipo = String(user.perfilTipo || "").toUpperCase();
  const esAdmin = rolNombre === "ADMIN";
  const esSupervisor =
    rolNombre === "SUPERVISOR" || perfilTipo === "SUPERVISOR_TIENDA";

  return {
    allowed: esAdmin || esSupervisor,
    esAdmin,
  };
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const scope = getUserScope(user);

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!scope.allowed) {
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

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const scope = getUserScope(user);

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!scope.allowed) {
      return NextResponse.json(
        { error: "No tienes permisos para usar Equality Zero Touch" },
        { status: 403 }
      );
    }

    if (!isEqualityConfigured()) {
      return NextResponse.json(
        {
          error: "No hay credenciales configuradas para Equality Zero Touch",
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const action = String(body.action || "").trim().toLowerCase();
    const deviceUid = normalizeDeviceUid(body.deviceUid || body.imei);

    if (!deviceUid) {
      return NextResponse.json(
        { error: "Debes indicar el IMEI o deviceUid" },
        { status: 400 }
      );
    }

    if (!["enroll", "lock", "unlock", "release"].includes(action)) {
      return NextResponse.json({ error: "Accion no valida" }, { status: 400 });
    }

    if (action === "release" && !scope.esAdmin) {
      return NextResponse.json(
        { error: "Solo el administrador puede liberar equipos" },
        { status: 403 }
      );
    }

    const result =
      action === "enroll"
        ? await enrollEqualityDevice(deviceUid)
        : action === "lock"
          ? await lockEqualityDevice(deviceUid, {
              title: body.lockMsgTitle,
              content: body.lockMsgContent,
            })
          : action === "unlock"
            ? await unlockEqualityDevice(deviceUid)
            : await releaseEqualityDevice(deviceUid, {
                reason: body.reason,
              });

    return NextResponse.json({
      configured: true,
      ok: result.ok,
      action,
      search: deviceUid,
      message: result.message,
      result: result.result,
      steps: result.steps.map((step) => ({
        serviceCode: step.serviceCode,
        statusCode: step.statusCode,
        resultCode: step.resultCode,
        resultMessage: step.resultMessage,
        ok: step.ok,
      })),
    });
  } catch (error) {
    console.error("ERROR ACCION EQUALITY:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error ejecutando accion en Equality Zero Touch",
      },
      { status: 500 }
    );
  }
}
