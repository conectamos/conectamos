import { redirect } from "next/navigation";
import { requireVendorPage } from "@/lib/page-access";
import { puedeConsultarExtensionesPayJoy, puedeGestionarExtensionesPayJoy } from "@/lib/payjoy-extensions-access";
import PayJoyExtensionsWorkspace from "./workspace";

export default async function PayJoyExtensionsPage() {
  const session = await requireVendorPage();
  if (!puedeConsultarExtensionesPayJoy(session)) redirect("/dashboard");

  return <PayJoyExtensionsWorkspace
    canManage={puedeGestionarExtensionesPayJoy(session)}
    session={{ nombre: session.perfilNombre || session.nombre, sedeNombre: session.sedeNombre }}
  />;
}
