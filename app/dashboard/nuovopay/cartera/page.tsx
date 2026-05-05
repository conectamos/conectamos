import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { NuovoPayWorkspace } from "../page";

export default async function NuovoPayCarteraPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!["ADMIN", "AUDITOR"].includes(String(user.rolNombre || "").toUpperCase())) {
    redirect("/dashboard/nuovopay");
  }

  return <NuovoPayWorkspace panel="cartera" />;
}
