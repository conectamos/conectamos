export function normalizarRolNombre(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

export function normalizarPerfilTipo(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

export function esRolAdmin(rolNombre: unknown) {
  return normalizarRolNombre(rolNombre) === "ADMIN";
}

export function esRolAuditor(rolNombre: unknown) {
  return normalizarRolNombre(rolNombre) === "AUDITOR";
}

export function esRolAdministrativo(rolNombre: unknown) {
  return esRolAdmin(rolNombre) || esRolAuditor(rolNombre);
}

export function puedeEliminarRegistros(rolNombre: unknown) {
  return esRolAdmin(rolNombre);
}

export function esPerfilAdministrador(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "ADMINISTRADOR";
}

export function esPerfilAuditor(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "AUDITOR";
}

export function esPerfilAdministrativo(perfilTipo: unknown) {
  return esPerfilAdministrador(perfilTipo) || esPerfilAuditor(perfilTipo);
}

export function esPerfilSupervisor(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "SUPERVISOR_TIENDA";
}

export function esPerfilFacturador(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "FACTURADOR";
}

export function esPerfilApoyoOperativo(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "APOYO_OPERATIVO";
}

export function esPerfilVendedor(perfilTipo: unknown) {
  return normalizarPerfilTipo(perfilTipo) === "VENDEDOR";
}

export function esPerfilRegistroVenta(perfilTipo: unknown) {
  return esPerfilVendedor(perfilTipo) || esPerfilApoyoOperativo(perfilTipo);
}

export function puedeAccederModulosOperativos(perfilTipo: unknown) {
  return !esPerfilRegistroVenta(perfilTipo) && !esPerfilFacturador(perfilTipo);
}

export function puedeAccederPanelVendedor(
  perfilTipo: unknown,
  rolNombre: unknown
) {
  return (
    esPerfilRegistroVenta(perfilTipo) ||
    esPerfilSupervisor(perfilTipo) ||
    esPerfilAdministrativo(perfilTipo) ||
    esRolAdministrativo(rolNombre)
  );
}

export function puedeAccederPanelFacturador(
  perfilTipo: unknown,
  rolNombre: unknown
) {
  return (
    esPerfilFacturador(perfilTipo) ||
    esPerfilAdministrativo(perfilTipo) ||
    esRolAdministrativo(rolNombre)
  );
}

export function puedeConsultarReporteSiigo(
  rolNombre: unknown,
  perfilTipo: unknown,
  perfilNombre?: unknown
) {
  const perfilNombreNormalizado = String(perfilNombre || "")
    .trim()
    .toUpperCase();

  return (
    esRolAdministrativo(rolNombre) ||
    esPerfilAdministrativo(perfilTipo) ||
    perfilNombreNormalizado.includes("CONTABILIDAD")
  );
}
