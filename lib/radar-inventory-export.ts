export type PrincipalWarehouseAvailabilityRow = {
  referencia: string;
  cantidad: number;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function buildPrincipalWarehouseAvailability(
  items: Array<{ referencia: string | null | undefined }>,
  search = ""
): PrincipalWarehouseAvailabilityRow[] {
  const quantities = new Map<string, number>();

  for (const item of items) {
    const referencia = normalizeText(item.referencia) || "SIN REFERENCIA";
    quantities.set(referencia, (quantities.get(referencia) ?? 0) + 1);
  }

  const filter = normalizeText(search);

  return Array.from(quantities, ([referencia, cantidad]) => ({
    referencia,
    cantidad,
  }))
    .filter((item) => !filter || item.referencia.includes(filter))
    .sort((a, b) => {
      if (b.cantidad !== a.cantidad) {
        return b.cantidad - a.cantidad;
      }

      return a.referencia.localeCompare(b.referencia, "es");
    });
}
