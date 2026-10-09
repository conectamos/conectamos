"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { RecordDeviceVisual } from "@/app/vendedor/registros/buscar/device-visual";
import { formatoPesos } from "@/lib/monthly-reports-view";
import styles from "./sales-approvals.module.css";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  rolNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type FinancieraRegistro = {
  plataformaCredito?: string;
  creditoAutorizado?: string | number | null;
  cuotaInicial?: string | number | null;
  tipoPagoInicial?: string | null;
};

type RegistroAprobacion = {
  id: number;
  createdAt: string;
  sedeId: number | null;
  sedeNombre?: string | null;
  puntoVenta: string | null;
  clienteNombre: string;
  tipoDocumento: string;
  documentoNumero: string;
  tipoProducto?: string | null;
  referenciaEquipo: string | null;
  serialImei: string | null;
  asesorNombre: string | null;
  jaladorNombre: string | null;
  numeroFactura: string | null;
  estadoFacturacion: string | null;
  estadoVentaRegistro: string | null;
  observacion: string | null;
  plataformaCredito: string | null;
  medioPago1Tipo: string | null;
  medioPago1Valor: string | number | null;
  medioPago2Tipo: string | null;
  medioPago2Valor: string | number | null;
  financierasDetalle: FinancieraRegistro[];
};

type ResumenAprobaciones = {
  total: number;
  totalPendientes: number;
  page: number;
  pageSize: number;
  totalPages: number;
  cobertura: string;
  sedes: Array<{ value: string; label: string }>;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Sin fecha";
  return date.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Sin valor";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatoPesos(parsed) : "Sin valor";
}

function esRegistroContado(registro: Pick<RegistroAprobacion, "plataformaCredito">) {
  return ["CONTADO", "CONTADO CLARO", "CONTADO LIBRES"].includes(String(registro.plataformaCredito || "").trim().toUpperCase());
}

function totalIngresosRegistro(registro: RegistroAprobacion) {
  const primero = Number(registro.medioPago1Valor ?? 0);
  const segundo = Number(registro.medioPago2Valor ?? 0);
  return (Number.isFinite(primero) ? primero : 0) + (Number.isFinite(segundo) ? segundo : 0);
}

function FinancialCell({ registro }: { registro: RegistroAprobacion }) {
  const contado = esRegistroContado(registro);
  const ingresos = [
    { tipo: registro.medioPago1Tipo, valor: registro.medioPago1Valor, label: "Ingreso 1" },
    { tipo: registro.medioPago2Tipo, valor: registro.medioPago2Valor, label: "Ingreso 2" },
  ].filter((ingreso) => ingreso.tipo || (ingreso.valor !== null && ingreso.valor !== undefined && ingreso.valor !== ""));
  const inicialUnica = !contado && registro.financierasDetalle.length === 1 && ingresos.length === 1
    && registro.financierasDetalle[0].cuotaInicial != null
    && registro.financierasDetalle[0].cuotaInicial !== ""
    && ingresos[0].valor != null && ingresos[0].valor !== ""
    && Number(registro.financierasDetalle[0].cuotaInicial) === Number(ingresos[0].valor)
    && String(registro.financierasDetalle[0].tipoPagoInicial || registro.medioPago1Tipo || "").trim().toUpperCase() === String(ingresos[0].tipo || "").trim().toUpperCase();
  return <div className={styles.financialCell}>
    {contado ? <div className={styles.financial}><span>Contado</span><strong>{formatMoney(totalIngresosRegistro(registro))}</strong></div>
      : registro.financierasDetalle.length > 0 ? registro.financierasDetalle.map((item, index) => <div key={`${registro.id}-fin-${index}`} className={styles.financial}>
        <span>{item.plataformaCredito || `Financiera ${index + 1}`}</span>
        <strong>{formatMoney(item.creditoAutorizado)}</strong>
        {!inicialUnica && item.cuotaInicial !== null && item.cuotaInicial !== undefined && item.cuotaInicial !== "" && <p className={styles.initial}>Inicial: {formatMoney(item.cuotaInicial)} · {item.tipoPagoInicial || registro.medioPago1Tipo || "Sin medio de pago"}</p>}
      </div>) : <p className={styles.secondary}>{registro.plataformaCredito || "Sin financiera"}</p>}
    {ingresos.length > 0 && <div className={styles.incomes}>{ingresos.map((ingreso) => <p key={ingreso.label}><span>{inicialUnica ? "Inicial" : ingreso.label}:</span> {formatMoney(ingreso.valor)} · {ingreso.tipo || "Sin medio de pago"}</p>)}</div>}
  </div>;
}

