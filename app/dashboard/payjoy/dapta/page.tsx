import { redirect } from "next/navigation";
import { requireNonVendorPage } from "@/lib/page-access";
import { puedePrepararBorradoresPayJoyDapta } from "@/lib/payjoy-dapta-access";
import PayJoyDaptaWorkspace from "./workspace";

export default async function PayJoyDaptaPage() {
  const user = await requireNonVendorPage();
  if (!puedePrepararBorradoresPayJoyDapta(user)) redirect("/dashboard");

  return <PayJoyDaptaWorkspace user={{
    nombre: user.perfilNombre || user.nombre || user.usuario,
    rolNombre: user.rolNombre,
    sedeNombre: user.sedeNombre,
  }} />;
}
