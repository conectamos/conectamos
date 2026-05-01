export const NOMBRE_SEDE_BODEGA = "BODEGA PRINCIPAL";
export const PROVEEDOR_FINSER = "Proveedor Finser";
const PROVEEDOR_KEYWORDS = [
  "PROVEEDOR",
  "FINSER",
  "BUNQUER",
  "TECNOSUPER",
  "IPHONE ANGIE",
  "EMOVIL",
  "POLLO",
  "ANDRES",
  "EMMATECH",
  "COMUNICARIBE",
  "HOLA PLAZA",
  "CONMOVIL",
  "CORBETA",
  "OPORTUNIDADES",
];

function normalizarTexto(valor: string | null | undefined) {
  return String(valor || "").trim().toUpperCase();
}

export function normalizarEstadoFinanciero(
  estado: string | null | undefined
) {
  return normalizarTexto(estado);
}

export function esEstadoDeuda(estado: string | null | undefined) {
  return normalizarEstadoFinanciero(estado) === "DEUDA";
}

export function etiquetaSedeAcreedora(
  sedeId: number,
  sedeNombre?: string | null
) {
  const nombre = String(sedeNombre || "").trim();
  return nombre || `SEDE ${sedeId}`;
}

export function esDeudaEntreSedes(deboA: string | null | undefined) {
  const acreedor = normalizarTexto(deboA);

  if (!acreedor) {
    return false;
  }

  return !esDeudaProveedor(acreedor);
}

export function esDeudaProveedor(deboA: string | null | undefined) {
  const acreedor = normalizarTexto(deboA);

  if (!acreedor) {
    return false;
  }

  return PROVEEDOR_KEYWORDS.some((keyword) => acreedor.includes(keyword));
}

export function resolverFinanzasDestinoPrestamo(params: {
  estadoFinanciero: string | null | undefined;
  deboA: string | null | undefined;
  sedeOrigenId: number;
  sedeOrigenNombre?: string | null | undefined;
}) {
  if (esEstadoDeuda(params.estadoFinanciero)) {
    const acreedorActual = String(params.deboA || "").trim();

    return {
      estadoFinanciero: "DEUDA",
      deboA: esDeudaEntreSedes(acreedorActual)
        ? etiquetaSedeAcreedora(params.sedeOrigenId, params.sedeOrigenNombre)
        : acreedorActual ||
          etiquetaSedeAcreedora(params.sedeOrigenId, params.sedeOrigenNombre),
    };
  }

  return {
    estadoFinanciero: "DEUDA",
    deboA: etiquetaSedeAcreedora(params.sedeOrigenId, params.sedeOrigenNombre),
  };
}
