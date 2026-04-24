import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { parsePayJoyFortySixtyWorkbook } from "@/lib/payjoy-40-60-import";
import { getLatestNationalIdsByDeviceTags } from "@/lib/payjoy-cortes-store";
import { getPayJoyPaymentSnapshot } from "@/lib/payjoy";

export const runtime = "nodejs";

type FortySixtyStatus = "40/60 APROBADO" | "40/60 NO APROBADO";

type LookupResult = {
  paidInFull: boolean;
  message: string | null;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizeWeekKey(value: string | null | undefined) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/^WEEK\s*/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

function normalizeDeviceTag(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
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

function computeFortySixtyStatus(input: {
  pay40At60: 0 | 1 | null;
  loanAgeDays: number | null;
  numberOfPayments: number | null;
  paidInFull: boolean;
}) {
  if (input.pay40At60 === 1) {
    return "40/60 APROBADO" satisfies FortySixtyStatus;
  }

  if (input.pay40At60 === 0) {
    return "40/60 NO APROBADO" satisfies FortySixtyStatus;
  }

  const loanAgeDays = input.loanAgeDays ?? Number.POSITIVE_INFINITY;
  const numberOfPayments = input.numberOfPayments ?? 0;

  if (loanAgeDays <= 60 && (numberOfPayments >= 3 || input.paidInFull)) {
    return "40/60 APROBADO" satisfies FortySixtyStatus;
  }

  return "40/60 NO APROBADO" satisfies FortySixtyStatus;
}

async function buildPayJoyLookupMap(rows: Array<{ deviceTag: string }>) {
  const deviceTags = Array.from(
    new Set(
      rows
        .map((row) => normalizeDeviceTag(row.deviceTag))
        .filter((deviceTag) => deviceTag.startsWith("D"))
    )
  );

  if (!deviceTags.length) {
    return new Map<string, LookupResult>();
  }

  const lookupEntries = await mapWithConcurrency(deviceTags, 4, async (deviceTag) => {
    try {
      const snapshot = await getPayJoyPaymentSnapshot(deviceTag);

      return [
        deviceTag,
        {
          paidInFull: snapshot.paidInFull,
          message: snapshot.message,
        } satisfies LookupResult,
      ] as const;
    } catch {
      return [
        deviceTag,
        {
          paidInFull: false,
          message: null,
        } satisfies LookupResult,
      ] as const;
    }
  });

  return new Map<string, LookupResult>(lookupEntries);
}

function summarizeRows(
  rows: Array<{
    cedula: string;
    status: FortySixtyStatus;
  }>
) {
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

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (String(user.rolNombre || "").toUpperCase() !== "ADMIN") {
      return NextResponse.json(
        { error: "No autorizado para usar este modulo." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const weekInput = String(formData.get("week") || "").trim();
    const files = [
      ...formData.getAll("file"),
      ...formData.getAll("files"),
    ].filter((item): item is File => item instanceof File);

    if (!weekInput) {
      return NextResponse.json(
        { error: "Debes escribir la WEEK que quieres consultar." },
        { status: 400 }
      );
    }

    if (!files.length) {
      return NextResponse.json(
        { error: "Debes subir un archivo Excel del 40/60." },
        { status: 400 }
      );
    }

    const file = files[0];
    const imported = parsePayJoyFortySixtyWorkbook(
      Buffer.from(await file.arrayBuffer()),
      file.name || "40-60.xlsx"
    );

    const normalizedWeek = normalizeWeekKey(weekInput);
    const filteredRows = imported.rows.filter(
      (row) => normalizeWeekKey(row.week) === normalizedWeek
    );

    const deviceTags = filteredRows.map((row) => normalizeDeviceTag(row.deviceTag));
    const nationalIdsByDevice = await getLatestNationalIdsByDeviceTags(deviceTags);

    const rowsRequiringLookup = filteredRows.filter(
      (row) => row.pay40At60 === null && (row.loanAgeDays ?? Number.POSITIVE_INFINITY) <= 60
    );
    const lookupMap = await buildPayJoyLookupMap(rowsRequiringLookup);

    const selectedWeekLabel = filteredRows[0]?.week || weekInput;
    const rows = filteredRows.map((row, index) => {
      const deviceTag = normalizeDeviceTag(row.deviceTag);
      const lookup = lookupMap.get(deviceTag);
      const paidInFull = lookup?.paidInFull ?? false;
      const status: FortySixtyStatus = computeFortySixtyStatus({
        pay40At60: row.pay40At60,
        loanAgeDays: row.loanAgeDays,
        numberOfPayments: row.numberOfPayments,
        paidInFull,
      });

      return {
        id: `${normalizedWeek}-${deviceTag}-${index}`,
        week: row.week,
        merchantName: row.merchantName,
        deviceTag,
        loanAgeDays: row.loanAgeDays,
        numberOfPayments: row.numberOfPayments,
        loanRepaymentBiweek: row.loanRepaymentBiweek,
        cedula: nationalIdsByDevice.get(deviceTag) || "",
        status,
        pay40At60: row.pay40At60,
        paidInFull,
      };
    });

    return NextResponse.json({
      ok: true,
      fileName: imported.fileName,
      sheetName: imported.sheetName,
      week: selectedWeekLabel,
      totalRows: imported.totalRows,
      filteredRows: rows.length,
      summary: summarizeRows(rows),
      rows,
    });
  } catch (error) {
    console.error("ERROR IMPORTANDO 40/60 PAYJOY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error procesando el archivo 40/60.",
      },
      { status: 500 }
    );
  }
}
