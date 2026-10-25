"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./inconsistencies.module.css";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  rolNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type EstadoRevision =
  | "COINCIDE"
  | "INCONSISTENTE"
  | "REVISAR"
  | "SIN_VERIFICAR"
  | "REVISADO";

type ResultadoRevision = {
  registroId: number;
  createdAt: string;
  clienteNombre: string;
  documentoNumero: string;
  serialImei: string | null;
  puntoVenta: string | null;
  asesorNombre: string | null;
  proveedor: string;
  identificadorTipo: "CEDULA" | "IMEI";
  plataformaCredito: string;
  creditoRegistrado: number | null;
  creditoPlataforma: number | null;
  fechaCreditoPlataforma: string | null;
  ordenId: string | null;
  estado: EstadoRevision;
  razones: string[];
};

type TipoPeriodo = "DIA" | "RANGO" | "MES";
type ProveedorMensual = "PAYJOY" | "SUMASPAY" | "ADDI";

type ReporteRevision = {
  modo: "RANGO";
  desde: string;
  hasta: string;
  proveedores: ProveedorMensual[];
  limitado: boolean;
  maxRegistros: number;
  resumen: {
    registrosAnalizados: number;
    creditosAnalizados: number;
    coincidencias: number;
    inconsistencias: number;
    revisar: number;
    sinVerificar: number;
    revisados: number;
  };
  resultados: ResultadoRevision[];
};

type RespuestaRango = {
  modo: "RANGO";
  desde: string;
  hasta: string;
  proveedor: ProveedorMensual;
  resultados: ResultadoRevision[];
  paginacion: {
    snapshot: string;
    cursor: number;
    cursorSiguiente: number | null;
    completo: boolean;
    gruposProcesados: number;
    gruposTotales: number;
    creditosTotales: number;
  };
};

type FiltroEstado = "REVISION" | "TODOS" | EstadoRevision;
const PROVEEDORES_MENSUALES = ["PAYJOY", "SUMASPAY", "ADDI"] as const;
const ETIQUETAS_PROVEEDOR: Record<ProveedorMensual, string> = {
  PAYJOY: "PAYJOY",
  SUMASPAY: "SUMASPAY",
  ADDI: "ADDI",
};

