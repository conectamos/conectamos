import { requireVendorPage } from "@/lib/page-access";
import BuscarRegistroWorkspace from "./workspace";

export default async function BuscarRegistroPage() {
  const session = await requireVendorPage();

  return (
    <BuscarRegistroWorkspace
      session={{
        nombre: session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
        perfilNombre: session.perfilNombre ?? session.nombre,
        perfilTipoLabel: session.perfilTipoLabel ?? session.rolNombre ?? "Vendedor",
      }}
    />
  );
}
