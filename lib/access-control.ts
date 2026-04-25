export function normalizarRolNombre(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

export function normalizarPerfilTipo(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

export function esRolAdmin(rolNombre: unknown) {
  return normalizarRolNombre(rolNombre) === "ADMIN";
}

export function esPerfilAdministrador(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "ADMINISTRADOR";
}

export function esPerfilSupervisor(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "SUPERVISOR_TIENDA";
}

export function esPerfilFacturador(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "FACTURADOR";
}

export function esPerfilVendedor(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "VENDEDOR";
}

export function puedeAccederPanelVendedor(
  perfilTipo: unknown,
  rolNombre: unknown
) {
  return (
    esPerfilVendedor(perfilTipo) ||
    esPerfilSupervisor(perfilTipo) ||
    esPerfilAdministrador(perfilTipo) ||
    esRolAdmin(rolNombre)
  );
}

export function puedeAccederPanelFacturador(
  perfilTipo: unknown,
  rolNombre: unknown
) {
  return (
    esPerfilFacturador(perfilTipo) ||
    esPerfilAdministrador(perfilTipo) ||
    esRolAdmin(rolNombre)
  );
}
