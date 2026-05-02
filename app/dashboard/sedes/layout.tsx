import { redirect } from "next/navigation";
import { esRolAdmin } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";

export default async function DashboardSedesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSessionPage();

  if (!esRolAdmin(session.rolNombre)) {
    redirect("/dashboard");
  }

  return children;
}
