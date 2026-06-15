import { redirect } from "next/navigation";
import { requireVendorPage } from "@/lib/page-access";
import { esPerfilRegistroVenta } from "@/lib/access-control";
import BuscarRegistroWorkspace from "./workspace";

export default async function BuscarRegistroPage() {
  const session = await requireVendorPage();

  if (esPerfilRegistroVenta(session.perfilTipo)) {
    redirect("/vendedor/registros");
  }

  return (
    <BuscarRegistroWorkspace
      session={{
        nombre: session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
        rolNombre: session.rolNombre ?? "USUARIO",
        perfilNombre: session.perfilNombre ?? session.nombre,
        perfilTipoLabel: session.perfilTipoLabel ?? session.rolNombre ?? "Vendedor",
      }}
    />
  );
}
