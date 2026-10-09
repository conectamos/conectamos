"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./approvals.module.css";

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

const categoriaConfig: Record<Categoria, { icon: DashboardIconName; label: string }> = {
  devoluciones: { icon: "arrow", label: "Devolución" },
  pagos: { icon: "cash", label: "Pago" },
  prestamos: { icon: "loans", label: "Préstamo" },
  ventas: { icon: "sales", label: "Venta" },
};

function formatoPesos(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "Sin valor asociado";
  return "$ " + Number(valor || 0).toLocaleString("es-CO");
}

function formatoFecha(valor: string) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "-";
  return fecha.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

function prioridadLabel(prioridad: BandejaItem["prioridad"]) {
  if (prioridad === "alta") return "Prioridad alta";
  if (prioridad === "media") return "Prioridad media";
  return "Prioridad normal";
}

function ApprovalCard({ item }: { item: BandejaItem }) {
  const config = categoriaConfig[item.categoria];
  const recorrido = item.sedeOrigen && item.sedeDestino && item.sedeOrigen !== item.sedeDestino
    ? item.sedeOrigen + " → " + item.sedeDestino
    : item.sedeDestino || item.sedeOrigen || "-";
  return <article className={styles.request} aria-label={item.titulo}>
    <div className={styles.requestHeader}>
      <span className={styles.requestIcon}><DashboardIcon name={config.icon} /></span>
      <div className={styles.requestTitle}>
        <div className={styles.badges}><span>{config.label}</span><span className={item.prioridad === "alta" ? styles.highPriority : styles.priority}>{prioridadLabel(item.prioridad)}</span></div>
        <h2>{item.titulo}</h2><p>{item.detalle}</p>
      </div>
      <time className={styles.requestDate} dateTime={item.fecha}><DashboardIcon name="calendar" />{formatoFecha(item.fecha)}</time>
    </div>
    <dl className={styles.requestDetails}>
      <div><dt>Referencia</dt><dd>{item.referencia || "-"}</dd></div>
      <div><dt>Cliente / IMEI</dt><dd>{item.cliente && <span>{item.cliente}</span>}<span>{item.imei || "-"}</span></dd></div>
      <div><dt>Ruta / Sede</dt><dd>{recorrido}</dd></div>
      <div><dt>Valor</dt><dd className={item.valor != null && item.valor < 0 ? styles.negative : undefined}>{formatoPesos(item.valor)}</dd></div>
    </dl>
    <div className={styles.requestFooter}><p><span className={styles.statusDot} />Estado <strong>{item.estado}</strong></p><Link href={item.href} className={styles.actionLink}>{item.accion}<DashboardIcon name="arrow" /></Link></div>
  </article>;
}

