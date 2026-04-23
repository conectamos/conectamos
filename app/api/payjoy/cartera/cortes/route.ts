import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPayJoyPaymentSnapshot } from "@/lib/payjoy";
import {
  deleteStoredPayJoyCutById,
  getStoredPayJoyCutById,
  listStoredPayJoyCuts,
  saveStoredPayJoyCut,
  updateStoredPayJoyCut,
  type PayJoyStoredCutDetail,
  type PayJoyStoredRow,
  type PayJoyStoredSummary,
} from "@/lib/payjoy-cortes-store";

export const runtime = "nodejs";

type LookupSuccess = {
  ok: true;
  validThrough: string | null;
  remainingBalance: number | null;
  currency: string | null;
  installmentAmount: number | null;
  paidInFull: boolean;
  message: string | null;
};

type LookupFailure = {
  ok: false;
  error: string;
};

type LookupResult = LookupSuccess | LookupFailure;

function isAdmin(roleName: string | null | undefined) {
  return String(roleName || "").trim().toUpperCase() === "ADMIN";
}

function formatBogotaTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function summarizeRows(rows: PayJoyStoredRow[]): PayJoyStoredSummary {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "MORA" || row.status === "GESTIONAR") {
        summary.mora += 1;
      } else if (row.status === "PAGO") {
        summary.pago += 1;
      } else {
        summary.pagoX += 1;
      }

      return summary;
    },
    {
      mora: 0,
      pago: 0,
      pagoX: 0,
    }
  );
}

function normalizeStoredRow(value: unknown): PayJoyStoredRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const status = String(candidate.status || "").trim().toUpperCase();
  const manualStatus = String(candidate.manualStatus || "")
    .trim()
    .toUpperCase();

  if (
    status !== "MORA" &&
    status !== "GESTIONAR" &&
    status !== "PAGO" &&
    status !== "PAGO X"
  ) {
    return null;
  }

  const amount =
    candidate.installmentAmount === null ||
    candidate.installmentAmount === undefined ||
    candidate.installmentAmount === ""
      ? null
      : Number(candidate.installmentAmount);

  return {
    corteName: String(candidate.corteName || "").trim(),
    transactionTime: candidate.transactionTime
      ? String(candidate.transactionTime)
      : null,
    merchantName: String(candidate.merchantName || "").trim(),
    device: String(candidate.device || "").trim(),
    deviceFamily: String(candidate.deviceFamily || "").trim(),
    imei: String(candidate.imei || "").trim(),
    nationalId: String(candidate.nationalId || "").trim(),
    installmentAmount: Number.isFinite(amount) ? amount : null,
    paymentDueDate: candidate.paymentDueDate
      ? String(candidate.paymentDueDate)
      : null,
    devicePaymentDate: candidate.devicePaymentDate
      ? String(candidate.devicePaymentDate)
      : null,
    paidInFull: Boolean(candidate.paidInFull),
    status,
    maximumPaymentDate: candidate.maximumPaymentDate
      ? String(candidate.maximumPaymentDate)
      : null,
    currency: candidate.currency ? String(candidate.currency) : null,
    lookupMessage: candidate.lookupMessage
      ? String(candidate.lookupMessage)
      : null,
    manualStatus:
      manualStatus === "MORA" ||
      manualStatus === "GESTIONAR" ||
      manualStatus === "PAGO" ||
      manualStatus === "PAGO X"
        ? manualStatus
        : null,
  };
}

function normalizeSourceNames(value: unknown, rows: PayJoyStoredRow[]) {
  const directNames = Array.isArray(value)
    ? value
        .map((entry) => String(entry || "").trim())
        .filter((entry) => entry.length > 0)
    : [];

  if (directNames.length) {
    return Array.from(new Set(directNames));
  }

  return Array.from(
    new Set(rows.map((row) => String(row.corteName || "").trim()).filter(Boolean))
  );
}

function buildDefaultRecordName(sourceNames: string[]) {
  if (sourceNames.length === 1) {
    return sourceNames[0];
  }

  return `Corte PayJoy ${formatBogotaTimestamp()}`;
}

