import { esAdministradorCentral, normalizarPerfilTipo } from "@/lib/access-control";

export function puedeEliminarEntidadesCentrales(user: { rolNombre?: unknown; perfilTipo?: unknown } | null | undefined) {
  return esAdministradorCentral(user);
}

export function puedeEliminarPerfilComercial(tipo: unknown) {
  return ["VENDEDOR", "APOYO_OPERATIVO", "SUPERVISOR_TIENDA"].includes(normalizarPerfilTipo(tipo));
}
