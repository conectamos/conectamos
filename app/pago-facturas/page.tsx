import { redirect } from "next/navigation";
import { esAdministradorCentral } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import { getTodayBogotaDateKey } from "@/lib/ventas-utils";
import InvoicePaymentsWorkspace from "./workspace";
import InvoiceDueNotifications from "@/app/_components/invoice-due-notifications";

export default async function InvoicePaymentsPage() {
  const session = await requireSessionPage();
  if (!esAdministradorCentral(session)) redirect("/dashboard");

  return <><InvoiceDueNotifications userKey={`${session.id}:${session.perfilId ?? "usuario"}`} /><InvoicePaymentsWorkspace today={getTodayBogotaDateKey()} userName={session.perfilNombre || session.nombre || session.usuario} /></>;
}