function normalizeDeviceTag(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function addCalendarDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getDateKeyInBogota(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function getCalendarDiffInBogota(laterDate: Date, earlierDate: Date) {
  const laterKey = getDateKeyInBogota(laterDate);
  const earlierKey = getDateKeyInBogota(earlierDate);
  const [laterYear, laterMonth, laterDay] = laterKey.split("-").map(Number);
  const [earlierYear, earlierMonth, earlierDay] = earlierKey
    .split("-")
    .map(Number);

  const laterUtc = Date.UTC(laterYear, laterMonth - 1, laterDay);
  const earlierUtc = Date.UTC(earlierYear, earlierMonth - 1, earlierDay);

  return Math.round((laterUtc - earlierUtc) / 86_400_000);
}

function parseIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getReloadPolicy(
  transactionTime: string | null,
  devicePaymentDate: string | null,
  paidInFull: boolean
) {
  if (paidInFull) {
    return {
      automaticStatus: "PAGO" as PayJoyStoredRow["status"],
      lockedByMaxWindow: false,
    };
  }

  const transactionDate = parseIsoDate(transactionTime);
  const deviceDate = parseIsoDate(devicePaymentDate);

  if (!transactionDate || !deviceDate) {
    return {
      automaticStatus: "PAGO X" as const,
      lockedByMaxWindow: false,
    };
  }

  const paymentDate = addCalendarDays(transactionDate, 14);
  const maximumPaymentDate = addCalendarDays(paymentDate, 4);
  const daysAfterMaximumPayment = getCalendarDiffInBogota(
    deviceDate,
    maximumPaymentDate
  );
  const automaticStatus =
    daysAfterMaximumPayment >= 10 && daysAfterMaximumPayment <= 14
      ? ("PAGO" as PayJoyStoredRow["status"])
      : ("MORA" as PayJoyStoredRow["status"]);

  return {
    automaticStatus,
    lockedByMaxWindow: daysAfterMaximumPayment > 14,
  };
}

function computeAutomaticStatus(
  transactionTime: string | null,
  devicePaymentDate: string | null,
  paidInFull: boolean
): PayJoyStoredRow["status"] | "PAGO X" {
  return getReloadPolicy(transactionTime, devicePaymentDate, paidInFull)
    .automaticStatus;
}

function resolveReloadedStatus(
  manualStatus: PayJoyStoredRow["manualStatus"],
  automaticStatus: PayJoyStoredRow["status"] | "PAGO X"
): PayJoyStoredRow["status"] {
  if (automaticStatus === "PAGO X") {
    return "PAGO X";
  }

  if (automaticStatus === "PAGO") {
    return "PAGO";
  }

  if (manualStatus === "GESTIONAR") {
    return "GESTIONAR";
  }

  if (manualStatus === "MORA") {
    return "MORA";
  }

  return automaticStatus;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

async function buildLookupMap(rows: PayJoyStoredRow[]) {
  const uniqueDeviceTags = Array.from(
    new Set(
      rows
        .map((row) => normalizeDeviceTag(row.device))
        .filter((deviceTag) => deviceTag.startsWith("D"))
    )
  );

  const lookupEntries = await mapWithConcurrency(
    uniqueDeviceTags,
    4,
    async (deviceTag) => {
      try {
        const snapshot = await getPayJoyPaymentSnapshot(deviceTag);

        return [
          deviceTag,
          {
            ok: true,
            validThrough: snapshot.validThrough?.toISOString() ?? null,
            remainingBalance: snapshot.remainingBalance,
            currency: snapshot.currency,
            installmentAmount: snapshot.cost14,
            paidInFull: snapshot.paidInFull,
            message: snapshot.message,
          } satisfies LookupSuccess,
        ] as const;
      } catch (error) {
        return [
          deviceTag,
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "No fue posible consultar el device en PayJoy.",
          } satisfies LookupFailure,
        ] as const;
      }
    }
  );

  return new Map<string, LookupResult>(lookupEntries);
}

async function reloadStoredRows(rows: PayJoyStoredRow[]) {
  const lookupMap = await buildLookupMap(rows);

  return rows.map((row) => {
    const normalizedDeviceTag = normalizeDeviceTag(row.device);
    const lookup = lookupMap.get(normalizedDeviceTag);
    const validThrough =
      lookup?.ok && lookup.validThrough ? new Date(lookup.validThrough) : null;
    const paidInFull = lookup?.ok ? lookup.paidInFull : false;
    const paymentDueDate = row.transactionTime
      ? addCalendarDays(new Date(row.transactionTime), 14)
      : null;
    const maximumPaymentDate = row.transactionTime
      ? addCalendarDays(new Date(row.transactionTime), 18)
      : null;
    const automaticStatus = getReloadPolicy(
      row.transactionTime,
      validThrough?.toISOString() ?? null,
      paidInFull
    ).automaticStatus;
    const nextManualStatus: PayJoyStoredRow["manualStatus"] =
      row.status === "PAGO X" || row.manualStatus === "PAGO X"
        ? "PAGO X"
        : automaticStatus === "PAGO X"
          ? "PAGO X"
        : automaticStatus === "PAGO"
          ? "PAGO"
          : row.manualStatus === "GESTIONAR"
            ? "GESTIONAR"
            : row.manualStatus === "MORA"
              ? "MORA"
              : null;

    return {
      ...row,
      installmentAmount: lookup?.ok ? lookup.installmentAmount : null,
      paymentDueDate: paymentDueDate?.toISOString() ?? null,
      devicePaymentDate: validThrough?.toISOString() ?? null,
      paidInFull,
      status: resolveReloadedStatus(nextManualStatus, automaticStatus),
      maximumPaymentDate: maximumPaymentDate?.toISOString() ?? null,
      currency: lookup?.ok ? lookup.currency : null,
      lookupMessage:
        !normalizedDeviceTag
          ? "La fila no trae device."
          : normalizedDeviceTag.startsWith("D")
            ? lookup?.ok
              ? paidInFull
                ? lookup.message || "Equipo pagado por completo."
                : null
              : lookup?.error || "No fue posible consultar el device."
            : "El device no parece ser un Device Tag valido.",
      manualStatus: nextManualStatus,
    } satisfies PayJoyStoredRow;
  });
}

function toCutResponse(cut: PayJoyStoredCutDetail) {
  return {
    ...cut,
    totalSources: cut.totalSources || cut.sourceNames.length,
    uniqueRows: cut.uniqueRows || cut.rows.length,
  };
}

async function getAdminUser() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!isAdmin(user.rolNombre)) {
    return NextResponse.json(
      { error: "Solo el admin puede acceder a Cartera PayJoy." },
      { status: 403 }
    );
  }

  return user;
}

