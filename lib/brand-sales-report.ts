import { esRolAdministrativo } from "@/lib/access-control";
import { getMonthlyCommercialSummary } from "@/lib/dashboard-commercial-summary";
import prisma from "@/lib/prisma";

export class BrandSalesReportError extends Error {
  constructor(
    message: string,
    public readonly code: "FORBIDDEN" | "INVALID_SCOPE"
  ) {
    super(message);
    this.name = "BrandSalesReportError";
  }
}

function parseSedeScope(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "" || value === "TODAS") return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new BrandSalesReportError("La cobertura seleccionada no es válida", "INVALID_SCOPE");
  }
  if (typeof value === "string" && !/^\d+$/.test(value)) {
    throw new BrandSalesReportError("La cobertura seleccionada no es válida", "INVALID_SCOPE");
  }
  const sedeId = Number(value);
  if (!Number.isSafeInteger(sedeId) || sedeId <= 0) {
    throw new BrandSalesReportError("La cobertura seleccionada no es válida", "INVALID_SCOPE");
  }
  return sedeId;
}

export async function getBrandSalesReport(
  session: { rolNombre: unknown } | null,
  options?: { period?: string | null; sedeId?: string | number | null }
) {
  // La página original permite exclusivamente los roles ADMIN y AUDITOR.
  if (!session || !esRolAdministrativo(session.rolNombre)) {
    throw new BrandSalesReportError("No tienes acceso al reporte de marcas", "FORBIDDEN");
  }
  const sedeId = parseSedeScope(options?.sedeId);
  const coberturas = await prisma.sede.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  const sedeSeleccionada = sedeId === null ? null : coberturas.find((sede) => sede.id === sedeId);
  if (sedeId !== null && !sedeSeleccionada) {
    throw new BrandSalesReportError("La cobertura seleccionada no existe o no está autorizada", "INVALID_SCOPE");
  }
  const resumen = await getMonthlyCommercialSummary({
    period: options?.period || null,
    sedeId,
    sedesDetalleMarcas: sedeSeleccionada ? [sedeSeleccionada] : coberturas,
  });

  return {
    resumen,
    coberturas,
    coberturaAplicada: { sedeId, nombre: sedeSeleccionada?.nombre ?? "Todas las sedes" },
    detalles: resumen.detalleMarcasPorSede,
  };
}
