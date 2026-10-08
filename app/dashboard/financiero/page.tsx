"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FinancialPasswordSettings from "./_components/financial-password-settings";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { DashboardSidebar, type NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  calcularBalanceFinanciero,
  formatoPesos,
  obtenerAlertasFinancieras,
  obtenerSaldosFinancieras,
  type FinancialSummary,
} from "@/lib/financial-dashboard-view";
import styles from "./financial.module.css";

type SessionUser = {
  id: number;
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre: string;
  rolId: number;
  rolNombre: string;
};
type Sede = { id: number; nombre: string };
type CorteFinanciero = {
  resumen: FinancialSummary;
  cobertura: string;
  actualizado: Date;
};

function formatTimeLabel(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(date);
}

function FinancialRow({ icon, label, value, commitment = false, cash = false }: {
  icon: DashboardIconName;
  label: string;
  value: number;
  commitment?: boolean;
  cash?: boolean;
}) {
  const formatted = formatoPesos(value);
  return (
    <div className={styles.financialRow}>
      <dt className={styles.rowLabel}>
        <span className={`${styles.rowIcon} ${commitment ? styles.commitmentIcon : ""}`}><DashboardIcon name={icon} className="h-6 w-6" /></span>
        <span>{label}</span>
      </dt>
      <dd className={`${styles.rowValue} ${cash ? (value < 0 ? styles.negative : styles.positive) : ""} ${formatted.length > 18 ? styles.longRowValue : ""}`}>{formatted}</dd>
    </div>
  );
}

