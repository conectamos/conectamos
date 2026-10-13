import { esRolAdmin, puedeAccederModulosOperativos } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import CierreWorkspace from "./workspace";

export default async function CierrePage() {
  const session = await requireSessionPage();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  return <CierreWorkspace
    today={today}
    user={{
      name: session.perfilNombre || session.nombre || session.usuario,
      sedeId: session.sedeId,
      sedeName: session.sedeNombre,
      isAdmin: esRolAdmin(session.rolNombre),
      operational: puedeAccederModulosOperativos(session.perfilTipo),
    }}
  />;
}
