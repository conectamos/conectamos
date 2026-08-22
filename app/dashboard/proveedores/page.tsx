import { redirect } from "next/navigation";
import { puedeGestionarProveedores } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import ProveedoresWorkspace from "./workspace";

export default async function ProveedoresPage() {
  const session = await requireSessionPage();

  if (!puedeGestionarProveedores(session.perfilTipo, session.rolNombre)) {
    redirect("/dashboard");
  }

  return (
    <ProveedoresWorkspace
      session={{
        nombre:
          session.perfilNombre ||
          session.nombre ||
          session.usuario ||
          "Usuario",
        rol:
          session.perfilTipoLabel ||
          session.rolNombre ||
          "Operación",
        rolNombre: session.rolNombre || "",
        sedeNombre: session.sedeNombre || "Todas las sedes",
        usuario: session.usuario || "usuario",
      }}
    />
  );
}
