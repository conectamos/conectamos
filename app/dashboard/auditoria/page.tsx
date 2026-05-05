import { redirect } from "next/navigation";
import { esRolAdministrativo } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import { AuditoriaWorkspace } from "./_components/auditoria-workspace";

export default async function AuditoriaPage() {
  const session = await requireSessionPage();

  if (!esRolAdministrativo(session.rolNombre)) {
    redirect("/dashboard");
  }

  return <AuditoriaWorkspace />;
}
