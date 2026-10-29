import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { calendarDayNumber, colombiaCalendarDate } from "@/lib/payjoy-40-60-age";
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
  return ["ADMIN", "AUDITOR"].includes(String(roleName || "").trim().toUpperCase());
}

function canDelete(roleName: string | null | undefined) {
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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (["id", "week", "merchantName", "deviceTag", "cedula"].some(key => typeof candidate[key] !== "string") ||
    !normalizeText(candidate.id) || !normalizeText(candidate.week) || typeof candidate.paidInFull !== "boolean" ||
    ![null, 0, 1].includes(candidate.pay40At60 as null | number) ||
    [candidate.loanAgeDays, candidate.numberOfPayments, candidate.loanRepaymentBiweek].some(number =>
      number !== null && (typeof number !== "number" || !Number.isFinite(number)))) return null;
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
    loanRepaymentBiweek:
      candidate.loanRepaymentBiweek === null ||
      candidate.loanRepaymentBiweek === undefined ||
      candidate.loanRepaymentBiweek === ""
        ? null
        : Number(candidate.loanRepaymentBiweek),
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validAgeReferenceDate(value: unknown) {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && calendarDayNumber(value) !== null && value >= "0001-01-01" && value <= colombiaCalendarDate();
}

function validRows(value: unknown): FortySixtyStoredRow[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const rows = value.map(normalizeStoredRow);
  if (rows.some(row => row === null)) return null;
  const complete = rows as FortySixtyStoredRow[];
  return new Set(complete.map(row => row.id)).size === complete.length ? complete : null;
}

function validTotalRows(value: unknown, rows: FortySixtyStoredRow[]) {
  const total = value === undefined ? rows.length : value;
  return typeof total === "number" && Number.isSafeInteger(total) && total >= rows.length && total <= 2147483647 ? total : null;
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
    if (!validAgeReferenceDate(body?.ageReferenceDate)) {
      return NextResponse.json({ error: "La fecha base de la edad debe ser una fecha válida y no futura en Colombia." }, { status: 400 });
    }
    if (body?.clientKey !== undefined && (typeof body.clientKey !== "string" || !UUID_PATTERN.test(body.clientKey))) {
      return NextResponse.json({ error: "La identificación del nuevo corte debe ser un UUID válido." }, { status: 400 });
    }
    const rows = validRows(body?.rows);

    if (!rows) {
      return NextResponse.json(
        { error: "El corte debe contener filas completas y válidas. No se guardó ninguna fila." },
        { status: 400 }
      );
    }

    const totalRows = validTotalRows(body?.totalRows, rows);
    if (totalRows === null) return NextResponse.json({ error: "El total de filas no es válido para este corte." }, { status: 400 });

    const week = normalizeText(body?.week);
    const savedRecord = await saveStoredFortySixtyRecord({
      ...(body.clientKey === undefined ? {} : { clientKey: body.clientKey.toLowerCase() }),
      ...(body.ageReferenceDate === undefined ? {} : { ageReferenceDate: body.ageReferenceDate }),
      recordName: normalizeText(body?.recordName) || buildDefaultRecordName(week),
      week,
      fileName: normalizeText(body?.fileName),
      sheetName: normalizeText(body?.sheetName),
      totalRows,
      filteredRows: rows.length,
      summary: summarizeRows(rows),
      rows,
      savedBy: {
        id: user.id ?? null,
        perfilId: user.perfilId ?? null,
        nombre: user.perfilNombre || user.nombre || "Admin",
        usuario: user.usuario || "",
      },
    });

    const { replayed = false, ...registro } = savedRecord;
    return NextResponse.json({
      ok: true,
      replayed,
      mensaje: `Semana guardada correctamente como "${savedRecord.recordName}".`,
      registro,
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
    if (!validAgeReferenceDate(body?.ageReferenceDate)) {
      return NextResponse.json({ error: "La fecha base de la edad debe ser una fecha válida y no futura en Colombia." }, { status: 400 });
    }
    const requestedId = Number(body?.id || 0);

    if (!Number.isSafeInteger(requestedId) || requestedId <= 0 || requestedId > 2147483647) {
      return NextResponse.json(
        { error: "Debes indicar un registro valido para actualizar." },
        { status: 400 }
      );
    }

    if (body?.expectedRevision !== undefined && (typeof body.expectedRevision !== "number" ||
      !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 || body.expectedRevision > 2147483647)) {
      return NextResponse.json({ error: "La revisión del corte debe ser un entero válido mayor que cero." }, { status: 400 });
    }
    if (body?.clientKey !== undefined && (typeof body.clientKey !== "string" || !UUID_PATTERN.test(body.clientKey))) {
      return NextResponse.json({ error: "La identificación del nuevo corte debe ser un UUID válido." }, { status: 400 });
    }
    const rows = validRows(body?.rows);

    if (!rows) {
      return NextResponse.json(
        { error: "El corte debe contener filas completas y válidas. No se guardó ninguna fila." },
        { status: 400 }
      );
    }

    const totalRows = validTotalRows(body?.totalRows, rows);
    if (totalRows === null) return NextResponse.json({ error: "El total de filas no es válido para este corte." }, { status: 400 });

    const week = normalizeText(body?.week);
    const updatedRecord = await updateStoredFortySixtyRecord({
      id: requestedId,
      ...(body.expectedRevision === undefined ? {} : { expectedRevision: body.expectedRevision }),
      ...(body.ageReferenceDate === undefined ? {} : { ageReferenceDate: body.ageReferenceDate }),
      recordName: normalizeText(body?.recordName) || buildDefaultRecordName(week),
      week,
      fileName: normalizeText(body?.fileName),
      sheetName: normalizeText(body?.sheetName),
      totalRows,
      filteredRows: rows.length,
      summary: summarizeRows(rows),
      rows,
      savedBy: {
        id: user.id ?? null,
        perfilId: user.perfilId ?? null,
        nombre: user.perfilNombre || user.nombre || "Admin",
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
    if (error instanceof Error && "code" in error && error.code === "REVISION_CONFLICT" && "currentRevision" in error) {
      return NextResponse.json({ code: "REVISION_CONFLICT", currentRevision: error.currentRevision,
        error: "Este corte cambió en otra sesión. Consulta la versión actual antes de guardar nuevamente." }, { status: 409 });
    }
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

    if (!canDelete(user.rolNombre)) {
      return NextResponse.json(
        { error: "El rol AUDITOR no puede eliminar registros" },
        { status: 403 }
      );
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