function EmptyInboxIllustration() {
  return <svg className={styles.emptyIllustration} width="220" height="180" viewBox="0 0 220 180" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="approval-paper" x1="90" y1="23" x2="142" y2="128" gradientUnits="userSpaceOnUse"><stop stopColor="#FAFAFA" /><stop offset="1" stopColor="#D6D8D8" /></linearGradient>
      <linearGradient id="approval-tray" x1="40" y1="116" x2="183" y2="162" gradientUnits="userSpaceOnUse"><stop stopColor="#777C7E" /><stop offset=".45" stopColor="#353B3E" /><stop offset="1" stopColor="#565C60" /></linearGradient>
      <filter id="approval-shadow" x="10" y="125" width="200" height="55" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="7" /></filter>
    </defs>
    <ellipse cx="110" cy="153" rx="75" ry="10" fill="#11161D" opacity=".18" filter="url(#approval-shadow)" />
    <path d="M48 76h124l20 64H28l20-64Z" fill="#333A3E" stroke="#7D8385" strokeWidth="3" />
    <path d="M52 82h116l13 45H39l13-45Z" fill="#1C2226" />
    <path d="M65 24a5 5 0 0 1 5-5h79a5 5 0 0 1 5 5v103l-12 12H65V24Z" fill="url(#approval-paper)" stroke="#E5E7E7" />
    <path d="M82 48h37M82 64h56M82 80h56M82 96h46" stroke="#CACDCE" strokeWidth="6" strokeLinecap="round" />
    <path d="M30 119h43c5 0 8 4 11 10l4 6h43l5-6c3-6 6-10 12-10h43v32a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8v-32Z" fill="url(#approval-tray)" stroke="#8C9193" strokeWidth="2" />
    <path d="M35 122h37c5 0 8 3 12 10l4 6h44l6-8c3-5 6-8 11-8h37" stroke="#B6BABC" strokeWidth="2" opacity=".7" />
    <circle cx="164" cy="33" r="22" fill="#fff" stroke="#288A3D" strokeWidth="2.5" />
    <path d="m153 33 7 7 14-15" stroke="#288A3D" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function LoadingCards() {
  return <div className={styles.loading} role="status" aria-label="Cargando aprobaciones"><span className={styles.spinner} /><p>Cargando aprobaciones…</p><div className={styles.skeletonRows} aria-hidden="true">{[0, 1, 2].map((row) => <div key={row}><span /><span /><span /></div>)}</div></div>;
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
  const cobertura = data?.cobertura || (esAdmin ? "Todas las sedes" : session.sedeNombre);
  const hayDatos = Boolean(data && !mensaje);
  const bandejaVacia = hayDatos && !cargando && items.length === 0;
  const limpiarFiltros = () => { setBusqueda(""); setFiltro("todos"); };
  const indicadores: Array<{ label: string; icon: DashboardIconName; value: number }> = [
    { label: "Total pendientes", icon: "approvals", value: resumen.total },
    { label: "Préstamos", icon: "loans", value: resumen.prestamos },
    { label: "Pagos", icon: "cash", value: resumen.pagos },
    { label: "Devoluciones", icon: "arrow", value: resumen.devoluciones },
    { label: "Ventas", icon: "sales", value: resumen.ventas },
  ];

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS · Inicio"><Image src="/branding/conectamos-logo.png" width={44} height={44} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{navigationItems.map((item) => <Link key={item.href} href={item.href} aria-current={item.href === "/dashboard/aprobaciones" ? "page" : undefined} className={styles.navItem + " " + (item.href === "/dashboard/aprobaciones" ? styles.navActive : "")}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
      <SalesProfile name={usuario} role={session.perfilTipoLabel} />
    </header>
    <main className={styles.main}>
      <header className={styles.heading}>
        <div><h1>Bandeja de aprobaciones</h1><p>Préstamos, pagos, devoluciones y ventas</p></div>
        <div className={styles.headingActions}><span className={styles.coverage} aria-label={"Sede consultada: " + cobertura}><DashboardIcon name="store" />{cobertura}</span><button type="button" className={styles.button + " " + styles.primary} disabled={cargando} onClick={() => void cargarBandeja()}><DashboardIcon name="refresh" className={cargando ? styles.spinning : undefined} />{cargando ? "Actualizando…" : "Actualizar"}</button></div>
      </header>
      <section className={styles.metrics} aria-label="Resumen de aprobaciones" aria-busy={cargando}>{indicadores.map((item) => <article className={styles.metric} key={item.label}><span className={styles.metricIcon}><DashboardIcon name={item.icon} /></span><div><p>{item.label}</p><strong>{hayDatos ? item.value.toLocaleString("es-CO") : "—"}</strong></div></article>)}</section>
      <section className={styles.panel} aria-label="Solicitudes de aprobación" aria-busy={cargando}>
        <div className={styles.panelHeader}>
          <div className={styles.tabs} role="tablist" aria-label="Filtrar aprobaciones">{filtros.map((item) => <button key={item.key} id={"aprobaciones-tab-" + item.key} type="button" role="tab" aria-selected={filtro === item.key} aria-controls="aprobaciones-resultados" className={styles.tab + " " + (filtro === item.key ? styles.tabActive : "")} onClick={() => setFiltro(item.key)}>{item.label}<span>{hayDatos ? (item.key === "todos" ? resumen.total : resumen[item.key]).toLocaleString("es-CO") : "—"}</span></button>)}</div>
          <label className={styles.search}><DashboardIcon name="search" /><input aria-label="Buscar aprobaciones" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar IMEI, cliente, referencia o sede..." />{busqueda && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBusqueda("")}><DashboardIcon name="close" /></button>}</label>
        </div>
        <div id="aprobaciones-resultados" role="tabpanel" aria-labelledby={"aprobaciones-tab-" + filtro} className={styles.results}>
          {mensaje ? <div className={styles.errorState} role="alert"><span className={styles.errorIcon}><DashboardIcon name="warning" /></span><h2>No se pudo cargar la bandeja</h2><p>{mensaje}</p><button type="button" className={styles.button} disabled={cargando} onClick={() => void cargarBandeja()}><DashboardIcon name="refresh" />Reintentar</button></div>
            : cargando && (!data || itemsFiltrados.length === 0) ? <LoadingCards />
            : bandejaVacia ? <div className={styles.emptyState}><EmptyInboxIllustration /><h2>No tienes aprobaciones pendientes</h2><p>No hay solicitudes pendientes para {cobertura}.</p><button type="button" className={styles.button} onClick={() => void cargarBandeja()}><DashboardIcon name="refresh" />Actualizar bandeja</button>{(busqueda || filtro !== "todos") && <button type="button" className={styles.textButton} onClick={limpiarFiltros}>Limpiar filtros</button>}</div>
            : itemsFiltrados.length === 0 && !cargando ? <div className={styles.emptyState}><span className={styles.noMatchIcon}><DashboardIcon name="search" /></span><h2>No hay solicitudes en esta vista</h2><p>{busqueda ? "No encontramos coincidencias para tu búsqueda." : "No hay pendientes en la categoría seleccionada."}</p><button type="button" className={styles.button} onClick={limpiarFiltros}><DashboardIcon name="refresh" />Limpiar filtros</button></div>
            : <>{cargando && <p className={styles.refreshNotice} role="status"><span className={styles.spinner} />Actualizando bandeja…</p>}<div className={styles.requests}>{itemsFiltrados.map((item) => <ApprovalCard key={item.id} item={item} />)}</div></>}
        </div>
        <footer className={styles.panelFooter}><span aria-live="polite">{cargando ? "Consultando…" : !hayDatos ? "Resultados no disponibles" : itemsFiltrados.length.toLocaleString("es-CO") + " " + (itemsFiltrados.length === 1 ? "resultado" : "resultados")}</span>{hayDatos && resumen.alta > 0 && <span className={styles.priorityNotice}><DashboardIcon name="warning" />{resumen.alta.toLocaleString("es-CO")} de prioridad alta</span>}</footer>
      </section>
    </main>
  </div>;
}
