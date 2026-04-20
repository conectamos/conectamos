import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  getNuovoPayDeviceById,
  isNuovoPayConfigured,
  lockNuovoPayDevices,
  searchNuovoPayDeviceByImei,
  searchNuovoPayDevices,
  unlockNuovoPayDevices,
} from "@/lib/nuovopay";

type QueryType = "imei" | "device";

function normalizarImei(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "").slice(0, 15);
}

function normalizarDeviceId(valor: string | null | undefined) {
  return Number(String(valor || "").replace(/\D/g, "").trim() || 0);
}

function normalizarQueryType(valor: string | null | undefined): QueryType {
  return String(valor || "").trim().toLowerCase() === "device"
    ? "device"
    : "imei";
}

async function consultarContextoLocal(
  imei: string,
  esAdmin: boolean,
  sedeId: number | null | undefined
) {
  if (!imei) {
    return {
      localItems: [],
      localPrincipal: null,
    };
  }

  const [localItems, localPrincipal] = await Promise.all([
    prisma.inventarioSede.findMany({
      where: esAdmin ? { imei } : { imei, sedeId: sedeId ?? -1 },
      orderBy: { id: "desc" },
      select: {
        id: true,
        imei: true,
        referencia: true,
        color: true,
        costo: true,
        distribuidor: true,
        estadoActual: true,
        estadoFinanciero: true,
        deboA: true,
        sedeId: true,
        sede: {
          select: {
            nombre: true,
          },
        },
      },
    }),
    esAdmin
      ? prisma.inventarioPrincipal.findUnique({
          where: { imei },
          select: {
            id: true,
            imei: true,
            referencia: true,
            color: true,
            costo: true,
            distribuidor: true,
            estado: true,
            estadoCobro: true,
            sedeDestinoId: true,
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    localItems,
    localPrincipal,
  };
}

async function intentarObtenerDevice(deviceId: number) {
  if (!deviceId) {
    return null;
  }

  try {
    return await getNuovoPayDeviceById(deviceId);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const esAdmin = String(user.rolNombre || "").toUpperCase() === "ADMIN";
    const { searchParams } = new URL(req.url);

    const queryType = normalizarQueryType(
      searchParams.get("queryType") ||
        (searchParams.get("device") ? "device" : "imei")
    );

    const rawSearch =
      searchParams.get("search") ||
      searchParams.get(queryType === "device" ? "device" : "imei") ||
      "";

    const search =
      queryType === "imei"
        ? normalizarImei(rawSearch)
        : String(rawSearch || "").replace(/\D/g, "").trim();

    if (!isNuovoPayConfigured()) {
      const localLookupImei = queryType === "imei" ? search : "";
      const { localItems, localPrincipal } = await consultarContextoLocal(
        localLookupImei,
        esAdmin,
        user.sedeId
      );

      return NextResponse.json({
        configured: false,
        canManage: true,
        queryType,
        search,
        matches: [],
        selectedDevice: null,
        localItems,
        localPrincipal,
      });
    }

    let matches = [];
    let selectedDevice = null;

    if (queryType === "device") {
      const requestedDeviceId =
        normalizarDeviceId(searchParams.get("deviceId")) ||
        normalizarDeviceId(search);

      selectedDevice = await intentarObtenerDevice(requestedDeviceId);
      matches = selectedDevice ? [selectedDevice] : [];
    } else {
      matches = await searchNuovoPayDevices(search);

      const requestedDeviceId = normalizarDeviceId(searchParams.get("deviceId"));
      const exactDevice = search
        ? matches.find(
            (device) => device.imei === search || device.imei2 === search
          )
        : null;

      const selectedDeviceId =
        requestedDeviceId ||
        exactDevice?.deviceId ||
        (matches.length === 1 ? matches[0].deviceId : 0);

      selectedDevice =
        matches.find((device) => device.deviceId === selectedDeviceId) ||
        (await intentarObtenerDevice(selectedDeviceId));
    }

    const localLookupImei =
      selectedDevice?.imei ||
      selectedDevice?.imei2 ||
      (queryType === "imei" ? search : "");

    const { localItems, localPrincipal } = await consultarContextoLocal(
      localLookupImei,
      String(user.rolNombre || "").toUpperCase() === "ADMIN",
      user.sedeId
    );

    return NextResponse.json({
      configured: true,
      canManage: true,
      queryType,
      search,
      matches,
      selectedDevice,
      localItems,
      localPrincipal,
    });
  } catch (error) {
    console.error("ERROR CONSULTANDO NUOVOPAY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error consultando Nuovo Pay",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!isNuovoPayConfigured()) {
      return NextResponse.json(
        { error: "NUOVOPAY_API_TOKEN no esta configurado" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const action = String(body.action || "").trim().toLowerCase();
    const imei = normalizarImei(body.imei);
    const deviceId = Number(body.deviceId || 0);

    if (!["lock", "unlock"].includes(action)) {
      return NextResponse.json({ error: "Accion no valida" }, { status: 400 });
    }

    let resolvedDeviceId = deviceId;

    if (!resolvedDeviceId) {
      if (!imei) {
        return NextResponse.json(
          { error: "Debes indicar el IMEI o el deviceId" },
          { status: 400 }
        );
      }

      const device = await searchNuovoPayDeviceByImei(imei);

      if (!device?.deviceId) {
        return NextResponse.json(
          { error: "No se encontro el dispositivo en Nuovo Pay" },
          { status: 404 }
        );
      }

      resolvedDeviceId = device.deviceId;
    }

    if (action === "lock") {
      await lockNuovoPayDevices([resolvedDeviceId]);
    } else {
      await unlockNuovoPayDevices([resolvedDeviceId]);
    }

    const device = await getNuovoPayDeviceById(resolvedDeviceId);

    return NextResponse.json({
      ok: true,
      mensaje:
        action === "lock"
          ? "Dispositivo bloqueado correctamente"
          : "Dispositivo desbloqueado correctamente",
      device,
    });
  } catch (error) {
    console.error("ERROR ACCION NUOVOPAY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error ejecutando accion en Nuovo Pay",
      },
      { status: 500 }
    );
  }
}
