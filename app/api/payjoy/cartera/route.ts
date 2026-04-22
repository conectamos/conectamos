import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  parsePayJoyWorkbook,
  type PayJoyTransactionRow,
} from "@/lib/payjoy-cartera-import";
import { getPayJoyPaymentSnapshot } from "@/lib/payjoy";

export const runtime = "nodejs";

type LookupSuccess = {
  ok: true;
  validThrough: string | null;
  remainingBalance: number | null;
  currency: string | null;
};

type LookupFailure = {
  ok: false;
  error: string;
};

type LookupResult = LookupSuccess | LookupFailure;

type ImportSource = {
  fileName: string;
  corteName: string;
  rows: PayJoyTransactionRow[];
};

type ConsolidatedTransaction = {
  transactionTime: Date | null;
  merchantName: string;
  device: string;
  deviceFamily: string;
  imei: string;
  nationalId: string;
  cortes: string[];
};

function normalizeDeviceTag(value: string) {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizeKeyText(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
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

function computeStatus(
  transactionTime: Date | null,
  validThrough: Date | null
): "MORA" | "PAGO" | "SIN DATOS" {
  if (!transactionTime || !validThrough) {
    return "SIN DATOS";
  }

  const expectedPaymentDate = addCalendarDays(transactionTime, 14);
  const pagoThresholdDate = addCalendarDays(expectedPaymentDate, 10);
  const expectedKey = getDateKeyInBogota(expectedPaymentDate);
  const validThroughKey = getDateKeyInBogota(validThrough);

  if (validThroughKey === expectedKey) {
    return "MORA";
  }

  return validThrough > pagoThresholdDate ? "PAGO" : "MORA";
}

function buildTransactionKey(row: ConsolidatedTransaction) {
  return [
    row.transactionTime?.toISOString() || "",
    normalizeKeyText(row.merchantName),
    normalizeDeviceTag(row.device),
    normalizeKeyText(row.deviceFamily),
    normalizeKeyText(row.imei),
    normalizeKeyText(row.nationalId),
  ].join("::");
}

function buildDefaultCorteName(fileName: string) {
  const baseName = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();

  return baseName || "Corte sin nombre";
}

function parseLinkLines(linksText: string) {
  return String(linksText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [left, ...rest] = line.split("|");

      if (rest.length === 0) {
        return {
          corteName: null as string | null,
          url: left.trim(),
        };
      }

      return {
        corteName: left.trim() || null,
        url: rest.join("|").trim(),
      };
    })
    .filter((item) => item.url);
}

function extractFileNameFromContentDisposition(value: string | null) {
  const raw = String(value || "");
  const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const classicMatch = raw.match(/filename="?([^"]+)"?/i);
  return classicMatch?.[1] ? classicMatch[1] : null;
}

function buildGoogleSpreadsheetExportUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/i);

  if (!match?.[1]) {
    return rawUrl;
  }

  const gid = url.searchParams.get("gid");
  const exportUrl = new URL(
    `https://docs.google.com/spreadsheets/d/${match[1]}/export`
  );

  exportUrl.searchParams.set("format", "xlsx");

  if (gid) {
    exportUrl.searchParams.set("gid", gid);
  }

  return exportUrl.toString();
}

function buildRemoteDownloadError(rawUrl: string, status: number) {
  const isGoogleSheet = rawUrl.includes("docs.google.com/spreadsheets");

  if (isGoogleSheet && (status === 401 || status === 403)) {
    return "Google no permitio descargar ese Sheet. Para usar links en produccion, debes compartirlo como publico o subir el archivo directamente.";
  }

  if (isGoogleSheet && status === 404) {
    return "Google no encontro ese Sheet. Revisa que el link sea correcto y que el documento exista.";
  }

  return `No fue posible descargar el link (${status}): ${rawUrl}`;
}

function getDownloadUrl(rawUrl: string) {
  const url = new URL(rawUrl);

  if (
    url.hostname.includes("docs.google.com") &&
    url.pathname.includes("/spreadsheets/")
  ) {
    return buildGoogleSpreadsheetExportUrl(rawUrl);
  }

  return rawUrl;
}

function getUploadedFiles(formData: FormData) {
  const files = [
    ...formData.getAll("files"),
    ...formData.getAll("file"),
  ].filter((item): item is File => item instanceof File);

  return files;
}

async function getRemoteImports(linksText: string) {
  const links = parseLinkLines(linksText);

  return Promise.all(
    links.map(async (item) => {
      const downloadUrl = getDownloadUrl(item.url);
      const response = await fetch(downloadUrl, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(buildRemoteDownloadError(item.url, response.status));
      }

      const fileName =
        extractFileNameFromContentDisposition(
          response.headers.get("content-disposition")
        ) ||
        `${new URL(item.url).hostname}.xlsx`;

      const imported = parsePayJoyWorkbook(
        Buffer.from(await response.arrayBuffer()),
        fileName
      );

      return {
        fileName: imported.fileName,
        corteName: item.corteName || buildDefaultCorteName(imported.fileName),
        rows: imported.rows,
      } satisfies ImportSource;
    })
  );
}

