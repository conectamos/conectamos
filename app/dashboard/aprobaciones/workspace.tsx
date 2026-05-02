"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Categoria =
  | "prestamos"
  | "pagos"
  | "devoluciones"
  | "ventas"
  | "facturacion";

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
    facturacion: number;
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
  { key: "prestamos", label: "Prestamos" },
  { key: "pagos", label: "Pagos" },
  { key: "devoluciones", label: "Devoluciones" },
  { key: "ventas", label: "Ventas" },
  { key: "facturacion", label: "Facturacion" },
];

function formatoPesos(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "-";

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

function categoriaLabel(categoria: Categoria) {
  const labels: Record<Categoria, string> = {
    devoluciones: "Devolucion",
    facturacion: "Facturacion",
    pagos: "Pago",
    prestamos: "Prestamo",
    ventas: "Venta",
  };

  return labels[categoria];
}

function categoriaTone(categoria: Categoria) {
  const tones: Record<Categoria, string> = {
    devoluciones: "border-violet-200 bg-violet-50 text-violet-700",
    facturacion: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pagos: "border-amber-200 bg-amber-50 text-amber-700",
    prestamos: "border-sky-200 bg-sky-50 text-sky-700",
    ventas: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return tones[categoria];
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
  label,
  value,
  detail,
  valueClass = "text-slate-950",
}: {
  detail: string;
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[26px] border border-[#e7e3da] bg-white px-5 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
      <p className={["mt-3 text-3xl font-black tracking-tight", valueClass].join(" ")}>
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function ApprovalCard({ item }: { item: BandejaItem }) {
  return (
    <article className="rounded-[26px] border border-[#e5ded2] bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span
              className={[
                "inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em]",
                categoriaTone(item.categoria),
              ].join(" ")}
            >
              {categoriaLabel(item.categoria)}
            </span>
            <span
              className={[
                "inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em]",
                prioridadTone(item.prioridad),
              ].join(" ")}
            >
              {item.prioridad}
            </span>
          </div>

          <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">
            {item.titulo}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.detalle}</p>
        </div>

        <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Fecha
          </p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {formatoFecha(item.fecha)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            IMEI / Cliente
          </p>
          <p className="mt-1 break-words text-sm font-bold text-slate-950">
            {item.imei || item.cliente || "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Referencia
          </p>
          <p className="mt-1 break-words text-sm font-bold text-slate-950">
            {item.referencia || "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Sede
          </p>
          <p className="mt-1 break-words text-sm font-bold text-slate-950">
            {item.sedeDestino || item.sedeOrigen || "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Valor
          </p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {formatoPesos(item.valor)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-slate-500">
          Estado: <span className="font-bold text-slate-900">{item.estado}</span>
        </div>
        <Link
          href={item.href}
          className="inline-flex min-h-[46px] items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          {item.accion}
        </Link>
      </div>
    </article>
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
    facturacion: 0,
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

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172033_52%,#7c2d12_100%)] px-6 py-7 text-white shadow-[0_26px_85px_rgba(15,23,42,0.2)] md:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.15),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f2d7a6]">
                Control operativo
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Bandeja de aprobaciones
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                Unifica prestamos, pagos, devoluciones, ventas y facturacion pendiente sin cambiar los flujos existentes.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-slate-100">
                  Usuario: <span className="font-semibold text-white">{session.nombre}</span>
                </div>
                <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-slate-100">
                  Cobertura: <span className="font-semibold text-white">{data?.cobertura || session.sedeNombre}</span>
                </div>
                <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-slate-100">
                  Perfil: <span className="font-semibold text-white">{session.perfilTipoLabel}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void cargarBandeja()}
                className="inline-flex min-h-[50px] items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-100"
              >
                Actualizar
              </button>
              <Link
                href="/dashboard"
                className="inline-flex min-h-[50px] items-center justify-center rounded-2xl border border-white/12 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15"
              >
                Volver
              </Link>
            </div>
          </div>
        </section>

        {mensaje && (
          <div className="mt-6 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-800">
            {mensaje}
          </div>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Total"
            value={cargando ? "..." : resumen.total}
            detail="Pendientes visibles en tu cobertura."
          />
          <MetricCard
            label="Pagos"
            value={resumen.pagos}
            detail="Pagos que requieren aprobacion."
            valueClass="text-amber-600"
          />
          <MetricCard
            label="Prestamos"
            value={resumen.prestamos + resumen.devoluciones}
            detail="Solicitudes y devoluciones abiertas."
            valueClass="text-sky-600"
          />
          <MetricCard
            label="Ventas"
            value={resumen.ventas}
            detail="Registros comerciales por completar."
            valueClass="text-rose-600"
          />
          <MetricCard
            label="Facturacion"
            value={resumen.facturacion}
            detail="Registros con factura pendiente."
            valueClass="text-emerald-600"
          />
        </section>

        <section className="mt-6 rounded-[30px] border border-[#e4dccd] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#e4dccd] bg-[#faf7f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Filtros
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                Pendientes por tipo
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Esta bandeja no aprueba directamente: abre cada modulo responsable.
              </p>
            </div>

            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar IMEI, cliente, referencia o sede..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 xl:max-w-[460px]"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {filtros.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFiltro(item.key)}
                className={[
                  "rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                  filtro === item.key
                    ? "border border-[#111318] bg-[#111318] text-white shadow-sm"
                    : "border border-[#d9cfbe] bg-white text-slate-700 hover:bg-[#faf7f1]",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 space-y-4">
          {cargando ? (
            <div className="rounded-[30px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500">
              Cargando bandeja de aprobaciones...
            </div>
          ) : itemsFiltrados.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <p className="text-lg font-black text-slate-950">
                No hay pendientes en esta vista
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Cambia el filtro o actualiza para revisar de nuevo.
              </p>
            </div>
          ) : (
            itemsFiltrados.map((item) => <ApprovalCard key={item.id} item={item} />)
          )}
        </section>
      </div>
    </div>
  );
}
