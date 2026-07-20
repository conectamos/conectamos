"use client";

import type { ReactNode } from "react";
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
import { esSedeOperativaInventario } from "@/lib/sedes";

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

type ImeiResponse = {
  referencia?: string;
  color?: string | null;
  costo?: number;
  error?: string;
};

function formatoPesos(valor: string | number) {
  const num = Number(valor || 0);
  return num > 0 ? `$ ${num.toLocaleString("es-CO")}` : "$ 0";
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-sm font-bold text-slate-700">{children}</span>
  );
}

function SectionCard({
  children,
  description,
  eyebrow,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  icon: DashboardIconName;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-5 sm:px-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
          <DashboardIcon name={icon} className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
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
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          {label}
        </p>
        <p className="mt-1 break-words text-sm font-bold leading-5 text-slate-950">
          {value}
        </p>
      </div>
    </div>
  );
}

export default function NuevoPrestamoPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);

  const [imei, setImei] = useState("");
  const [referencia, setReferencia] = useState("");
  const [color, setColor] = useState("");
  const [costo, setCosto] = useState("");

  const [sedeOrigenId, setSedeOrigenId] = useState("");
  const [sedeDestinoId, setSedeDestinoId] = useState("");

  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [consultandoImei, setConsultandoImei] = useState(false);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(
    user?.rolNombre?.toUpperCase() || ""
  );
  const mensajeEsOk = mensaje.startsWith("OK:");

  const inputClass =
    "min-h-[52px] w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-[#e30613] focus:ring-4 focus:ring-red-50";

  const inputReadOnlyClass =
    "min-h-[52px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 outline-none";

  useEffect(() => {
    void cargarUsuario();
    void cargarSedes();
  }, []);

  const cargarUsuario = async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "Error cargando sesión"}`);
        return;
      }

      setUser(data);

      if (!(["ADMIN", "AUDITOR"].includes(data.rolNombre?.toUpperCase() || ""))) {
        setSedeOrigenId(String(data.sedeId));
      }
    } catch {
      setMensaje("Error: cargando sesión.");
    }
  };

  const cargarSedes = async () => {
    try {
      const res = await fetch("/api/sedes", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setSedes(Array.isArray(data) ? data : []);
      }
    } catch {
      setMensaje("Error: cargando sedes.");
    }
  };

  const limpiarDatosEquipo = () => {
    setReferencia("");
    setColor("");
    setCosto("");
  };

  const consultarImei = async (valor: string) => {
    const imeiLimpio = valor.replace(/\D/g, "").slice(0, 15);

    if (!imeiLimpio) {
      limpiarDatosEquipo();
      return;
    }

    try {
      setConsultandoImei(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/buscar-imei", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imei: imeiLimpio, sedeOrigenId }),
      });

      const data: ImeiResponse = await res.json();

      if (!res.ok) {
        limpiarDatosEquipo();
        setMensaje(`Error: ${data.error || "No se encontró el IMEI"}`);
        return;
      }

      setReferencia(data.referencia || "");
      setColor(data.color || "");
      setCosto(String(data.costo || ""));
    } catch {
      limpiarDatosEquipo();
      setMensaje("Error: consultando IMEI.");
    } finally {
      setConsultandoImei(false);
    }
  };

  const sedesOperativasInventario = useMemo(() => {
    return sedes.filter((sede) => esSedeOperativaInventario(sede.nombre));
  }, [sedes]);

  const sedesDestinoDisponibles = useMemo(() => {
    return sedesOperativasInventario.filter(
      (sede) => String(sede.id) !== String(sedeOrigenId)
    );
  }, [sedesOperativasInventario, sedeOrigenId]);

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      if (!imei) return setMensaje("Error: el IMEI es obligatorio.");
      if (!referencia) return setMensaje("Error: la referencia es obligatoria.");
      if (!costo) return setMensaje("Error: el costo es obligatorio.");
      if (!sedeOrigenId) return setMensaje("Error: la sede origen es obligatoria.");
      if (!sedeDestinoId) return setMensaje("Error: la sede destino es obligatoria.");
      if (sedeOrigenId === sedeDestinoId) {
        return setMensaje("Error: la sede origen no puede ser igual a la sede destino.");
      }

      const res = await fetch("/api/prestamos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imei,
          referencia,
          color,
          costo: Number(costo),
          sedeOrigenId: Number(sedeOrigenId),
          sedeDestinoId: Number(sedeDestinoId),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(`Error: ${data.error || "Error al guardar préstamo"}`);
        return;
      }

      setMensaje("OK: solicitud de préstamo enviada. La sede destino debe aprobarla.");
      setImei("");
      setReferencia("");
      setColor("");
      setCosto("");
      setSedeDestinoId("");

      if (esAdmin) {
        setSedeOrigenId("");
      } else if (user?.sedeId) {
        setSedeOrigenId(String(user.sedeId));
      }
    } catch (error) {
      console.error(error);
      setMensaje("Error: al guardar préstamo.");
    } finally {
      setGuardando(false);
    }
  };

  const sedeOrigenNombre =
    sedes.find((sede) => String(sede.id) === sedeOrigenId)?.nombre ||
    (esAdmin ? "Pendiente" : user?.sedeNombre || "Tu sede");
  const sedeDestinoNombre =
    sedes.find((sede) => String(sede.id) === sedeDestinoId)?.nombre || "Pendiente";
  const cobertura = esAdmin ? sedeOrigenNombre : user?.sedeNombre || "Tu sede";
  const rutaCompleta = Boolean(sedeOrigenId && sedeDestinoId);
  const equipoValidado = Boolean(referencia && costo);
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
        coverageLabel={cobertura}
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
                <span className="text-slate-600">Nuevo préstamo</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Solicitud entre sedes
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Selecciona la ruta, valida el equipo y envía la solicitud para
                aprobación de la sede destino.
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

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:px-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  active: !rutaCompleta,
                  completed: rutaCompleta,
                  label: "ORIGEN Y DESTINO",
                  number: "1",
                },
                {
                  active: rutaCompleta && !equipoValidado,
                  completed: equipoValidado,
                  label: "VALIDACIÓN DEL EQUIPO",
                  number: "2",
                },
                {
                  active: rutaCompleta && equipoValidado,
                  completed: false,
                  label: "CONFIRMACIÓN",
                  number: "3",
                },
              ].map((paso) => (
                <div key={paso.number} className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      paso.completed
                        ? "bg-emerald-100 text-emerald-700"
                        : paso.active
                          ? "bg-[#e30613] text-white"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {paso.completed ? "✓" : paso.number}
                  </span>
                  <span className="text-[11px] font-black tracking-[0.08em] text-slate-600">
                    {paso.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {mensaje && (
            <div
              role="status"
              className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                mensajeEsOk
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              <DashboardIcon
                name={mensajeEsOk ? "approvals" : "warning"}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span>{mensaje.replace(/^OK:\s*/, "")}</span>
            </div>
          )}

          <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
            <div className="space-y-6">
              <SectionCard
                eyebrow="Paso 1"
                icon="send"
                title="Origen y destino del traslado"
                description="Define la sede que entrega el equipo y la sede que deberá aprobar su recepción."
              >
                <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-end">
                  <label>
                    <FieldLabel>Sede origen</FieldLabel>
                    {esAdmin ? (
                      <select
                        value={sedeOrigenId}
                        onChange={(event) => {
                          setSedeOrigenId(event.target.value);
                          setSedeDestinoId("");
                          setImei("");
                          limpiarDatosEquipo();
                          setMensaje("");
                        }}
                        className={inputClass}
                      >
                        <option value="">Seleccionar sede origen</option>
                        {sedesOperativasInventario.map((sede) => (
                          <option key={sede.id} value={sede.id}>
                            {sede.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={user?.sedeNombre || ""}
                        readOnly
                        className={inputReadOnlyClass}
                      />
                    )}
                  </label>

                  <span className="hidden h-[52px] w-[52px] items-center justify-center rounded-xl bg-slate-100 text-slate-500 md:flex">
                    <DashboardIcon name="arrow" className="h-6 w-6" />
                  </span>

                  <label>
                    <FieldLabel>Sede destino</FieldLabel>
                    <select
                      value={sedeDestinoId}
                      onChange={(event) => {
                        setSedeDestinoId(event.target.value);
                        setMensaje("");
                      }}
                      className={inputClass}
                    >
                      <option value="">Seleccionar sede destino</option>
                      {sedesDestinoDisponibles.map((sede) => (
                        <option key={sede.id} value={sede.id}>
                          {sede.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="Paso 2"
                icon="inventory"
                title="Identificación del equipo"
                description="El equipo debe estar disponible en la sede origen para generar el préstamo."
              >
                <label>
                  <FieldLabel>IMEI del equipo</FieldLabel>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <DashboardIcon
                        name="search"
                        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        inputMode="numeric"
                        disabled={!sedeOrigenId}
                        value={imei}
                        onChange={(event) => {
                          const nuevoImei = event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 15);
                          setImei(nuevoImei);
                          setMensaje("");

                          if (nuevoImei.length === 15) {
                            void consultarImei(nuevoImei);
                          } else {
                            limpiarDatosEquipo();
                          }
                        }}
                        placeholder={
                          sedeOrigenId
                            ? "Ingresa los 15 dígitos"
                            : "Selecciona primero la sede origen"
                        }
                        className={`${inputClass} pl-12 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void consultarImei(imei)}
                      disabled={!sedeOrigenId || imei.length !== 15 || consultandoImei}
                      className="inline-flex min-h-[52px] min-w-[170px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-black tracking-[0.08em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <DashboardIcon name="search" className="h-5 w-5" />
                      {consultandoImei ? "BUSCANDO..." : "BUSCAR IMEI"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {consultandoImei
                      ? "Validando disponibilidad en la sede origen..."
                      : "La consulta se ejecuta automáticamente al completar el IMEI."}
                  </p>
                </label>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {[
                    ["REFERENCIA", referencia || "Sin consultar"],
                    ["COLOR", color || "Sin consultar"],
                    ["COSTO", formatoPesos(costo)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black tracking-[0.14em] text-slate-400">
                        {label}
                      </p>
                      <p className="mt-2 break-words text-base font-black text-slate-950">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] xl:sticky xl:top-7 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Resumen del préstamo
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight">
                    Revisión final
                  </h2>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <DashboardIcon name="loans" className="h-6 w-6" />
                </span>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 px-4">
                <SummaryRow icon="inventory" label="Equipo" value={referencia || "Sin consultar"} />
                <SummaryRow icon="search" label="IMEI" value={imei || "Sin registrar"} />
                <SummaryRow icon="store" label="Origen" value={sedeOrigenNombre} />
                <SummaryRow icon="send" label="Destino" value={sedeDestinoNombre} />
                <SummaryRow icon="cash" label="Valor" value={formatoPesos(costo)} />
              </div>

              <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                <DashboardIcon name="warning" className="h-5 w-5 shrink-0" />
                <p>
                  El equipo no ingresará a la sede destino hasta que la solicitud
                  sea aprobada.
                </p>
              </div>

              <div className="mt-5 grid gap-2.5">
                <button
                  type="button"
                  onClick={() => void guardar()}
                  disabled={guardando}
                  className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-xs font-black tracking-[0.08em] text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <DashboardIcon name="approvals" className="h-5 w-5" />
                  {guardando ? "GUARDANDO..." : "ENVIAR SOLICITUD"}
                </button>
                <Link
                  href="/prestamos"
                  className="inline-flex min-h-[50px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-xs font-black tracking-[0.08em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                >
                  CANCELAR
                </Link>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
