import { redirect } from "next/navigation";
import { requireVendorPage } from "@/lib/page-access";
import { puedeConsultarExtensionesPayJoy, puedeGestionarExtensionesPayJoy } from "@/lib/payjoy-extensions-access";
import { payJoyNavigationFor } from "@/lib/payjoy-navigation";
import PayJoyExtensionsWorkspace from "./workspace";

export default async function PayJoyExtensionsPage({ searchParams }: { searchParams: Promise<{ deviceTag?: string | string[] }> }) {
  const session = await requireVendorPage();
  if (!puedeConsultarExtensionesPayJoy(session)) redirect("/dashboard");
  const query = await searchParams;
  const tag = typeof query.deviceTag === "string" ? query.deviceTag.trim().toUpperCase() : "";
  const initialDeviceTag = /^D[A-Z0-9]{5,31}$/.test(tag) ? tag : "";

  return <PayJoyExtensionsWorkspace
    key={initialDeviceTag}
    initialDeviceTag={initialDeviceTag}
    canManage={puedeGestionarExtensionesPayJoy(session)}
    navigation={payJoyNavigationFor(session)}
    session={{ nombre: session.perfilNombre || session.nombre, sedeNombre: session.sedeNombre, roleLabel: session.perfilTipoLabel || session.rolNombre }}
  />;
}
