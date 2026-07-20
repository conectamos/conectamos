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

type CajaMovimiento = {
  id: number;
  tipo: string;
  concepto: string;
  valor: number;
  descripcion: string | null;
  sedeId: number;
  createdAt: string;
  editable: boolean;
  sede?: {
    nombre: string;
  };
};

function limpiarNumero(value: string) {
  return value.replace(/\D/g, "");
}

function formatoPesos(value: string | number) {
  const numero = Number(value || 0);
  if (!numero) return "";
  return `$ ${numero.toLocaleString("es-CO")}`;
}

function formatoFecha(value: string) {
  return new Date(value).toLocaleString("es-CO");
}

function tipoBadgeClass(tipo: string) {
  return String(tipo || "").toUpperCase() === "INGRESO"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
}

function MetricCard({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon: DashboardIconName;
  label: string;
  value: number | string;
}) {
  return (
    <article className="flex min-h-[132px] items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
        <DashboardIcon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          {label}
        </p>
        <p className="mt-1.5 break-words text-2xl font-black leading-tight">{value}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </article>
  );
}

export default function CajaGestionPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [movimientos, setMovimientos] = useState<CajaMovimiento[]>([]);

  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [concepto, setConcepto] = useState("");
  const [valor, setValor] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [sedeId, setSedeId] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);

  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  const rolActual = user?.rolNombre?.toUpperCase() || "";
  const esAdmin = ["ADMIN", "AUDITOR"].includes(rolActual);
  const puedeEliminar = rolActual === "ADMIN";

  const cargarUsuario = async () => {
    try {
      const resUser = await fetch("/api/session", { cache: "no-store" });
      const dataUser = await resUser.json();

      if (resUser.ok) {
        setUser(dataUser);
        setSedeId((current) => current || String(dataUser.sedeId || ""));
      }

      if (["ADMIN", "AUDITOR"].includes(dataUser?.rolNombre?.toUpperCase() || "")) {
        const resSedes = await fetch("/api/sedes", { cache: "no-store" });
        const dataSedes = await resSedes.json();

        if (resSedes.ok) {
          setSedes(Array.isArray(dataSedes) ? dataSedes : []);
        }
      }
    } catch {
      setMensaje("Error cargando información inicial");
    }
  };

  const cargarMovimientos = useCallback(async () => {
    try {
      const params = new URLSearchParams();

      if (esAdmin && sedeId) {
        params.set("sedeId", sedeId);
      }

      params.set("limit", "300");

      const endpoint = params.size ? `/api/caja?${params.toString()}` : "/api/caja";
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setMovimientos(Array.isArray(data) ? data : []);
      }
    } catch {}
  }, [esAdmin, sedeId]);

  useEffect(() => {
    void cargarUsuario();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const timer = window.setTimeout(() => {
      void cargarMovimientos();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [cargarMovimientos, user]);

  useLiveRefresh(cargarMovimientos, { intervalMs: 30000 });

  const limpiarFormulario = () => {
    setTipo("INGRESO");
    setConcepto("");
    setValor("");
    setDescripcion("");
    setEditandoId(null);
  };

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      if (!tipo) {
        setMensaje("Debes seleccionar el tipo");
        return;
      }

      if (!concepto.trim()) {
        setMensaje("Debes ingresar el concepto");
        return;
      }

      if (!valor || Number(valor) <= 0) {
        setMensaje("Debes ingresar un valor mayor a 0");
        return;
      }

      if (!sedeId || Number(sedeId) <= 0) {
        setMensaje("Debes seleccionar la sede");
        return;
      }

      const endpoint = editandoId ? `/api/caja?id=${editandoId}` : "/api/caja/registrar";
      const method = editandoId ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tipo,
          concepto,
          valor: Number(valor),
          descripcion,
          sedeId: Number(sedeId),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error al guardar movimiento");
        return;
      }

      setMensaje(
        data.mensaje ||
          (editandoId
            ? "Movimiento actualizado correctamente"
            : "Movimiento registrado correctamente")
      );

      limpiarFormulario();
      await cargarMovimientos();
    } catch {
      setMensaje("Error al guardar movimiento");
    } finally {
      setGuardando(false);
    }
  };

  const iniciarEdicion = (movimiento: CajaMovimiento) => {
    setEditandoId(movimiento.id);
    setTipo(
      String(movimiento.tipo).toUpperCase() === "EGRESO" ? "EGRESO" : "INGRESO"
    );
    setConcepto(movimiento.concepto || "");
    setValor(String(Math.trunc(Number(movimiento.valor || 0))));
    setDescripcion(movimiento.descripcion || "");
    setSedeId(String(movimiento.sedeId));
    setMensaje("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminar = async (movimiento: CajaMovimiento) => {
    const confirmado = window.confirm(
      `Deseas eliminar el movimiento #${movimiento.id}?`
    );

    if (!confirmado) {
      return;
    }

    try {
      setEliminandoId(movimiento.id);
      setMensaje("");

      const res = await fetch(`/api/caja?id=${movimiento.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo eliminar el movimiento");
        return;
      }

      if (editandoId === movimiento.id) {
        limpiarFormulario();
      }

      setMensaje(data.mensaje || "Movimiento eliminado correctamente");
      await cargarMovimientos();
    } catch {
      setMensaje("Error eliminando movimiento");
    } finally {
      setEliminandoId(null);
    }
  };

  const totalManualVisible = useMemo(
    () => movimientos.filter((movimiento) => movimiento.editable).length,
    [movimientos]
  );

  const cobertura = useMemo(
    () =>
      esAdmin
        ? sedes.find((sede) => String(sede.id) === sedeId)?.nombre ||
          "Sede seleccionada"
        : user?.sedeNombre || "Sede actual",
    [esAdmin, sedeId, sedes, user?.sedeNombre]
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

  const nombreUsuario = user?.nombre || user?.usuario || "Usuario";
  const inicialesUsuario = nombreUsuario
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
  const automaticosProtegidos = movimientos.length - totalManualVisible;
  const mensajeEsError = /error|no se pudo|debes|selecciona/i.test(mensaje);

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
                <span className="text-slate-600">Ingresos y egresos</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Gestión de caja
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Registra movimientos manuales y consulta el historial operativo sin
                modificar los registros automáticos del sistema.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || "US"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[170px] truncate text-sm font-bold">
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

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon="cash"
              label="Movimientos visibles"
              value={movimientos.length}
              detail="Registros dentro de la cobertura actual."
            />
            <MetricCard
              icon="document"
              label="Registros manuales"
              value={totalManualVisible}
              detail="Movimientos que permiten gestión administrativa."
            />
            <MetricCard
              icon="lock"
              label="Automáticos protegidos"
              value={automaticosProtegidos}
              detail="Movimientos originados por procesos del sistema."
            />
            <MetricCard
              icon="store"
              label="Modo actual"
              value={editandoId ? "EDICIÓN" : "REGISTRO"}
              detail={cobertura}
            />
          </section>

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
              <span>{mensaje}</span>
            </div>
          )}

          <section className="mt-6 grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.5fr)]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-5 sm:px-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name="cash" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    {editandoId ? "Edición manual" : "Nuevo movimiento"}
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                    {editandoId
                      ? `Editar movimiento #${editandoId}`
                      : "Registrar ingreso o egreso"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {editandoId
                      ? "Actualiza únicamente el registro manual seleccionado."
                      : "Completa los datos para afectar la caja de la sede seleccionada."}
                  </p>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <fieldset>
                  <legend className="mb-2 text-sm font-bold text-slate-700">
                    Tipo de movimiento
                  </legend>
                  <div className="grid gap-2 rounded-2xl bg-slate-100 p-1.5 sm:grid-cols-2">
                    {(["INGRESO", "EGRESO"] as const).map((opcion) => (
                      <button
                        key={opcion}
                        type="button"
                        onClick={() => setTipo(opcion)}
                        className={`min-h-[48px] rounded-xl px-4 text-xs font-black tracking-[0.08em] transition ${
                          tipo === opcion
                            ? opcion === "INGRESO"
                              ? "bg-slate-950 text-white shadow-sm"
                              : "bg-[#e30613] text-white shadow-sm"
                            : "text-slate-600 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        {opcion}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  {esAdmin ? (
                    <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                      Sede
                      <select
                        value={sedeId}
                        onChange={(event) => setSedeId(event.target.value)}
                        className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                      >
                        <option value="">Seleccionar sede</option>
                        {sedes.map((sede) => (
                          <option key={sede.id} value={sede.id}>
                            {sede.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                      Sede
                      <input
                        value={user?.sedeNombre || ""}
                        readOnly
                        className="min-h-[52px] rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 outline-none"
                      />
                    </label>
                  )}

                  <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                    Valor
                    <input
                      inputMode="numeric"
                      value={valor ? formatoPesos(valor) : ""}
                      onChange={(event) => setValor(limpiarNumero(event.target.value))}
                      placeholder="$ 0"
                      className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-base font-black text-slate-950 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                    Concepto
                    <input
                      value={concepto}
                      onChange={(event) => setConcepto(event.target.value)}
                      placeholder="Ej: INGRESO EXTRA, PAGO DE TRANSPORTE, APOYO COMERCIAL..."
                      className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                    Descripción
                    <textarea
                      value={descripcion}
                      onChange={(event) => setDescripcion(event.target.value)}
                      placeholder="Detalle opcional del movimiento"
                      rows={3}
                      className="resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2.5 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={limpiarFormulario}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-xs font-black tracking-[0.08em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                >
                  {editandoId ? "CANCELAR EDICIÓN" : "LIMPIAR"}
                </button>
                <button
                  type="button"
                  onClick={() => void guardar()}
                  disabled={guardando}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#e30613] px-7 text-xs font-black tracking-[0.08em] text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <DashboardIcon name="approvals" className="h-5 w-5" />
                  {guardando
                    ? "GUARDANDO..."
                    : editandoId
                      ? "GUARDAR CAMBIOS"
                      : `REGISTRAR ${tipo}`}
                </button>
              </div>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Vista previa
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight">
                    Movimiento actual
                  </h2>
                </div>
                <span
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-black tracking-[0.12em] ${tipoBadgeClass(tipo)}`}
                >
                  {tipo}
                </span>
              </div>

              <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
                {[
                  ["VALOR", valor ? formatoPesos(valor) : "$ 0"],
                  ["SEDE", cobertura],
                  ["CONCEPTO", concepto.trim() || "Sin completar"],
                  ["DESCRIPCIÓN", descripcion.trim() || "Sin detalle"],
                ].map(([label, value]) => (
                  <div key={label} className="py-4">
                    <p className="text-[10px] font-black tracking-[0.14em] text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 break-words text-sm font-bold leading-5 text-slate-950">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                <DashboardIcon name="lock" className="h-5 w-5 shrink-0" />
                <p>
                  Los movimientos automáticos permanecen protegidos y no pueden
                  editarse ni eliminarse desde esta pantalla.
                </p>
              </div>
            </aside>
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <DashboardIcon name="reports" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Historial visible
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                    Movimientos recientes
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {esAdmin
                      ? "Puedes gestionar únicamente los movimientos manuales permitidos por tu rol."
                      : "Movimientos recientes registrados dentro de tu sede."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                  {movimientos.length} REGISTRO{movimientos.length === 1 ? "" : "S"}
                </span>
                <button
                  type="button"
                  onClick={() => void cargarMovimientos()}
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black tracking-[0.08em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                >
                  <DashboardIcon name="send" className="h-4 w-4" />
                  ACTUALIZAR
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {[
                      "ID",
                      "TIPO",
                      "CONCEPTO",
                      "VALOR",
                      "SEDE",
                      "DESCRIPCIÓN",
                      "FECHA",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-5 py-4 text-left text-[11px] font-black tracking-[0.1em]"
                      >
                        {heading}
                      </th>
                    ))}
                    {esAdmin && (
                      <th className="px-5 py-4 text-left text-[11px] font-black tracking-[0.1em]">
                        ACCIONES
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {movimientos.length === 0 ? (
                    <tr>
                      <td colSpan={esAdmin ? 8 : 7} className="px-6 py-20 text-center">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <DashboardIcon name="cash" className="h-6 w-6" />
                        </span>
                        <p className="mt-3 font-bold text-slate-700">
                          No hay movimientos visibles
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          La sede seleccionada todavía no tiene registros para mostrar.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    movimientos.map((movimiento) => (
                      <tr
                        key={movimiento.id}
                        className="border-t border-slate-100 align-top transition hover:bg-slate-50/70"
                      >
                        <td className="whitespace-nowrap px-5 py-5 font-black">
                          #{movimiento.id}
                        </td>
                        <td className="px-5 py-5">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black tracking-[0.12em] ${tipoBadgeClass(movimiento.tipo)}`}
                          >
                            {movimiento.tipo}
                          </span>
                        </td>
                        <td className="px-5 py-5">
                          <p className="max-w-[240px] font-bold leading-5">
                            {movimiento.concepto}
                          </p>
                          {!movimiento.editable && (
                            <span className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                              <DashboardIcon name="lock" className="h-3.5 w-3.5" />
                              Automático
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-5">
                          <p
                            className={`text-base font-black ${
                              movimiento.tipo === "INGRESO"
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatoPesos(movimiento.valor)}
                          </p>
                        </td>
                        <td className="px-5 py-5">
                          <span className="inline-flex max-w-[170px] rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700">
                            {movimiento.sede?.nombre || "Sede sin configurar"}
                          </span>
                        </td>
                        <td className="px-5 py-5">
                          <p className="max-w-[330px] break-words leading-6 text-slate-600">
                            {movimiento.descripcion || "-"}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-5 text-xs font-semibold text-slate-600">
                          {formatoFecha(movimiento.createdAt)}
                        </td>
                        {esAdmin && (
                          <td className="px-5 py-5">
                            {movimiento.editable ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicion(movimiento)}
                                  className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 text-[10px] font-black tracking-[0.08em] text-slate-700 transition hover:bg-slate-100"
                                >
                                  EDITAR
                                </button>
                                {puedeEliminar && (
                                  <button
                                    type="button"
                                    onClick={() => void eliminar(movimiento)}
                                    disabled={eliminandoId === movimiento.id}
                                    className="min-h-[36px] rounded-lg border border-red-200 bg-red-50 px-3 text-[10px] font-black tracking-[0.08em] text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                                  >
                                    {eliminandoId === movimiento.id
                                      ? "ELIMINANDO..."
                                      : "ELIMINAR"}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.1em] text-slate-400">
                                <DashboardIcon name="lock" className="h-4 w-4" />
                                PROTEGIDO
                              </span>
                            )}
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
