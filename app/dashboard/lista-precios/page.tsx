import { redirect } from "next/navigation";
import { esRolAdministrativo } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import ListaPreciosAdminWorkspace from "./workspace";

export default async function ListaPreciosAdminPage() {
  const session = await requireSessionPage();

  if (!esRolAdministrativo(session.rolNombre)) {
    redirect("/dashboard");
  }

  return <ListaPreciosAdminWorkspace />;
}
