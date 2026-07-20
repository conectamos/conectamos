"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";

type SessionProps = {
  perfilNombre: string;
  sedeNombre: string;
};

type PriceListItem = {
  id: number;
  marca: string;
  referencia: string;
  precio: number;
  updatedAt: string;
};

function formatoPesos(value: number) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
}

function normalizarBusqueda(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatoFecha(value: string | undefined) {
  if (!value) {
    return "Sin actualización";
  }

  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ListaPreciosVendedorWorkspace({
  session,
}: {
  session: SessionProps;
}) {
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargarLista = async () => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/lista-precios", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo cargar la lista de precios");
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMensaje("Error cargando lista de precios");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarLista();
  }, []);

  const itemsFiltrados = useMemo(() => {
    const filtro = normalizarBusqueda(busqueda.trim());

    if (!filtro) {
      return items;
    }

    return items.filter((item) =>
      normalizarBusqueda(`${item.marca} ${item.referencia}`).includes(filtro)
    );
  }, [busqueda, items]);

  const marcasDisponibles = new Set(items.map((item) => item.marca)).size;
  const ultimaActualizacion = items.reduce<string | undefined>(
    (ultima, item) => {
      if (!ultima || new Date(item.updatedAt) > new Date(ultima)) {
        return item.updatedAt;
      }

      return ultima;
    },
    undefined
  );
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/vendedor/registros", icon: "sales", label: "Registrar venta" },
    {
      href: "/vendedor/registros/buscar",
      icon: "search",
      label: "Buscar registro",
    },
    {
      href: "/vendedor/lista-negra",
      icon: "warning",
      label: "Lista negra",
    },
    {
      href: "/vendedor/lista-precios",
      icon: "reports",
      label: "Lista de precios",
    },
    { href: "/dashboard/radar", icon: "inventory", label: "Radar" },
  ];
  const iniciales = session.perfilNombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950 [&_button]:uppercase">
      <DashboardSidebar
        activeHref="/vendedor/lista-precios"
        coverageLabel={session.sedeNombre}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <Link href="/dashboard" className="transition hover:text-[#e30613]">
                  Inicio
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-600">Consulta comercial</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Lista de precios
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Consulta las referencias y precios vigentes definidos por administración.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                  Solo consulta
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                  Cobertura: {session.sedeNombre}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/vendedor/registros"
                className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-red-700"
              >
                Registrar venta
              </Link>
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {iniciales || "US"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[170px] truncate text-sm font-bold">
                    {session.perfilNombre}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {session.sedeNombre}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] uppercase" />
            </div>
          </header>

          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: "catalog" as const,
                label: "Referencias activas",
                value: items.length,
                detail: "Productos disponibles en el catálogo.",
                tone: "bg-red-50 text-red-600",
              },
              {
                icon: "inventory" as const,
                label: "Marcas disponibles",
                value: marcasDisponibles,
                detail: "Marcas con precios configurados.",
                tone: "bg-violet-50 text-violet-600",
              },
              {
                icon: "calendar" as const,
                label: "Última actualización",
                value: formatoFecha(ultimaActualizacion),
                detail: "Cambio más reciente del catálogo.",
                tone: "bg-blue-50 text-blue-600",
              },
            ].map((metric) => (
              <article
                key={metric.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
              >
                <div className="flex items-start gap-4">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                    <DashboardIcon name={metric.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-600">{metric.label}</p>
                    <p className="mt-1 break-words text-2xl font-black leading-tight tracking-tight">
                      {metric.value}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{metric.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <DashboardIcon name="search" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                    Búsqueda rápida
                  </p>
                  <h2 className="mt-1 text-xl font-black">Encuentra un equipo</h2>
                </div>
              </div>
              <label className="relative block w-full lg:max-w-xl">
                <DashboardIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Buscar marca o referencia..."
                  className="min-h-[50px] w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                />
              </label>
            </div>
          </section>

          {mensaje && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
              {mensaje}
            </div>
          )}

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                  Catálogo vigente
                </p>
                <h2 className="mt-1 text-xl font-black">Precios de venta</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Consulta informativa; los valores son administrados desde configuración.
                </p>
              </div>
              <span className="w-fit rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                {itemsFiltrados.length} resultados
              </span>
            </div>

            {cargando ? (
              <div className="px-5 py-14 text-center text-sm font-semibold text-slate-500">
                Cargando lista de precios...
              </div>
            ) : itemsFiltrados.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <DashboardIcon name="search" className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-500">
                  No hay precios que coincidan con la búsqueda.
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[720px]">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        <th className="w-[28%] px-6 py-4">Marca</th>
                        <th className="px-6 py-4">Referencia</th>
                        <th className="w-[200px] px-6 py-4 text-right">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itemsFiltrados.map((item) => (
                        <tr key={item.id} className="transition hover:bg-slate-50/80">
                          <td className="px-6 py-4 text-sm font-black uppercase text-slate-950">
                            {item.marca}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-slate-700">
                            {item.referencia}
                          </td>
                          <td className="px-6 py-4 text-right text-base font-black text-slate-950">
                            {formatoPesos(item.precio)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-slate-100 md:hidden">
                  {itemsFiltrados.map((item) => (
                    <article key={item.id} className="px-5 py-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-600">
                            {item.marca}
                          </p>
                          <h3 className="mt-1 break-words text-sm font-bold text-slate-800">
                            {item.referencia}
                          </h3>
                        </div>
                        <p className="shrink-0 text-base font-black text-slate-950">
                          {formatoPesos(item.precio)}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
