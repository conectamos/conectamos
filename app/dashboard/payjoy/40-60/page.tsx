import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import PayJoyFortySixtyWorkspace from "../_components/payjoy-40-60-workspace";

export default async function PayJoyFortySixtyPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").toUpperCase())) {
    redirect("/dashboard");
  }

  return (
    <PayJoyFortySixtyWorkspace
      puedeEliminar={String(user.rolNombre || "").toUpperCase() === "ADMIN"}
    />
  );
}
