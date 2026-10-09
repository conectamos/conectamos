"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import type { InventoryAdminSummary } from "@/lib/dashboard-inventory-summary";
import { buildRadarView, type RadarLocationFilter, type RadarReference } from "@/lib/radar-inventory-view";
import styles from "./radar.module.css";

const numero = (value: number) => Number(value || 0).toLocaleString("es-CO");
const marcaLabel = (marca: string) => ({ APPLE: "Apple", HONOR: "Honor", SAMSUNG: "Samsung", MOTOROLA: "Motorola", XIAOMI: "Xiaomi", INFINIX: "Infinix", "OTRAS REFERENCIAS": "Otras referencias" }[marca] || marca);
const ubicacionLabel = { TODAS: "Todas las ubicaciones", PRINCIPAL: "Bodega principal", SEDES: "Sedes" };

function BrandIcon({ marca }: { marca: string }) {
  return marca === "APPLE" ? <svg viewBox="0 0 24 24" className={styles.appleIcon} fill="currentColor" aria-hidden="true"><path d="M17.05 12.54c.03 3.25 2.85 4.33 2.88 4.35-.02.08-.45 1.54-1.48 3.05-.89 1.3-1.81 2.6-3.27 2.63-1.43.03-1.89-.85-3.52-.85-1.62 0-2.13.82-3.47.88-1.41.05-2.48-1.41-3.38-2.7-1.84-2.65-3.25-7.49-1.36-10.77a5.25 5.25 0 0 1 4.45-2.7c1.39-.03 2.7.94 3.54.94.83 0 2.4-1.16 4.05-.99.69.03 2.65.28 3.91 2.12-.1.06-2.34 1.36-2.35 4.04ZM14.38 4.62c.75-.91 1.26-2.17 1.12-3.43-1.08.04-2.4.72-3.17 1.62-.7.8-1.31 2.1-1.15 3.33 1.2.09 2.43-.61 3.2-1.52Z" /></svg> : <DashboardIcon name="inventory" className={styles.brandIcon} />;
}