function ApprovalRow({ registro }: { registro: RegistroAprobacion }) {
  const estado = registro.estadoFacturacion || "PENDIENTE";
  const facturado = estado.trim().toUpperCase() === "FACTURADO";
  return <tr className={styles.recordRow}>
    <td data-label="Fecha / Sede"><time dateTime={registro.createdAt}>{formatDate(registro.createdAt)}</time><p className={styles.secondary}>{registro.puntoVenta || registro.sedeNombre || "Sin punto"}</p></td>
    <td data-label="Cliente / Cédula"><strong>{registro.clienteNombre}</strong><p className={styles.identifier}>{registro.tipoDocumento} {String(registro.documentoNumero || "").replace(/[.\s]/g, "")}</p></td>
    <td data-label="Equipo / IMEI"><div className={styles.equipment}><RecordDeviceVisual reference={registro.referenciaEquipo} productType={registro.tipoProducto} className={styles.deviceIcon} /><div><strong>{registro.referenciaEquipo || "Sin referencia"}</strong><p className={styles.identifier}>IMEI: <span>{registro.serialImei || "Sin IMEI"}</span></p></div></div></td>
    <td data-label="Asesor / Jalador"><strong>{registro.asesorNombre || "Sin asesor"}</strong><p className={styles.secondary}>Jalador: {registro.jaladorNombre || "Sin jalador"}</p></td>
    <td data-label="Observación"><p className={styles.observation}>{registro.observacion || "—"}</p></td>
    <td data-label="Financiera / Inicial"><FinancialCell registro={registro} /></td>
    <td data-label="Facturación"><span className={styles.invoiceStatus + " " + (facturado ? styles.invoiced : "")}>{estado.replace(/_/g, " ").toLocaleLowerCase("es-CO")}</span><p className={styles.secondary}>{registro.numeroFactura ? `Factura: ${registro.numeroFactura}` : "Factura pendiente"}</p></td>
    <td data-label="Acción"><Link href={`/ventas/nuevo?registroId=${registro.id}`} className={styles.completeButton}>Completar venta</Link></td>
  </tr>;
}

