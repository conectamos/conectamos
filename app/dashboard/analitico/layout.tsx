import FinancialAccessGate from "../financiero/_components/financial-access-gate";
import { esPerfilSupervisor } from "@/lib/access-control";
import { getFinancialAccessState } from "@/lib/financial-access";
import { requireNonVendorPage } from "@/lib/page-access";

export default async function DashboardAnaliticoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireNonVendorPage();

  if (!esPerfilSupervisor(user.perfilTipo)) {
    return children;
  }

  const access = await getFinancialAccessState({
    allowAdminBypass: false,
  });

  if (!access.authorized) {
    return (
      <FinancialAccessGate
        actionPath="/api/dashboard/analitico/acceso"
        badgeLabel="Analitico"
        claveAsignada={Boolean(access.sede?.claveAsignada)}
        claveLabel="Clave de la sede"
        missingMessage={`El administrador debe asignar la clave de ${access.sede?.nombre ?? user.sedeNombre} para habilitar el panel analitico.`}
        panelNombre="panel analitico"
        sedeNombre={access.sede?.nombre ?? user.sedeNombre}
        submitLabel="Ingresar al panel analitico"
        tone="teal"
      />
    );
  }

  return children;
}
