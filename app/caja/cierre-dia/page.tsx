"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./cierre-dia.module.css";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
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

function fechaLegible(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : value;
}

function ReportContentCard({ detail, icon, title }: {
  detail: string; icon: DashboardIconName; title: string;
}) {
  return <article className={styles.contentItem}><span><DashboardIcon name={icon} /></span><div><h3>{title}</h3><p>{detail}</p></div></article>;
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
  const [errorCarga, setErrorCarga] = useState(false);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(
    String(user?.rolNombre || "").toUpperCase()
  );

  const cargarFiltros = useCallback(async () => {
    setCargando(true);
    setErrorCarga(false);
    setMensaje("");
    try {
      const sessionRes = await fetch("/api/session", { cache: "no-store" });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) {
        setUser(null);
        setErrorCarga(true);
        setMensaje(sessionData.error || "No se pudo cargar la sesión");
        return;
      }
      setUser(sessionData);
      if (["ADMIN", "AUDITOR"].includes(String(sessionData?.rolNombre || "").toUpperCase())) {
        const sedesRes = await fetch("/api/sedes", { cache: "no-store" });
        const sedesData = await sedesRes.json();
        if (sedesRes.ok && Array.isArray(sedesData)) setSedes(sedesData);
        else {
          setErrorCarga(true);
          setMensaje(sedesData.error || "No se pudieron cargar las sedes. Intenta nuevamente.");
        }
      }
    } catch {
      setErrorCarga(true);
      setMensaje("Error cargando los filtros del cierre");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargarFiltros(); }, [cargarFiltros]);

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
    { href: "/cierre", icon: "reports", label: "CIERRE" },
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
    if (cargando || !user || errorCarga) return;
    const params = buildParams(formato);

    if (!params) {
      return;
    }

    setMensaje("");
    window.open(`/api/caja/cierre-dia?${params.toString()}`, "_blank", "noopener");
  };

  const nombreUsuario = user?.nombre || user?.usuario || "Usuario";
  const secundarios = navigationItems.filter(item => ["/cierre", "/dashboard/reportes", "/dashboard/analitico", "/dashboard/sedes"].includes(item.href));
  const principales = navigationItems.filter(item => !secundarios.includes(item));
  const enlace = (item: NavigationItem) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/caja" ? styles.navActive : ""}`} aria-current={item.href === "/caja" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>;
  const tipoActual = !esAdmin || periodoTipo === "dia" ? "Día" : periodoTipo === "rango" ? "Rango de fechas" : "Mes completo";
  const periodoLegible = !esAdmin || periodoTipo === "dia" ? fechaLegible(periodoActual) : periodoTipo === "rango" ? `${fechaLegible(fechaInicio) || "—"} al ${fechaLegible(fechaFin) || "—"}` : /^\d{4}-\d{2}$/.test(mes) ? new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T12:00:00Z`)) : "Selecciona un mes";
  const disponible = Boolean(user) && !cargando && !errorCarga;

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" alt="" width={44} height={44} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{principales.map(enlace)}<div className={styles.extraNavigation}>{secundarios.map(enlace)}</div><details className={styles.moreNavigation} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Más<DashboardIcon name="chevron" /></summary><div>{secundarios.map(enlace)}</div></details></nav>
      <SalesProfile name={cargando && !user ? "Cargando usuario" : nombreUsuario} role={user?.rolNombre || "Sesión activa"} />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}>
        <div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/caja">Caja</Link><DashboardIcon name="arrow" /><span>Cierre del día</span></nav><h1>Cierre operativo</h1><p>Ventas, movimientos y caja del periodo seleccionado.</p></div>
        <Link href="/caja" className={styles.button}><DashboardIcon name="cash" />Ver caja</Link>
      </div>

      <section className={styles.summary} aria-label="Resumen del cierre" aria-busy={cargando}>
        <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="calendar" /></span><div><p>Periodo del reporte</p><strong>{periodoLegible || "Selecciona una fecha"}</strong><small>{tipoActual}</small></div></div>
        <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="store" /></span><div><p>Cobertura por sede</p><strong>{user ? cobertura : "—"}</strong><small>{user ? esAdmin ? "Consulta consolidada" : "Sede autorizada" : cargando ? "Cargando sesión…" : "Sin datos de sesión"}</small></div></div>
        <div className={styles.metric}><span className={styles.metricIcon}><DashboardIcon name="download" /></span><div><p>Formatos disponibles</p><strong>PDF y Excel</strong><small>Reporte de solo consulta</small></div></div>
      </section>

      <div className={styles.workspace}>
        <div className={styles.leftColumn}>
          <section className={styles.panel} aria-labelledby="close-config-title">
            <div className={styles.panelHeader}><span className={styles.sectionIcon}><DashboardIcon name="calendar" /></span><div><h2 id="close-config-title">Configura tu cierre</h2><p>Selecciona el periodo y la cobertura del informe.</p></div><span className={styles.step}>01</span></div>
            <div className={styles.formBody}>
              {esAdmin && <div className={styles.periodOptions} role="group" aria-label="Tipo de periodo">{opcionesPeriodo.map(opcion => <button key={opcion.value} type="button" aria-pressed={periodoTipo === opcion.value} onClick={() => { setPeriodoTipo(opcion.value); setMensaje(""); }} disabled={cargando}>{opcion.label}</button>)}</div>}
              <div className={styles.fields}>
                {(!esAdmin || periodoTipo === "dia") && <label>Fecha del cierre<input type="date" value={fecha} disabled={cargando} onChange={event => { setFecha(event.target.value); setMensaje(""); }} /></label>}
                {esAdmin && periodoTipo === "rango" && <><label>Fecha inicial<input type="date" value={fechaInicio} disabled={cargando} onChange={event => { setFechaInicio(event.target.value); setMensaje(""); }} /></label><label>Fecha final<input type="date" value={fechaFin} disabled={cargando} onChange={event => { setFechaFin(event.target.value); setMensaje(""); }} /></label></>}
                {esAdmin && periodoTipo === "mes" && <label>Mes del cierre<input type="month" value={mes} disabled={cargando} onChange={event => { setMes(event.target.value); setMensaje(""); }} /></label>}
                <label className={esAdmin && periodoTipo === "rango" ? styles.fullWidth : undefined}>Cobertura por sede{esAdmin ? <select value={sedeId} disabled={cargando} onChange={event => { setSedeId(event.target.value); setMensaje(""); }}><option value="TODAS">Todas las sedes</option>{sedes.map(sede => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</select> : <input value={user?.sedeNombre || "Cargando sede"} readOnly />}</label>
              </div>
              {cargando && <p className={styles.loading} role="status"><DashboardIcon name="refresh" />Cargando opciones del cierre…</p>}
              {(mensaje || errorCarga) && <div className={styles.notice} role="alert"><DashboardIcon name="warning" /><span>{mensaje || "No se pudieron cargar las opciones del cierre. Intenta nuevamente."}</span>{errorCarga && <button type="button" disabled={cargando} onClick={() => void cargarFiltros()}>Reintentar</button>}</div>}
            </div>
            <div className={styles.configFooter}><DashboardIcon name="shield" /><span>{esAdmin ? "Cobertura disponible según tu perfil administrativo." : "La consulta se limita a tu sede."}</span></div>
          </section>

          <section className={styles.panel} aria-labelledby="close-content-title">
            <div className={styles.panelHeader}><span className={`${styles.sectionIcon} ${styles.neutralIcon}`}><DashboardIcon name="catalog" /></span><div><h2 id="close-content-title">Contenido del cierre</h2><p>Información consolidada del periodo</p></div></div>
            <div className={styles.contentGrid}>
              <ReportContentCard icon="sales" title="Ventas y participantes" detail="Equipos, servicios, jaladores y cerradores." />
              <ReportContentCard icon="transfer" title="Ingresos y movimientos" detail="Ingresos, egresos, comisiones, salidas y caja." />
              <ReportContentCard icon="store" title="Financieras" detail="Operaciones financiadas y sus valores." />
              <ReportContentCard icon="reports" title="Resumen ejecutivo" detail="Indicadores y comparativos del periodo." />
            </div>
          </section>
        </div>

        <aside className={`${styles.panel} ${styles.downloadPanel}`} aria-labelledby="download-title">
          <div className={styles.receipt}><div className={styles.receiptHeading}><span><DashboardIcon name="document" /></span><span className={styles.receiptTag}>{tipoActual}</span></div><p>INFORME DEL CIERRE</p><h2 id="download-title">Tu reporte operativo</h2><div className={styles.receiptPeriod}>{periodoLegible || "Selecciona una fecha"}</div><div className={styles.receiptScope}><DashboardIcon name="store" /><span>{user ? cobertura : "Cargando cobertura…"}</span></div></div>
          <div className={styles.downloadBody}><h3>{cargando ? "Preparando opciones…" : !disponible ? "Revisa la configuración" : "Listo para generar"}</h3><p>Elige el formato de descarga.</p><div className={styles.downloadActions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={!disponible} onClick={() => generarCierre("pdf")}><DashboardIcon name="document" />Descargar PDF<DashboardIcon name="download" /></button><button type="button" className={`${styles.button} ${styles.graphite}`} disabled={!disponible} onClick={() => generarCierre("excel")}><DashboardIcon name="download" />Descargar Excel<DashboardIcon name="arrow" /></button></div><div className={styles.downloadNote}><DashboardIcon name="lock" /><span>La descarga no modifica ventas ni movimientos de caja.</span></div></div>
        </aside>
      </div>
    </main>
  </div>;
}