export default function VentasAprobacionesWorkspace({ session }: { session: SessionProps }) {
  const [registros, setRegistros] = useState<RegistroAprobacion[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [sedeSeleccionada, setSedeSeleccionada] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [resumen, setResumen] = useState<ResumenAprobaciones | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [revision, setRevision] = useState(0);
  const esAdmin = ["ADMIN", "AUDITOR"].includes(String(session.rolNombre || "").trim().toUpperCase());

  const cargarRegistros = useCallback(async (signal?: AbortSignal) => {
    try {
      setCargando(true);
      setMensaje("");
      const params = new URLSearchParams({ paginated: "1", page: String(page), pageSize: String(pageSize) });
      if (busquedaAplicada) params.set("q", busquedaAplicada);
      if (sedeSeleccionada) params.set("sede", sedeSeleccionada);
      const res = await fetch(`/api/ventas/aprobaciones?${params.toString()}`, { cache: "no-store", signal });
      const data = await res.json();
      if (signal?.aborted) return;
      if (!res.ok) {
        setMensaje(data.error || "No se pudieron cargar las aprobaciones");
        setRegistros([]);
        setResumen(null);
        return;
      }
      setRegistros(Array.isArray(data.registros) ? data.registros : []);
      setResumen(data);
      if (data.page !== page) setPage(data.page);
    } catch {
      if (signal?.aborted) return;
      setMensaje("Error cargando aprobaciones de ventas");
      setRegistros([]);
      setResumen(null);
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, [busquedaAplicada, page, pageSize, sedeSeleccionada]);

  useEffect(() => {
    const controller = new AbortController();
    void cargarRegistros(controller.signal);
    return () => controller.abort();
  }, [cargarRegistros, revision]);

  const buscar = () => {
    setPage(1);
    setBusquedaAplicada(busqueda.trim());
    setRevision((value) => value + 1);
  };
  const limpiarFiltros = () => {
    setBusqueda("");
    setBusquedaAplicada("");
    setSedeSeleccionada("");
    setPage(1);
  };
  const navigationItems: Array<{ href: string; icon: DashboardIconName; label: string }> = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
    { href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico", icon: "reports", label: "Reportes" },
    ...(esAdmin ? [{ href: "/dashboard/sedes", icon: "settings" as const, label: "Configuración" }] : []),
  ];
  const totalPages = resumen?.totalPages || 1;
  const paginas = Array.from(new Set([1, page - 1, page, page + 1, totalPages].filter((value) => value >= 1 && value <= totalPages))).sort((a, b) => a - b);
  const cobertura = resumen?.cobertura || (esAdmin ? "Todas las sedes" : session.sedeNombre);
  const inicio = resumen?.total ? (page - 1) * pageSize + 1 : 0;
  const fin = resumen?.total ? inicio + registros.length - 1 : 0;

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS · Inicio"><Image src="/branding/conectamos-logo.png" width={44} height={44} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{navigationItems.map((item) => <Link key={item.href} href={item.href} aria-current={item.href === "/dashboard/aprobaciones" ? "page" : undefined} className={styles.navItem + " " + (item.href === "/dashboard/aprobaciones" ? styles.navActive : "")}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
      <SalesProfile name={session.nombre} role={session.rolNombre || session.perfilTipoLabel} />
    </header>
    <main className={styles.main}>
      <header className={styles.heading}>
        <div><h1>Registros por aprobar</h1><p>Revisa los registros y completa la venta.</p></div>
        <div className={styles.headingActions}>
          <Link href="/ventas/nuevo" className={styles.button + " " + styles.primary}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>Nueva venta</Link>
          {esAdmin && <Link href="/dashboard/registros" className={styles.button}><DashboardIcon name="catalog" />Gestionar registros</Link>}
          <Link href="/ventas" className={styles.button}><DashboardIcon name="arrow" className={styles.backArrow} />Volver a ventas</Link>
        </div>
      </header>
      <section className={styles.summary} aria-label="Resumen de registros pendientes" aria-busy={cargando}>
        <strong className={styles.pendingCount}>{cargando || !resumen ? "—" : resumen.totalPendientes.toLocaleString("es-CO")}</strong>
        <span className={styles.pendingLabel}>Registros pendientes</span>
        <span className={styles.summaryCoverage}><DashboardIcon name="pin" />{cobertura}</span>
        <DashboardIcon name="approvals" className={styles.summaryIcon} />
      </section>
      <section className={styles.panel} aria-label="Registros pendientes de venta" aria-busy={cargando}>
        <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); buscar(); }}>
          <label className={styles.search}><span className={styles.srOnly}>Buscar por cliente, cédula, IMEI o referencia</span><DashboardIcon name="search" /><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Cliente, cédula, IMEI o referencia" />{busqueda && <button type="button" aria-label="Limpiar búsqueda" onClick={() => { setBusqueda(""); setBusquedaAplicada(""); setPage(1); }}><DashboardIcon name="close" /></button>}</label>
          <label className={styles.coverage}><span className={styles.srOnly}>Filtrar por sede</span><DashboardIcon name="pin" /><select value={sedeSeleccionada} onChange={(event) => { setSedeSeleccionada(event.target.value); setPage(1); }}><option value="">{esAdmin ? "Todas las sedes" : session.sedeNombre}</option>{resumen?.sedes.map((sede) => <option key={sede.value} value={sede.value}>{sede.label}</option>)}</select><DashboardIcon name="chevron" /></label>
          <button type="submit" className={styles.button + " " + styles.searchButton} disabled={cargando}>{cargando ? "Buscando…" : "Buscar"}</button>
        </form>
        {(busquedaAplicada || sedeSeleccionada) && <div className={styles.appliedFilters}><span>{busquedaAplicada && `Búsqueda: “${busquedaAplicada}” · `}{cobertura}</span><button type="button" onClick={limpiarFiltros}>Limpiar filtros</button></div>}
        {mensaje ? <div className={styles.state} role="alert"><DashboardIcon name="warning" /><h2>No se pudieron cargar los registros</h2><p>{mensaje}</p><button type="button" className={styles.button} onClick={() => setRevision((value) => value + 1)}><DashboardIcon name="refresh" />Reintentar</button></div>
          : cargando ? <div className={styles.state} role="status"><span className={styles.spinner} /><p>Cargando registros…</p></div>
          : registros.length === 0 ? <div className={styles.state}><DashboardIcon name={busquedaAplicada || sedeSeleccionada ? "search" : "approvals"} /><h2>{busquedaAplicada || sedeSeleccionada ? "No hay registros para esta consulta" : "No hay registros pendientes"}</h2><p>{busquedaAplicada || sedeSeleccionada ? "Prueba otra búsqueda o limpia los filtros." : `No hay ventas por completar en ${cobertura}.`}</p>{busquedaAplicada || sedeSeleccionada ? <button type="button" className={styles.button} onClick={limpiarFiltros}>Limpiar filtros</button> : <button type="button" className={styles.button} onClick={() => setRevision((value) => value + 1)}><DashboardIcon name="refresh" />Actualizar</button>}</div>
          : <div className={styles.tableScroller}><table className={styles.table}><caption className={styles.srOnly}>Registros por aprobar de {cobertura}</caption><colgroup><col className={styles.dateColumn} /><col className={styles.clientColumn} /><col className={styles.deviceColumn} /><col className={styles.sellerColumn} /><col className={styles.observationColumn} /><col className={styles.financialColumn} /><col className={styles.invoiceColumn} /><col className={styles.actionColumn} /></colgroup><thead><tr>{["Fecha / Sede", "Cliente / Cédula", "Equipo / IMEI", "Asesor / Jalador", "Observación", "Financiera / Inicial", "Facturación", "Acción"].map((title) => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{registros.map((registro) => <ApprovalRow key={registro.id} registro={registro} />)}</tbody></table></div>}
        <footer className={styles.footer}>
          <p aria-live="polite">{cargando ? "Consultando registros…" : !resumen ? "Resultados no disponibles" : `Mostrando ${inicio.toLocaleString("es-CO")}–${fin.toLocaleString("es-CO")} de ${resumen.total.toLocaleString("es-CO")} registros`}</p>
          <label className={styles.pageSize}>Filas por página<select value={pageSize} disabled={cargando} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 20, 50].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <nav className={styles.pagination} aria-label="Paginación de registros">
            <button type="button" aria-label="Página anterior" disabled={cargando || !resumen || page <= 1} onClick={() => setPage((value) => value - 1)}><DashboardIcon name="chevron" className={styles.previous} /></button>
            {paginas.map((numero, index) => <span key={numero} className={styles.pageEntry}>{index > 0 && numero - paginas[index - 1] > 1 && <span className={styles.ellipsis}>…</span>}<button type="button" aria-label={`Página ${numero}`} aria-current={page === numero ? "page" : undefined} disabled={cargando || !resumen} className={page === numero ? styles.currentPage : ""} onClick={() => setPage(numero)}>{numero}</button></span>)}
            <button type="button" aria-label="Página siguiente" disabled={cargando || !resumen || page >= totalPages} onClick={() => setPage((value) => value + 1)}><DashboardIcon name="chevron" className={styles.next} /></button>
          </nav>
        </footer>
      </section>
    </main>
  </div>;
}
