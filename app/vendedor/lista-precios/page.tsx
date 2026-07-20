import { requireVendorPage } from "@/lib/page-access";
import ListaPreciosVendedorWorkspace from "./workspace";

export default async function ListaPreciosVendedorPage() {
  const session = await requireVendorPage();

  return (
    <ListaPreciosVendedorWorkspace
      session={{
        perfilNombre: session.perfilNombre ?? session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
      }}
    />
  );
}
