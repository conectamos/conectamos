import { requireVendorPage } from "@/lib/page-access";
import ListaNegraWorkspace from "./workspace";

export default async function ListaNegraPage() {
  const session = await requireVendorPage();

  return (
    <ListaNegraWorkspace
      session={{
        perfilNombre: session.perfilNombre ?? session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
      }}
    />
  );
}
