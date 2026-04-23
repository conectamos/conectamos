import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  deleteStoredPayJoyCutById,
  getStoredPayJoyCutById,
  listStoredPayJoyCuts,
  saveStoredPayJoyCut,
  type PayJoyStoredCutDetail,
  type PayJoyStoredRow,
  type PayJoyStoredSummary,
} from "@/lib/payjoy-cortes-store";

export const runtime = "nodejs";

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
      if (row.status === "MORA") {
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

  if (status !== "MORA" && status !== "PAGO" && status !== "PAGO X") {
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
