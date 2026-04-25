import { requireFacturadorPage } from "@/lib/page-access";
import FacturadorRegistrosWorkspace from "@/app/facturador/registros/workspace";

export default async function DashboardRegistrosPage() {
  const session = await requireFacturadorPage();

  return (
    <FacturadorRegistrosWorkspace
      session={{
        nombre: session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
        rolNombre: session.rolNombre ?? "USUARIO",
        perfilNombre: session.perfilNombre ?? session.nombre,
        perfilTipoLabel:
          session.perfilTipoLabel ?? session.rolNombre ?? "Administrador",
      }}
    />
  );
}
