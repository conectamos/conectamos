import { requireNonVendorPage } from "@/lib/page-access";
import VentasAprobacionesWorkspace from "./workspace";

export default async function VentasAprobacionesPage() {
  const session = await requireNonVendorPage();

  return (
    <VentasAprobacionesWorkspace
      session={{
        nombre: session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
        rolNombre: session.rolNombre ?? "",
        perfilNombre: session.perfilNombre ?? session.nombre,
        perfilTipoLabel: session.perfilTipoLabel ?? "Supervisor",
      }}
    />
  );
}
