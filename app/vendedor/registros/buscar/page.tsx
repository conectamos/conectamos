import { redirect } from "next/navigation";
import { requireVendorPage } from "@/lib/page-access";
import { esPerfilVendedor } from "@/lib/access-control";
import BuscarRegistroWorkspace from "./workspace";

export default async function BuscarRegistroPage() {
  const session = await requireVendorPage();

  if (esPerfilVendedor(session.perfilTipo)) {
    redirect("/vendedor/registros");
  }

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
