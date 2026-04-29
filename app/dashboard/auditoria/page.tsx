import { redirect } from "next/navigation";
import { esRolAdmin } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import { AuditoriaWorkspace } from "./_components/auditoria-workspace";

export default async function AuditoriaPage() {
  const session = await requireSessionPage();

  if (!esRolAdmin(session.rolNombre)) {
    redirect("/dashboard");
  }

  return <AuditoriaWorkspace />;
}
