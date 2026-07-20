"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import { useLiveRefresh } from "@/lib/use-live-refresh";

type Prestamo = {
  id: number;
  imei: string;
  referencia: string;
  color: string | null;
  costo: number;
  sedeOrigenId: number;
  sedeDestinoId: number;
  sedeOrigenNombre?: string;
  sedeDestinoNombre?: string;
  estado: string;
};

type SessionUser = {
  id: number;
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre: string;
  rolId: number;
  rolNombre: string;
};

type Sede = {
  id: number;
  nombre: string;
};

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function MetricCard({
  detail,
  icon,
  iconClass,
  label,
  value,
  valueClass = "text-slate-950",
}: {
  detail: string;
  icon: DashboardIconName;
  iconClass: string;
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <article className="flex min-h-[140px] items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        <DashboardIcon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          {label}
        </p>
        <p className={`mt-2 break-words text-[28px] font-black leading-tight tracking-tight ${valueClass}`}>
          {value}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

export default function AlertasPrestamosPage() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(
    user?.rolNombre?.toUpperCase() || ""
  );
  const mensajeEsError = mensaje.trim().toUpperCase().startsWith("ERROR");

  const cargarUsuario = useCallback(async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setUser(data);
      }
    } catch {}
  }, []);

  const cargarSedes = useCallback(async () => {
    try {
      const res = await fetch("/api/sedes", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setSedes(Array.isArray(data) ? data : []);
      }
    } catch {}
  }, []);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      const params = new URLSearchParams();

      if (esAdmin && sedeFiltroId !== "TODAS") {
        params.set("sedeId", sedeFiltroId);
      }

      const endpoint = params.size
        ? `/api/alertas/prestamos?${params.toString()}`
        : "/api/alertas/prestamos";

      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();
      setPrestamos(Array.isArray(data) ? data : []);
      setMensaje("");
    } catch {
      setMensaje("Error cargando alertas");
    } finally {
      setCargando(false);
    }
  }, [esAdmin, sedeFiltroId]);

  useEffect(() => {
    const init = async () => {
      await cargarUsuario();
      await cargarSedes();
    };

    void init();
  }, [cargarSedes, cargarUsuario]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const timer = window.setTimeout(() => {
      void cargar();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [cargar, user]);

  useLiveRefresh(cargar, { intervalMs: 12000 });

  const sedeFiltroNombre = useMemo(() => {
    if (!esAdmin) {
      return user?.sedeNombre || "tu sede";
    }

    if (sedeFiltroId === "TODAS") {
      return "Todas las sedes";
    }

    return (
      sedes.find((sede) => String(sede.id) === sedeFiltroId)?.nombre ||
      "Sede seleccionada"
    );
  }, [esAdmin, sedeFiltroId, sedes, user?.sedeNombre]);

  const prestamosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    if (!termino) {
      return prestamos;
    }

    return prestamos.filter((prestamo) =>
      [
        prestamo.imei,
        prestamo.referencia,
        prestamo.color,
        prestamo.sedeOrigenNombre,
        prestamo.sedeDestinoNombre,
        prestamo.estado,
      ]
        .map((valor) => String(valor || "").toLowerCase())
        .some((valor) => valor.includes(termino))
    );
  }, [busqueda, prestamos]);

  const totalCosto = useMemo(
    () => prestamos.reduce((acc, item) => acc + Number(item.costo || 0), 0),
    [prestamos]
  );
  const nombreUsuario = user?.nombre || user?.usuario || "Usuario";
  const inicialesUsuario = nombreUsuario
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    {
      href: "/dashboard/aprobaciones",
      icon: "approvals",
      label: "Aprobaciones",
    },
    {
      href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico",
      icon: "reports",
      label: "Reportes",
    },
    ...(esAdmin
      ? ([
          {
            href: "/dashboard/sedes",
            icon: "settings",
            label: "Configuración",
          },
        ] satisfies NavigationItem[])
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/prestamos"
        coverageLabel={sedeFiltroNombre}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <Link href="/prestamos" className="transition hover:text-[#e30613]">
                  Préstamos
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-600">Alertas</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Alertas de préstamos
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Equipos que continúan abiertos y requieren seguimiento de pago o
                cierre entre sedes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || "US"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[170px] truncate text-sm font-bold">{nombreUsuario}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {user?.rolNombre || "Cargando"}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] uppercase" />
            </div>
          </header>

          {mensaje && (
            <div
              role="status"
              className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                mensajeEsError
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <DashboardIcon
                name={mensajeEsError ? "warning" : "approvals"}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              {mensaje}
            </div>
          )}

          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              icon="warning"
              iconClass="bg-red-50 text-[#e30613]"
              label="Alertas activas"
              value={prestamos.length}
              detail="Préstamos abiertos dentro de esta cobertura."
              valueClass="text-[#e30613]"
            />
            <MetricCard
              icon="cash"
              iconClass="bg-amber-50 text-amber-600"
              label="Valor comprometido"
              value={formatoPesos(totalCosto)}
              detail="Costo acumulado de los equipos en seguimiento."
              valueClass="text-amber-600"
            />
            <MetricCard
              icon={prestamos.length > 0 ? "bell" : "approvals"}
              iconClass={
                prestamos.length > 0
                  ? "bg-red-50 text-[#e30613]"
                  : "bg-emerald-50 text-emerald-600"
              }
              label="Estado general"
              value={prestamos.length > 0 ? "ATENCIÓN" : "ESTABLE"}
              detail={
                prestamos.length > 0
                  ? "Hay seguimiento pendiente en esta cobertura."
                  : "No se detectan alertas activas por ahora."
              }
              valueClass={prestamos.length > 0 ? "text-[#e30613]" : "text-emerald-600"}
            />
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name="search" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Foco de cobertura
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                    Panorama de riesgo
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Filtra por sede o busca un equipo sin perder el contexto general.
                  </p>
                </div>
              </div>

              <div className="grid w-full gap-3 md:grid-cols-2 xl:max-w-[720px]">
                <div className="relative">
                  <DashboardIcon
                    name="search"
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={busqueda}
                    onChange={(event) => setBusqueda(event.target.value)}
                    placeholder="Buscar IMEI, referencia, sede o estado..."
                    className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-sm font-semibold outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                  />
                </div>

                {esAdmin ? (
                  <select
                    value={sedeFiltroId}
                    onChange={(event) => setSedeFiltroId(event.target.value)}
                    className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                  >
                    <option value="TODAS">Todas las sedes</option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={String(sede.id)}>
                        {sede.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex min-h-[52px] items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-600">
                    {user?.sedeNombre || "Tu sede"}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <DashboardIcon name="loans" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Seguimiento activo
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                    Préstamos pendientes
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Listado de equipos que requieren gestión de pago o cierre.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
                  {prestamosFiltrados.length} RESULTADO{prestamosFiltrados.length === 1 ? "" : "S"}
                </span>
                <Link
                  href="/prestamos"
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-slate-950 px-4 text-xs font-black tracking-[0.06em] text-white transition hover:bg-slate-800"
                >
                  VER PRÉSTAMOS
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-5 py-4">ID</th>
                    <th className="px-5 py-4">Equipo</th>
                    <th className="px-5 py-4">Costo</th>
                    <th className="px-5 py-4">Sede origen</th>
                    <th className="px-5 py-4">Sede destino</th>
                    <th className="px-5 py-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cargando ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center text-slate-500">
                        <span className="inline-flex items-center gap-3 font-semibold">
                          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
                          Cargando alertas...
                        </span>
                      </td>
                    </tr>
                  ) : prestamosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                          <DashboardIcon name="approvals" className="h-6 w-6" />
                        </span>
                        <p className="mt-3 font-bold text-slate-700">Sin alertas visibles</p>
                        <p className="mt-1 text-sm text-slate-500">
                          No hay préstamos que coincidan con esta cobertura y búsqueda.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    prestamosFiltrados.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 align-top text-slate-700 transition hover:bg-slate-50/70"
                      >
                        <td className="whitespace-nowrap px-5 py-5 font-black text-slate-950">
                          #{item.id}
                        </td>
                        <td className="px-5 py-5">
                          <p className="font-bold text-slate-950">{item.referencia}</p>
                          <p className="mt-1 whitespace-nowrap text-xs font-semibold text-slate-500">
                            IMEI: {item.imei}
                          </p>
                          {item.color && (
                            <p className="mt-1 text-xs text-slate-400">{item.color}</p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-5 text-base font-black text-amber-600">
                          {formatoPesos(item.costo)}
                        </td>
                        <td className="px-5 py-5">
                          <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700">
                            {item.sedeOrigenNombre ?? "Sede sin configurar"}
                          </span>
                        </td>
                        <td className="px-5 py-5">
                          <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700">
                            {item.sedeDestinoNombre ?? "Sede sin configurar"}
                          </span>
                        </td>
                        <td className="px-5 py-5">
                          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-black tracking-[0.08em] text-red-700">
                            {item.estado}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
