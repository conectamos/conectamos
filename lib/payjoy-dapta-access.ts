import { normalizarPerfilTipo, normalizarRolNombre } from "@/lib/access-control";

type Session = { perfilTipo?: unknown; rolNombre?: unknown; perfilId?: number | null };

/** A selected profile cannot inherit administrative access from its login. */
export function puedePrepararBorradoresPayJoyDapta(session: Session | null | undefined): boolean {
  if (!session) return false;
  const profile = normalizarPerfilTipo(session.perfilTipo);
  const role = normalizarRolNombre(session.rolNombre);
  if (["BODEGA", "FACTURADOR"].includes(role)) return false;
  if (profile) return ["ADMINISTRADOR", "AUDITOR"].includes(profile)
    && typeof session.perfilId === "number" && Number.isSafeInteger(session.perfilId) && session.perfilId > 0;
  if (session.perfilId != null) return false;
  return role === "ADMIN" || role === "AUDITOR";
}
