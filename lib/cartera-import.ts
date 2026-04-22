export type CarteraTxtRow = {
  cedula: string;
  numeroCredito: string | null;
  modalidad: string | null;
  sucursal: string | null;
  ubicacion: string | null;
  diasVencido: number;
  cuotasPendientes: number | null;
  valorCuota: number | null;
  saldoObligacion: number | null;
  saldoCapital: number | null;
  saldoGarantia: number | null;
  estadoGestion: string | null;
  estado: string | null;
  garantia: string | null;
  marca: string | null;
  abogado: string | null;
  abonoInsuficiente: boolean;
  beneficioPerdido: boolean;
  fechaApertura: Date | null;
  fechaConsulta: Date | null;
  fechaProximaCuota: Date | null;
  ultimoAbonoEn: Date | null;
};

function splitPipeLine(line: string) {
  return line.split("|").map((value) => value.trim());
}

function normalizeText(value: string | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

export function normalizeCedula(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "").trim();
}

function parseNumber(value: string | undefined) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  let normalized = raw.replace(/\s/g, "");

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/,/g, "");
  } else if (normalized.includes(",") && !normalized.includes(".")) {
    normalized = normalized.replace(/,/g, ".");
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseInteger(value: string | undefined) {
  const numeric = parseNumber(value);

  if (numeric === null) {
    return 0;
  }

  return Math.trunc(numeric);
}

function parseNullableInteger(value: string | undefined) {
  const numeric = parseNumber(value);

  if (numeric === null) {
    return null;
  }

  return Math.trunc(numeric);
}

function parseDate(value: string | undefined) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  const isoAttempt = new Date(raw);
  if (!Number.isNaN(isoAttempt.getTime())) {
    return isoAttempt;
  }

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseBooleanFlag(value: string | undefined) {
  return String(value || "").trim() === "1";
}

function isSeparatorLine(line: string) {
  return /^[\s\-+=]+$/.test(line.replace(/\|/g, "").trim());
}

function isEndMarker(line: string) {
  return /^\(\d+\s+rows?\)/i.test(line.trim());
}

export function parseCarteraTxt(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, ""));

  const headerIndex = lines.findIndex(
    (line) =>
      line.includes("|") &&
      /(^|\|)\s*cedula\s*(\||$)/i.test(line) &&
      /(^|\|)\s*f_dias_vencido\s*(\||$)/i.test(line)
  );

  if (headerIndex === -1) {
    throw new Error(
      "No se encontro una tabla valida de cartera dentro del archivo."
    );
  }

  const headers = splitPipeLine(lines[headerIndex]);
  const columnMap = new Map<string, number>();

  headers.forEach((header, index) => {
    columnMap.set(header.toLowerCase(), index);
  });

  const getValue = (columns: string[], key: string) => {
    const index = columnMap.get(key.toLowerCase());
    return index === undefined ? "" : columns[index] || "";
  };

  const rows: CarteraTxtRow[] = [];

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (isSeparatorLine(line)) {
      continue;
    }

    if (isEndMarker(line)) {
      break;
    }

    if (!line.includes("|")) {
      continue;
    }

    const columns = splitPipeLine(line);
    const cedula = normalizeCedula(getValue(columns, "cedula"));

    if (!cedula) {
      continue;
    }

    rows.push({
      cedula,
      numeroCredito: normalizeText(getValue(columns, "nro_credito")),
      modalidad: normalizeText(getValue(columns, "d_modalidad")),
      sucursal: normalizeText(getValue(columns, "d_sucursal")),
      ubicacion: normalizeText(getValue(columns, "ubicacion")),
      diasVencido: parseInteger(getValue(columns, "f_dias_vencido")),
      cuotasPendientes: parseNullableInteger(
        getValue(columns, "f_cuotas_pendientes")
      ),
      valorCuota: parseNumber(getValue(columns, "valor_cuota")),
      saldoObligacion: parseNumber(getValue(columns, "saldo_obligacion")),
      saldoCapital: parseNumber(getValue(columns, "saldo_capital")),
      saldoGarantia: parseNumber(getValue(columns, "saldo_garantia")),
      estadoGestion: normalizeText(getValue(columns, "c_estado_gestion")),
      estado: normalizeText(getValue(columns, "d_estado")),
      garantia: normalizeText(getValue(columns, "c_garantia")),
      marca: normalizeText(getValue(columns, "id_marca")),
      abogado: normalizeText(getValue(columns, "n17_d_abogado")),
      abonoInsuficiente: parseBooleanFlag(
        getValue(columns, "m16_cxc_abono_insuficiente")
      ),
      beneficioPerdido: parseBooleanFlag(
        getValue(columns, "m17_sw_beneficio_perdido_interes_garantia")
      ),
      fechaApertura: parseDate(getValue(columns, "f_apertura")),
      fechaConsulta: parseDate(getValue(columns, "f_consulta")),
      fechaProximaCuota: parseDate(getValue(columns, "f_proxima_cuota")),
      ultimoAbonoEn: parseDate(getValue(columns, "m15_f_ultimoabono")),
    });
  }

  return rows;
}
