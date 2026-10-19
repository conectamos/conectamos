export type BodegaNavigationItem = {
  href: string;
  icon: "home" | "inventory" | "catalog" | "loans" | "radar" | "receivable";
  label: string;
};

// Shared, client-safe routes for the warehouse role. Keep logistics separate
// from collection and payment actions: the debt view is read-only.
export function getBodegaNavigation(): BodegaNavigationItem[] {
  return [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/inventario-principal", icon: "inventory", label: "Bodega principal" },
    { href: "/inventario/nuevo", icon: "catalog", label: "Ingresar equipos" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/dashboard/radar", icon: "radar", label: "Radar" },
    { href: "/dashboard#quien-me-debe", icon: "receivable", label: "Quién le debe" },
  ];
}
