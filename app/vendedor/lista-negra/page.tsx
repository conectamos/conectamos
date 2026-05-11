import { esPerfilAdministrador, esRolAdmin } from "@/lib/access-control";
import { requireVendorPage } from "@/lib/page-access";
import ListaNegraWorkspace from "./workspace";

export default async function ListaNegraPage() {
  const session = await requireVendorPage();
  const puedeAdministrar =
    esRolAdmin(session.rolNombre) || esPerfilAdministrador(session.perfilTipo);

  return (
    <ListaNegraWorkspace
      puedeAdministrar={puedeAdministrar}
      session={{
        perfilNombre: session.perfilNombre ?? session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
      }}
    />
  );
}
