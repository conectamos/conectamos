import { redirect } from "next/navigation";
import { requireVendorPage } from "@/lib/page-access";
import { puedeConsultarExtensionesPayJoy } from "@/lib/payjoy-extensions-access";

export default async function PayJoyCreditPage({ searchParams }: {
  searchParams: Promise<{ identifier?: string | string[]; deviceTag?: string | string[]; tab?: string | string[] }>;
}) {
  const session = await requireVendorPage();
  if (!puedeConsultarExtensionesPayJoy(session)) redirect("/dashboard");
  const query = await searchParams;
  const value = typeof query.deviceTag === "string" ? query.deviceTag : typeof query.identifier === "string" ? query.identifier : "";
  const normalized = value.trim().toUpperCase();
  const deviceTag = /^D[A-Z0-9]{5,31}$/.test(normalized) ? normalized : "";
  redirect(`/vendedor/payjoy/extensiones${deviceTag ? `?deviceTag=${encodeURIComponent(deviceTag)}` : ""}`);
}