export async function GET(req: Request) {
  try {
    const user = await getAdminUser();

    if (user instanceof NextResponse) {
      return user;
    }

    const { searchParams } = new URL(req.url);
    const requestedId = Number(searchParams.get("id") || 0);

    if (Number.isFinite(requestedId) && requestedId > 0) {
      const cut = await getStoredPayJoyCutById(requestedId);

      if (!cut) {
        return NextResponse.json(
          { error: "No se encontro el corte guardado." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        corte: toCutResponse(cut),
      });
    }

    const cortes = await listStoredPayJoyCuts();

    return NextResponse.json({
      ok: true,
      cortes,
    });
  } catch (error) {
    console.error("ERROR CONSULTANDO CORTES PAYJOY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible consultar los cortes guardados.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAdminUser();

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows)
      ? body.rows
          .map(normalizeStoredRow)
          .filter(
            (candidate: PayJoyStoredRow | null): candidate is PayJoyStoredRow =>
              candidate !== null
          )
      : [];

    if (!rows.length) {
      return NextResponse.json(
        { error: "No hay filas listas para guardar en este corte." },
        { status: 400 }
      );
    }

    const sourceNames = normalizeSourceNames(body?.sourceNames, rows);
    const rawRows = Math.max(0, Math.floor(Number(body?.rawRows || rows.length)));
    const uniqueRows = rows.length;
    const duplicatesRemoved = Math.max(
      0,
      Math.floor(Number(body?.duplicatesRemoved || 0))
    );
    const summary = summarizeRows(rows);
    const recordName = String(body?.recordName || "").trim() ||
      buildDefaultRecordName(sourceNames);

    const savedCut = await saveStoredPayJoyCut({
      recordName,
      totalSources: Math.max(
        sourceNames.length,
        Math.floor(Number(body?.totalSources || sourceNames.length))
      ),
      sourceNames,
      rawRows,
      uniqueRows,
      duplicatesRemoved,
      summary,
      rows,
      savedBy: {
        id: user.id ?? null,
        nombre: user.nombre || "Admin",
        usuario: user.usuario || "",
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Corte guardado correctamente como "${savedCut.recordName}".`,
      corte: savedCut,
    });
  } catch (error) {
    console.error("ERROR GUARDANDO CORTE PAYJOY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible guardar el corte PayJoy.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAdminUser();

    if (user instanceof NextResponse) {
      return user;
    }

    const { searchParams } = new URL(req.url);
    const requestedId = Number(searchParams.get("id") || 0);

    if (!Number.isFinite(requestedId) || requestedId <= 0) {
      return NextResponse.json(
        { error: "Debes indicar un corte valido para eliminar." },
        { status: 400 }
      );
    }

    const removed = await deleteStoredPayJoyCutById(requestedId);

    if (!removed) {
      return NextResponse.json(
        { error: "No se encontro el corte guardado para eliminar." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Corte guardado eliminado correctamente.",
    });
  } catch (error) {
    console.error("ERROR ELIMINANDO CORTE PAYJOY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible eliminar el corte guardado.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getAdminUser();

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await req.json().catch(() => ({}));
    const requestedId = Number(body?.id || 0);

    if (!Number.isFinite(requestedId) || requestedId <= 0) {
      return NextResponse.json(
        { error: "Debes indicar un corte valido para recargar." },
        { status: 400 }
      );
    }

    const storedCut = await getStoredPayJoyCutById(requestedId);

    if (!storedCut) {
      return NextResponse.json(
        { error: "No se encontro el corte guardado para recargar." },
        { status: 404 }
      );
    }

    const reloadedRows = await reloadStoredRows(storedCut.rows);
    const reloadedCut = {
      ...storedCut,
      rows: reloadedRows,
      uniqueRows: reloadedRows.length,
      summary: summarizeRows(reloadedRows),
    } satisfies PayJoyStoredCutDetail;

    return NextResponse.json({
      ok: true,
      mensaje: `Corte "${storedCut.recordName}" recargado correctamente con la informacion actual de PayJoy.`,
      corte: toCutResponse(reloadedCut),
    });
  } catch (error) {
    console.error("ERROR RECARGANDO CORTE PAYJOY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible recargar el corte guardado.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getAdminUser();

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await req.json().catch(() => ({}));
    const requestedId = Number(body?.id || 0);

    if (!Number.isFinite(requestedId) || requestedId <= 0) {
      return NextResponse.json(
        { error: "Debes indicar un corte valido para actualizar." },
        { status: 400 }
      );
    }

    const rows = Array.isArray(body?.rows)
      ? body.rows
          .map(normalizeStoredRow)
          .filter(
            (candidate: PayJoyStoredRow | null): candidate is PayJoyStoredRow =>
              candidate !== null
          )
      : [];

    if (!rows.length) {
      return NextResponse.json(
        { error: "No hay filas listas para actualizar en este corte." },
        { status: 400 }
      );
    }

    const sourceNames = normalizeSourceNames(body?.sourceNames, rows);
    const rawRows = Math.max(0, Math.floor(Number(body?.rawRows || rows.length)));
    const uniqueRows = rows.length;
    const duplicatesRemoved = Math.max(
      0,
      Math.floor(Number(body?.duplicatesRemoved || 0))
    );
    const summary = summarizeRows(rows);
    const recordName =
      String(body?.recordName || "").trim() ||
      buildDefaultRecordName(sourceNames);

    const updatedCut = await updateStoredPayJoyCut({
      id: requestedId,
      recordName,
      totalSources: Math.max(
        sourceNames.length,
        Math.floor(Number(body?.totalSources || sourceNames.length))
      ),
      sourceNames,
      rawRows,
      uniqueRows,
      duplicatesRemoved,
      summary,
      rows,
      savedBy: {
        id: user.id ?? null,
        nombre: user.nombre || "Admin",
        usuario: user.usuario || "",
      },
    });

    if (!updatedCut) {
      return NextResponse.json(
        { error: "No se encontro el corte guardado para actualizar." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      mensaje: `Corte actualizado correctamente como "${updatedCut.recordName}".`,
      corte: updatedCut,
    });
  } catch (error) {
    console.error("ERROR ACTUALIZANDO CORTE PAYJOY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el corte guardado.",
      },
      { status: 500 }
    );
  }
}
