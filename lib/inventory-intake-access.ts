import {
  esPerfilSupervisor,
  esRolAdministrativo,
  esRolBodega,
  puedeAccederModulosOperativos,
  puedeGestionarBodegaPrincipal,
} from "@/lib/access-control";

export type UsuarioIngresoInventario = { rolNombre?: unknown; perfilTipo?: unknown };

export const INGRESO_DIRECTO_DESHABILITADO =
  "El ingreso directo está deshabilitado. Los equipos se reciben por despacho desde Bodega Principal.";

export function puedeIngresarInventarioPrincipal(user: UsuarioIngresoInventario | null | undefined) {
  return Boolean(user && puedeAccederModulosOperativos(user.perfilTipo) &&
    !esPerfilSupervisor(user.perfilTipo) && puedeGestionarBodegaPrincipal(user.rolNombre));
}

export function puedeIngresarInventarioSede(user: UsuarioIngresoInventario, habilitado = false) {
  if (!puedeAccederModulosOperativos(user.perfilTipo) || esRolBodega(user.rolNombre)) return false;

  // A selected supervisor profile never inherits the base account's broad coverage.
  return habilitado || (esRolAdministrativo(user.rolNombre) && !esPerfilSupervisor(user.perfilTipo));
}
