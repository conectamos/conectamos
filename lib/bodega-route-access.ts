// BODEGA is a logistics role, never an administrative or financial role.
// Keep this allowlist explicit: new modules must not inherit warehouse access.
export const BODEGA_HOME_PATH = "/dashboard";

const warehousePages = new Set([
  "/",
  BODEGA_HOME_PATH,
  "/inventario-principal",
  "/dashboard/radar",
  "/inventario/nuevo",
  "/inventario/historial",
  "/prestamos",
  "/prestamos/nuevo",
]);

const warehouseApiMethods: Record<string, readonly string[]> = {
  "/api/login": ["POST"],
  "/api/login/perfil": ["POST"],
  "/api/login/perfil/cambiar-pin": ["POST"],
  "/api/logout": ["POST"],
  "/api/session": ["GET"],
  "/api/session/heartbeat": ["POST"],
  "/api/financiero/acceso": ["DELETE"], // Shared logout of the financial cookie only.
  "/api/sedes": ["GET"],
  "/api/dashboard/bodega": ["GET"],
  "/api/dashboard/radar/export": ["GET"],
  "/api/inventario-principal": ["GET", "POST"],
  "/api/inventario-principal/buscar": ["POST"],
  "/api/inventario-principal/actualizar": ["PATCH"],
  "/api/inventario-principal/enviar-a-sede": ["POST"],
  "/api/inventario-principal/restaurar-bodega": ["POST"],
  "/api/inventario-principal/referencias": ["GET", "POST"],
  "/api/inventario-principal/distribuidores": ["GET", "POST", "DELETE"],
  "/api/inventario/revisar": ["POST"],
  "/api/prestamos": ["GET", "POST"],
  "/api/prestamos/buscar-imei": ["POST"],
  "/api/prestamos/crear-desde-inventario": ["POST"],
  "/api/prestamos/pendientes-destino": ["GET"],
  "/api/prestamos/aprobar": ["POST"],
  "/api/prestamos/cerrar-pendiente": ["POST"],
  "/api/prestamos/solicitar-devolucion": ["POST"],
  "/api/prestamos/rechazar-devolucion": ["POST"],
  "/api/prestamos/devolver": ["POST"],
};

export function puedeAccederRutaBodega(pathname: string, method = "GET") {
  const path = pathname.replace(/\/+$/, "") || "/";
  const verb = method.toUpperCase();
  if (path.startsWith("/api/")) {
    const methods = warehouseApiMethods[path];
    return Boolean(methods?.includes(verb === "HEAD" ? "GET" : verb));
  }
  return (verb === "GET" || verb === "HEAD") && warehousePages.has(path);
}

export function esRutaPublicaBodega(pathname: string) {
  // These assets are public to unauthenticated visitors too. API paths always
  // pass through authorization, even when the URL ends in a file extension.
  return !pathname.startsWith("/api/") && (
    pathname.startsWith("/_next/") ||
    /\.(?:png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|map|webmanifest)$/i.test(pathname)
  );
}
