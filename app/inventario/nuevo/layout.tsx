import { redirect } from "next/navigation";
import { requireNonVendorPage } from "@/lib/page-access";
import { consultarPermisoIngresoInventario } from "@/lib/inventory-intake-policy";

export default async function NuevoInventarioLayout({ children }: { children: React.ReactNode }) {
  const user = await requireNonVendorPage();
  if (!(await consultarPermisoIngresoInventario(user))) redirect("/inventario");
  return children;
}
