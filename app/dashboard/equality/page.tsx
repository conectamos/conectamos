import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { EqualityWorkspace } from "./_components/equality-workspace";

export default async function EqualityZeroTouchPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").toUpperCase());
  const esSupervisor =
    String(user.perfilTipo || "").toUpperCase() === "SUPERVISOR_TIENDA" ||
    String(user.rolNombre || "").toUpperCase() === "SUPERVISOR";

  if (!esAdmin && !esSupervisor) {
    redirect("/dashboard");
  }

  return <EqualityWorkspace esAdmin={esAdmin} />;
}
