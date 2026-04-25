import { requireVendorPage } from "@/lib/page-access";
import VendedorRegistroWorkspace from "./workspace";

export default async function VendedorRegistrosPage() {
  const session = await requireVendorPage();

  return (
    <VendedorRegistroWorkspace
      session={{
        nombre: session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
        perfilNombre: session.perfilNombre ?? session.nombre,
        perfilTipoLabel: session.perfilTipoLabel ?? session.rolNombre ?? "Vendedor",
      }}
    />
  );
}
