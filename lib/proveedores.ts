import {
  getDateKeyInColombia,
  normalizeDateKey,
} from "@/lib/credit-date-utils";

export const ESTADO_FACTURA_PROVEEDOR = {
  PAGADO: "PAGADO",
  PENDIENTE: "PENDIENTE",
} as const;

export const DIAS_ANTICIPACION_AVISO_PROVEEDOR = 3;
export const RUTA_PROVEEDORES = "/dashboard/proveedores";

export type EstadoFacturaProveedorValue =
  (typeof ESTADO_FACTURA_PROVEEDOR)[keyof typeof ESTADO_FACTURA_PROVEEDOR];

export type SituacionFacturaProveedor =
  | "AL_DIA"
  | "PAGADO"
  | "PROXIMA"
  | "VENCE_HOY"
  | "VENCIDA";

export type TipoAvisoFacturaProveedor =
  | "PROXIMO_VENCIMIENTO"
  | "VENCE_HOY"
  | "VENCIDA";

type FacturaProveedorSerializable = {
  aliado: string;
  creadoPorId: number;
  creadoPorNombre: string;
  createdAt: Date | string;
  estado: string;
  fechaVencimiento: Date | string;
  id: number;
  numeroFactura: string;
  pagoAprobadoEn: Date | string | null;
  pagoAprobadoPorId: number | null;
  pagoAprobadoPorNombre: string | null;
  updatedAt: Date | string;
  valorPagar: { toString(): string } | number | string;
};

export type FacturaProveedorSerializada = ReturnType<
  typeof serializarFacturaProveedor
>;

function fechaIso(value: Date | string | null) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateKeyToEpoch(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function normalizarTextoProveedor(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizarClaveProveedor(value: unknown) {
  return normalizarTextoProveedor(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("es-CO");
}

export function normalizarNumeroFacturaProveedor(value: unknown) {
  return normalizarClaveProveedor(value).replace(/\s+/g, "");
}

export function dateKeyToDatabaseDate(dateKey: string) {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized || normalized !== dateKey) return null;

  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function databaseDateToDateKey(value: Date | string) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }

  const direct = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return direct?.[1] && normalizeDateKey(direct[1]) === direct[1]
    ? direct[1]
    : null;
}

export function parseFechaVencimientoProveedor(value: unknown) {
  const key = normalizeDateKey(value);
  if (!key) return null;

  const date = dateKeyToDatabaseDate(key);
  return date ? { date, key } : null;
}

export function diferenciaDiasFechaProveedor(
  fechaVencimientoKey: string,
  hoyKey = getDateKeyInColombia()
) {
  return Math.round(
    (dateKeyToEpoch(fechaVencimientoKey) - dateKeyToEpoch(hoyKey)) /
      86_400_000
  );
}

export function parseValorPagarProveedor(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || value > 999_999_999_999.99) {
      return null;
    }

    return value.toFixed(2);
  }

  const raw = String(value ?? "").trim();
  if (!raw || raw.includes("-")) return null;

  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);
  const separator = separatorIndex >= 0 ? cleaned[separatorIndex] : "";
  const separatorCount = separator
    ? cleaned.split(separator).length - 1
    : 0;
  const decimalsAfterSeparator =
    separatorIndex >= 0
      ? cleaned.slice(separatorIndex + 1).replace(/\D/g, "").length
      : 0;
  const hasBothSeparators = lastComma >= 0 && lastDot >= 0;
  const usesDecimalSeparator =
    separatorIndex >= 0 &&
    decimalsAfterSeparator >= 1 &&
    decimalsAfterSeparator <= 2 &&
    (hasBothSeparators || separatorCount === 1);

  const integerSource = usesDecimalSeparator
    ? cleaned.slice(0, separatorIndex)
    : cleaned;
  const fractionSource = usesDecimalSeparator
    ? cleaned.slice(separatorIndex + 1)
    : "";
  const integerDigits = integerSource.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const fractionDigits = fractionSource
    .replace(/\D/g, "")
    .slice(0, 2)
    .padEnd(2, "0");

  if (!integerDigits || integerDigits.length > 12) return null;
  if (/^0+$/.test(integerDigits) && /^0*$/.test(fractionDigits)) return null;

  return `${integerDigits}.${fractionDigits || "00"}`;
}

export function obtenerSituacionFacturaProveedor(
  estado: string,
  fechaVencimientoKey: string,
  hoyKey = getDateKeyInColombia()
): SituacionFacturaProveedor {
  if (estado === ESTADO_FACTURA_PROVEEDOR.PAGADO) return "PAGADO";

  const dias = diferenciaDiasFechaProveedor(fechaVencimientoKey, hoyKey);
  if (dias < 0) return "VENCIDA";
  if (dias === 0) return "VENCE_HOY";
  if (dias <= DIAS_ANTICIPACION_AVISO_PROVEEDOR) return "PROXIMA";
  return "AL_DIA";
}