function rangoDelMes(mes: string, fechaHoy: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(mes);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return null;
  }

  const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const hastaMes = `${mes}-${String(ultimoDia).padStart(2, "0")}`;

  return {
    desde: `${mes}-01`,
    hasta: hastaMes > fechaHoy ? fechaHoy : hastaMes,
  };
}

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Sin dato";
  }

  return `$ ${value.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function formatDateKey(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function etiquetaEstado(estado: EstadoRevision) {
  if (estado === "INCONSISTENTE") return "Inconsistente";
  if (estado === "REVISAR") return "Revisar";
  if (estado === "SIN_VERIFICAR") return "Sin verificar";
  if (estado === "REVISADO") return "Revisado";
  return "Coincide";
}

function claseEstado(estado: EstadoRevision) {
  if (estado === "INCONSISTENTE") return styles.stateDanger;
  if (estado === "REVISAR") return styles.stateWarning;
  if (estado === "SIN_VERIFICAR") return styles.stateNeutral;
  return styles.stateSuccess;
}

function resumirResultados(resultados: ResultadoRevision[]) {
  return {
    registrosAnalizados: new Set(
      resultados.map((resultado) => resultado.registroId)
    ).size,
    creditosAnalizados: resultados.length,
    coincidencias: resultados.filter(
      (resultado) => resultado.estado === "COINCIDE"
    ).length,
    inconsistencias: resultados.filter(
      (resultado) => resultado.estado === "INCONSISTENTE"
    ).length,
    revisar: resultados.filter((resultado) => resultado.estado === "REVISAR")
      .length,
    sinVerificar: resultados.filter(
      (resultado) => resultado.estado === "SIN_VERIFICAR"
    ).length,
    revisados: resultados.filter(
      (resultado) => resultado.estado === "REVISADO"
    ).length,
  };
}

export default function InconsistenciasCreditosWorkspace({
  fechaHoy,
  mesActual,
  session,
}: {
  fechaHoy: string;
  mesActual: string;
  session: SessionProps;
}) {
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodo>("MES");
  const [fechaDia, setFechaDia] = useState(fechaHoy);
  const [fechaDesde, setFechaDesde] = useState(`${mesActual}-01`);
  const [fechaHasta, setFechaHasta] = useState(fechaHoy);
  const [mes, setMes] = useState(mesActual);
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState<
    ProveedorMensual[]
  >([...PROVEEDORES_MENSUALES]);
  const [reporte, setReporte] = useState<ReporteRevision | null>(null);
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("REVISION");
  const [marcandoRevision, setMarcandoRevision] = useState("");
  const [pagina, setPagina] = useState(1);
  const analisisEnCurso = useRef(false);
  const revisionEnCurso = useRef(false);
  const analisisAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { analisisAbort.current?.abort(); }, []);

  const esAdministrador = ["ADMIN", "AUDITOR"].includes(
    String(session.rolNombre || "").trim().toUpperCase()
  );
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
      href: esAdministrador ? "/dashboard/reportes" : "/dashboard/analitico",
      icon: "reports",
      label: "Reportes",
    },
  ];

  if (esAdministrador) {
    navigationItems.push({
      href: "/dashboard/sedes",
      icon: "settings",
      label: "Configuración",
    });
  }

  const resultadosVisibles = useMemo(() => {
    if (!reporte) {
      return [];
    }

    if (filtro === "TODOS") {
      return reporte.resultados;
    }

    if (filtro === "REVISION") {
      return reporte.resultados.filter(
        (item) => item.estado !== "COINCIDE" && item.estado !== "REVISADO"
      );
    }

    return reporte.resultados.filter((item) => item.estado === filtro);
  }, [filtro, reporte]);

  const analizar = async () => {
    if (analisisEnCurso.current || revisionEnCurso.current) return;
    analisisEnCurso.current = true;
    const controller = new AbortController();
    analisisAbort.current = controller;
    try {
      setCargando(true);
      setError("");
      setReporte(null);
      setProgreso("");

      if (proveedoresSeleccionados.length === 0) {
        throw new Error("Selecciona al menos una financiera para continuar.");
      }

      const rangoConsulta =
        tipoPeriodo === "DIA"
          ? { desde: fechaDia, hasta: fechaDia }
          : tipoPeriodo === "RANGO"
            ? { desde: fechaDesde, hasta: fechaHasta }
            : rangoDelMes(mes, fechaHoy);

      if (
        !rangoConsulta ||
        !/^\d{4}-\d{2}-\d{2}$/.test(rangoConsulta.desde) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(rangoConsulta.hasta) ||
        rangoConsulta.desde > rangoConsulta.hasta ||
        rangoConsulta.hasta > fechaHoy
      ) {
        throw new Error(
          "Selecciona un periodo valido, sin fechas futuras y con la fecha inicial antes de la final."
        );
      }

      const { desde, hasta } = rangoConsulta;
      const resultadosCompletos: ResultadoRevision[] = [];
      let snapshotRevision = "";

      for (const proveedor of proveedoresSeleccionados) {
        let cursor: number | null = 0;
        const cursoresProcesados = new Set<number>();
        const indiceProveedor =
          proveedoresSeleccionados.indexOf(proveedor) + 1;

        while (cursor !== null) {
          if (cursoresProcesados.has(cursor)) {
            throw new Error(
              `La consulta de ${proveedor} no pudo avanzar al siguiente bloque.`
            );
          }

          cursoresProcesados.add(cursor);
          setProgreso(
            `Consultando ${ETIQUETAS_PROVEEDOR[proveedor]} · financiera ${indiceProveedor} de ${proveedoresSeleccionados.length}${
              cursor > 0 ? ` · bloque ${cursoresProcesados.size}` : ""
            }`
          );

          const params = new URLSearchParams({
            desde,
            hasta,
            proveedor,
            cursor: String(cursor),
          });

          if (snapshotRevision) {
            params.set("snapshot", snapshotRevision);
          }

          const response = await fetch(
            `/api/vendedor/registros/inconsistencias?${params.toString()}`,
            { cache: "no-store", signal: controller.signal }
          );
          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                `No se pudo completar la revision de ${ETIQUETAS_PROVEEDOR[proveedor]}.`
            );
          }

          if (
            !Array.isArray(data?.resultados) ||
            typeof data?.paginacion?.snapshot !== "string" ||
            (data.paginacion.cursorSiguiente !== null &&
              (!Number.isInteger(data.paginacion.cursorSiguiente) ||
                data.paginacion.cursorSiguiente < 0))
          ) {
            throw new Error(
              "La financiera devolvió una respuesta incompleta. Intenta consultar nuevamente."
            );
          }

          const pagina = data as RespuestaRango;
          snapshotRevision =
            snapshotRevision || pagina.paginacion.snapshot;
          resultadosCompletos.push(...pagina.resultados);
          cursor = pagina.paginacion.cursorSiguiente;
        }
      }

      resultadosCompletos.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          b.registroId - a.registroId
      );

      setReporte({
        modo: "RANGO",
        desde,
        hasta,
        proveedores: [...proveedoresSeleccionados],
        limitado: false,
        maxRegistros: 0,
        resumen: resumirResultados(resultadosCompletos),
        resultados: resultadosCompletos,
      });
      setFiltro("REVISION");
      setPagina(1);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Error consultando las plataformas de credito."
      );
    } finally {
      analisisEnCurso.current = false;
      setCargando(false);
      setProgreso("");
    }
  };

  const marcarComoRevisado = async (item: ResultadoRevision) => {
    if (revisionEnCurso.current || analisisEnCurso.current || item.estado === "COINCIDE" || item.estado === "REVISADO") return;
    revisionEnCurso.current = true;
    const key = `${item.registroId}:${item.proveedor}`;

    try {
      setMarcandoRevision(key);
      setError("");

      const response = await fetch(
        "/api/vendedor/registros/inconsistencias",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            registroId: item.registroId,
            proveedor: item.proveedor,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "No se pudo guardar la revision.");
        return;
      }

      setReporte((current) => {
        if (!current) {
          return current;
        }

        const resultados = current.resultados.map((resultado) =>
          resultado.registroId === item.registroId &&
          resultado.proveedor === item.proveedor
            ? {
                ...resultado,
                estado: "REVISADO" as const,
                razones: [
                  `Marcado como revisado por ${
                    data.revision?.revisadoPor || "el usuario actual"
                  }.`,
                  ...resultado.razones,
                ],
              }
            : resultado
        );

        return {
          ...current,
          resumen: {
            ...current.resumen,
            inconsistencias:
              current.resumen.inconsistencias -
              (item.estado === "INCONSISTENTE" ? 1 : 0),
            revisar:
              current.resumen.revisar - (item.estado === "REVISAR" ? 1 : 0),
            sinVerificar:
              current.resumen.sinVerificar -
              (item.estado === "SIN_VERIFICAR" ? 1 : 0),
            revisados: current.resumen.revisados + 1,
          },
          resultados,
        };
      });
    } catch {
      setError("No se pudo guardar la revision.");
    } finally {
      revisionEnCurso.current = false;
      setMarcandoRevision("");
    }
  };

  const limpiarInforme = () => {
    setPagina(1);
    setReporte(null);
    setError("");
  };

  const alternarProveedor = (proveedor: ProveedorMensual) => {
    setProveedoresSeleccionados((actuales) =>
      actuales.includes(proveedor)
        ? actuales.filter((item) => item !== proveedor)
        : PROVEEDORES_MENSUALES.filter(
            (item) => item === proveedor || actuales.includes(item)
          )
    );
    limpiarInforme();
  };

  const periodoIncompleto =
    (tipoPeriodo === "DIA" && !fechaDia) ||
    (tipoPeriodo === "RANGO" && (!fechaDesde || !fechaHasta)) ||
    (tipoPeriodo === "MES" && !mes);

  const paginasTotales = Math.max(1, Math.ceil(resultadosVisibles.length / 10));
  const paginaActual = Math.min(pagina, paginasTotales);
  const filas = resultadosVisibles.slice((paginaActual - 1) * 10, paginaActual * 10);
  const paginas = [...new Set([1, paginaActual - 1, paginaActual, paginaActual + 1, paginasTotales])].filter(item => item > 0 && item <= paginasTotales).sort((a,b) => a-b);
  const secundarios = navigationItems.filter(item => ["/cierre", "/dashboard/aprobaciones", "/dashboard/reportes", "/dashboard/analitico", "/dashboard/sedes"].includes(item.href));
  const principales = navigationItems.filter(item => !secundarios.includes(item));
  const enlace = (item: NavigationItem) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/ventas" ? styles.navActive : ""}`} aria-current={item.href === "/ventas" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>;
  const indicadores = [
    { label: "Créditos revisados", value: reporte?.resumen.creditosAnalizados, icon: "document" as const },
    { label: "Coinciden", value: reporte?.resumen.coincidencias, icon: "shield" as const, tone: "positive" },
    { label: "Inconsistentes", value: reporte?.resumen.inconsistencias, icon: "warning" as const, tone: "negative" },
    { label: "Revisar duplicidad", value: reporte?.resumen.revisar, icon: "search" as const, tone: "warning" },
    { label: "Sin verificar", value: reporte?.resumen.sinVerificar, icon: "clock" as const },
    { label: "Revisados", value: reporte?.resumen.revisados, icon: "approvals" as const, tone: "positive" },
  ];

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" alt="" width={44} height={44} priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{principales.map(enlace)}<div className={styles.extraNavigation}>{secundarios.map(enlace)}</div><details className={styles.moreNavigation} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Más<DashboardIcon name="chevron" /></summary><div>{secundarios.map(enlace)}</div></details></nav>
      <SalesProfile name={session.perfilNombre || session.nombre} role={session.perfilTipoLabel || session.rolNombre} />
    </header>
    <main className={styles.main}>
      <div className={styles.heading}><div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/vendedor/registros">Registrar venta</Link><DashboardIcon name="arrow" /><span>Inconsistencias</span></nav><h1>Inconsistencias de créditos</h1><p>Compara el crédito autorizado con las plataformas financieras.</p></div><Link href="/vendedor/registros" className={styles.button}><DashboardIcon name="arrow" className={styles.backIcon} />Volver al registro</Link></div>
      <section className={styles.summary} aria-label="Resumen de revisión" aria-busy={cargando}>{indicadores.map(item => <article className={styles.metric} key={item.label} data-tone={item.tone}><span className={styles.metricIcon}><DashboardIcon name={item.icon} /></span><div><p>{item.label}</p><strong>{item.value === undefined ? "—" : item.value.toLocaleString("es-CO", { maximumFractionDigits: 2 })}</strong></div></article>)}</section>
      <section className={styles.panel} aria-labelledby="review-filters-title">
        <div className={styles.panelHeader}><div className={styles.sectionTitle}><span className={styles.sectionIcon}><DashboardIcon name="calendar" /></span><div><h2 id="review-filters-title">Periodo y financieras</h2><p>{esAdministrador ? "Todas las sedes" : session.sedeNombre}</p></div></div><details className={styles.help}><summary><DashboardIcon name="document" />Ver reglas<DashboardIcon name="chevron" /></summary><p>Solo se valida el valor del credito; no se comparan cuota, plazo, inicial ni frecuencia. Este informe no modifica las ventas. La consulta recorre todos los bloques del periodo autorizado.</p></details></div>
        <div className={styles.filters}>
          <label>Tipo de periodo<select value={tipoPeriodo} disabled={cargando || Boolean(marcandoRevision)} onChange={event => { setTipoPeriodo(event.target.value as TipoPeriodo); limpiarInforme(); }}><option value="DIA">Día</option><option value="RANGO">Rango</option><option value="MES">Mes</option></select></label>
          {tipoPeriodo === "MES" ? <label>Mes de registros<input type="month" value={mes} max={mesActual} disabled={cargando || Boolean(marcandoRevision)} onChange={event => { setMes(event.target.value); limpiarInforme(); }} /></label> : tipoPeriodo === "DIA" ? <label>Fecha de registros<input type="date" value={fechaDia} max={fechaHoy} disabled={cargando || Boolean(marcandoRevision)} onChange={event => { setFechaDia(event.target.value); limpiarInforme(); }} /></label> : <div className={styles.dateRange}><label>Desde<input type="date" value={fechaDesde} max={fechaHoy} disabled={cargando || Boolean(marcandoRevision)} onChange={event => { setFechaDesde(event.target.value); limpiarInforme(); }} /></label><label>Hasta<input type="date" value={fechaHasta} max={fechaHoy} disabled={cargando || Boolean(marcandoRevision)} onChange={event => { setFechaHasta(event.target.value); limpiarInforme(); }} /></label></div>}
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => void analizar()} disabled={cargando || Boolean(marcandoRevision) || periodoIncompleto || proveedoresSeleccionados.length === 0}><DashboardIcon name={cargando ? "refresh" : "search"} />{cargando ? "Consultando…" : "Analizar créditos"}</button>
        </div>
        <div className={styles.providers}><div className={styles.providersHeading}><div><strong>Financieras</strong><span>{PROVEEDORES_MENSUALES.length} disponibles para consultar</span></div><div><button type="button" disabled={cargando || Boolean(marcandoRevision)} onClick={() => { setProveedoresSeleccionados([...PROVEEDORES_MENSUALES]); limpiarInforme(); }}>Seleccionar todas</button><button type="button" disabled={cargando || Boolean(marcandoRevision)} onClick={() => { setProveedoresSeleccionados([]); limpiarInforme(); }}>Limpiar</button></div></div><div className={styles.providerOptions}>{PROVEEDORES_MENSUALES.map(proveedor => <label key={proveedor} className={proveedoresSeleccionados.includes(proveedor) ? styles.providerSelected : undefined}><input type="checkbox" checked={proveedoresSeleccionados.includes(proveedor)} disabled={cargando || Boolean(marcandoRevision)} onChange={() => alternarProveedor(proveedor)} /><span>{ETIQUETAS_PROVEEDOR[proveedor]}</span></label>)}</div></div>
      </section>
      {error && <div className={styles.error} role="alert"><DashboardIcon name="warning" /><span>{error}</span></div>}
      {cargando && <div className={styles.progress} role="status"><DashboardIcon name="refresh" /><div><strong>{progreso || "Comparando registros con las plataformas"}</strong><span>Procesando todos los bloques del periodo seleccionado.</span></div></div>}
      <section className={styles.panel} aria-labelledby="review-list-title">
        <div className={styles.panelHeader}><div className={styles.sectionTitle}><span className={styles.sectionIcon}><DashboardIcon name="approvals" /></span><div><h2 id="review-list-title">Listado de revisión</h2><p>{reporte ? `${resultadosVisibles.length.toLocaleString("es-CO")} resultados · ${formatDateKey(reporte.desde)}${reporte.desde !== reporte.hasta ? ` al ${formatDateKey(reporte.hasta)}` : ""}` : "Consulta un periodo para ver los resultados"}</p></div></div><label className={styles.stateFilter}>Mostrar<select value={filtro} disabled={!reporte || cargando} onChange={event => { setFiltro(event.target.value as FiltroEstado); setPagina(1); }}><option value="REVISION">Necesitan revisión</option><option value="INCONSISTENTE">Inconsistentes</option><option value="REVISAR">Duplicidad por revisar</option><option value="SIN_VERIFICAR">Sin verificar</option><option value="REVISADO">Revisados</option><option value="COINCIDE">Coinciden</option><option value="TODOS">Todos</option></select></label></div>
        {reporte && !cargando ? <><div className={styles.reportScope}><DashboardIcon name="calendar" /><span>Consulta ejecutada: {formatDateKey(reporte.desde)}{reporte.desde !== reporte.hasta ? ` al ${formatDateKey(reporte.hasta)}` : ""} · {reporte.proveedores.map(proveedor => ETIQUETAS_PROVEEDOR[proveedor]).join(", ")}</span></div>{filas.length > 0 ? <div className={styles.tableScroll} tabIndex={0} aria-label="Resultados de revisión"><table className={styles.table}><thead><tr><th>Registro</th><th>Cliente e identificador</th><th>Financiera</th><th>Conectamos</th><th>Plataforma</th><th>Resultado</th><th>Acción</th></tr></thead><tbody>{filas.map((item,index) => <tr key={`${item.registroId}-${item.proveedor}-${index}`}>
          <td><strong>#{item.registroId}</strong><p>{formatDate(item.createdAt)}</p><p>{item.puntoVenta || "Sin punto"}</p></td><td><strong>{item.clienteNombre}</strong><p className={styles.identifier}>CC {item.documentoNumero}</p><p className={styles.identifier}>IMEI {item.serialImei || "Sin dato"}</p></td><td><span className={styles.providerBadge}>{item.proveedor}</span><p>Consulta por {item.identificadorTipo.toLowerCase()}</p>{item.ordenId && <p>Orden {item.ordenId}</p>}</td><td className={styles.money}>{formatMoney(item.creditoRegistrado)}</td><td className={styles.money}>{formatMoney(item.creditoPlataforma)}{item.fechaCreditoPlataforma && <p>{item.fechaCreditoPlataforma}</p>}</td><td><span className={`${styles.state} ${claseEstado(item.estado)}`}>{etiquetaEstado(item.estado)}</span>{item.razones.length > 0 && <ul className={styles.reasons}>{item.razones.map((razon,i) => <li key={`${i}-${razon}`}>{razon}</li>)}</ul>}</td><td><div className={styles.rowActions}>{item.estado !== "COINCIDE" && item.estado !== "REVISADO" && <button type="button" disabled={Boolean(marcandoRevision)} aria-label={`Marcar como revisada la alerta de ${item.proveedor} del registro ${item.registroId}`} onClick={() => void marcarComoRevisado(item)}><DashboardIcon name="approvals" />{marcandoRevision === `${item.registroId}:${item.proveedor}` ? "Guardando…" : "Revisado"}</button>}<Link href={`/vendedor/registros?editar=${item.registroId}`}>Ver registro<DashboardIcon name="arrow" /></Link></div></td>
        </tr>)}</tbody></table></div> : <div className={styles.empty}><DashboardIcon name="approvals" /><strong>No hay resultados en este filtro</strong><p>Cambia el filtro para consultar el resto de resultados del periodo.</p></div>}<div className={styles.pagination}><span>10 por página · {resultadosVisibles.length.toLocaleString("es-CO")} resultados</span><nav aria-label="Paginación de resultados"><button type="button" aria-label="Anterior" disabled={paginaActual <= 1} onClick={() => setPagina(paginaActual - 1)}><DashboardIcon name="chevron" className={styles.previousIcon} /><span>Anterior</span></button>{paginas.map((numero,index) => <span key={numero} className={styles.pageSlot}>{index > 0 && numero - paginas[index-1] > 1 && <span>…</span>}<button type="button" aria-label={`Página ${numero}`} aria-current={paginaActual === numero ? "page" : undefined} onClick={() => setPagina(numero)}>{numero}</button></span>)}<button type="button" aria-label="Siguiente" disabled={paginaActual >= paginasTotales} onClick={() => setPagina(paginaActual + 1)}><span>Siguiente</span><DashboardIcon name="chevron" className={styles.nextIcon} /></button></nav></div></> : <div className={styles.empty}><DashboardIcon name={cargando ? "refresh" : "search"} /><strong>{cargando ? "Revisión en curso" : "Prepara una revisión de créditos"}</strong><p>{cargando ? "Los resultados aparecerán cuando finalicen todos los bloques." : "Selecciona el periodo y las financieras; luego pulsa Analizar créditos."}</p></div>}
      </section>
    </main>
  </div>;
}
