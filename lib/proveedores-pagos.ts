export type ValorDecimalProveedor =
  | { toString(): string }
  | number
  | string;

const MAX_CENTAVOS_PROVEEDOR = 99_999_999_999_999;
const CLAVE_IDEMPOTENCIA_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function normalizePaymentAmountInput(
  value: string,
  previousValue = "",
  isPastedValue = false,
) {
  const compact = value.replace(/[^\d.,]/g, "");
  if (!compact) return "";

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const lastSeparator = Math.max(lastComma, lastDot);
  const hasBothSeparators = lastComma >= 0 && lastDot >= 0;
  const separator = lastSeparator >= 0 ? compact[lastSeparator] : "";
  const groups = separator ? compact.split(separator) : [compact];
  const looksLikeThousands =
    Boolean(separator) &&
    !compact.endsWith(separator) &&
    !hasBothSeparators &&
    groups.length > 1 &&
    groups.slice(1).every((group) => group.length === 3);
  const keepsExistingDecimal =
    !isPastedValue && previousValue.includes(".") && separator === ",";
  const trailingDigits = lastSeparator >= 0
    ? compact.slice(lastSeparator + 1).replace(/\D/g, "").length
    : 0;
  const usesDecimalSeparator =
    lastSeparator >= 0 &&
    (hasBothSeparators ||
      keepsExistingDecimal ||
      compact.endsWith(separator) ||
      (!looksLikeThousands && trailingDigits <= 2));
  const integerSource = usesDecimalSeparator
    ? compact.slice(0, lastSeparator)
    : compact;
  const fractionSource = usesDecimalSeparator
    ? compact.slice(lastSeparator + 1)
    : "";
  const integerDigits =
    integerSource.replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
  const fractionDigits = fractionSource.replace(/\D/g, "").slice(0, 2);

  return usesDecimalSeparator
    ? `${integerDigits}.${fractionDigits}`
    : integerDigits;
}

export function formatPaymentAmountInput(value: string) {
  if (!value) return "";

  const [integerPart = "0", fractionPart] = value.split(".");
  const integer = Number(integerPart || 0);
  const formattedInteger = Number.isFinite(integer)
    ? integer.toLocaleString("es-CO")
    : integerPart;

  return fractionPart === undefined
    ? formattedInteger
    : `${formattedInteger},${fractionPart}`;
}

export function paymentAmountToCents(value: string) {
  const match = value.match(/^(\d{1,12})(?:\.(\d{0,2}))?$/);
  if (!match) return null;

  const cents =
    Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTAVOS_PROVEEDOR
    ? cents
    : null;
}

export function moneyValueToCents(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function moneyValueToPaymentInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";

  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

export function decimalProveedorACentavos(
  value: ValorDecimalProveedor,
): number | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,12})(?:\.(\d{1,2}))?$/);

  if (!match) return null;

  const centavos =
    Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));

  return Number.isSafeInteger(centavos) && centavos <= MAX_CENTAVOS_PROVEEDOR
    ? centavos
    : null;
}

export function centavosADecimalProveedor(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_CENTAVOS_PROVEEDOR
  ) {
    return null;
  }

  const entero = Math.floor(value / 100);
  const centavos = String(value % 100).padStart(2, "0");
  return `${entero}.${centavos}`;
}

export function calcularSaldoFacturaProveedor(
  valorFacturaValue: ValorDecimalProveedor,
  abonos: Array<ValorDecimalProveedor | { valor: ValorDecimalProveedor }> = [],
  estado = "PENDIENTE",
) {
  const valorFactura = decimalProveedorACentavos(valorFacturaValue) ?? 0;
  const valoresAbonados = abonos
    .map((abono) =>
      decimalProveedorACentavos(
        typeof abono === "object" && abono !== null && "valor" in abono
          ? abono.valor
          : abono,
      ),
    )
    .filter((valor): valor is number => valor !== null);
  const totalRegistrado = valoresAbonados.reduce(
    (total, valor) => total + valor,
    0,
  );
  const valorAbonado =
    estado === "PAGADO" && valoresAbonados.length === 0
      ? valorFactura
      : totalRegistrado;
  const saldoPendiente =
    estado === "PAGADO" && valoresAbonados.length === 0
      ? 0
      : valorFactura > valorAbonado
        ? valorFactura - valorAbonado
        : 0;

  return {
    cantidadAbonos: valoresAbonados.length,
    saldoPendiente: centavosADecimalProveedor(saldoPendiente) || "0.00",
    saldoPendienteCentavos: saldoPendiente,
    valorAbonado: centavosADecimalProveedor(valorAbonado) || "0.00",
    valorAbonadoCentavos: valorAbonado,
    valorFactura: centavosADecimalProveedor(valorFactura) || "0.00",
    valorFacturaCentavos: valorFactura,
  };
}

export function validarAbonoFacturaProveedor(
  valorAbonoValue: ValorDecimalProveedor,
  saldoPendienteValue: ValorDecimalProveedor,
) {
  const valorAbonoCentavos = decimalProveedorACentavos(valorAbonoValue);
  const saldoPendienteCentavos = decimalProveedorACentavos(
    saldoPendienteValue,
  );

  if (valorAbonoCentavos === null || valorAbonoCentavos <= 0) {
    return {
      codigo: "VALOR_INVALIDO" as const,
      error: "El valor del abono debe ser mayor que cero",
      ok: false as const,
    };
  }

  if (saldoPendienteCentavos === null || saldoPendienteCentavos <= 0) {
    return {
      codigo: "SIN_SALDO" as const,
      error: "La factura ya no tiene saldo pendiente",
      ok: false as const,
    };
  }

  if (valorAbonoCentavos > saldoPendienteCentavos) {
    return {
      codigo: "SOBREABONO" as const,
      error: "El abono no puede superar el saldo pendiente de la factura",
      ok: false as const,
    };
  }

  const saldoPosteriorCentavos =
    saldoPendienteCentavos - valorAbonoCentavos;

  return {
    ok: true as const,
    saldoAnterior:
      centavosADecimalProveedor(saldoPendienteCentavos) || "0.00",
    saldoPosterior:
      centavosADecimalProveedor(saldoPosteriorCentavos) || "0.00",
    saldoPosteriorCentavos,
    valor: centavosADecimalProveedor(valorAbonoCentavos) || "0.00",
    valorCentavos: valorAbonoCentavos,
  };
}

export function normalizarClaveIdempotenciaProveedor(value: unknown) {
  const key = String(value ?? "").trim();

  if (
    key.length < 8 ||
    key.length > 160 ||
    !CLAVE_IDEMPOTENCIA_PATTERN.test(key)
  ) {
    return null;
  }

  return key;
}
