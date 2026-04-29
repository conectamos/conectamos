import { redirect } from "next/navigation";
import { esRolAdmin } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import ListaPreciosAdminWorkspace from "./workspace";

export default async function ListaPreciosAdminPage() {
  const session = await requireSessionPage();

  if (!esRolAdmin(session.rolNombre)) {
    redirect("/dashboard");
  }

  return <ListaPreciosAdminWorkspace />;
}
