import { redirect } from "next/navigation";
import { esRolAdmin } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import { getVendorWelcomeMessage } from "@/lib/vendor-welcome-message";
import MensajeVendedorWorkspace from "./workspace";

export default async function MensajeVendedorPage() {
  const session = await requireSessionPage();

  if (!esRolAdmin(session.rolNombre) || session.perfilId) {
    redirect("/dashboard");
  }

  const mensaje = await getVendorWelcomeMessage();

  return <MensajeVendedorWorkspace mensajeInicial={mensaje} />;
}
