import { redirect } from "next/navigation";
import { requireVendorPage } from "@/lib/page-access";
import { puedeConsultarExtensionesPayJoy } from "@/lib/payjoy-extensions-access";
import { payJoyNavigationFor } from "@/lib/payjoy-navigation";
import PayJoyFollowUpWorkspace from "./workspace";

export default async function PayJoyFollowUpPage({ searchParams }: {
  searchParams: Promise<{ identifier?: string | string[]; deviceTag?: string | string[] }>;
}) {
  const session = await requireVendorPage();
  if (!puedeConsultarExtensionesPayJoy(session)) redirect("/dashboard");
  const query = await searchParams;
  const value = typeof query.identifier === "string" ? query.identifier : typeof query.deviceTag === "string" ? query.deviceTag : "";
  const normalized = value.trim().toUpperCase();
  const identifier = /^(?:D[A-Z0-9]{5,31}|\d{15,16})$/.test(normalized) ? normalized : "";
  return <PayJoyFollowUpWorkspace
    key={identifier}
    initialIdentifier={identifier}
    navigation={payJoyNavigationFor(session)}
    session={{ nombre: session.perfilNombre || session.nombre, sedeNombre: session.sedeNombre, roleLabel: session.perfilTipoLabel || session.rolNombre }}
  />;
}
