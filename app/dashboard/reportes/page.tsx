import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { esRolAdministrativo } from "@/lib/access-control";
import { getMonthlyReportsView } from "@/lib/monthly-reports-report";
import ReportsDashboard from "./reports-dashboard";

export default async function ReportesPage({ searchParams }: {
  searchParams?: Promise<{ period?: string; sedeId?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) return <div className="p-10">No autenticado</div>;
  if (!esRolAdministrativo(session.rolNombre)) redirect("/dashboard");
  const params = await searchParams;
  const view = await getMonthlyReportsView(session, params);
  return <ReportsDashboard key={`${view.consulta.period}:${view.consulta.sedeId}`} view={view} />;
}