export default function PanelFinancieroPage() {
  const [corte, setCorte] = useState<CorteFinanciero | null>(null);
  const corteRef = useRef<CorteFinanciero | null>(null);
  const solicitudRef = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [actualizacionAdvertencia, setActualizacionAdvertencia] = useState("");
  const [contextoAdvertencia, setContextoAdvertencia] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [contextoVersion, setContextoVersion] = useState(0);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [catalogoFinancieras, setCatalogoFinancieras] = useState<string[]>([]);
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const accionesRef = useRef<HTMLDetailsElement | null>(null);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");
  const coberturaKey = esAdmin ? sedeFiltroId : String(user?.sedeId || "TODAS");
  // Nunca presentar el corte anterior con el nombre de una cobertura nueva.
  const resumen = corte?.cobertura === coberturaKey ? corte.resumen : null;
  const ultimaActualizacion = resumen ? corte?.actualizado : null;

  useEffect(() => {
    const controller = new AbortController();
    const cargarContexto = async () => {
      setError("");
      try {
        const sessionRes = await fetch("/api/session", { cache: "no-store", signal: controller.signal });
        const sessionData = await sessionRes.json();
        if (!sessionRes.ok) {
          setError(sessionData.error || "No se pudo cargar la sesión");
          return;
        }
        setUser(sessionData);
        const peticiones = [fetch("/api/ventas/catalogo-personal", { cache: "no-store", signal: controller.signal })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok || !Array.isArray(data.financieras)) throw new Error("No se pudo cargar el catálogo de financieras");
            setCatalogoFinancieras(data.financieras.map((item: { nombre: string }) => item.nombre));
          })];
        if (["ADMIN", "AUDITOR"].includes(String(sessionData.rolNombre || "").toUpperCase())) {
          peticiones.push(fetch("/api/sedes", { cache: "no-store", signal: controller.signal })
            .then(async (res) => {
              const data = await res.json();
              if (!res.ok || !Array.isArray(data)) throw new Error("No se pudieron cargar las sedes");
              setSedes(data);
            }));
        }
        const resultados = await Promise.allSettled(peticiones);
        if (!controller.signal.aborted) {
          setContextoAdvertencia(resultados.some((resultado) => resultado.status === "rejected")
            ? "No se pudo completar el catálogo de financieras o coberturas. Reintenta para mostrar todas las opciones."
            : "");
        }
      } catch {
        if (!controller.signal.aborted) setError("No se pudo cargar la sesión");
      }
    };
    void cargarContexto();
    return () => controller.abort();
  }, [contextoVersion]);

  const cargarResumen = useCallback(async () => {
    if (!user) return;
    solicitudRef.current?.abort();
    const controller = new AbortController();
    solicitudRef.current = controller;
    try {
      const params = new URLSearchParams();
      if (esAdmin && sedeFiltroId !== "TODAS") params.set("sedeId", sedeFiltroId);
      const endpoint = params.size ? `/api/financiero?${params.toString()}` : "/api/financiero";
      const res = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (controller.signal.aborted || solicitudRef.current !== controller) return;
      if (!res.ok || !data.resumen) throw new Error(data.error || "Error cargando panel financiero");
      const nuevoCorte = { resumen: data.resumen, cobertura: coberturaKey, actualizado: new Date() };
      corteRef.current = nuevoCorte;
      setCorte(nuevoCorte);
      setError("");
      setActualizacionAdvertencia("");
    } catch (cause) {
      if (controller.signal.aborted || solicitudRef.current !== controller) return;
      if (corteRef.current?.cobertura === coberturaKey) {
        setActualizacionAdvertencia("No se pudo actualizar el panel en este momento. Se conservan los últimos datos válidos.");
      } else {
        setError(cause instanceof Error ? cause.message : "Error interno cargando panel financiero");
      }
    }
  }, [coberturaKey, esAdmin, sedeFiltroId, user]);

  useEffect(() => {
    setError("");
    setActualizacionAdvertencia("");
    void cargarResumen();
    return () => solicitudRef.current?.abort();
  }, [cargarResumen]);
  useLiveRefresh(cargarResumen, { enabled: Boolean(user), intervalMs: 30000 });

  useEffect(() => {
    const cerrarAcciones = (event: PointerEvent) => {
      if (accionesRef.current && !accionesRef.current.contains(event.target as Node)) accionesRef.current.open = false;
    };
    const cerrarConEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && accionesRef.current?.open) {
        accionesRef.current.open = false;
        accionesRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", cerrarAcciones);
    document.addEventListener("keydown", cerrarConEscape);
    return () => {
      document.removeEventListener("pointerdown", cerrarAcciones);
      document.removeEventListener("keydown", cerrarConEscape);
    };
  }, []);

  const { totalFinancieras, activos, pasivos, resultadoNeto } = calcularBalanceFinanciero(resumen);
  const alertas = useMemo(() => resumen ? obtenerAlertasFinancieras(resumen, resultadoNeto) : [], [resumen, resultadoNeto]);
  const financierasOrdenadas = useMemo(() => obtenerSaldosFinancieras(resumen, catalogoFinancieras), [resumen, catalogoFinancieras]);
  const coberturaActual = !esAdmin || sedeFiltroId === "TODAS"
    ? esAdmin ? "Todas las sedes" : user?.sedeNombre || "Tu sede"
    : sedes.find((sede) => String(sede.id) === sedeFiltroId)?.nombre || "Sede filtrada";
  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "wallet", label: "Caja" },
    { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico", icon: "reports", label: "Reportes" },
    ...(esAdmin ? [{ href: "/dashboard/sedes", icon: "settings", label: "Configuración" } satisfies NavigationItem] : []),
  ];
  const inicialesUsuario = String(user?.nombre || user?.usuario || "").split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]?.toUpperCase()).join("");
  const summaryValue = (valor: number) => {
    const length = formatoPesos(valor).length;
    return `${styles.summaryValue} ${length > 17 ? styles.extraLongSummaryValue : length > 13 ? styles.mediumSummaryValue : length > 12 ? styles.longSummaryValue : ""}`;
  };

  return (
    <div className={styles.page}>
      <DashboardSidebar activeHref="/caja" coverageLabel={coberturaActual} items={navigationItems} appearance="financial" />
      <div className={styles.content}>
        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.heading}><h1>Centro financiero</h1><p>Resumen de tu operación</p></div>
            <div className={styles.user}>
              <span className={styles.avatar}>{inicialesUsuario || <DashboardIcon name="user" />}</span>
              <div><p>{user?.nombre || user?.usuario || "Cargando usuario"}</p><span>{user?.rolNombre || "Sesión activa"}</span></div>
            </div>
            <div className={styles.toolbar}>
              <label className={styles.coverage}><span>Cobertura</span>
                <select aria-label="Cobertura" value={esAdmin ? sedeFiltroId : coberturaKey} onChange={(event) => setSedeFiltroId(event.target.value)} disabled={!esAdmin}>
                  {esAdmin ? <><option value="TODAS">Todas las sedes</option>{sedes.map((sede) => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</> : <option value={coberturaKey}>{coberturaActual}</option>}
                </select>
              </label>
              <FinancialPasswordSettings />
              <Link href="/dashboard/financiero/abonos" className={`${styles.action} ${styles.redAction}`}>Registrar abono</Link>
              <Link href="/dashboard/financiero/cartera" className={`${styles.action} ${styles.darkAction}`}>Registrar cartera</Link>
              <details className={styles.moreActions} ref={accionesRef}>
                <summary className={styles.action}>Más acciones<DashboardIcon name="chevron" className="h-4 w-4" /></summary>
                <div className={styles.actionsMenu}>
                  <Link href="/dashboard" className={styles.menuAction}>Volver<DashboardIcon name="arrow" className="h-4 w-4 rotate-180" /></Link>
                  <Link href="/dashboard/financiero/abonos/detalle" className={styles.menuAction}>Detalle de abonos<DashboardIcon name="arrow" className="h-4 w-4" /></Link>
                  <Link href="/dashboard/financiero/cartera/detalle" className={styles.menuAction}>Detalle de cartera<DashboardIcon name="arrow" className="h-4 w-4" /></Link>
                  <button type="button" className={styles.menuAction} disabled={!user} onClick={() => { if (accionesRef.current) accionesRef.current.open = false; setContextoVersion((version) => version + 1); }}>Actualizar<DashboardIcon name="refresh" className="h-4 w-4" /></button>
                  <LogoutButton variant="light" className={styles.logout} />
                  {resumen && <p className={styles.menuStatus}>{resultadoNeto >= 0 ? "Balance saludable" : "Balance bajo presión"}</p>}
                </div>
              </details>
            </div>
            <p className={styles.updated} role="status">{ultimaActualizacion ? <>Actualizado <time dateTime={ultimaActualizacion.toISOString()}>{formatTimeLabel(ultimaActualizacion)}</time></> : "Actualizando corte…"}</p>
          </header>

          {error && <div className={styles.error} role="alert">{error}<button type="button" onClick={() => { if (user) void cargarResumen(); else setContextoVersion((version) => version + 1); }}>Reintentar</button></div>}
          {actualizacionAdvertencia && <div className={styles.warning} role="status">{actualizacionAdvertencia}</div>}
          {contextoAdvertencia && <div className={`${styles.warning} ${styles.error}`} role="status">{contextoAdvertencia}<button type="button" onClick={() => setContextoVersion((version) => version + 1)}>Reintentar</button></div>}

          <section className={styles.balance} aria-label="Balance financiero" aria-busy={!resumen}>
            <div className={styles.netResult}>
              <h2>Resultado neto</h2><p className={summaryValue(resultadoNeto)}>{resumen ? formatoPesos(resultadoNeto) : "—"}</p>
              <p className={styles.resultDescription}>Activos menos pasivos</p>
              {resumen && <span className="sr-only">{resultadoNeto >= 0 ? "Balance saludable" : "Balance bajo presión"}</span>}
            </div>
            <div className={styles.balanceItem}><h2>Activos</h2><p className={summaryValue(activos)}>{resumen ? formatoPesos(activos) : "—"}</p></div>
            <div className={styles.balanceItem}><h2>Pasivos</h2><p className={summaryValue(pasivos)}>{resumen ? formatoPesos(pasivos) : "—"}</p></div>
          </section>

          {!resumen ? <div className={styles.loading} role="status">{error ? "No hay datos disponibles para esta cobertura." : "Cargando panel financiero…"}</div> : <>
            <div className={styles.alerts}>
              {alertas.length === 0 ? <p className={styles.noAlerts}><span aria-hidden="true" />Sin alertas críticas en este corte.</p> : (
                <details className={styles.alertDetails}>
                  <summary><DashboardIcon name="warning" className="h-5 w-5" /><span>{alertas.length} {alertas.length === 1 ? "alerta financiera" : "alertas financieras"} en este corte</span><span className={styles.alertPreview}>{alertas.map((alerta) => alerta.title).join(" · ")}</span><span className={styles.alertDetailLabel}>Ver detalle</span><DashboardIcon name="chevron" className="h-4 w-4" /></summary>
                  <ul>{alertas.map((alerta) => <li key={alerta.title}><div><strong>{alerta.title}</strong><p>{alerta.detail}</p></div>{alerta.href && <Link href={alerta.href} aria-label={`Ver detalle: ${alerta.title}`}>Ver detalle<DashboardIcon name="arrow" className="h-4 w-4" /></Link>}</li>)}</ul>
                </details>
              )}
            </div>

            <div className={styles.centralGrid}>
              <section className={styles.panel} aria-labelledby="availability-title">
                <h2 id="availability-title">Disponibilidad y cobros</h2>
                <dl>
                  <FinancialRow icon="wallet" label="Caja disponible" value={resumen.cajaDisponible} cash />
                  <FinancialRow icon="transfer" label="Transferencias" value={resumen.saldoTransferencias} />
                  <FinancialRow icon="document" label="Financieras por cobrar" value={totalFinancieras} />
                  <FinancialRow icon="receivable" label="Préstamos por cobrar" value={resumen.prestamosPorCobrar} />
                  <FinancialRow icon="inventory" label="Equipos en bodega" value={resumen.valorBodega} />
                </dl>
              </section>
              <section className={`${styles.panel} ${styles.commitments}`} aria-labelledby="commitments-title">
                <h2 id="commitments-title">Compromisos</h2>
                <dl>
                  <FinancialRow icon="document" label="Gasto de cartera" value={resumen.totalGastosCartera} commitment />
                  <FinancialRow icon="inventory" label="Deuda de equipos" value={resumen.deudaEquipos} commitment />
                  <FinancialRow icon="clock" label="Equipos pendientes" value={resumen.valorPendiente} commitment />
                  <FinancialRow icon="shield" label="Garantías" value={resumen.valorGarantia} commitment />
                </dl>
                <div className={styles.detailLinks}>
                  <Link href="/dashboard/financiero/abonos/detalle">Detalle de abonos<DashboardIcon name="arrow" className="h-4 w-4" /></Link>
                  <Link href="/dashboard/financiero/cartera/detalle">Detalle de cartera<DashboardIcon name="arrow" className="h-4 w-4" /></Link>
                </div>
              </section>
            </div>

            <section className={`${styles.panel} ${styles.balancesPanel}`} aria-labelledby="finance-balances-title">
              <div className={styles.balancesHeading}><h2 id="finance-balances-title">Saldos por financiera</h2><p>Total <strong>{formatoPesos(totalFinancieras)}</strong></p></div>
              {financierasOrdenadas.length === 0 ? <p className={styles.empty}>No hay financieras registradas para esta vista.</p> : (
                <table className={styles.financeTable}>
                  <thead><tr><th scope="col">Financiera</th><th scope="col">Saldo pendiente</th><th scope="col">Participación</th></tr></thead>
                  <tbody>{financierasOrdenadas.map((item) => <tr key={item.nombre}>
                    <th scope="row">{item.nombre}</th><td data-label="Saldo pendiente">{formatoPesos(item.valor)}</td>
                    <td data-label="Participación"><div className={styles.participation}><div className={styles.barTrack} aria-hidden="true"><div className={styles.barFill} style={{ width: `${item.anchoBarra}%` }} /></div><span>{new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(item.participacion)}%</span></div></td>
                  </tr>)}</tbody>
                </table>
              )}
            </section>
          </>}
        </main>
      </div>
    </div>
  );
}