export function obtenerTipoAvisoFacturaProveedor(
  estado: string,
  fechaVencimientoKey: string,
  hoyKey = getDateKeyInColombia()
): TipoAvisoFacturaProveedor | null {
  if (estado !== ESTADO_FACTURA_PROVEEDOR.PENDIENTE) return null;

  const dias = diferenciaDiasFechaProveedor(fechaVencimientoKey, hoyKey);
  if (dias < 0) return "VENCIDA";
  if (dias === 0) return "VENCE_HOY";
  if (dias <= DIAS_ANTICIPACION_AVISO_PROVEEDOR) {
    return "PROXIMO_VENCIMIENTO";
  }

  return null;
}

export function serializarFacturaProveedor(
  factura: FacturaProveedorSerializable,
  hoyKey = getDateKeyInColombia()
) {
  const fechaVencimiento =
    databaseDateToDateKey(factura.fechaVencimiento) ?? "";
  const valorPagar = Number(factura.valorPagar.toString());

  return {
    id: factura.id,
    aliado: factura.aliado,
    factura: factura.numeroFactura,
    numeroFactura: factura.numeroFactura,
    fechaVencimiento,
    valor: valorPagar,
    valorPagar,
    estado: factura.estado as EstadoFacturaProveedorValue,
    situacion: obtenerSituacionFacturaProveedor(
      factura.estado,
      fechaVencimiento,
      hoyKey
    ),
    diasParaVencimiento: diferenciaDiasFechaProveedor(
      fechaVencimiento,
      hoyKey
    ),
    creadoPorId: factura.creadoPorId,
    creadoPorNombre: factura.creadoPorNombre,
    pagoAprobadoPorId: factura.pagoAprobadoPorId,
    pagoAprobadoPorNombre: factura.pagoAprobadoPorNombre,
    pagoAprobadoEn: fechaIso(factura.pagoAprobadoEn),
    createdAt: fechaIso(factura.createdAt),
    updatedAt: fechaIso(factura.updatedAt),
  };
}

export function resumirFacturasProveedor(
  facturas: FacturaProveedorSerializada[]
) {
  return facturas.reduce(
    (resumen, factura) => {
      resumen.total += 1;

      if (factura.estado === ESTADO_FACTURA_PROVEEDOR.PAGADO) {
        resumen.pagadas += 1;
        resumen.valorPagado += factura.valorPagar;
        return resumen;
      }

      resumen.pendientes += 1;
      resumen.valorPendiente += factura.valorPagar;

      if (factura.situacion === "VENCIDA") {
        resumen.vencidas += 1;
        resumen.valorVencido += factura.valorPagar;
      } else if (
        factura.situacion === "VENCE_HOY" ||
        factura.situacion === "PROXIMA"
      ) {
        resumen.proximas += 1;
      }

      return resumen;
    },
    {
      total: 0,
      pendientes: 0,
      pagadas: 0,
      vencidas: 0,
      proximas: 0,
      valorPendiente: 0,
      valorPagado: 0,
      valorVencido: 0,
    }
  );
}

export function validarNuevaFacturaProveedor(
  body: Record<string, unknown>
) {
  const aliado = normalizarTextoProveedor(body.aliado);
  const numeroFactura = normalizarTextoProveedor(
    body.numeroFactura ?? body.factura
  );
  const fecha = parseFechaVencimientoProveedor(
    body.fechaVencimiento ?? body.vencimiento
  );
  const valorPagar = parseValorPagarProveedor(
    body.valorPagar ?? body.valor
  );

  if (!aliado) {
    return { ok: false as const, error: "El aliado es obligatorio" };
  }
  if (aliado.length > 160) {
    return {
      ok: false as const,
      error: "El aliado no puede superar 160 caracteres",
    };
  }
  if (!numeroFactura) {
    return {
      ok: false as const,
      error: "La factura es obligatoria",
    };
  }
  if (numeroFactura.length > 120) {
    return {
      ok: false as const,
      error: "La factura no puede superar 120 caracteres",
    };
  }
  if (!fecha) {
    return {
      ok: false as const,
      error: "La fecha de vencimiento no es valida",
    };
  }
  if (!valorPagar) {
    return {
      ok: false as const,
      error: "El valor a pagar debe ser mayor que cero",
    };
  }

  return {
    ok: true as const,
    data: {
      aliado,
      aliadoNormalizado: normalizarClaveProveedor(aliado),
      numeroFactura,
      numeroFacturaNormalizado:
        normalizarNumeroFacturaProveedor(numeroFactura),
      fechaVencimiento: fecha.date,
      fechaVencimientoKey: fecha.key,
      valorPagar,
    },
  };
}

export function formatoPesosProveedor(value: unknown) {
  const number = Number(value || 0);
  return `$ ${Number.isFinite(number) ? number.toLocaleString("es-CO") : "0"}`;
}
