import { redirect } from "next/navigation";
import { requireVendorPage } from "@/lib/page-access";
import { esPerfilRegistroVenta } from "@/lib/access-control";
import { getTodayBogotaDateKey } from "@/lib/ventas-utils";
import { shiftDateKey } from "@/lib/credit-date-utils";
import InconsistenciasCreditosWorkspace from "./workspace";

export default async function InconsistenciasCreditosPage() {
  const session = await requireVendorPage();

  if (esPerfilRegistroVenta(session.perfilTipo)) {
    redirect("/vendedor/registros");
  }

  const fechaHoy = getTodayBogotaDateKey();

  return (
    <InconsistenciasCreditosWorkspace
      fechaHoy={fechaHoy}
      fechaAyer={shiftDateKey(fechaHoy, -1)}
      session={{
        nombre: session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
        rolNombre: session.rolNombre ?? "USUARIO",
        perfilNombre: session.perfilNombre ?? session.nombre,
        perfilTipoLabel:
          session.perfilTipoLabel ?? session.rolNombre ?? "Supervisor",
      }}
    />
  );
}
