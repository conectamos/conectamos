"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import FinancialPasswordSettings from "./_components/financial-password-settings";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";

type Resumen = {
  cajaGeneralVentas: number;
  saldoCaja: number;
  cajaDisponible: number;
  transferenciasVentas: number;
  abonosTransferencia: number;
  saldoTransferencias: number;
  prestamosPorCobrar: number;
  deudaEquipos: number;
  financieras: Record<string, number>;
  valorPendiente: number;
  valorGarantia: number;
  valorBodega: number;
  totalGastosCartera: number;
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

type Tone = "neutral" | "positive" | "negative" | "accent";

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function formatTimeLabel(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function toneClasses(tone: Tone) {
  switch (tone) {
    case "positive":
      return {
        card: "border-slate-200 bg-white",
        value: "text-emerald-700",
        detail: "text-slate-500",
      };
    case "negative":
      return {
        card: "border-red-200 bg-red-50/80",
        value: "text-red-700",
        detail: "text-red-600",
      };
    case "accent":
      return {
        card: "border-[#d7c3a0] bg-[#fff9ef]",
        value: "text-[#8f5b24]",
        detail: "text-[#8f5b24]",
      };
    default:
      return {
        card: "border-slate-200 bg-white",
        value: "text-slate-950",
        detail: "text-slate-500",
      };
  }
}

function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number | null;
  detail: string;
  tone?: Tone;
}) {
  const styles = toneClasses(tone);

  return (
    <div
      className={[
        "min-w-0 rounded-2xl border px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] transition",
        styles.card,
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p
        className={[
          "mt-4 max-w-full overflow-hidden text-[clamp(1.2rem,1.25vw,2.1rem)] font-black leading-[1.02] tracking-tight tabular-nums [overflow-wrap:anywhere]",
          styles.value,
        ].join(" ")}
      >
        {value === null ? "—" : formatoPesos(value)}
      </p>
      <p className={["mt-3 text-sm leading-6", styles.detail].join(" ")}>
        {detail}
      </p>
    </div>
  );
}

function SectionHeader({
  badge,
  title,
  description,
}: {
  badge: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
        {badge}
      </p>
      <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function ActionLink({
  href,
  label,
  primary = false,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition",
        primary
          ? "bg-[#e30613] text-white hover:bg-[#bd0711]"
          : "border border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function PanelFinancieroPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(
    null
  );

  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");

  const cargarContexto = async () => {
    try {
      const sessionRes = await fetch("/api/session", { cache: "no-store" });
      const sessionData = await sessionRes.json();

      if (!sessionRes.ok) {
        return;
      }

      setUser(sessionData);

      if (["ADMIN", "AUDITOR"].includes(String(sessionData?.rolNombre || "").toUpperCase())) {
        const sedesRes = await fetch("/api/sedes", { cache: "no-store" });
        const sedesData = await sedesRes.json();

        if (sedesRes.ok) {
          setSedes(Array.isArray(sedesData) ? sedesData : []);
        }
      } else {
        setSedes([]);
        setSedeFiltroId("TODAS");
      }
    } catch {}
  };

  const cargarResumen = async () => {
    try {
      setError("");

      const params = new URLSearchParams();

      if (esAdmin && sedeFiltroId !== "TODAS") {
        params.set("sedeId", sedeFiltroId);
      }

      const endpoint = params.size
        ? `/api/financiero?${params.toString()}`
        : "/api/financiero";

      const res = await fetch(endpoint, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error cargando panel financiero");
        return;
      }

      setResumen(data.resumen);
      setUltimaActualizacion(new Date());
    } catch {
      setError("Error interno cargando panel financiero");
    }
  };

  useEffect(() => {
    const init = async () => {
      await cargarContexto();
    };

    void init();
  }, []);

  useLiveRefresh(
    async () => {
      if (!user) {
        return;
      }

      await cargarResumen();
    },
    {
      enabled: Boolean(user),
      intervalMs: 10000,
      runOnMount: true,
    }
  );

  const totalFinancieras = Object.values(resumen?.financieras || {}).reduce(
    (acc, value) => acc + Number(value || 0),
    0
  );

  const activos =
    Number(resumen?.cajaDisponible || 0) +
    Number(resumen?.saldoTransferencias || 0) +
    Number(resumen?.prestamosPorCobrar || 0) +
    Number(resumen?.valorBodega || 0) +
    Number(totalFinancieras || 0);

  const pasivos =
    Number(resumen?.deudaEquipos || 0) +
    Number(resumen?.valorPendiente || 0) +
    Number(resumen?.valorGarantia || 0) +
    Number(resumen?.totalGastosCartera || 0);

  const resumenGeneral = activos - pasivos;

  const coberturaActual =
    !esAdmin || sedeFiltroId === "TODAS"
      ? esAdmin
        ? "Todas las sedes"
        : user?.sedeNombre || "Tu sede"
      : sedes.find((sede) => String(sede.id) === sedeFiltroId)?.nombre ||
        "Sede filtrada";

  const financierasOrdenadas = useMemo(() => {
    return Object.entries(resumen?.financieras || {})
      .map(([nombre, valor]) => ({
        nombre,
        valor: Number(valor || 0),
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [resumen?.financieras]);

  const valorMaximoFinanciera =
    financierasOrdenadas.length > 0 ? financierasOrdenadas[0].valor : 0;

  const alertas = useMemo(() => {
    const items: Array<{
      title: string;
      detail: string;
      tone: Tone;
    }> = [];

    if (resumenGeneral < 0) {
      items.push({
        title: "Resultado neto en rojo",
        detail: `Los pasivos superan a los activos por ${formatoPesos(
          Math.abs(resumenGeneral)
        )}.`,
        tone: "negative",
      });
    }

    if (Number(resumen?.cajaDisponible || 0) < 0) {
      items.push({
        title: "Caja disponible negativa",
        detail: `La caja disponible esta en ${formatoPesos(
          Number(resumen?.cajaDisponible || 0)
        )}.`,
        tone: "negative",
      });
    }

    if (Number(resumen?.valorPendiente || 0) > 0) {
      items.push({
        title: "Equipos pendientes",
        detail: `Tienes ${formatoPesos(
          Number(resumen?.valorPendiente || 0)
        )} comprometidos en estado pendiente.`,
        tone: "negative",
      });
    }

    if (Number(resumen?.valorGarantia || 0) > 0) {
      items.push({
        title: "Garantias abiertas",
        detail: `Hay ${formatoPesos(
          Number(resumen?.valorGarantia || 0)
        )} inmovilizados por garantia.`,
        tone: "negative",
      });
    }

    if (
      Number(resumen?.totalGastosCartera || 0) > 0 &&
      Number(resumen?.totalGastosCartera || 0) >=
        Number(resumen?.deudaEquipos || 0)
    ) {
      items.push({
        title: "Cartera con peso alto",
        detail: `El gasto de cartera alcanza ${formatoPesos(
          Number(resumen?.totalGastosCartera || 0)
        )}.`,
        tone: "negative",
      });
    }

    if (items.length === 0) {
      items.push({
        title: "Operacion estable",
        detail:
          "No hay alertas financieras criticas con los datos visibles en este corte.",
        tone: "positive",
      });
    }

    return items.slice(0, 4);
  }, [resumen, resumenGeneral]);

  const estadoResumen =
    resumenGeneral >= 0 ? "Balance saludable" : "Balance bajo presion";

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

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/caja"
        coverageLabel={coberturaActual}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Centro financiero
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Liquidez, riesgo operativo, cartera y financieras
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Cobertura: {coberturaActual}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Estado: {resumen ? estadoResumen : "Calculando balance"}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Actualizado:{" "}
                  {ultimaActualizacion
                    ? formatTimeLabel(ultimaActualizacion)
                    : "Cargando..."}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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

          <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="Balance financiero">
            <MetricCard
              label="Resultado neto"
              value={resumen ? resumenGeneral : null}
              detail="Activos disponibles menos compromisos operativos."
              tone={resumenGeneral >= 0 ? "positive" : "negative"}
            />
            <MetricCard
              label="Activos"
              value={resumen ? activos : null}
              detail="Liquidez, cartera por cobrar, bodega y financieras."
              tone="positive"
            />
            <MetricCard
              label="Pasivos"
              value={resumen ? pasivos : null}
              detail="Deudas, pendientes, garantías y gastos de cartera."
              tone="negative"
            />
          </section>

        <div className="mt-6 space-y-6">
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <SectionHeader
              badge="Acciones y control"
              title="Operacion financiera"
              description="Accede rapido a los movimientos financieros clave y controla la cobertura del panel."
            />

            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              {esAdmin && (
                <label className="flex min-w-[240px] flex-col gap-2 text-sm font-semibold text-slate-700">
                  Cobertura financiera
                  <select
                    value={sedeFiltroId}
                    onChange={(event) => setSedeFiltroId(event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                  >
                    <option value="TODAS">Todas las sedes</option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={String(sede.id)}>
                        {sede.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="flex flex-wrap gap-3">
                <FinancialPasswordSettings />
                <ActionLink
                  href="/dashboard/financiero/abonos"
                  label="Registrar abono"
                  primary
                />
                <ActionLink
                  href="/dashboard/financiero/cartera"
                  label="Registrar cartera"
                  primary
                />
                <ActionLink
                  href="/dashboard/financiero/abonos/detalle"
                  label="Detalle abonos"
                />
                <ActionLink
                  href="/dashboard/financiero/cartera/detalle"
                  label="Detalle cartera"
                />
                <ActionLink href="/dashboard" label="Volver" />
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {!resumen ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-slate-500 shadow-sm">
            Cargando panel financiero...
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <SectionHeader
                  badge="Liquidez"
                  title="Lectura operativa"
                  description="Dinero disponible, flujos de transferencia y respaldo financiero inmediato."
                />

                <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  <MetricCard
                    label="Caja disponible"
                    value={resumen.cajaDisponible}
                    detail="Ventas mas movimientos de caja."
                    tone={resumen.cajaDisponible >= 0 ? "positive" : "negative"}
                  />
                  <MetricCard
                    label="Transferencias saldo"
                    value={resumen.saldoTransferencias}
                    detail="Transferencias menos abonos registrados."
                    tone={resumen.saldoTransferencias >= 0 ? "positive" : "negative"}
                  />
                  <MetricCard
                    label="Financieras saldo"
                    value={totalFinancieras}
                    detail="Pendiente por recaudar en financieras."
                    tone={totalFinancieras >= 0 ? "positive" : "negative"}
                  />
                  <MetricCard
                    label="Prestamos por cobrar"
                    value={resumen.prestamosPorCobrar}
                    detail="Prestamos activos salientes pendientes por cierre o pago."
                    tone={resumen.prestamosPorCobrar >= 0 ? "positive" : "negative"}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <SectionHeader
                  badge="Alertas"
                  title="Lectura ejecutiva"
                  description="Señales rapidas para priorizar decisiones sin revisar todo el detalle."
                />

                <div className="mt-6 space-y-3">
                  {alertas.map((alerta, index) => {
                    const styles = toneClasses(alerta.tone);

                    return (
                      <div
                        key={`${alerta.title}-${index}`}
                        className={[
                          "rounded-2xl border px-4 py-4",
                          styles.card,
                        ].join(" ")}
                      >
                        <p className={["text-sm font-bold", styles.value].join(" ")}>
                          {alerta.title}
                        </p>
                        <p className={["mt-1 text-sm", styles.detail].join(" ")}>
                          {alerta.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <SectionHeader
                  badge="Riesgo y cartera"
                  title="Compromisos abiertos"
                  description="Pasivos operativos que presionan caja o amarran inventario."
                />

                <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  <MetricCard
                    label="Gasto cartera"
                    value={resumen.totalGastosCartera}
                    detail="Salidas registradas en cartera."
                    tone={
                      resumen.totalGastosCartera <= 0 ? "positive" : "negative"
                    }
                  />
                  <MetricCard
                    label="Deuda equipos"
                    value={resumen.deudaEquipos}
                    detail="Equipos con deuda financiera activa."
                    tone="negative"
                  />
                  <MetricCard
                    label="Pendiente"
                    value={resumen.valorPendiente}
                    detail="Inventario inmovilizado por pendiente."
                    tone="negative"
                  />
                  <MetricCard
                    label="Garantia"
                    value={resumen.valorGarantia}
                    detail="Valor comprometido en garantias."
                    tone="negative"
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <SectionHeader
                  badge="Inventario"
                  title="Respaldo operativo"
                  description="Valor del inventario disponible para soportar la operacion."
                />

                <div className="mt-6">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-500">
                      Equipos en bodega
                    </p>
                    <p className="mt-3 text-4xl font-black text-emerald-700">
                      {formatoPesos(resumen.valorBodega)}
                    </p>
                    <p className="mt-3 max-w-md text-sm leading-6 text-emerald-600">
                      Este valor funciona como respaldo inmediato del panel, al
                      concentrar el inventario disponible para venta o rotacion.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <SectionHeader
                  badge="Financieras"
                  title="Ranking de saldos"
                  description="Comparativo visual de las financieras con mayor peso en el corte actual."
                />

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Total saldo financieras:{" "}
                  <span className="font-bold text-slate-950">
                    {formatoPesos(totalFinancieras)}
                  </span>
                </div>
              </div>

              {financierasOrdenadas.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500">
                  No hay financieras registradas para esta vista.
                </p>
              ) : (
                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  {financierasOrdenadas.map((item) => {
                    const width =
                      valorMaximoFinanciera > 0
                        ? Math.max(8, (item.valor / valorMaximoFinanciera) * 100)
                        : 0;

                    return (
                      <div
                        key={item.nombre}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              {item.nombre}
                            </p>
                            <p className="mt-2 text-xl font-black text-slate-950">
                              {formatoPesos(item.valor)}
                            </p>
                          </div>

                          <div className="text-right text-sm text-slate-500">
                            {totalFinancieras > 0
                              ? `${((item.valor / totalFinancieras) * 100).toFixed(1)}%`
                              : "0.0%"}
                          </div>
                        </div>

                        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[#e30613]"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
        </div>
        </main>
      </div>
    </div>
  );
}
