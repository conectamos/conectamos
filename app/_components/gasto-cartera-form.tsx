"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";

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

type GastoCarteraFormProps = {
  backHref?: string;
  badgeLabel?: string;
  detailHref?: string | null;
  description?: string;
};

function limpiarNumero(value: string) {
  const limpio = value.replace(/[^\d-]/g, "");
  if (!limpio) return "";

  return limpio.startsWith("-")
    ? `-${limpio.slice(1).replace(/-/g, "")}`
    : limpio.replace(/-/g, "");
}

function formatoPesos(value: string | number) {
  const numero = Number(value || 0);

  if (!numero) return "$ 0";

  return numero < 0
    ? `-$ ${Math.abs(numero).toLocaleString("es-CO")}`
    : `$ ${numero.toLocaleString("es-CO")}`;
}

function formatoNumeroCampo(value: string) {
  if (!value) return "";

  const numero = Number(value || 0);
  return numero < 0
    ? `-${Math.abs(numero).toLocaleString("es-CO")}`
    : numero.toLocaleString("es-CO");
}

export default function GastoCarteraForm({
  backHref = "/dashboard",
  badgeLabel = "Financiero",
  detailHref = "/dashboard/financiero/cartera/detalle",
  description = "Registra movimientos de cartera que afectan el resumen general.",
}: GastoCarteraFormProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeId, setSedeId] = useState("");
  const [valor, setValor] = useState("");
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    const init = async () => {
      try {
        setCargando(true);
        const resUser = await fetch("/api/session", { cache: "no-store" });
        const dataUser = await resUser.json();

        if (!resUser.ok) {
          setMensaje(dataUser.error || "Error cargando información inicial");
          return;
        }

        setUser(dataUser);
        setSedeId(String(dataUser.sedeId || ""));

        if (
          ["ADMIN", "AUDITOR"].includes(
            String(dataUser?.rolNombre || "").toUpperCase()
          )
        ) {
          const resSedes = await fetch("/api/sedes", { cache: "no-store" });
          const dataSedes = await resSedes.json();

          if (resSedes.ok) {
            setSedes(Array.isArray(dataSedes) ? dataSedes : []);
          }
        }
      } catch {
        setMensaje("Error cargando información inicial");
      } finally {
        setCargando(false);
      }
    };

    void init();
  }, []);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(
    String(user?.rolNombre || "").toUpperCase()
  );
  const sedeSeleccionada = esAdmin
    ? sedes.find((sede) => String(sede.id) === sedeId)?.nombre ||
      user?.sedeNombre ||
      "Seleccionar sede"
    : user?.sedeNombre || "Sede asignada";
  const inicialesUsuario = String(user?.nombre || user?.usuario || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
  const mensajeEsError = Boolean(mensaje && !mensaje.includes("correctamente"));

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

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      const res = await fetch("/api/financiero/cartera", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          valor: Number(valor || 0),
          observacion,
          sedeId: Number(sedeId || 0),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error registrando gasto de cartera");
        return;
      }

      setMensaje("Gasto de cartera registrado correctamente");
      setValor("");
      setObservacion("");
    } catch {
      setMensaje("Error registrando gasto de cartera");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/caja"
        coverageLabel={sedeSeleccionada}
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
                <span className="text-slate-600">Cartera</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Registrar gasto de cartera
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                {description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {detailHref ? (
                <Link
                  href={detailHref}
                  className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#c9000b]"
                >
                  <DashboardIcon name="document" className="h-5 w-5" />
                  Ver detalle
                </Link>
              ) : null}
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

          <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(310px,0.55fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
              <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name="cash" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    {badgeLabel} / Registro
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                    Datos del movimiento
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Selecciona la cobertura, registra el valor y deja una observación clara.
                  </p>
                </div>
              </div>

              {cargando ? (
                <div className="py-16 text-center text-sm font-semibold text-slate-500">
                  Cargando información de cartera...
                </div>
              ) : (
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                    Sede
                    {esAdmin ? (
                      <select
                        value={sedeId}
                        onChange={(event) => setSedeId(event.target.value)}
                        className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                      >
                        <option value="">Seleccionar sede</option>
                        {sedes.map((sede) => (
                          <option key={sede.id} value={sede.id}>
                            {sede.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex min-h-[52px] items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
                        {user?.sedeNombre || "Sede asignada"}
                      </div>
                    )}
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                    Valor
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                        $
                      </span>
                      <input
                        value={formatoNumeroCampo(valor)}
                        onChange={(event) => setValor(limpiarNumero(event.target.value))}
                        inputMode="numeric"
                        placeholder="0"
                        className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                      />
                    </div>
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                    Observación
                    <textarea
                      value={observacion}
                      onChange={(event) => setObservacion(event.target.value)}
                      rows={4}
                      placeholder="Describe el motivo o soporte del movimiento de cartera..."
                      className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                    />
                  </label>
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
                <Link
                  href={backHref}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50"
                >
                  Volver
                </Link>
                <button
                  type="button"
                  onClick={() => void guardar()}
                  disabled={guardando || cargando}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#e30613] px-6 text-xs font-black uppercase tracking-[0.06em] text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <DashboardIcon name="approvals" className="h-5 w-5" />
                  {guardando ? "Guardando..." : "Registrar gasto"}
                </button>
              </div>
            </div>

            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] xl:sticky xl:top-6 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <DashboardIcon name="document" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Revisión
                  </p>
                  <h2 className="mt-1 text-xl font-black">Resumen del gasto</h2>
                </div>
              </div>

              <dl className="mt-6 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Sede
                  </dt>
                  <dd className="mt-2 text-base font-black text-slate-900">
                    {sedeSeleccionada}
                  </dd>
                </div>
                <div className="rounded-xl border border-red-100 bg-red-50/60 p-4">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-600">
                    Valor registrado
                  </dt>
                  <dd className="mt-2 break-words text-2xl font-black text-[#e30613]">
                    {formatoPesos(valor)}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Observación
                  </dt>
                  <dd className="mt-2 break-words text-sm font-semibold leading-6 text-slate-700">
                    {observacion.trim() || "Pendiente por completar"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                <DashboardIcon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />
                Este movimiento alimentará el resumen financiero utilizando las reglas actuales del sistema.
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}
