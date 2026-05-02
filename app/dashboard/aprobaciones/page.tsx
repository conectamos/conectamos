import { requireSessionPage } from "@/lib/page-access";
import AprobacionesWorkspace from "./workspace";

export default async function DashboardAprobacionesPage() {
  const session = await requireSessionPage();

  return (
    <AprobacionesWorkspace
      session={{
        nombre: session.nombre,
        sedeNombre: session.sedeNombre ?? "Tu sede",
        rolNombre: session.rolNombre ?? "USUARIO",
        perfilNombre: session.perfilNombre ?? session.nombre,
        perfilTipoLabel: session.perfilTipoLabel ?? session.rolNombre ?? "Usuario",
      }}
    />
  );
}
