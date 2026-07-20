"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  detalleIngresosTexto,
  financierasTexto,
  formatoFechaHoraVenta,
  formatoPesos,
  getBogotaDateKey,
  getTodayBogotaDateKey,
  isTodayBogota,
  dinero,
  type VentaLike,
} from "@/lib/ventas-utils";

type Venta = VentaLike & {
  id: number;
};

type CajaResumenResponse = {
  resumen?: {
    saldo: number;
  };
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

type VistaFiltro = "HOY" | "FECHA" | "TODAS";

function SalesMetricCard({
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
    <article className="min-h-[138px] rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <span
          className={[
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            iconClass,
          ].join(" ")}
        >
          <DashboardIcon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-700">{label}</p>
          <p className={["mt-1 text-[27px] font-black leading-tight", valueClass].join(" ")}>
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function servicioBadge(servicio: string) {
  const normalized = String(servicio || "").toUpperCase();

  if (normalized.includes("FINAN")) {
    return "bg-red-50 text-red-700 ring-red-100";
  }

  if (normalized.includes("ACTIV")) {
    return "bg-blue-50 text-blue-700 ring-blue-100";
  }

  if (normalized.includes("CONTADO")) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cajaNetaMovimientos, setCajaNetaMovimientos] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedesReporte, setSedesReporte] = useState<Sede[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<VistaFiltro>("HOY");
  const [fechaFiltro, setFechaFiltro] = useState(() => getTodayBogotaDateKey());
  const [vistaSedeId, setVistaSedeId] = useState("TODAS");
  const [eliminandoVentaId, setEliminandoVentaId] = useState<number | null>(null);
  const [cargandoVentas, setCargandoVentas] = useState(false);
  const [ventasCargadas, setVentasCargadas] = useState(false);
  const [cajaResumenCargada, setCajaResumenCargada] = useState(false);
  const rolActual = user?.rolNombre?.toUpperCase() || "";
  const esAdmin = ["ADMIN", "AUDITOR"].includes(rolActual);
  const puedeEliminar = rolActual === "ADMIN";

  const cargarUsuario = async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setUser(data);
      }
    } catch {}
  };

  const cargarVentas = useCallback(async () => {
    try {
      setCargandoVentas(true);
      const params = new URLSearchParams();

      if (esAdmin && vistaSedeId !== "TODAS") {
        params.set("sedeId", vistaSedeId);
      }

      const endpoint = params.size
        ? `/api/ventas?${params.toString()}`
        : "/api/ventas";

      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();
      setVentas(Array.isArray(data) ? data : []);
      setVentasCargadas(true);
    } catch {
      setMensaje("Error cargando ventas");
    } finally {
      setCargandoVentas(false);
    }
  }, [esAdmin, vistaSedeId]);

  const cargarCajaResumen = useCallback(async () => {
    try {
      const params = new URLSearchParams();

      if (esAdmin && vistaSedeId !== "TODAS") {
        params.set("sedeId", vistaSedeId);
      }

      params.set("resumen", "1");
      params.set("limit", "0");

      const endpoint = params.size
        ? `/api/caja?${params.toString()}`
        : "/api/caja";

      const res = await fetch(endpoint, { cache: "no-store" });
      const data = (await res.json()) as CajaResumenResponse;
      setCajaNetaMovimientos(Number(data.resumen?.saldo || 0));
      setCajaResumenCargada(true);
    } catch {
      setCajaNetaMovimientos(0);
    }
  }, [esAdmin, vistaSedeId]);

  const cargarSedes = useCallback(async () => {
    try {
      const res = await fetch("/api/sedes", { cache: "no-store" });
      const data = await res.json();
      setSedesReporte(Array.isArray(data) ? data : []);
    } catch {
      setSedesReporte([]);
    }
  }, []);

  useEffect(() => {
    void cargarUsuario();
  }, []);

  useEffect(() => {
    if (!esAdmin) {
      setSedesReporte([]);
      setVistaSedeId("TODAS");
      return;
    }

    void cargarSedes();
  }, [cargarSedes, esAdmin]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void Promise.all([cargarVentas(), cargarCajaResumen()]);
  }, [cargarCajaResumen, cargarVentas, user]);

  useLiveRefresh(
    async () => {
      await cargarUsuario();
      await Promise.all([cargarVentas(), cargarCajaResumen()]);
    },
    { intervalMs: 30000 }
  );

  const vistaSedeNombre = useMemo(() => {
    if (!esAdmin) {
      return user?.sedeNombre || "tu sede";
    }

    if (vistaSedeId === "TODAS") {
      return "todas las sedes";
    }

    return (
      sedesReporte.find((sede) => String(sede.id) === vistaSedeId)?.nombre ||
      "la sede seleccionada"
    );
  }, [esAdmin, sedesReporte, user?.sedeNombre, vistaSedeId]);

  const todayKey = useMemo(() => getTodayBogotaDateKey(), []);

  const ventasHoy = useMemo(
    () => ventas.filter((venta) => isTodayBogota(venta.fecha, todayKey)),
    [todayKey, ventas]
  );

  const totalUtilidadHoy = useMemo(
    () => ventasHoy.reduce((acc, venta) => acc + dinero(venta.utilidad), 0),
    [ventasHoy]
  );

  const totalCajaHoy = useMemo(
    () => ventasHoy.reduce((acc, venta) => acc + dinero(venta.cajaOficina), 0),
    [ventasHoy]
  );

  const totalIngresosHoy = useMemo(
    () => ventasHoy.reduce((acc, venta) => acc + dinero(venta.ingreso), 0),
    [ventasHoy]
  );

  const totalCajaGeneral = useMemo(
    () => ventas.reduce((acc, venta) => acc + dinero(venta.cajaOficina), 0),
    [ventas]
  );

  const totalCajaAcumulada = totalCajaGeneral + cajaNetaMovimientos;

  const totalIngresos = useMemo(
    () => ventas.reduce((acc, venta) => acc + dinero(venta.ingreso), 0),
    [ventas]
  );

  const ventasMostradas = useMemo(() => {
    const base =
      vista === "HOY"
        ? ventasHoy
        : vista === "FECHA"
          ? ventas.filter((venta) => getBogotaDateKey(venta.fecha) === fechaFiltro)
          : ventas;
    const termino = busqueda.trim().toLowerCase();

    if (!termino) {
      return base;
    }

    return base.filter((venta) => {
      return (
        String(venta.idVenta || "").toLowerCase().includes(termino) ||
        String(venta.servicio || "").toLowerCase().includes(termino) ||
        String(venta.descripcion || "").toLowerCase().includes(termino) ||
        String(venta.serial || "").toLowerCase().includes(termino) ||
        String(venta.jalador || "").toLowerCase().includes(termino) ||
        String(venta.cerrador || "").toLowerCase().includes(termino) ||
        String(venta.sede?.nombre || "").toLowerCase().includes(termino)
      );
    });
  }, [busqueda, fechaFiltro, ventas, ventasHoy, vista]);

  const eliminarVenta = async (ventaId: number) => {
    const confirmado = window.confirm(
      "Esta venta se eliminara y el equipo volvera a BODEGA. Deseas continuar?"
    );

    if (!confirmado) {
      return;
    }

    try {
      setEliminandoVentaId(ventaId);
      setMensaje("");

      const res = await fetch(`/api/ventas?id=${ventaId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo eliminar la venta");
        return;
      }

      setMensaje(data.mensaje || "Venta eliminada correctamente");
      await cargarVentas();
    } catch {
      setMensaje("Error eliminando la venta");
    } finally {
      setEliminandoVentaId(null);
    }
  };

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
  const inicialesUsuario = String(user?.nombre || user?.usuario || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
  const coberturaActual = esAdmin
    ? vistaSedeId === "TODAS"
      ? "Todas las sedes"
      : vistaSedeNombre
    : user?.sedeNombre || "Tu sede";
  const valorMetrica = (valor: string | number) =>
    ventasCargadas ? valor : "—";
  const valorCajaAcumulada =
    ventasCargadas && cajaResumenCargada
      ? formatoPesos(totalCajaAcumulada)
      : "—";

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/ventas"
        coverageLabel={coberturaActual}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Panel de ventas
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Seguimiento del corte diario y rendimiento comercial
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Cobertura: {coberturaActual}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Corte: {new Date().toLocaleDateString("es-CO")}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  {cargandoVentas
                    ? "Actualizando ventas"
                    : ventasCargadas
                      ? `${ventasHoy.length} ventas hoy`
                      : "Ventas sin cargar"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {esAdmin && (
                <Link
                  href="/ventas/perfiles"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
                >
                  Perfiles vendedores
                </Link>
              )}

              {esAdmin && (
                <Link
                  href="/ventas/equipo-comercial"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
                >
                  Catálogos
                </Link>
              )}

              <Link
                href="/ventas/aprobaciones"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
              >
                Aprobaciones
              </Link>

              <Link
                href="/ventas/nuevo"
                className="order-first inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#bd0711]"
              >
                + Nueva venta
              </Link>

              <Link
                href="/dashboard"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-[#e30613] xl:hidden"
              >
                Volver
              </Link>
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[185px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || <DashboardIcon name="user" className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {user?.nombre || user?.usuario || "Cargando usuario"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {user?.rolNombre || "Sesión activa"}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-12 shrink-0 rounded-xl" />
            </div>
          </header>

        {mensaje && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {mensaje}
          </div>
        )}

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SalesMetricCard
            icon="sales"
            iconClass="bg-red-50 text-[#e30613]"
            label="Ventas del día"
            value={valorMetrica(ventasHoy.length)}
            detail="Registros del corte operativo actual."
          />
          <SalesMetricCard
            icon="trend"
            iconClass="bg-red-50 text-[#e30613]"
            label="Ingresos del día"
            value={valorMetrica(formatoPesos(totalIngresosHoy))}
            detail="Ingreso neto registrado hoy."
          />
          <SalesMetricCard
            icon="cash"
            iconClass="bg-slate-100 text-slate-700"
            label="Caja del día"
            value={valorMetrica(formatoPesos(totalCajaHoy))}
            detail="Disponible según las ventas del día."
          />
          <SalesMetricCard
            icon="trend"
            iconClass="bg-emerald-50 text-emerald-600"
            label="Utilidad del día"
            value={valorMetrica(formatoPesos(totalUtilidadHoy))}
            valueClass="text-emerald-600"
            detail="Resultado neto del corte diario."
          />
        </section>

        <section
          className={`mt-4 grid grid-cols-1 gap-4 ${
            esAdmin ? "lg:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          <SalesMetricCard
            icon="reports"
            iconClass="bg-violet-50 text-violet-600"
            label="Ventas acumuladas"
            value={valorMetrica(ventas.length)}
            detail="Total visible dentro de la cobertura actual."
          />

          {esAdmin && (
            <SalesMetricCard
              icon="sales"
              iconClass="bg-red-50 text-[#e30613]"
              label="Ingresos acumulados"
              value={valorMetrica(formatoPesos(totalIngresos))}
              detail="Ingresos comerciales de la cobertura actual."
            />
          )}

          <SalesMetricCard
            icon="cash"
            iconClass="bg-slate-100 text-slate-700"
            label="Caja acumulada"
            value={valorCajaAcumulada}
            detail="Caja de ventas más el neto de movimientos de Caja."
          />
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Filtros comerciales
              </p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                Seguimiento comercial
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Revisa el corte del dia, una fecha especifica o todo el historico reciente sin perder legibilidad.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex flex-wrap gap-2">
                {(["HOY", "TODAS"] as VistaFiltro[]).map((opcion) => (
                  <button
                    key={opcion}
                    type="button"
                    onClick={() => setVista(opcion)}
                    className={[
                      "rounded-xl px-4 py-2.5 text-sm font-bold transition",
                      vista === opcion
                        ? "border border-[#e30613] bg-[#e30613] text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]",
                    ].join(" ")}
                  >
                    {opcion === "HOY" ? "Solo hoy" : "Todas"}
                  </button>
                ))}
              </div>

              <input
                type="date"
                aria-label="Filtrar ventas por fecha"
                value={fechaFiltro}
                onChange={(event) => {
                  setFechaFiltro(event.target.value || getTodayBogotaDateKey());
                  setVista("FECHA");
                }}
                className={[
                  "w-full rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100 lg:w-[180px]",
                  vista === "FECHA"
                    ? "border-[#e30613] ring-3 ring-red-100"
                    : "border-slate-300",
                ].join(" ")}
              />

              {esAdmin && (
                <select
                  value={vistaSedeId}
                  onChange={(event) => setVistaSedeId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100 lg:w-[260px]"
                >
                  <option value="TODAS">Todas las sedes</option>
                  {sedesReporte.map((sede) => (
                    <option key={sede.id} value={String(sede.id)}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              )}

              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar por venta, IMEI, servicio, sede o asesor..."
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100 lg:w-[360px]"
              />
            </div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Listado comercial
              </p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                Ventas registradas
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {ventasMostradas.length} resultado
                {ventasMostradas.length === 1 ? "" : "s"} visibles en esta vista.
              </p>
            </div>

            <div className="text-sm text-slate-500">
              Vista actual:{" "}
              <span className="font-semibold text-slate-900">
                {vista === "HOY"
                  ? "Corte del dia"
                  : vista === "FECHA"
                    ? `Fecha ${fechaFiltro}`
                    : "Historico"}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1460px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-4 text-left font-semibold">Venta</th>
                  <th className="px-5 py-4 text-left font-semibold">Momento</th>
                  <th className="px-5 py-4 text-left font-semibold">Equipo</th>
                  <th className="px-5 py-4 text-left font-semibold">Participantes</th>
                  <th className="px-5 py-4 text-left font-semibold">Cobro</th>
                  <th className="px-5 py-4 text-left font-semibold">Financieras</th>
                  <th className="px-5 py-4 text-left font-semibold">Resultado</th>
                  <th className="px-5 py-4 text-left font-semibold">Sede</th>
                  {esAdmin && <th className="px-5 py-4 text-left font-semibold">Acciones</th>}
                </tr>
              </thead>

              <tbody>
                {ventasMostradas.length === 0 ? (
                  <tr>
                    <td colSpan={esAdmin ? 9 : 8} className="px-6 py-16 text-center">
                      <div className="mx-auto max-w-md">
                        <p className="text-base font-semibold text-slate-900">
                          {cargandoVentas && !ventasCargadas
                            ? "Cargando ventas"
                            : "No hay ventas para esta vista"}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {cargandoVentas && !ventasCargadas
                            ? "Estamos consultando la cobertura seleccionada."
                            : "Ajusta la búsqueda o cambia entre corte del día e histórico."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  ventasMostradas.map((venta) => (
                    <tr
                      key={venta.id}
                      className="border-t border-slate-200 align-top transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-5">
                        <div className="space-y-3">
                          <p className="font-bold text-slate-950">{venta.idVenta}</p>
                          <span
                            className={[
                              "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ring-1 ring-inset",
                              servicioBadge(venta.servicio),
                            ].join(" ")}
                          >
                            {venta.servicio}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-5">
                        <p className="font-semibold text-slate-900">
                          {formatoFechaHoraVenta(venta.fecha, venta.hora)}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                          Registro comercial
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <p className="font-semibold text-slate-950">
                          {venta.descripcion || "Sin descripcion"}
                        </p>
                        <p className="mt-2 text-slate-500">IMEI: {venta.serial}</p>
                      </td>

                      <td className="px-5 py-5">
                        <p className="font-semibold text-slate-900">
                          Jalador: {venta.jalador || "-"}
                        </p>
                        <p className="mt-2 text-slate-500">
                          Cerrador: {venta.cerrador || "-"}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <p className="text-lg font-black text-slate-950">
                          {formatoPesos(venta.ingreso)}
                        </p>
                        <p className="mt-2 text-slate-500">
                          {venta.tipoIngreso || "Sin tipo de ingreso"}
                        </p>
                        <p className="mt-3 max-w-[260px] text-xs leading-5 text-slate-500">
                          {detalleIngresosTexto(venta)}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <p className="max-w-[260px] text-xs leading-5 text-slate-500">
                          {financierasTexto(venta)}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <p className="font-semibold text-emerald-700">
                          Utilidad:{" "}
                          <span
                            tabIndex={0}
                            className="group inline-flex min-w-[78px] cursor-default rounded-md outline-none"
                            aria-label="Utilidad protegida. Pasa el mouse para ver el valor."
                          >
                            <span className="group-hover:hidden group-focus:hidden">
                              *****
                            </span>
                            <span className="hidden group-hover:inline group-focus:inline">
                              {formatoPesos(venta.utilidad)}
                            </span>
                          </span>
                        </p>
                        <p className="mt-2 text-slate-700">
                          Caja: {formatoPesos(venta.cajaOficina)}
                        </p>
                        <p className="mt-2 text-slate-500">
                          Comision: {formatoPesos(venta.comision)}
                        </p>
                        <p className="mt-1 text-slate-500">
                          Salida: {formatoPesos(venta.salida)}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <p className="font-semibold text-slate-900">
                          {venta.sede?.nombre || "-"}
                        </p>
                      </td>

                      {esAdmin && (
                        <td className="px-5 py-5">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/ventas/editar/${venta.id}`}
                              className="inline-flex rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Editar
                            </Link>
                            {puedeEliminar && (
                              <button
                                type="button"
                                onClick={() => void eliminarVenta(venta.id)}
                                disabled={eliminandoVentaId === venta.id}
                                className="inline-flex rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {eliminandoVentaId === venta.id ? "Eliminando..." : "Eliminar"}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
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
