"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";

type Categoria = "prestamos" | "pagos" | "devoluciones" | "ventas";

type BandejaItem = {
  accion: string;
  categoria: Categoria;
  cliente?: string | null;
  detalle: string;
  estado: string;
  fecha: string;
  href: string;
  id: string;
  imei?: string | null;
  prioridad: "alta" | "media" | "normal";
  referencia?: string | null;
  sedeDestino?: string | null;
  sedeOrigen?: string | null;
  titulo: string;
  valor?: number | null;
};

type BandejaResponse = {
  cobertura: string;
  items: BandejaItem[];
  ok: boolean;
  resumen: {
    alta: number;
    devoluciones: number;
    pagos: number;
    prestamos: number;
    total: number;
    ventas: number;
  };
};

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  rolNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type Filtro = "todos" | Categoria;

const filtros: Array<{ key: Filtro; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "prestamos", label: "Préstamos" },
  { key: "pagos", label: "Pagos" },
  { key: "devoluciones", label: "Devoluciones" },
  { key: "ventas", label: "Ventas" },
];

const categoriaConfig: Record<
  Categoria,
  {
    icon: DashboardIconName;
    label: string;
    tone: string;
    iconTone: string;
  }
> = {
  devoluciones: {
    icon: "arrow",
    label: "Devolución",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
    iconTone: "bg-violet-50 text-violet-600",
  },
  pagos: {
    icon: "cash",
    label: "Pago",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    iconTone: "bg-amber-50 text-amber-600",
  },
  prestamos: {
    icon: "loans",
    label: "Préstamo",
    tone: "border-blue-200 bg-blue-50 text-blue-700",
    iconTone: "bg-blue-50 text-blue-600",
  },
  ventas: {
    icon: "sales",
    label: "Venta",
    tone: "border-red-200 bg-red-50 text-[#e30613]",
    iconTone: "bg-red-50 text-[#e30613]",
  },
};

