"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import { useLiveRefresh } from "@/lib/use-live-refresh";

type Sede = {
  id: number;
  nombre: string;
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

type GastoItem = {
  id: number;
  valor: number;
  observacion: string | null;
  sedeId: number;
  createdAt: string;
  sede?: {
    nombre: string;
  };
};

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function formatoFecha(fecha: string) {
  try {
    return new Date(fecha).toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return fecha;
  }
}

function normalizarBusqueda(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function DetalleCarteraPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [items, setItems] = useState<GastoItem[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"error" | "success">("error");
  const [sedeFiltro, setSedeFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [valorEditando, setValorEditando] = useState("");
  const [observacionEditando, setObservacionEditando] = useState("");
  const [sedeEditando, setSedeEditando] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargarUsuario = async () => {
    const res = await fetch("/api/session", { cache: "no-store" });
    const data = await res.json();

    if (res.ok) {
      setUser(data);
    }
  };

  const cargarSedes = async () => {
    const res = await fetch("/api/sedes", { cache: "no-store" });
    const data = await res.json();

    if (res.ok) {
      setSedes(Array.isArray(data) ? data : []);
    }
  };

  const cargar = async (sedeId?: string, mostrarCarga = false) => {
    try {
      if (mostrarCarga) setCargando(true);

      const query =
        sedeId && Number(sedeId) > 0 ? `?sedeId=${Number(sedeId)}` : "";
      const res = await fetch(`/api/financiero/cartera${query}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "Error cargando detalle de cartera");
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMensajeTipo("error");
      setMensaje("Error cargando detalle de cartera");
    } finally {
      if (mostrarCarga) setCargando(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([cargarUsuario(), cargarSedes(), cargar(undefined, true)]);
    };

    void init();
  }, []);

  useLiveRefresh(
    async () => {
      await cargarUsuario();
      await cargar(sedeFiltro);
    },
    { intervalMs: 10000 }
  );

  const total = useMemo(
    () => items.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [items]
  );
  const promedio = items.length > 0 ? total / items.length : 0;
  const termino = normalizarBusqueda(busqueda.trim());
  const itemsFiltrados = useMemo(() => {
    if (!termino) return items;

    return items.filter((item) =>
      [
        item.id,
        item.observacion,
        item.sede?.nombre,
        formatoPesos(item.valor),
        formatoFecha(item.createdAt),
      ].some((value) => normalizarBusqueda(String(value || "")).includes(termino))
    );
  }, [items, termino]);

  const rolActual = String(user?.rolNombre || "").toUpperCase();
  const esAdmin = ["ADMIN", "AUDITOR"].includes(rolActual);
  const puedeEliminar = rolActual === "ADMIN";
  const coberturaActual = esAdmin
    ? sedes.find((sede) => String(sede.id) === sedeFiltro)?.nombre ||
      "Todas las sedes"
    : user?.sedeNombre || "Sede asignada";
  const inicialesUsuario = String(user?.nombre || user?.usuario || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
  const navigationItems = useMemo<NavigationItem[]>(
    () => [
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
    ],
    [esAdmin]
  );

  const cerrarEdicion = () => {
    setEditandoId(null);
    setValorEditando("");
    setObservacionEditando("");
    setSedeEditando("");
  };

  const abrirEdicion = (item: GastoItem) => {
    setEditandoId(item.id);
    setValorEditando(String(Number(item.valor || 0)));
    setObservacionEditando(item.observacion ?? "");
    setSedeEditando(String(item.sedeId));
  };

  const guardarEdicion = async () => {
    if (!editandoId) return;

    try {
      setProcesando(true);
      setMensaje("");

      const res = await fetch("/api/financiero/cartera", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editandoId,
          valor: Number(valorEditando || 0),
          observacion: observacionEditando,
          sedeId: Number(sedeEditando || 0),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "Error actualizando gasto de cartera");
        return;
      }

      setMensajeTipo("success");
      setMensaje("Gasto de cartera actualizado correctamente");
      cerrarEdicion();
      await cargar(sedeFiltro);
    } catch {
      setMensajeTipo("error");
      setMensaje("Error actualizando gasto de cartera");
    } finally {
      setProcesando(false);
    }
  };

  const eliminarGasto = async (id: number) => {
    const confirmado = window.confirm("¿Deseas eliminar este gasto de cartera?");

    if (!confirmado) return;

    try {
      setProcesando(true);
      setMensaje("");

      const res = await fetch("/api/financiero/cartera", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "Error eliminando gasto de cartera");
        return;
      }

      if (editandoId === id) cerrarEdicion();

      setMensajeTipo("success");
      setMensaje("Gasto de cartera eliminado correctamente");
      await cargar(sedeFiltro);
    } catch {
      setMensajeTipo("error");
      setMensaje("Error eliminando gasto de cartera");
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/caja"
        coverageLabel={coberturaActual}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <Link href="/dashboard/financiero" className="transition hover:text-[#e30613]">
                  Centro financiero
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-600">Detalle cartera</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Historial de gastos de cartera
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Consulta, filtra y administra los movimientos que alimentan el consolidado financiero.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/dashboard/financiero/cartera"
                className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#c9000b]"
              >
                <DashboardIcon name="cash" className="h-5 w-5" />
                Registrar gasto
              </Link>
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || "US"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[170px] truncate text-sm font-bold">
                    {user?.nombre || user?.usuario || "Cargando usuario"}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {user?.rolNombre || "Sesión activa"}
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
                mensajeTipo === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <DashboardIcon
                name={mensajeTipo === "error" ? "warning" : "approvals"}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              {mensaje}
            </div>
          )}

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: "cash" as const,
                label: "Total cartera",
                value: formatoPesos(total),
                detail: `Cobertura: ${coberturaActual}.`,
                tone: "text-[#e30613] bg-red-50",
              },
              {
                icon: "document" as const,
                label: "Movimientos",
                value: items.length.toLocaleString("es-CO"),
                detail: "Registros cargados en la cobertura actual.",
                tone: "text-blue-600 bg-blue-50",
              },
              {
                icon: "trend" as const,
                label: "Promedio por registro",
                value: formatoPesos(promedio),
                detail: "Promedio calculado con los datos visibles.",
                tone: "text-amber-600 bg-amber-50",
              },
            ].map((metric) => (
              <article
                key={metric.label}
                className="flex min-h-[132px] items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                  <DashboardIcon name={metric.icon} className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-1.5 break-words text-2xl font-black tracking-tight">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{metric.detail}</p>
                </div>
              </article>
            ))}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name="search" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Consulta
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight">Filtros del historial</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Busca por observación, sede, valor, fecha o identificador.
                  </p>
                </div>
              </div>

              <div className={`grid w-full gap-3 ${esAdmin ? "md:grid-cols-2" : ""} xl:max-w-[760px]`}>
                <div className="relative">
                  <DashboardIcon
                    name="search"
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={busqueda}
                    onChange={(event) => setBusqueda(event.target.value)}
                    placeholder="Buscar movimiento..."
                    className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-sm font-semibold outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                  />
                </div>

                {esAdmin && (
                  <select
                    value={sedeFiltro}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSedeFiltro(value);
                      void cargar(value, true);
                    }}
                    className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                  >
                    <option value="">Todas las sedes</option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={sede.id}>
                        {sede.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Listado
                </p>
                <h2 className="mt-1 text-xl font-black">Gastos de cartera registrados</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {itemsFiltrados.length} resultado(s) en esta vista.
                </p>
              </div>
              <Link
                href="/dashboard/financiero"
                className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50"
              >
                Volver al panel
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-5 py-4">ID</th>
                    <th className="px-5 py-4">Fecha</th>
                    <th className="px-5 py-4">Valor</th>
                    <th className="px-5 py-4">Observación</th>
                    <th className="px-5 py-4">Sede</th>
                    {esAdmin && <th className="px-5 py-4 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {cargando ? (
                    <tr>
                      <td colSpan={esAdmin ? 6 : 5} className="px-6 py-16 text-center font-semibold text-slate-500">
                        Cargando movimientos de cartera...
                      </td>
                    </tr>
                  ) : itemsFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={esAdmin ? 6 : 5} className="px-6 py-16 text-center text-slate-500">
                        No hay gastos de cartera para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    itemsFiltrados.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100 text-slate-700 transition hover:bg-slate-50/80">
                        <td className="px-5 py-4 font-black text-slate-900">#{item.id}</td>
                        <td className="px-5 py-4 whitespace-nowrap">{formatoFecha(item.createdAt)}</td>
                        <td className="px-5 py-4 whitespace-nowrap font-black text-[#e30613]">
                          {formatoPesos(item.valor)}
                        </td>
                        <td className="max-w-[420px] px-5 py-4 font-semibold leading-6 text-slate-700">
                          {item.observacion ?? "Sin observación"}
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                            {item.sede?.nombre ?? "Sede sin configurar"}
                          </span>
                        </td>
                        {esAdmin && (
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => abrirEdicion(item)}
                                disabled={procesando}
                                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-black uppercase text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613] disabled:opacity-60"
                              >
                                Editar
                              </button>
                              {puedeEliminar && (
                                <button
                                  type="button"
                                  onClick={() => void eliminarGasto(item.id)}
                                  disabled={procesando}
                                  className="min-h-[38px] rounded-lg border border-red-200 bg-red-50 px-3 text-[11px] font-black uppercase text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                                >
                                  Eliminar
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

      {esAdmin && editandoId !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Edición administrativa
                </p>
                <h3 className="mt-1 text-2xl font-black">Editar gasto #{editandoId}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  La actualización conserva las reglas financieras y de trazabilidad actuales.
                </p>
              </div>
              <button
                type="button"
                onClick={cerrarEdicion}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-600 transition hover:bg-slate-50"
                aria-label="Cerrar edición"
              >
                <DashboardIcon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Sede
                <select
                  value={sedeEditando}
                  onChange={(event) => setSedeEditando(event.target.value)}
                  className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                >
                  <option value="">Seleccionar sede</option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Valor
                <input
                  type="number"
                  value={valorEditando}
                  onChange={(event) => setValorEditando(event.target.value)}
                  className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold outline-none focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700 sm:col-span-2">
                Observación
                <textarea
                  value={observacionEditando}
                  onChange={(event) => setObservacionEditando(event.target.value)}
                  rows={4}
                  className="resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                />
              </label>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={cerrarEdicion}
                disabled={procesando}
                className="min-h-[46px] rounded-xl border border-slate-300 bg-white px-5 text-xs font-black uppercase text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarEdicion()}
                disabled={procesando}
                className="min-h-[46px] rounded-xl bg-[#e30613] px-6 text-xs font-black uppercase text-white transition hover:bg-[#c9000b] disabled:opacity-60"
              >
                {procesando ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
