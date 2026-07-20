"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import {
  getCurrentBogotaMonthInput,
  getTodayBogotaDateKey,
} from "@/lib/ventas-utils";

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

type PeriodoTipo = "dia" | "rango" | "mes";

const opcionesPeriodo: Array<{
  label: string;
  value: PeriodoTipo;
}> = [
  { label: "DÍA", value: "dia" },
  { label: "RANGO", value: "rango" },
  { label: "MES COMPLETO", value: "mes" },
];

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: DashboardIconName;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-4 last:border-b-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <DashboardIcon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-bold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function ReportContentCard({
  detail,
  icon,
  title,
}: {
  detail: string;
  icon: DashboardIconName;
  title: string;
}) {
  return (
    <article className="flex min-h-[112px] items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
        <DashboardIcon name={icon} className="h-5 w-5" />
      </span>
      <div>
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
        <p className="mt-1.5 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

export default function CierreDiaPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [fecha, setFecha] = useState(() => getTodayBogotaDateKey());
  const [fechaInicio, setFechaInicio] = useState(() => getTodayBogotaDateKey());
  const [fechaFin, setFechaFin] = useState(() => getTodayBogotaDateKey());
  const [mes, setMes] = useState(() => getCurrentBogotaMonthInput());
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>("dia");
  const [sedeId, setSedeId] = useState("TODAS");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(
    String(user?.rolNombre || "").toUpperCase()
  );

  useEffect(() => {
    const init = async () => {
      try {
        const sessionRes = await fetch("/api/session", { cache: "no-store" });
        const sessionData = await sessionRes.json();

        if (!sessionRes.ok) {
          setMensaje(sessionData.error || "No se pudo cargar la sesión");
          return;
        }

        setUser(sessionData);

        if (
          ["ADMIN", "AUDITOR"].includes(
            String(sessionData?.rolNombre || "").toUpperCase()
          )
        ) {
          const sedesRes = await fetch("/api/sedes", { cache: "no-store" });
          const sedesData = await sedesRes.json();

          if (sedesRes.ok) {
            setSedes(Array.isArray(sedesData) ? sedesData : []);
          }
        }
      } catch {
        setMensaje("Error cargando los filtros del cierre");
      } finally {
        setCargando(false);
      }
    };

    void init();
  }, []);

  const cobertura = useMemo(() => {
    if (!esAdmin) {
      return user?.sedeNombre || "Tu sede";
    }

    if (sedeId === "TODAS") {
      return "Todas las sedes";
    }

    return sedes.find((sede) => String(sede.id) === sedeId)?.nombre || "Sede";
  }, [esAdmin, sedeId, sedes, user?.sedeNombre]);

  const periodoActual = useMemo(() => {
    if (!esAdmin || periodoTipo === "dia") {
      return fecha || "-";
    }

    if (periodoTipo === "rango") {
      return `${fechaInicio || "-"} a ${fechaFin || "-"}`;
    }

    return mes || "-";
  }, [esAdmin, fecha, fechaFin, fechaInicio, mes, periodoTipo]);

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

  const buildParams = (formato: "pdf" | "excel") => {
    const params = new URLSearchParams({
      formato,
      vista: "tabla",
    });

    if (esAdmin && periodoTipo === "rango") {
      if (!fechaInicio || !fechaFin) {
        setMensaje("Selecciona fecha inicial y fecha final");
        return null;
      }

      params.set("fechaInicio", fechaInicio);
      params.set("fechaFin", fechaFin);
    } else if (esAdmin && periodoTipo === "mes") {
      if (!mes) {
        setMensaje("Selecciona el mes para generar el cierre");
        return null;
      }

      params.set("mes", mes);
    } else {
      if (!fecha) {
        setMensaje("Selecciona una fecha para generar el cierre");
        return null;
      }

      params.set("fecha", fecha);
    }

    if (esAdmin && sedeId !== "TODAS") {
      params.set("sedeId", sedeId);
    }

    return params;
  };

  const generarCierre = (formato: "pdf" | "excel") => {
    const params = buildParams(formato);

    if (!params) {
      return;
    }

    setMensaje("");
    window.open(`/api/caja/cierre-dia?${params.toString()}`, "_blank", "noopener");
  };

  const nombreUsuario = user?.nombre || user?.usuario || "Usuario";

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/caja"
        coverageLabel={cobertura}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <Link href="/caja" className="transition hover:text-[#e30613]">
                  Caja
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-600">Cierre del día</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight text-slate-950 sm:text-[34px]">
                Cierre operativo
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Genera el informe oficial de ventas, movimientos, comisiones y caja
                para el periodo seleccionado.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {iniciales(nombreUsuario) || "US"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[170px] truncate text-sm font-bold text-slate-950">
                    {nombreUsuario}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {user?.rolNombre || "Cargando"}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] uppercase" />
            </div>
          </header>

          <section className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                    <DashboardIcon name="calendar" className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                      Configuración del reporte
                    </p>
                    <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                      Selecciona periodo y cobertura
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Los permisos actuales determinan las sedes que puedes consultar.
                    </p>
                  </div>
                </div>

                {esAdmin && (
                  <div className="mt-6 grid gap-2 rounded-2xl bg-slate-100 p-1.5 sm:grid-cols-3">
                    {opcionesPeriodo.map((opcion) => (
                      <button
                        key={opcion.value}
                        type="button"
                        onClick={() => {
                          setPeriodoTipo(opcion.value);
                          setMensaje("");
                        }}
                        className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-black tracking-[0.08em] transition ${
                          periodoTipo === opcion.value
                            ? "bg-[#e30613] text-white shadow-sm"
                            : "bg-transparent text-slate-600 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        {opcion.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {(!esAdmin || periodoTipo === "dia") && (
                    <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                      Fecha del cierre
                      <input
                        type="date"
                        value={fecha}
                        onChange={(event) => {
                          setFecha(event.target.value);
                          setMensaje("");
                        }}
                        className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                      />
                    </label>
                  )}

                  {esAdmin && periodoTipo === "rango" && (
                    <>
                      <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                        Fecha inicial
                        <input
                          type="date"
                          value={fechaInicio}
                          onChange={(event) => {
                            setFechaInicio(event.target.value);
                            setMensaje("");
                          }}
                          className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                        Fecha final
                        <input
                          type="date"
                          value={fechaFin}
                          onChange={(event) => {
                            setFechaFin(event.target.value);
                            setMensaje("");
                          }}
                          className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                        />
                      </label>
                    </>
                  )}

                  {esAdmin && periodoTipo === "mes" && (
                    <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                      Mes del cierre
                      <input
                        type="month"
                        value={mes}
                        onChange={(event) => {
                          setMes(event.target.value);
                          setMensaje("");
                        }}
                        className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                      />
                    </label>
                  )}

                  {esAdmin ? (
                    <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                      Cobertura por sede
                      <select
                        value={sedeId}
                        onChange={(event) => {
                          setSedeId(event.target.value);
                          setMensaje("");
                        }}
                        className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                      >
                        <option value="TODAS">Todas las sedes</option>
                        {sedes.map((sede) => (
                          <option key={sede.id} value={String(sede.id)}>
                            {sede.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                      Cobertura por sede
                      <input
                        value={user?.sedeNombre || "Cargando sede"}
                        readOnly
                        className="min-h-[52px] rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 outline-none"
                      />
                    </label>
                  )}
                </div>

                {mensaje && (
                  <div
                    role="alert"
                    className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                  >
                    <DashboardIcon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>{mensaje}</span>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Contenido del cierre
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight">
                  Información consolidada del periodo
                </h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <ReportContentCard
                    icon="sales"
                    title="Ventas y participantes"
                    detail="Ventas registradas, equipos, servicios, jaladores y cerradores."
                  />
                  <ReportContentCard
                    icon="cash"
                    title="Ingresos y movimientos"
                    detail="Ingresos, egresos, comisiones, salidas y caja acumulada."
                  />
                  <ReportContentCard
                    icon="store"
                    title="Financieras"
                    detail="Operaciones financiadas y valores asociados al periodo."
                  />
                  <ReportContentCard
                    icon="reports"
                    title="Resumen ejecutivo"
                    detail="Indicadores y comparativos listos para revisión administrativa."
                  />
                </div>
              </section>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] xl:sticky xl:top-7 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Resumen del cierre
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight">Listo para generar</h2>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <DashboardIcon name="document" className="h-6 w-6" />
                </span>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 px-4">
                <SummaryRow icon="calendar" label="Periodo" value={periodoActual} />
                <SummaryRow icon="store" label="Cobertura" value={cobertura} />
                <SummaryRow icon="download" label="Formatos" value="PDF y Excel" />
              </div>

              <div className="mt-4 flex gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                <DashboardIcon name="lock" className="h-5 w-5 shrink-0 text-slate-500" />
                <p>
                  La descarga consulta los datos actuales y no modifica ventas,
                  movimientos ni cierres existentes.
                </p>
              </div>

              <div className="mt-5 grid gap-2.5">
                <button
                  type="button"
                  onClick={() => generarCierre("pdf")}
                  disabled={cargando || !user}
                  className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-xs font-black tracking-[0.08em] text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DashboardIcon name="download" className="h-5 w-5" />
                  DESCARGAR PDF
                </button>
                <button
                  type="button"
                  onClick={() => generarCierre("excel")}
                  disabled={cargando || !user}
                  className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-black tracking-[0.08em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DashboardIcon name="download" className="h-5 w-5" />
                  DESCARGAR EXCEL
                </button>
                <Link
                  href="/caja"
                  className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-xs font-black tracking-[0.08em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                >
                  <DashboardIcon name="cash" className="h-5 w-5" />
                  VER CAJA
                </Link>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}
