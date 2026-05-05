import { redirect } from "next/navigation";
import { esRolAdministrativo } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import SeguridadAdminWorkspace from "./workspace";

export default async function SeguridadAdminPage() {
  const session = await requireSessionPage();

  if (!esRolAdministrativo(session.rolNombre) || session.perfilId) {
    redirect("/dashboard");
  }

  return (
    <SeguridadAdminWorkspace
      usuario={{
        nombre: session.nombre,
        usuario: session.usuario,
      }}
    />
  );
}
