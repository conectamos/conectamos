import { esPerfilAdministrador, esRolAdmin, normalizarPerfilTipo } from "@/lib/access-control";

export function puedeEliminarEntidadesCentrales(user: { rolNombre?: unknown; perfilTipo?: unknown } | null | undefined) {
  if (!user || !esRolAdmin(user.rolNombre)) return false;
  return !normalizarPerfilTipo(user.perfilTipo) || esPerfilAdministrador(user.perfilTipo);
}

export function puedeEliminarPerfilComercial(tipo: unknown) {
  return ["VENDEDOR", "APOYO_OPERATIVO", "SUPERVISOR_TIENDA"].includes(normalizarPerfilTipo(tipo));
}
