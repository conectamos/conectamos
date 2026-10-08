"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { SalesMetric, SalesProfile, SaleRows, formatoPesos, type Sale } from "./_components/sales-dashboard-parts";
import styles from "./sales.module.css";
import {
  getBogotaDateKey,
  getTodayBogotaDateKey,
  isTodayBogota,
  dinero,
} from "@/lib/ventas-utils";

type Venta = Sale;

type CajaResumenResponse = {
  resumen?: {
    saldo: number;
  };
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

type VistaFiltro = "HOY" | "FECHA" | "TODAS";

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cajaNetaMovimientos, setCajaNetaMovimientos] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedesReporte, setSedesReporte] = useState<Sede[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<VistaFiltro>("HOY");
  const [fechaFiltro, setFechaFiltro] = useState(() => getTodayBogotaDateKey());
  const [vistaSedeId, setVistaSedeId] = useState("TODAS");
  const [eliminandoVentaId, setEliminandoVentaId] = useState<number | null>(null);
  const [cargandoVentas, setCargandoVentas] = useState(false);
  const [ventasCargadas, setVentasCargadas] = useState(false);
  const [cajaResumenCargada, setCajaResumenCargada] = useState(false);
  const [errorVentas, setErrorVentas] = useState("");
  const [errorCaja, setErrorCaja] = useState("");
  const [errorSedes, setErrorSedes] = useState("");
  const [errorUsuario, setErrorUsuario] = useState("");
  const [ventasScope, setVentasScope] = useState<string | null>(null);
  const [cajaScope, setCajaScope] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [detallesAbiertos, setDetallesAbiertos] = useState<number[]>([]);
  const solicitudVentas = useRef(0);
  const solicitudCaja = useRef(0);
  const rolActual = user?.rolNombre?.toUpperCase() || "";
  const esAdmin = ["ADMIN", "AUDITOR"].includes(rolActual);
  const puedeEliminar = rolActual === "ADMIN";
  const consultaScope = esAdmin ? `admin:${vistaSedeId}` : `sede:${user?.sedeId ?? ""}`;

  const cargarUsuario = async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) throw new Error("No se pudo cargar el perfil de usuario.");
      setUser(data);
      setErrorUsuario("");
    } catch {
      setErrorUsuario("No se pudo cargar el perfil de usuario.");
    }
  };

  const cargarVentas = useCallback(async () => {
    const solicitud = ++solicitudVentas.current;
    try {
      setCargandoVentas(true);
      setErrorVentas("");
      const params = new URLSearchParams();

      if (esAdmin && vistaSedeId !== "TODAS") {
        params.set("sedeId", vistaSedeId);
      }

      const endpoint = params.size
        ? `/api/ventas?${params.toString()}`
        : "/api/ventas";

      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error("No se pudieron cargar las ventas.");
      if (solicitud !== solicitudVentas.current) return;
      setVentas(Array.isArray(data) ? data : []);
      setVentasCargadas(true);
      setVentasScope(consultaScope);
    } catch {
      if (solicitud === solicitudVentas.current) setErrorVentas("No se pudieron actualizar las ventas. Reintenta la consulta.");
    } finally {
      if (solicitud === solicitudVentas.current) setCargandoVentas(false);
    }
  }, [consultaScope, esAdmin, vistaSedeId]);

  const cargarCajaResumen = useCallback(async () => {
    const solicitud = ++solicitudCaja.current;
    try {
      setErrorCaja("");
      const params = new URLSearchParams();

      if (esAdmin && vistaSedeId !== "TODAS") {
        params.set("sedeId", vistaSedeId);
      }

      params.set("resumen", "1");
      params.set("limit", "0");

      const endpoint = params.size
        ? `/api/caja?${params.toString()}`
        : "/api/caja";

      const res = await fetch(endpoint, { cache: "no-store" });
      const data = (await res.json()) as CajaResumenResponse;
      if (!res.ok || !data.resumen) throw new Error("No se pudo cargar la caja acumulada.");
      if (solicitud !== solicitudCaja.current) return;
      setCajaNetaMovimientos(Number(data.resumen?.saldo || 0));
      setCajaResumenCargada(true);
      setCajaScope(consultaScope);
    } catch {
      if (solicitud === solicitudCaja.current) setErrorCaja("No se pudo actualizar la caja acumulada. Reintenta la consulta.");
    }
  }, [consultaScope, esAdmin, vistaSedeId]);

  const cargarSedes = useCallback(async () => {
    try {
      const res = await fetch("/api/sedes", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error("No se pudieron cargar las sedes.");
      setSedesReporte(Array.isArray(data) ? data : []);
      setErrorSedes("");
    } catch {
      setErrorSedes("No se pudieron actualizar las sedes disponibles.");
    }
  }, []);

  useEffect(() => {
    void cargarUsuario();
  }, []);

  useEffect(() => {
    if (!esAdmin) {
      setSedesReporte([]);
      setVistaSedeId("TODAS");
      return;
    }

    void cargarSedes();
  }, [cargarSedes, esAdmin]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void Promise.all([cargarVentas(), cargarCajaResumen()]);
  }, [cargarCajaResumen, cargarVentas, user]);

  useLiveRefresh(
    async () => {
      await cargarUsuario();
      await Promise.all([cargarVentas(), cargarCajaResumen()]);
    },
    { intervalMs: 30000 }
  );

  const vistaSedeNombre = useMemo(() => {
    if (!esAdmin) {
      return user?.sedeNombre || "tu sede";
    }

    if (vistaSedeId === "TODAS") {
      return "todas las sedes";
    }

    return (
      sedesReporte.find((sede) => String(sede.id) === vistaSedeId)?.nombre ||
      "la sede seleccionada"
    );
  }, [esAdmin, sedesReporte, user?.sedeNombre, vistaSedeId]);

  const todayKey = useMemo(() => getTodayBogotaDateKey(), []);

  const ventasHoy = useMemo(
    () => ventas.filter((venta) => isTodayBogota(venta.fecha, todayKey)),
    [todayKey, ventas]
  );

  const totalUtilidadHoy = useMemo(
    () => ventasHoy.reduce((acc, venta) => acc + dinero(venta.utilidad), 0),
    [ventasHoy]
  );

  const totalCajaHoy = useMemo(
    () => ventasHoy.reduce((acc, venta) => acc + dinero(venta.cajaOficina), 0),
    [ventasHoy]
  );

  const totalIngresosHoy = useMemo(
    () => ventasHoy.reduce((acc, venta) => acc + dinero(venta.ingreso), 0),
    [ventasHoy]
  );

  const totalCajaGeneral = useMemo(
    () => ventas.reduce((acc, venta) => acc + dinero(venta.cajaOficina), 0),
    [ventas]
  );

  const totalCajaAcumulada = totalCajaGeneral + cajaNetaMovimientos;

  const totalIngresos = useMemo(
    () => ventas.reduce((acc, venta) => acc + dinero(venta.ingreso), 0),
    [ventas]
  );

  const ventasMostradas = useMemo(() => {
    const base =
      vista === "HOY"
        ? ventasHoy
        : vista === "FECHA"
          ? ventas.filter((venta) => getBogotaDateKey(venta.fecha) === fechaFiltro)
          : ventas;
    const termino = busqueda.trim().toLowerCase();

    if (!termino) {
      return base;
    }

    return base.filter((venta) => {
      return (
        String(venta.idVenta || "").toLowerCase().includes(termino) ||
        String(venta.servicio || "").toLowerCase().includes(termino) ||
        String(venta.descripcion || "").toLowerCase().includes(termino) ||
        String(venta.serial || "").toLowerCase().includes(termino) ||
        String(venta.jalador || "").toLowerCase().includes(termino) ||
        String(venta.cerrador || "").toLowerCase().includes(termino) ||
        String(venta.sede?.nombre || "").toLowerCase().includes(termino)
      );
    });
  }, [busqueda, fechaFiltro, ventas, ventasHoy, vista]);

  const eliminarVenta = async (ventaId: number) => {
    const confirmado = window.confirm(
      "Esta venta se eliminara y el equipo volvera a BODEGA. Deseas continuar?"
    );

    if (!confirmado) {
      return;
    }

    try {
      setEliminandoVentaId(ventaId);
      setMensaje("");

      const res = await fetch(`/api/ventas?id=${ventaId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo eliminar la venta");
        return;
      }

      setMensaje(data.mensaje || "Venta eliminada correctamente");
      await cargarVentas();
    } catch {
      setMensaje("Error eliminando la venta");
    } finally {
      setEliminandoVentaId(null);
    }
  };

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
  const coberturaActual = esAdmin
    ? vistaSedeId === "TODAS"
      ? "Todas las sedes"
      : vistaSedeNombre
    : user?.sedeNombre || "Tu sede";
  const ventasDisponibles = ventasCargadas && ventasScope === consultaScope;
  const cajaDisponible = cajaResumenCargada && cajaScope === consultaScope;
  const valorMetrica = (valor: string | number) => ventasDisponibles ? valor : "—";
  const valorCajaAcumulada = ventasDisponibles && cajaDisponible ? formatoPesos(totalCajaAcumulada) : "—";
  const fechaHoy = todayKey.split("-").reverse().join("/");
  const totalResultados = ventasDisponibles ? ventasMostradas.length : 0;
  const tamanoPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(totalResultados / tamanoPagina));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicioPagina = (paginaActual - 1) * tamanoPagina;
  const ventasPaginadas = ventasDisponibles ? ventasMostradas.slice(inicioPagina, inicioPagina + tamanoPagina) : [];
  const primeraPaginaVisible = Math.max(1, Math.min(paginaActual - 2, totalPaginas - 4));
  const paginasVisibles = Array.from({ length: Math.min(5, totalPaginas) }, (_, index) => primeraPaginaVisible + index);
  const cambiarVista = (nuevaVista: VistaFiltro) => { setVista(nuevaVista); setPagina(1); };
  const alternarDetalle = (ventaId: number) => setDetallesAbiertos((prev) => prev.includes(ventaId) ? prev.filter((id) => id !== ventaId) : [...prev, ventaId]);
  const reintentar = () => { void cargarUsuario(); if (user) void Promise.all([cargarVentas(), cargarCajaResumen(), ...(esAdmin ? [cargarSedes()] : [])]); };
  const errores = [errorUsuario, errorVentas, errorCaja, esAdmin ? errorSedes : ""].filter(Boolean);

  return (
    <div className={styles.shell}>
      <DashboardSidebar activeHref="/ventas" coverageLabel={coberturaActual} items={navigationItems} appearance="white" />
      <div className={styles.workspace}>
        <main className={styles.main}>
          <header className={styles.header}>
            <h1>Ventas</h1>
            <div className={styles.headerActions}>
              {esAdmin && <Link href="/ventas/perfiles">Perfiles vendedores</Link>}
              {esAdmin && <Link href="/ventas/equipo-comercial">Catálogos</Link>}
              <Link href="/ventas/aprobaciones">Aprobaciones</Link>
              <Link href="/ventas/nuevo" className={styles.newSale}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Nueva venta</Link>
              <SalesProfile name={user?.nombre || user?.usuario || "Cargando usuario"} role={user?.rolNombre || "Sesión activa"} />
            </div>
          </header>
          {mensaje && <div className={styles.notice} role="status">{mensaje}</div>}
          {errores.length > 0 && <div className={styles.notice} role="alert"><div>{errores.map((error) => <p key={error}>{error}</p>)}{ventasDisponibles && errorVentas && <p>Se muestran las últimas ventas cargadas para esta cobertura.</p>}{cajaDisponible && errorCaja && <p>La caja acumulada conserva el último saldo cargado para esta cobertura.</p>}</div><button type="button" onClick={reintentar}>Reintentar</button></div>}
          <section className={styles.summary} aria-labelledby="resumen-dia">
            <div className={styles.summaryHeader}><h2 id="resumen-dia">Hoy · {fechaHoy}</h2><span>Cobertura: {coberturaActual}</span></div>
            <div className={styles.metrics}>
              <SalesMetric icon="sales" label="Ventas" value={valorMetrica(ventasHoy.length)} primary />
              <SalesMetric icon="trend" label="Ingresos" value={valorMetrica(formatoPesos(totalIngresosHoy))} negative={totalIngresosHoy < 0} />
              <SalesMetric icon="cash" label="Caja" value={valorMetrica(formatoPesos(totalCajaHoy))} negative={totalCajaHoy < 0} />
              <SalesMetric icon="reports" label="Utilidad" value={valorMetrica(formatoPesos(totalUtilidadHoy))} negative={totalUtilidadHoy < 0} />
            </div>
          </section>
          <section className={`${styles.summary} ${styles.accumulated}`} aria-labelledby="resumen-acumulado">
            <div className={styles.summaryHeader}><h2 id="resumen-acumulado">Acumulado · {coberturaActual}</h2><span>Histórico completo</span></div>
            <div className={`${styles.metrics} ${!esAdmin ? styles.twoMetrics : ""}`}>
              <SalesMetric icon="sales" label="Ventas" value={valorMetrica(ventas.length)} />
              {esAdmin && <SalesMetric icon="trend" label="Ingresos" value={valorMetrica(formatoPesos(totalIngresos))} negative={totalIngresos < 0} />}
              <SalesMetric icon="cash" label="Caja" value={valorCajaAcumulada} negative={totalCajaAcumulada < 0} />
            </div>
          </section>
          <section className={styles.list} aria-labelledby="ventas-registradas" aria-busy={cargandoVentas}>
            <div className={styles.listHeader}>
              <div className={styles.listHeading}><h2 id="ventas-registradas">Ventas registradas</h2><p aria-live="polite">{!user ? "Cargando sesión…" : cargandoVentas ? "Actualizando ventas…" : ventasDisponibles ? `${totalResultados.toLocaleString("es-CO")} ${totalResultados === 1 ? "resultado" : "resultados"}` : "Consulta pendiente"}</p></div>
              <div className={styles.filters}>
                <div className={styles.viewSwitch} aria-label="Período del listado"><button type="button" aria-pressed={vista === "HOY"} onClick={() => cambiarVista("HOY")}>Hoy</button><button type="button" aria-pressed={vista === "TODAS"} onClick={() => cambiarVista("TODAS")}>Todas</button></div>
                <label className={`${styles.filterField} ${styles.dateField} ${vista === "FECHA" ? styles.activeDate : ""}`}><span className="sr-only">Fecha de las ventas</span><DashboardIcon name="calendar" /><input type="date" value={vista === "HOY" ? todayKey : fechaFiltro} onChange={(event) => { setFechaFiltro(event.target.value); cambiarVista("FECHA"); }} /></label>
                <label className={`${styles.filterField} ${styles.sedeField}`}><DashboardIcon name="pin" /><span className="sr-only">Sede</span>{esAdmin ? <select value={vistaSedeId} onChange={(event) => { setVistaSedeId(event.target.value); setPagina(1); }}><option value="TODAS">Todas las sedes</option>{sedesReporte.map((sede) => <option key={sede.id} value={sede.id}>{sede.nombre}</option>)}</select> : <span>{coberturaActual}</span>}</label>
                <label className={`${styles.filterField} ${styles.searchField}`}><span className="sr-only">Buscar por venta, IMEI, servicio o asesor</span><DashboardIcon name="search" /><input type="search" value={busqueda} placeholder="Buscar por venta, IMEI, servicio o asesor…" onChange={(event) => { setBusqueda(event.target.value); setPagina(1); }} /></label>
              </div>
            </div>
            {vista === "FECHA" && <p className={styles.appliedFilter}>Listado del {fechaFiltro ? fechaFiltro.split("-").reverse().join("/") : "día seleccionado"} · {coberturaActual}</p>}
            <div className={styles.tableScroller} tabIndex={0} role="region" aria-label="Listado de ventas, desplazable">
              <table className={styles.table}>
                <caption className="sr-only">Ventas de {coberturaActual}. {vista === "HOY" ? `Hoy, ${fechaHoy}` : vista === "FECHA" ? `Fecha: ${fechaFiltro}` : "Todas las fechas"}.</caption>
                <thead><tr><th scope="col">Venta / Fecha</th><th scope="col">Equipo / IMEI</th><th scope="col">Asesores</th><th scope="col">Cobro</th><th scope="col">Financieras</th><th scope="col">Resultado</th><th scope="col">Sede</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
                <tbody>
                  {ventasPaginadas.map((venta) => <SaleRows key={venta.id} sale={venta} expanded={detallesAbiertos.includes(venta.id)} esAdmin={esAdmin} puedeEliminar={puedeEliminar} deleting={eliminandoVentaId === venta.id} onToggle={() => alternarDetalle(venta.id)} onDelete={() => void eliminarVenta(venta.id)} />)}
                  {!ventasPaginadas.length && <tr><td colSpan={8} className={styles.empty}>{!ventasDisponibles ? <><strong>{errorVentas || errorUsuario ? "No se pudo completar la consulta" : "Cargando ventas…"}</strong><span>{errorVentas || errorUsuario ? "Reintenta para consultar los datos de esta cobertura." : "Preparando el resumen y los registros de la cobertura autorizada."}</span></> : <><strong>Sin resultados</strong><span>No hay ventas que coincidan con los filtros aplicados.</span></>}</td></tr>}
                </tbody>
              </table>
            </div>
            <footer className={styles.pagination}>
              <p>{ventasDisponibles ? `Mostrando ${totalResultados ? inicioPagina + 1 : 0}–${Math.min(inicioPagina + tamanoPagina, totalResultados)} de ${totalResultados.toLocaleString("es-CO")}` : "Esperando resultados de la consulta"}</p>
              <nav className={styles.pageButtons} aria-label="Paginación de ventas">
                <button type="button" disabled={!ventasDisponibles || paginaActual === 1} onClick={() => setPagina(paginaActual - 1)}><DashboardIcon name="arrow" className={styles.previousIcon} />Anterior</button>
                {primeraPaginaVisible > 1 && <><button type="button" aria-label="Página 1" onClick={() => setPagina(1)}>1</button><span aria-hidden="true">…</span></>}
                {paginasVisibles.map((numero) => <button key={numero} type="button" aria-label={`Página ${numero}`} aria-current={numero === paginaActual ? "page" : undefined} disabled={!ventasDisponibles} onClick={() => setPagina(numero)}>{numero}</button>)}
                {paginasVisibles[0] + paginasVisibles.length - 1 < totalPaginas && <><span aria-hidden="true">…</span><button type="button" aria-label={`Página ${totalPaginas}`} onClick={() => setPagina(totalPaginas)}>{totalPaginas}</button></>}
                <button type="button" disabled={!ventasDisponibles || paginaActual === totalPaginas} onClick={() => setPagina(paginaActual + 1)}>Siguiente<DashboardIcon name="arrow" /></button>
              </nav>
            </footer>
          </section>
        </main>
      </div>
    </div>
  );
}
