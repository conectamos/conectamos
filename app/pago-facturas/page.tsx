import { redirect } from "next/navigation";
import { esAdministradorCentral } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import { getTodayBogotaDateKey } from "@/lib/ventas-utils";
import InvoicePaymentsWorkspace from "./workspace";

export default async function InvoicePaymentsPage() {
  const session = await requireSessionPage();
  if (!esAdministradorCentral(session)) redirect("/dashboard");

  return <InvoicePaymentsWorkspace today={getTodayBogotaDateKey()} userName={session.perfilNombre || session.nombre || session.usuario} />;
}
