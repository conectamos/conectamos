import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  deleteStoredFortySixtyRecordById,
  getStoredFortySixtyRecordById,
  listStoredFortySixtyRecords,
  saveStoredFortySixtyRecord,
  updateStoredFortySixtyRecord,
  type FortySixtyStoredDetail,
  type FortySixtyStoredRow,
  type FortySixtyStoredSummary,
} from "@/lib/payjoy-40-60-store";

export const runtime = "nodejs";

function isAdmin(roleName: string | null | undefined) {
  return String(roleName || "").trim().toUpperCase() === "ADMIN";
}

async function getAdminUser() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!isAdmin(user.rolNombre)) {
    return NextResponse.json(
      { error: "No autorizado para usar este modulo." },
      { status: 403 }
    );
  }

  return user;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeStoredRow(value: unknown): FortySixtyStoredRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const status = normalizeText(candidate.status).toUpperCase();
  const pay40At60 =
    candidate.pay40At60 === null ||
    candidate.pay40At60 === undefined ||
    candidate.pay40At60 === ""
      ? null
      : Number(candidate.pay40At60);

  if (status !== "40/60 APROBADO" && status !== "40/60 NO APROBADO") {
    return null;
  }

  return {
    id: normalizeText(candidate.id),
    week: normalizeText(candidate.week),
    merchantName: normalizeText(candidate.merchantName),
    deviceTag: normalizeText(candidate.deviceTag).toUpperCase(),
    loanAgeDays:
      candidate.loanAgeDays === null ||
      candidate.loanAgeDays === undefined ||
      candidate.loanAgeDays === ""
        ? null
        : Number(candidate.loanAgeDays),
    numberOfPayments:
      candidate.numberOfPayments === null ||
      candidate.numberOfPayments === undefined ||
      candidate.numberOfPayments === ""
        ? null
        : Number(candidate.numberOfPayments),
    cedula: normalizeText(candidate.cedula),
    status: status as FortySixtyStoredRow["status"],
    pay40At60: pay40At60 === 1 ? 1 : pay40At60 === 0 ? 0 : null,
    paidInFull: Boolean(candidate.paidInFull),
  };
}

function summarizeRows(rows: FortySixtyStoredRow[]): FortySixtyStoredSummary {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "40/60 APROBADO") {
        summary.aprobados += 1;
      } else {
        summary.noAprobados += 1;
      }

      if (normalizeText(row.cedula)) {
        summary.cedulasEncontradas += 1;
      } else {
        summary.cedulasPendientes += 1;
      }

      return summary;
    },
    {
      aprobados: 0,
      noAprobados: 0,
      cedulasEncontradas: 0,
      cedulasPendientes: 0,
    }
  );
}

function buildDefaultRecordName(week: string) {
  return `40/60 - ${normalizeText(week) || "Semana sin nombre"}`;
}

function toRecordResponse(record: FortySixtyStoredDetail) {
  return {
    ...record,
    rows: record.rows,
  };
}

export async function GET(req: Request) {
  try {
    const user = await getAdminUser();

    if (user instanceof NextResponse) {
      return user;
    }

    const { searchParams } = new URL(req.url);
    const requestedId = Number(searchParams.get("id") || 0);

    if (requestedId > 0) {
      const record = await getStoredFortySixtyRecordById(requestedId);

      if (!record) {
        return NextResponse.json(
          { error: "No se encontro el registro guardado de 40/60." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        registro: toRecordResponse(record),
      });
    }

    const registros = await listStoredFortySixtyRecords();

    return NextResponse.json({
      ok: true,
      registros,
    });
  } catch (error) {
    console.error("ERROR CONSULTANDO REGISTROS 40/60:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible consultar los registros guardados de 40/60.",
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
            (candidate: FortySixtyStoredRow | null): candidate is FortySixtyStoredRow =>
              candidate !== null
          )
      : [];

    if (!rows.length) {
      return NextResponse.json(
        { error: "No hay filas listas para guardar en este registro 40/60." },
        { status: 400 }
      );
    }

    const week = normalizeText(body?.week);
    const savedRecord = await saveStoredFortySixtyRecord({
      recordName: normalizeText(body?.recordName) || buildDefaultRecordName(week),
      week,
      fileName: normalizeText(body?.fileName),
      sheetName: normalizeText(body?.sheetName),
      totalRows: Math.max(0, Math.floor(Number(body?.totalRows || rows.length))),
      filteredRows: rows.length,
      summary: summarizeRows(rows),
      rows,
      savedBy: {
        id: user.id ?? null,
        nombre: user.nombre || "Admin",
        usuario: user.usuario || "",
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Semana guardada correctamente como "${savedRecord.recordName}".`,
      registro: savedRecord,
    });
  } catch (error) {
    console.error("ERROR GUARDANDO REGISTRO 40/60:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible guardar el registro 40/60.",
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
        { error: "Debes indicar un registro valido para actualizar." },
        { status: 400 }
      );
    }

    const rows = Array.isArray(body?.rows)
      ? body.rows
          .map(normalizeStoredRow)
          .filter(
            (candidate: FortySixtyStoredRow | null): candidate is FortySixtyStoredRow =>
              candidate !== null
          )
      : [];

    if (!rows.length) {
      return NextResponse.json(
        { error: "No hay filas listas para actualizar en este registro 40/60." },
        { status: 400 }
      );
    }

    const week = normalizeText(body?.week);
    const updatedRecord = await updateStoredFortySixtyRecord({
      id: requestedId,
      recordName: normalizeText(body?.recordName) || buildDefaultRecordName(week),
      week,
      fileName: normalizeText(body?.fileName),
      sheetName: normalizeText(body?.sheetName),
      totalRows: Math.max(0, Math.floor(Number(body?.totalRows || rows.length))),
      filteredRows: rows.length,
      summary: summarizeRows(rows),
      rows,
      savedBy: {
        id: user.id ?? null,
        nombre: user.nombre || "Admin",
        usuario: user.usuario || "",
      },
    });

    if (!updatedRecord) {
      return NextResponse.json(
        { error: "No se encontro el registro guardado para actualizar." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      mensaje: `Registro actualizado correctamente como "${updatedRecord.recordName}".`,
      registro: updatedRecord,
    });
  } catch (error) {
    console.error("ERROR ACTUALIZANDO REGISTRO 40/60:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el registro 40/60.",
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
        { error: "Debes indicar un registro valido para eliminar." },
        { status: 400 }
      );
    }

    const removed = await deleteStoredFortySixtyRecordById(requestedId);

    if (!removed) {
      return NextResponse.json(
        { error: "No se encontro el registro guardado para eliminar." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Registro 40/60 eliminado correctamente.",
    });
  } catch (error) {
    console.error("ERROR ELIMINANDO REGISTRO 40/60:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible eliminar el registro 40/60.",
      },
      { status: 500 }
    );
  }
}
