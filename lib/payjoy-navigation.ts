import type { requireVendorPage } from "@/lib/page-access";
import { esPerfilApoyoOperativo, esPerfilRegistroVenta, esRolAdministrativo } from "@/lib/access-control";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";

export function payJoyNavigationFor(session: Awaited<ReturnType<typeof requireVendorPage>>): NavigationItem[] {
  const home: NavigationItem = { href: "/dashboard", icon: "home", label: "Inicio" };
  const cierre: NavigationItem = { href: "/cierre", icon: "reports", label: "CIERRE" };
  const payjoy: NavigationItem = { href: "/vendedor/payjoy/extensiones", icon: "clock", label: "Extensiones PayJoy" };

  // The selected sales profile keeps its commercial menu even when the base
  // account is administrative. Match its dashboard rather than the base role.
  if (esPerfilRegistroVenta(session.perfilTipo)) {
    return [
      home,
      cierre,
      { href: "/vendedor/registros", icon: "sales", label: esPerfilApoyoOperativo(session.perfilTipo) ? "Registrar ventas" : "Registrar venta" },
      ...(esPerfilApoyoOperativo(session.perfilTipo)
        ? [{ href: "/dashboard/radar", icon: "radar", label: "Radar" } satisfies NavigationItem]
        : []),
      { href: "/vendedor/lista-negra", icon: "warning", label: "Lista negra" },
      { href: "/vendedor/lista-precios", icon: "tag", label: "Lista de precios" },
      { href: "/vendedor/payjoy/credito", icon: "document-search", label: "Crédito PayJoy" },
      payjoy,
    ];
  }

  const administrative = esRolAdministrativo(session.rolNombre);
  if (!administrative && session.sedeSoloInventarioPorCobrar) {
    return [
      home,
      { href: "/inventario", icon: "inventory", label: "Inventario" },
      { href: "/prestamos", icon: "loans", label: "Préstamos" },
      cierre,
      { href: "/vendedor/payjoy/credito", icon: "document-search", label: "Crédito PayJoy" },
      payjoy,
    ];
  }

  return [
    home,
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    cierre,
    { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: administrative ? "/dashboard/reportes" : "/dashboard/analitico", icon: "reports", label: administrative ? "Reportes" : "Panel analítico" },
    ...(administrative
      ? [{ href: "/dashboard/sedes", icon: "settings", label: "Configuración" } satisfies NavigationItem]
      : []),
    { href: "/vendedor/payjoy/credito", icon: "document-search", label: "Crédito PayJoy" },
    payjoy,
  ];
}

