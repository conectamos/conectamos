import FinancialAccessGate from "../financiero/_components/financial-access-gate";
import { getFinancialAccessState } from "@/lib/financial-access";
import { requireNonVendorPage } from "@/lib/page-access";

export default async function DashboardAnaliticoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNonVendorPage();

  const access = await getFinancialAccessState({
    allowAdminBypass: false,
  });

  if (!access.user) {
    return (
      <div className="min-h-screen bg-slate-100 px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-3xl font-black text-slate-950">
            Panel analitico
          </h1>
          <p className="mt-3 text-slate-600">
            Debes iniciar sesi&oacute;n para acceder al panel analitico.
          </p>
        </div>
      </div>
    );
  }

  if (!access.authorized) {
    return (
      <FinancialAccessGate
        actionPath="/api/dashboard/analitico/acceso"
        badgeLabel="Analitico"
        claveAsignada={Boolean(access.sede?.claveAsignada)}
        claveLabel="Clave de la sede"
        missingMessage={`El administrador debe asignar la clave de ${access.sede?.nombre ?? access.user.sedeNombre} para habilitar el panel analitico.`}
        panelNombre="panel analitico"
        sedeNombre={access.sede?.nombre ?? access.user.sedeNombre}
        submitLabel="Ingresar al panel analitico"
        tone="teal"
      />
    );
  }

  return children;
}
