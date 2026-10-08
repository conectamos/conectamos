import { redirect } from "next/navigation";
import { esRolAdministrativo } from "@/lib/access-control";
import { BrandSalesReportError, getBrandSalesReport } from "@/lib/brand-sales-report";
import { requireSessionPage } from "@/lib/page-access";
import BrandsReport from "./brands-report";

export default async function TopMarcasVendidasPage({ searchParams }: {
  searchParams?: Promise<{ period?: string | string[]; sedeId?: string | string[] }>;
}) {
  const session = await requireSessionPage();
  if (!esRolAdministrativo(session.rolNombre)) redirect("/dashboard");
  const params = await searchParams;
  if (Array.isArray(params?.sedeId)) throw new BrandSalesReportError("La cobertura seleccionada no es válida", "INVALID_SCOPE");
  const { resumen, coberturas, coberturaAplicada, detalles } = await getBrandSalesReport(session, {
    period: typeof params?.period === "string" ? params.period : null,
    sedeId: params?.sedeId,
  });
  const sedeId = coberturaAplicada.sedeId === null ? "TODAS" : String(coberturaAplicada.sedeId);
  return <BrandsReport key={`${resumen.periodo.key}:${sedeId}`}
    usuario={{ nombre: session.nombre || session.usuario || "Administrador", rolNombre: session.rolNombre }}
    consulta={{ period: resumen.periodo.key, periodLabel: resumen.periodo.label, sedeId, cobertura: coberturaAplicada.nombre }}
    sedes={coberturas} ventas={resumen.ventas} marcas={resumen.topMarcasVendidas}
    referencias={resumen.referenciasVendidas} detalles={detalles} />;
}
