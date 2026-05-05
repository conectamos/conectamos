import { redirect } from "next/navigation";
import { esRolAdministrativo } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";

export default async function DashboardSedesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSessionPage();

  if (!esRolAdministrativo(session.rolNombre)) {
    redirect("/dashboard");
  }

  return children;
}