export default function DashboardRadarWorkspace({ summary }: {
  summary: InventoryAdminSummary;
  puedeVerBodegaPrincipal: boolean;
  puedeVerInventario: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [ubicacion, setUbicacion] = useState<RadarLocationFilter>("TODAS");
  const [marcaActiva, setMarcaActiva] = useState("TODAS");
  const [pagina, setPagina] = useState(1);
  const [referenciaActiva, setReferenciaActiva] = useState<RadarReference | null>(null);
  const [exportando, setExportando] = useState(false);
  const [errorExportacion, setErrorExportacion] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const moreBrandsRef = useRef<HTMLDetailsElement>(null);
  const exportRef = useRef(false);
  const view = useMemo(() => buildRadarView(summary, { search: busqueda, location: ubicacion, brand: marcaActiva }, pagina), [summary, busqueda, ubicacion, marcaActiva, pagina]);
  const marcasVisibles = view.brands.slice(0, 6);
  const paginas = [...new Set([1, view.page - 1, view.page, view.page + 1, view.pageCount])].filter((value) => value >= 1 && value <= view.pageCount).sort((a, b) => a - b);
  const exportUrl = `/api/dashboard/radar/export?${new URLSearchParams({ alcance: "consulta", q: busqueda.trim(), ubicacion, marca: marcaActiva }).toString()}`;

  useEffect(() => {
    if (!referenciaActiva || !dialogRef.current) return;
    const dialog = dialogRef.current;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, [referenciaActiva]);

  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!moreBrandsRef.current?.contains(event.target as Node)) moreBrandsRef.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && moreBrandsRef.current?.open) { moreBrandsRef.current.removeAttribute("open"); moreBrandsRef.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);

  const cambiarMarca = (marca: string) => { setMarcaActiva(marca); setPagina(1); setErrorExportacion(""); moreBrandsRef.current?.removeAttribute("open"); };
  const cerrarDetalle = () => { dialogRef.current?.close(); setReferenciaActiva(null); triggerRef.current?.focus({ preventScroll: true }); };
  const abrirDetalle = (item: RadarReference, trigger: HTMLButtonElement) => { triggerRef.current = trigger; setReferenciaActiva(item); };
  const limpiarFiltros = () => { setBusqueda(""); setUbicacion("TODAS"); setMarcaActiva("TODAS"); setPagina(1); setErrorExportacion(""); };

  const exportar = async () => {
    if (exportRef.current || !view.references.length) return;
    exportRef.current = true;
    setExportando(true);
    setErrorExportacion("");
    try {
      const response = await fetch(exportUrl, { cache: "no-store" });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error || "No se pudo exportar el radar.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "radar-inventario.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setErrorExportacion(error instanceof Error ? error.message : "No se pudo exportar el radar.");
    } finally { exportRef.current = false; setExportando(false); }
  };

  return <>
    <section className={styles.summary} aria-label="Resumen de disponibilidad">
      {[
        { icon: "inventory" as const, value: view.metrics.totalBodega, label: "Equipos disponibles" },
        { icon: "store" as const, value: view.metrics.totalBodegaPrincipal, label: "Bodega principal" },
        { icon: "pin" as const, value: view.metrics.totalSedes, label: "Disponibles en sedes" },
        { icon: "catalog" as const, value: view.metrics.referenciasEnBodega, label: "Referencias activas" },
      ].map((item) => <div className={styles.metric} key={item.label}><span className={styles.metricIcon}><DashboardIcon name={item.icon} /></span><div><strong>{numero(item.value)}</strong><span>{item.label}</span></div></div>)}
    </section>

    <section className={styles.panel} aria-labelledby="radar-title">
      <div className={styles.panelTitle}><h2 id="radar-title">Disponibilidad de equipos</h2><span className={styles.badge}>Solo disponibles</span></div>
      <div className={styles.filters}>
        <label className={styles.search}><span className={styles.srOnly}>Buscar marca o referencia</span><DashboardIcon name="search" /><input id="radar-search" value={busqueda} maxLength={100} onChange={(event) => { setBusqueda(event.target.value); setPagina(1); setErrorExportacion(""); }} placeholder="Buscar marca o referencia..." />{busqueda && <button type="button" onClick={() => { setBusqueda(""); setPagina(1); }} aria-label="Limpiar búsqueda"><DashboardIcon name="close" /></button>}</label>
        <label className={styles.location}><span className={styles.srOnly}>Filtrar por ubicación</span><DashboardIcon name="pin" /><select aria-label="Filtrar por ubicación" value={ubicacion} onChange={(event) => { setUbicacion(event.target.value as RadarLocationFilter); setPagina(1); setErrorExportacion(""); }}><option value="TODAS">Todas las ubicaciones</option><option value="PRINCIPAL">Bodega principal</option><option value="SEDES">Sedes</option></select><DashboardIcon name="chevron" /></label>
        <button type="button" className={`${styles.button} ${styles.exportButton}`} disabled={exportando || !view.references.length} onClick={() => void exportar()}><DashboardIcon name="download" />{exportando ? "Exportando..." : "Exportar Excel"}</button>
      </div>
      {errorExportacion && <p className={styles.error} role="alert">{errorExportacion}</p>}

      <nav className={styles.brands} aria-label="Filtrar por marca">
        <button type="button" className={`${styles.brandTab} ${marcaActiva === "TODAS" ? styles.selectedBrand : ""}`} aria-pressed={marcaActiva === "TODAS"} onClick={() => cambiarMarca("TODAS")}><DashboardIcon name="catalog" /><span>Todas</span><span className={styles.brandCount}>{numero(view.totalUnits)}<span className={styles.srOnly}> unidades disponibles</span></span></button>
        {marcasVisibles.map((brand) => <button type="button" key={brand.marca} className={`${styles.brandTab} ${marcaActiva === brand.marca ? styles.selectedBrand : ""}`} aria-pressed={marcaActiva === brand.marca} onClick={() => cambiarMarca(brand.marca)}><BrandIcon marca={brand.marca} /><span>{marcaLabel(brand.marca)}</span><span className={styles.brandCount}>{numero(brand.total)}<span className={styles.srOnly}> unidades disponibles</span></span></button>)}
        {view.brands.length > 0 && <details ref={moreBrandsRef} className={styles.moreBrands}><summary className={`${styles.button} ${!marcasVisibles.some((brand) => brand.marca === marcaActiva) && marcaActiva !== "TODAS" ? styles.moreSelected : ""}`}>{!marcasVisibles.some((brand) => brand.marca === marcaActiva) && marcaActiva !== "TODAS" ? marcaLabel(marcaActiva) : "Más marcas"}<DashboardIcon name="chevron" /></summary><div className={styles.brandMenu} aria-label="Todas las marcas">{view.brands.map((brand) => <button type="button" key={brand.marca} aria-pressed={marcaActiva === brand.marca} className={marcaActiva === brand.marca ? styles.activeBrandOption : undefined} onClick={() => cambiarMarca(brand.marca)}><BrandIcon marca={brand.marca} /><span>{marcaLabel(brand.marca)}</span><strong>{numero(brand.total)}<span className={styles.srOnly}> unidades disponibles</span></strong></button>)}</div></details>}
        <span className={styles.brandTotal}>{numero(view.brands.length)} marcas</span>
      </nav>

      <div className={styles.tableFrame}>
        <div className={styles.tableScroller} tabIndex={0} role="region" aria-label="Referencias disponibles. Desplaza horizontalmente para ver todas las columnas.">
          <table className={styles.table} id="radar-reference-table"><thead><tr><th scope="col">Referencia</th><th scope="col">Bodega principal</th><th scope="col">Unidades en sedes</th><th scope="col">Total disponible</th><th scope="col">Detalle</th></tr></thead><tbody>
            {view.pageRows.map((item) => <tr key={`${item.marca}-${item.referencia}`}><td><div className={styles.reference}><BrandIcon marca={item.marca} /><strong>{item.referencia}</strong></div></td><td>{numero(item.bodegaPrincipal)}</td><td><button type="button" className={styles.sedeCount} onClick={(event) => abrirDetalle(item, event.currentTarget)} aria-label={`Ver ${numero(item.sedes)} unidades en sedes de ${item.referencia}`}><DashboardIcon name="pin" />{numero(item.sedes)}</button></td><td><span className={styles.availableCount}>{numero(item.total)}</span></td><td><button type="button" className={`${styles.button} ${styles.detailButton}`} onClick={(event) => abrirDetalle(item, event.currentTarget)} aria-label={`Ver sedes de ${item.referencia}`}>Ver sedes<DashboardIcon name="chevron" /></button></td></tr>)}
            {!view.pageRows.length && <tr><td colSpan={5}><div className={styles.empty}><DashboardIcon name="search" /><h3>No hay referencias disponibles</h3><p>Prueba otra marca, referencia o ubicación.</p><button type="button" className={styles.button} onClick={limpiarFiltros}>Limpiar filtros</button></div></td></tr>}
          </tbody></table>
        </div>
        <div className={styles.pagination}><p aria-live="polite">{view.totalReferences ? `Mostrando ${(view.page - 1) * 10 + 1}–${Math.min(view.page * 10, view.totalReferences)} de ${numero(view.totalReferences)} referencias` : "0 referencias"}{marcaActiva !== "TODAS" && <> de {marcaLabel(marcaActiva)}</>}</p><span className={styles.pageSize}>10 por página</span><nav className={styles.pageButtons} aria-label="Páginas de referencias"><button type="button" disabled={view.page === 1} onClick={() => setPagina(view.page - 1)} aria-label="Anterior"><DashboardIcon name="chevron" className={styles.chevronLeft} /><span className={styles.srOnly}>Anterior</span></button>{paginas.map((page, index) => <span key={page}>{index > 0 && page > paginas[index - 1] + 1 && <span className={styles.ellipsis}>…</span>}<button type="button" className={page === view.page ? styles.currentPage : undefined} aria-current={page === view.page ? "page" : undefined} onClick={() => setPagina(page)} aria-label={`Página ${page}`}>{page}</button></span>)}<button type="button" disabled={view.page === view.pageCount} onClick={() => setPagina(view.page + 1)} aria-label="Siguiente"><span className={styles.srOnly}>Siguiente</span><DashboardIcon name="chevron" className={styles.chevronRight} /></button></nav></div>
      </div>
      <p className={styles.hint}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v2" /></svg><span>Selecciona <strong>Ver sedes</strong> para consultar la distribución.</span></p>
    </section>

    {referenciaActiva && <dialog ref={dialogRef} className={styles.detailPanel} aria-labelledby="radar-detail-title" aria-describedby="radar-detail-scope" onCancel={(event) => { event.preventDefault(); cerrarDetalle(); }} onClose={() => { setReferenciaActiva(null); triggerRef.current?.focus({ preventScroll: true }); }}>
      <div className={styles.detailHeader}><div><span className={styles.detailBrand}><BrandIcon marca={referenciaActiva.marca} />{marcaLabel(referenciaActiva.marca)}</span><h2 id="radar-detail-title">{referenciaActiva.referencia}</h2><p id="radar-detail-scope">Disponibilidad por sede · {ubicacionLabel[ubicacion]}</p></div><button type="button" className={styles.closeDetail} onClick={cerrarDetalle} aria-label="Cerrar detalle"><DashboardIcon name="close" /></button></div>
      <div className={styles.detailBody}><div className={styles.principalAvailability}><DashboardIcon name="store" /><span>Bodega principal</span><strong>{numero(referenciaActiva.bodegaPrincipal)}</strong></div><h3>Unidades disponibles en sedes</h3><table className={styles.sedesTable}><thead><tr><th scope="col">Sede</th><th scope="col">Unidades</th></tr></thead><tbody>{referenciaActiva.sedesDetalle.map((sede) => <tr key={sede.sede}><td>{sede.sede}</td><td>{numero(sede.total)}</td></tr>)}{!referenciaActiva.sedesDetalle.length && <tr><td colSpan={2}>Sin unidades en sedes para esta consulta.</td></tr>}</tbody><tfoot><tr><th scope="row">Total en sedes</th><td>{numero(referenciaActiva.sedes)}</td></tr></tfoot></table><div className={styles.referenceTotal}><span>Total disponible de la referencia</span><strong>{numero(referenciaActiva.total)}</strong></div></div>
      <div className={styles.detailFooter}><button type="button" className={`${styles.button} ${styles.graphite}`} onClick={cerrarDetalle}>Cerrar</button></div>
    </dialog>}
  </>;
}