async function getFileImports(files: File[]) {
  return Promise.all(
    files.map(async (file) => {
      const imported = parsePayJoyWorkbook(
        Buffer.from(await file.arrayBuffer()),
        file.name || "transacciones.xlsx"
      );

      return {
        fileName: imported.fileName,
        corteName: buildDefaultCorteName(imported.fileName),
        rows: imported.rows,
      } satisfies ImportSource;
    })
  );
}

function consolidateTransactions(imports: ImportSource[]) {
  const consolidated = new Map<string, ConsolidatedTransaction>();
  let rawRows = 0;

  for (const source of imports) {
    for (const row of source.rows) {
      rawRows += 1;

      const candidate: ConsolidatedTransaction = {
        transactionTime: row.transactionTime,
        merchantName: row.merchantName,
        device: row.device,
        deviceFamily: row.deviceFamily,
        imei: row.imei,
        nationalId: row.nationalId,
        cortes: [source.corteName],
      };

      const key = buildTransactionKey(candidate);
      const existing = consolidated.get(key);

      if (!existing) {
        consolidated.set(key, candidate);
        continue;
      }

      if (!existing.transactionTime && candidate.transactionTime) {
        existing.transactionTime = candidate.transactionTime;
      }

      if (!existing.merchantName && candidate.merchantName) {
        existing.merchantName = candidate.merchantName;
      }

      if (!existing.device && candidate.device) {
        existing.device = candidate.device;
      }

      if (!existing.deviceFamily && candidate.deviceFamily) {
        existing.deviceFamily = candidate.deviceFamily;
      }

      if (!existing.imei && candidate.imei) {
        existing.imei = candidate.imei;
      }

      if (!existing.nationalId && candidate.nationalId) {
        existing.nationalId = candidate.nationalId;
      }

      if (!existing.cortes.includes(source.corteName)) {
        existing.cortes.push(source.corteName);
      }
    }
  }

  const rows = Array.from(consolidated.values());

  return {
    rawRows,
    uniqueRows: rows.length,
    duplicatesRemoved: Math.max(rawRows - rows.length, 0),
    rows,
  };
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

async function buildLookupMap(rows: ConsolidatedTransaction[]) {
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

function summarizeRows(
  rows: Array<{
    status: "MORA" | "PAGO" | "SIN DATOS";
  }>
) {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "MORA") {
        summary.mora += 1;
      } else if (row.status === "PAGO") {
        summary.pago += 1;
      } else {
        summary.sinDatos += 1;
      }

      return summary;
    },
    {
      mora: 0,
      pago: 0,
      sinDatos: 0,
    }
  );
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await req.formData();
    const files = getUploadedFiles(formData);
    const linksText = String(formData.get("linksText") || "");

    if (!files.length && !linksText.trim()) {
      return NextResponse.json(
        { error: "Debes subir archivos o pegar links de transacciones." },
        { status: 400 }
      );
    }

    const imports = [
      ...(await getFileImports(files)),
      ...(await getRemoteImports(linksText)),
    ];

    if (!imports.length) {
      return NextResponse.json(
        { error: "No se encontraron cargas validas para procesar." },
        { status: 400 }
      );
    }

    const consolidated = consolidateTransactions(imports);
    const lookupMap = await buildLookupMap(consolidated.rows);

    const rows = consolidated.rows.map((row) => {
      const normalizedDeviceTag = normalizeDeviceTag(row.device);
      const lookup = lookupMap.get(normalizedDeviceTag);
      const validThrough =
        lookup?.ok && lookup.validThrough ? new Date(lookup.validThrough) : null;
      const paymentDueDate = row.transactionTime
        ? addCalendarDays(row.transactionTime, 14)
        : null;
      const maximumPaymentDate = row.transactionTime
        ? addCalendarDays(row.transactionTime, 18)
        : null;
      const status = computeStatus(row.transactionTime, validThrough);

      return {
        corteName: row.cortes.join(" | "),
        transactionTime: row.transactionTime?.toISOString() ?? null,
        merchantName: row.merchantName,
        device: row.device,
        deviceFamily: row.deviceFamily,
        imei: row.imei,
        nationalId: row.nationalId,
        paymentDueDate: paymentDueDate?.toISOString() ?? null,
        devicePaymentDate: validThrough?.toISOString() ?? null,
        status,
        maximumPaymentDate: maximumPaymentDate?.toISOString() ?? null,
        currency: lookup?.ok ? lookup.currency : null,
        lookupMessage:
          !normalizedDeviceTag
            ? "La fila no trae device."
            : normalizedDeviceTag.startsWith("D")
              ? lookup?.ok
                ? null
                : lookup?.error || "No fue posible consultar el device."
              : "El device no parece ser un Device Tag valido.",
      };
    });

    return NextResponse.json({
      ok: true,
      totalSources: imports.length,
      sourceNames: imports.map((item) => item.corteName),
      rawRows: consolidated.rawRows,
      uniqueRows: consolidated.uniqueRows,
      duplicatesRemoved: consolidated.duplicatesRemoved,
      summary: summarizeRows(rows),
      rows,
    });
  } catch (error) {
    console.error("ERROR IMPORTANDO CARTERA PAYJOY:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error procesando la cartera de PayJoy.",
      },
      { status: 500 }
    );
  }
}
