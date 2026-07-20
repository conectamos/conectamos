"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import {
  ARQUEO_DENOMINACIONES,
  calcularTotalArqueo,
  clasificarArqueo,
  type ArqueoDenominacionKey,
} from "@/lib/arqueo";
import { getTodayBogotaDateKey } from "@/lib/ventas-utils";

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

type ArqueoRegistro = {
  id: number;
  sedeId: number;
  usuarioId: number;
  fechaCorte: string;
  voucher: number;
  cheques: number;
  totalContado: number;
  cajaSistema: number;
  diferencia: number;
  estado: string;
  observacion: string | null;
  usuario?: {
    nombre: string;
  };
} & Record<ArqueoDenominacionKey, number>;

type ArqueoResponse = {
  ok: boolean;
  fecha: string;
  sedeId: number;
  cajaSistema: number;
  registro: ArqueoRegistro | null;
  historial: ArqueoRegistro[];
};

type FormState = Record<ArqueoDenominacionKey, number> & {
  voucher: number;
  cheques: number;
  observacion: string;
};

const FORM_BASE: FormState = {
  billetes100000: 0,
  billetes50000: 0,
  billetes20000: 0,
  billetes10000: 0,
  billetes5000: 0,
  billetes2000: 0,
  billetes1000: 0,
  monedas500: 0,
  monedas200: 0,
  monedas100: 0,
  monedas50: 0,
  voucher: 0,
  cheques: 0,
  observacion: "",
};

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function toSafeInt(value: string) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function toSafeMoney(value: string) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function estadoTone(estado: string) {
  const normalized = String(estado || "").toUpperCase();

  if (normalized === "CUADRADO") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized === "SOBRANTE") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (normalized === "FALTANTE") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function CajaArqueoPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeId, setSedeId] = useState("0");
  const [fecha, setFecha] = useState(() => getTodayBogotaDateKey());
  const [cajaSistema, setCajaSistema] = useState(0);
  const [registroActual, setRegistroActual] = useState<ArqueoRegistro | null>(null);
  const [historial, setHistorial] = useState<ArqueoRegistro[]>([]);
  const [form, setForm] = useState<FormState>(FORM_BASE);
  const [formDirty, setFormDirty] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const formDirtyRef = useRef(formDirty);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(String(user?.rolNombre || "").toUpperCase());

  useEffect(() => {
    formDirtyRef.current = formDirty;
  }, [formDirty]);

  const cargarUsuario = async () => {
    const res = await fetch("/api/session", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "No se pudo cargar la sesion");
    }

    setUser(data);
    setSedeId((actual) =>
      actual && actual !== "0" ? actual : String(data.sedeId || "0")
    );
    return data as SessionUser;
  };

  const cargarSedes = async () => {
    const res = await fetch("/api/sedes", { cache: "no-store" });
    const data = await res.json();

    if (res.ok) {
      setSedes(Array.isArray(data) ? data : []);
    }
  };

  const aplicarRegistroAlFormulario = useCallback((registro: ArqueoRegistro | null) => {
    if (!registro) {
      setForm(FORM_BASE);
      return;
    }

    setForm({
      billetes100000: registro.billetes100000 || 0,
      billetes50000: registro.billetes50000 || 0,
      billetes20000: registro.billetes20000 || 0,
      billetes10000: registro.billetes10000 || 0,
      billetes5000: registro.billetes5000 || 0,
      billetes2000: registro.billetes2000 || 0,
      billetes1000: registro.billetes1000 || 0,
      monedas500: registro.monedas500 || 0,
      monedas200: registro.monedas200 || 0,
      monedas100: registro.monedas100 || 0,
      monedas50: registro.monedas50 || 0,
      voucher: Number(registro.voucher || 0),
      cheques: Number(registro.cheques || 0),
      observacion: registro.observacion || "",
    });
  }, []);

  const cargarArqueo = useCallback(async (
    targetSedeId: string,
    targetFecha: string,
    options?: {
      preserveForm?: boolean;
    }
  ) => {
    if (!targetSedeId || targetSedeId === "0" || !targetFecha) {
      return;
    }

    setCargando(true);

    try {
      const params = new URLSearchParams({
        fecha: targetFecha,
      });

      if (targetSedeId && targetSedeId !== "0") {
        params.set("sedeId", targetSedeId);
      }

      const res = await fetch(`/api/arqueo?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ArqueoResponse & { error?: string };

      if (!res.ok) {
        setMensaje(data.error || "No se pudo cargar el arqueo");
        return;
      }

      setCajaSistema(Number(data.cajaSistema || 0));
      setRegistroActual(data.registro || null);
      setHistorial(Array.isArray(data.historial) ? data.historial : []);

      if (!(options?.preserveForm && formDirtyRef.current)) {
        aplicarRegistroAlFormulario(data.registro || null);
        setFormDirty(false);
      }
    } catch {
      setMensaje("Error cargando arqueo");
    } finally {
      setCargando(false);
    }
  }, [aplicarRegistroAlFormulario]);

  useEffect(() => {
    const init = async () => {
      try {
        const session = await cargarUsuario();

        if (["ADMIN", "AUDITOR"].includes(String(session.rolNombre || "").toUpperCase())) {
          await cargarSedes();
        }

        const initialSedeId = String(session.sedeId || "0");
        await cargarArqueo(initialSedeId, getTodayBogotaDateKey(), {
          preserveForm: false,
        });
      } catch {
        setMensaje("No se pudo cargar la sesion de arqueo");
        setCargando(false);
      }
    };

    void init();
  }, [cargarArqueo]);

  useEffect(() => {
    if (!user || !sedeId || sedeId === "0") {
      return;
    }

    void cargarArqueo(sedeId, fecha, { preserveForm: false });
  }, [cargarArqueo, fecha, sedeId, user]);

  useLiveRefresh(async () => {
    if (!user || !sedeId || sedeId === "0") {
      return;
    }

    await cargarArqueo(sedeId, fecha, { preserveForm: true });
  }, { intervalMs: 12000 });

  const totalContado = useMemo(
    () =>
      calcularTotalArqueo({
        ...form,
      }),
    [form]
  );

  const diferencia = totalContado - cajaSistema;
  const estadoCalculado = clasificarArqueo(diferencia);

  const sedeActualNombre = useMemo(() => {
    if (!esAdmin) {
      return user?.sedeNombre || "Sede actual";
    }

    return (
      sedes.find((item) => String(item.id) === sedeId)?.nombre ||
      user?.sedeNombre ||
      "Sede actual"
    );
  }, [esAdmin, sedeId, sedes, user?.sedeNombre]);

  const actualizarCantidad = (key: ArqueoDenominacionKey, value: string) => {
    setFormDirty(true);
    setForm((current) => ({
      ...current,
      [key]: toSafeInt(value),
    }));
  };

  const actualizarDinero = (key: "voucher" | "cheques", value: string) => {
    const soloNumeros = String(value || "").replace(/[^\d]/g, "");
    setFormDirty(true);
    setForm((current) => ({
      ...current,
      [key]: toSafeMoney(soloNumeros),
    }));
  };

  const guardarArqueo = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      const res = await fetch("/api/arqueo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          sedeId,
          fecha,
          ...form,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo guardar el arqueo");
        return;
      }

      setFormDirty(false);
      setMensaje(data.mensaje || "Arqueo registrado correctamente");
      await cargarArqueo(sedeId, fecha, { preserveForm: false });
    } catch {
      setMensaje("Error guardando arqueo");
    } finally {
      setGuardando(false);
    }
  };
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    { href: "/caja/gestion", icon: "reports", label: "Ingresos y egresos" },
    { href: "/caja/arqueo", icon: "approvals", label: "Arqueo" },
    { href: "/caja/cierre-dia", icon: "calendar", label: "Cierre del día" },
  ];
  const inicialesUsuario = String(user?.nombre || user?.usuario || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950 [&_button]:uppercase">
      <DashboardSidebar
        activeHref="/caja/arqueo"
        coverageLabel={sedeActualNombre}
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
                <span className="text-slate-600">Arqueo diario</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Arqueo diario
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Cuenta el dinero físico por denominación, suma voucher y cheques,
                cruza contra la caja del mes y deja el registro diario de sobrante,
                faltante o cuadrado.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                  Sede: {sedeActualNombre}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
                  Fecha: {fecha}
                </span>
                <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${estadoTone(registroActual?.estado || estadoCalculado)}`}>
                  Estado: {registroActual?.estado || estadoCalculado}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2.5">
              {esAdmin && (
                <label className="flex min-w-[220px] flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                  Sede
                  <select
                    value={sedeId}
                    onChange={(event) => setSedeId(event.target.value)}
                    className="min-h-[50px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                  >
                    {sedes.map((sede) => (
                      <option key={sede.id} value={String(sede.id)}>
                        {sede.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex min-w-[190px] flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                Fecha corte
                <input
                  type="date"
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                  className="min-h-[50px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                />
              </label>

              <div className="flex min-h-[50px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || "US"}
                </span>
                <div className="min-w-0 pr-1">
                  <p className="max-w-[140px] truncate text-sm font-bold">
                    {user?.nombre || user?.usuario || "Usuario"}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {user?.rolNombre || "Operación"}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[50px] uppercase" />
            </div>
          </header>

        {mensaje && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
            {mensaje}
          </div>
        )}

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              icon: "cash" as const,
              iconClass: "bg-emerald-50 text-emerald-600",
              label: "Caja acumulada",
              value: formatoPesos(cajaSistema),
              valueClass: "text-emerald-600",
              detail: "Base del sistema para cruzar el arqueo.",
            },
            {
              icon: "approvals" as const,
              iconClass: "bg-blue-50 text-blue-600",
              label: "Total contado",
              value: formatoPesos(totalContado),
              valueClass: "text-slate-950",
              detail: "Efectivo, voucher y cheques registrados.",
            },
            {
              icon: "warning" as const,
              iconClass: estadoCalculado === "CUADRADO" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
              label: "Diferencia",
              value: formatoPesos(diferencia),
              valueClass: estadoCalculado === "CUADRADO" ? "text-emerald-600" : "text-red-600",
              detail: `Estado actual: ${estadoCalculado}`,
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
            >
              <div className="flex items-start gap-4">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${metric.iconClass}`}>
                  <DashboardIcon name={metric.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-600">{metric.label}</p>
                  <p className={`mt-1.5 break-words text-3xl font-black leading-tight tracking-tight ${metric.valueClass}`}>
                    {metric.value}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{metric.detail}</p>
                </div>
              </div>
            </article>
          ))}
        </section>

        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="flex items-start gap-3 border-b border-slate-200 pb-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                <DashboardIcon name="cash" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                  Conteo físico
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                  Registro por denominación
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Ingresa unidades por billete o moneda y completa los valores adicionales.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ARQUEO_DENOMINACIONES.map((item) => (
                <label
                  key={item.key}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-4 transition focus-within:border-red-200 focus-within:bg-white"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {item.label}
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form[item.key]}
                    onChange={(event) => actualizarCantidad(item.key, event.target.value)}
                    className="mt-3 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-bold text-slate-950 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Subtotal: {formatoPesos(form[item.key] * item.valor)}
                  </p>
                </label>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Voucher
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.voucher > 0 ? formatoPesos(form.voucher) : ""}
                  onChange={(event) => actualizarDinero("voucher", event.target.value)}
                  placeholder="$ 0"
                  className="mt-3 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-bold text-slate-950 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                />
              </label>

              <label className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Cheques
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.cheques > 0 ? formatoPesos(form.cheques) : ""}
                  onChange={(event) => actualizarDinero("cheques", event.target.value)}
                  placeholder="$ 0"
                  className="mt-3 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-bold text-slate-950 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                />
              </label>
            </div>

            <label className="mt-6 block rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Observacion
              </p>
              <textarea
                value={form.observacion}
                onChange={(event) =>
                  {
                    setFormDirty(true);
                    setForm((current) => ({
                      ...current,
                      observacion: event.target.value,
                    }));
                  }
                }
                rows={4}
                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50"
                placeholder="Notas del arqueo, faltantes explicados o sobrantes justificados..."
              />
            </label>
          </section>

          <aside className="space-y-5 xl:sticky xl:top-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                Cierre del día
              </p>
              <h2 className="mt-1 text-xl font-black">Resumen del arqueo</h2>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Caja acumulada
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-950">
                    {formatoPesos(cajaSistema)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Total arqueado
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-950">
                    {formatoPesos(totalContado)}
                  </p>
                </div>

                <div
                  className={[
                    "rounded-2xl border px-4 py-4",
                    estadoTone(estadoCalculado),
                  ].join(" ")}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Resultado
                  </p>
                  <p className="mt-2 text-2xl font-black">{estadoCalculado}</p>
                  <p className="mt-2 text-sm font-medium">
                    Diferencia: {formatoPesos(diferencia)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void guardarArqueo()}
                disabled={guardando || cargando}
                  className="mt-5 inline-flex min-h-[50px] w-full items-center justify-center rounded-xl bg-[#e30613] px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {guardando ? "Guardando arqueo..." : "Guardar arqueo diario"}
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Historial reciente
                  </p>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                    Ultimos arqueos
                  </h3>
                </div>

                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {historial.length} registros
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {historial.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#e5dccd] bg-[#fcfaf6] px-4 py-4 text-sm text-slate-500">
                    Todavia no hay arqueos guardados para esta sede.
                  </div>
                ) : (
                  historial.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-[#eee5d7] bg-white/90 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {item.fechaCorte.slice(0, 10)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Registrado por {item.usuario?.nombre || "Usuario"}
                          </p>
                        </div>

                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                            estadoTone(item.estado),
                          ].join(" ")}
                        >
                          {item.estado}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500">Caja sistema</p>
                          <p className="mt-1 font-semibold text-slate-950">
                            {formatoPesos(item.cajaSistema)}
                          </p>
                        </div>

                        <div>
                          <p className="text-slate-500">Total contado</p>
                          <p className="mt-1 font-semibold text-slate-950">
                            {formatoPesos(item.totalContado)}
                          </p>
                        </div>

                        <div className="col-span-2">
                          <p className="text-slate-500">Diferencia</p>
                          <p className="mt-1 font-semibold text-slate-950">
                            {formatoPesos(item.diferencia)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
        </main>
      </div>
    </div>
  );
}