function formatoPesos(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "Sin valor asociado";

  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function formatoFecha(valor: string) {
  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return "-";
  }

  return fecha.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function prioridadLabel(prioridad: BandejaItem["prioridad"]) {
  if (prioridad === "alta") return "Prioridad alta";
  if (prioridad === "media") return "Prioridad media";
  return "Prioridad normal";
}

function prioridadTone(prioridad: BandejaItem["prioridad"]) {
  if (prioridad === "alta") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (prioridad === "media") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function MetricCard({
  detail,
  icon,
  iconClassName,
  label,
  value,
  valueClassName = "text-slate-950",
}: {
  detail: string;
  icon: DashboardIconName;
  iconClassName: string;
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <article className="min-h-[142px] rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
        >
          <DashboardIcon name={icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p
            className={`mt-1.5 text-[27px] font-black leading-tight tracking-tight ${valueClassName}`}
          >
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function DetailCell({
  detail,
  label,
}: {
  detail?: string | null;
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1.5 break-words text-sm font-bold leading-5 text-slate-950">
        {detail || "-"}
      </p>
    </div>
  );
}

function ApprovalCard({ item }: { item: BandejaItem }) {
  const config = categoriaConfig[item.categoria];
  const clienteImei = [item.cliente, item.imei].filter(Boolean).join(" · ");
  const recorrido =
    item.sedeOrigen && item.sedeDestino && item.sedeOrigen !== item.sedeDestino
      ? `${item.sedeOrigen} → ${item.sedeDestino}`
      : item.sedeDestino || item.sedeOrigen || "-";

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <span className="absolute inset-y-0 left-0 w-1 bg-[#e30613]" />
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.iconTone}`}
            >
              <DashboardIcon name={config.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${config.tone}`}
                >
                  {config.label}
                </span>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${prioridadTone(item.prioridad)}`}
                >
                  {prioridadLabel(item.prioridad)}
                </span>
              </div>

              <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">
                {item.titulo}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">{item.detalle}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
            <DashboardIcon name="calendar" className="h-4 w-4 text-slate-400" />
            {formatoFecha(item.fecha)}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DetailCell label="Cliente / IMEI" detail={clienteImei} />
          <DetailCell label="Referencia" detail={item.referencia} />
          <DetailCell label="Ruta / Sede" detail={recorrido} />
          <DetailCell label="Valor" detail={formatoPesos(item.valor)} />
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Estado
            <span className="font-bold text-slate-900">{item.estado}</span>
          </div>
          <Link
            href={item.href}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-sm font-bold text-white transition hover:bg-[#c9000b]"
          >
            {item.accion}
            <DashboardIcon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-4" aria-label="Cargando aprobaciones">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex gap-4">
            <div className="h-11 w-11 rounded-xl bg-slate-100" />
            <div className="flex-1">
              <div className="h-3 w-28 rounded bg-slate-100" />
              <div className="mt-4 h-5 w-64 max-w-full rounded bg-slate-100" />
              <div className="mt-3 h-3 w-96 max-w-full rounded bg-slate-100" />
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((cell) => (
              <div key={cell} className="h-16 rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AprobacionesWorkspace({
  session,
}: {
  session: SessionProps;
}) {
  const [data, setData] = useState<BandejaResponse | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const esAdmin = ["ADMIN", "AUDITOR"].includes(
    String(session.rolNombre || "").trim().toUpperCase()
  );
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

  const cargarBandeja = useCallback(async () => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/dashboard/aprobaciones", {
        cache: "no-store",
      });
      const body = await res.json();

      if (!res.ok) {
        setMensaje(body.error || "No se pudo cargar la bandeja");
        setData(null);
        return;
      }

      setData(body);
    } catch {
      setMensaje("Error cargando la bandeja de aprobaciones");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarBandeja();
  }, [cargarBandeja]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const resumen = data?.resumen ?? {
    alta: 0,
    devoluciones: 0,
    pagos: 0,
    prestamos: 0,
    total: 0,
    ventas: 0,
  };
  const itemsFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return items
      .filter((item) => (filtro === "todos" ? true : item.categoria === filtro))
      .filter((item) => {
        if (!termino) return true;

        return [
          item.titulo,
          item.detalle,
          item.estado,
          item.imei,
          item.cliente,
          item.referencia,
          item.sedeOrigen,
          item.sedeDestino,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termino);
      });
  }, [busqueda, filtro, items]);
  const usuario = session.perfilNombre || session.nombre;
  const inicialesUsuario = usuario
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
  const cobertura = data?.cobertura || (esAdmin ? "Todas las sedes" : session.sedeNombre);

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/dashboard/aprobaciones"
        coverageLabel={cobertura}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Bandeja de aprobaciones
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500 sm:text-base">
                Préstamos, pagos, devoluciones y ventas que requieren gestión
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  <DashboardIcon name="store" className="h-4 w-4 text-slate-500" />
                  Cobertura: {cobertura}
                </span>
                {!cargando && resumen.alta > 0 && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">
                    {resumen.alta} de prioridad alta
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void cargarBandeja()}
                disabled={cargando}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613] disabled:cursor-wait disabled:opacity-60"
              >
                <DashboardIcon name="approvals" className="h-4 w-4" />
                {cargando ? "Actualizando..." : "Actualizar"}
              </button>
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[205px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || (
                    <DashboardIcon name="user" className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{usuario}</p>
                  <p className="truncate text-xs text-slate-500">
                    {session.perfilTipoLabel}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-12 shrink-0 rounded-xl" />
            </div>
          </header>

          {mensaje && (
            <section className="mt-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <DashboardIcon name="warning" className="h-5 w-5 shrink-0" />
                {mensaje}
              </div>
              <button
                type="button"
                onClick={() => void cargarBandeja()}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100"
              >
                Reintentar
              </button>
            </section>
          )}

          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <MetricCard
              icon="approvals"
              iconClassName="bg-red-50 text-[#e30613]"
              label="Total pendientes"
              value={cargando && !data ? "—" : resumen.total}
              detail="Gestiones visibles en esta cobertura."
            />
            <MetricCard
              icon="loans"
              iconClassName="bg-blue-50 text-blue-600"
              label="Préstamos"
              value={resumen.prestamos}
              detail="Solicitudes pendientes de decisión."
            />
            <MetricCard
              icon="cash"
              iconClassName="bg-amber-50 text-amber-600"
              label="Pagos"
              value={resumen.pagos}
              detail="Pagos que requieren aprobación."
              valueClassName="text-amber-600"
            />
            <MetricCard
              icon="arrow"
              iconClassName="bg-violet-50 text-violet-600"
              label="Devoluciones"
              value={resumen.devoluciones}
              detail="Equipos con devolución solicitada."
            />
            <MetricCard
              icon="sales"
              iconClassName="bg-rose-50 text-rose-600"
              label="Ventas"
              value={resumen.ventas}
              detail="Registros comerciales por completar."
              valueClassName="text-[#e30613]"
            />
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Pendientes operativos
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                  Filtra y abre el módulo responsable
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Esta bandeja centraliza la consulta; cada acción mantiene su flujo actual.
                </p>
              </div>

              <div className="relative w-full xl:max-w-[460px]">
                <DashboardIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Buscar IMEI, cliente, referencia o sede..."
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => setBusqueda("")}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <DashboardIcon name="close" className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {filtros.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFiltro(item.key)}
                  className={[
                    "rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
                    filtro === item.key
                      ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
              <span className="ml-auto text-xs font-semibold text-slate-500" aria-live="polite">
                {cargando ? "Consultando..." : `${itemsFiltrados.length} resultado(s)`}
              </span>
            </div>
          </section>

          <section className="mt-5">
            {cargando && !data ? (
              <LoadingCards />
            ) : itemsFiltrados.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <DashboardIcon name="approvals" className="h-7 w-7" />
                </span>
                <p className="mt-4 text-lg font-black text-slate-950">
                  No hay pendientes en esta vista
                </p>
                <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                  Cambia el filtro, limpia la búsqueda o actualiza la bandeja.
                </p>
                {(busqueda || filtro !== "todos") && (
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda("");
                      setFiltro("todos");
                    }}
                    className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {itemsFiltrados.map((item) => (
                  <ApprovalCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
