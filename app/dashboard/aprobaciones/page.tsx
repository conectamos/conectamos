import { requireNonVendorPage } from "@/lib/page-access";
import { puedeAccederPanelFacturador } from "@/lib/access-control";
import AprobacionesWorkspace from "./workspace";

export default async function DashboardAprobacionesPage() {
  const session = await requireNonVendorPage();

  return (
    <AprobacionesWorkspace
      session={{
        nombre: session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
        rolNombre: session.rolNombre ?? "USUARIO",
        perfilNombre: session.perfilNombre ?? session.nombre,
        perfilTipoLabel: session.perfilTipoLabel ?? session.rolNombre ?? "Usuario",
        puedeVerFacturacion: puedeAccederPanelFacturador(
          session.perfilTipo,
          session.rolNombre
        ),
      }}
    />
  );
}
