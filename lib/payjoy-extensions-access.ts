import { normalizarPerfilTipo, normalizarRolNombre } from "@/lib/access-control";

export type PayJoyExtensionsSession = {
  perfilTipo?: unknown;
  rolNombre?: unknown;
  perfilId?: number | null;
  sedeId?: number | null;
};

const PERFILES_CONSULTA = new Set([
  "VENDEDOR", "APOYO_OPERATIVO", "SUPERVISOR_TIENDA", "ADMINISTRADOR", "AUDITOR",
]);

function esIdValido(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function puedeConsultarExtensionesPayJoy(session: PayJoyExtensionsSession | null | undefined) {
  if (!session) return false;
  const perfil = normalizarPerfilTipo(session.perfilTipo);
  const rol = normalizarRolNombre(session.rolNombre);

  // A restricted or unknown profile must never inherit its base login's role.
  if (["BODEGA", "FACTURADOR"].includes(perfil) || ["BODEGA", "FACTURADOR"].includes(rol)) return false;
  if (perfil) return PERFILES_CONSULTA.has(perfil) && esIdValido(session.perfilId);
  if (session.perfilId !== null && session.perfilId !== undefined) return false;
  return rol === "ADMIN" || rol === "AUDITOR";
}

export function puedeGestionarExtensionesPayJoy(session: PayJoyExtensionsSession | null | undefined) {
  return puedeConsultarExtensionesPayJoy(session)
    && normalizarPerfilTipo(session?.perfilTipo) !== "AUDITOR"
    && normalizarRolNombre(session?.rolNombre) !== "AUDITOR";
}

export function scopeRegistrosExtensionesPayJoy(
  session: PayJoyExtensionsSession | null | undefined,
): { perfilVendedorId?: number; sedeId?: number } {
  const sinAcceso = { perfilVendedorId: -1, sedeId: -1 };
  if (!session || !puedeConsultarExtensionesPayJoy(session)) return sinAcceso;
  const perfil = normalizarPerfilTipo(session.perfilTipo);

  // Global access belongs to the selected administrative identity only.
  if (perfil === "ADMINISTRADOR" || perfil === "AUDITOR" || !perfil) return {};
  if (!esIdValido(session.perfilId) || !esIdValido(session.sedeId)) return sinAcceso;
  return { perfilVendedorId: session.perfilId, sedeId: session.sedeId };
}
