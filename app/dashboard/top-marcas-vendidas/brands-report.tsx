"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import ReferenceSalesPanel from "./reference-sales-panel";
import BrandReferenceList from "./brand-reference-list";
import styles from "./brands.module.css";

export type BrandRankingItem = { nombre: string; total: number; porcentaje: number };
export type BrandSedeItem = BrandRankingItem & { sedeId: number };
export type BrandsReportProps = {
  usuario: { nombre: string; rolNombre: string };
  consulta: { period: string; periodLabel: string; sedeId: string; cobertura: string };
  sedes: { id: number; nombre: string }[];
  ventas: number;
  marcas: BrandRankingItem[];
  referencias: BrandRankingItem[];
  detalles: Record<string, BrandSedeItem[]>;
  referenciasPorMarca?: Record<string, BrandRankingItem[]>;
};

const numero = (valor: number) => Number(valor || 0).toLocaleString("es-CO");
const porcentaje = (valor: number) => `${Number(valor || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const navigationItems: { href: string; icon: DashboardIconName; label: string }[] = [
  { href: "/dashboard", icon: "home", label: "Inicio" },
  { href: "/ventas", icon: "sales", label: "Ventas" },
  { href: "/inventario", icon: "inventory", label: "Inventario" },
  { href: "/prestamos", icon: "loans", label: "Préstamos" },
  { href: "/caja", icon: "wallet", label: "Caja" },
  { href: "/cierre", icon: "reports", label: "CIERRE" },
  { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
  { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
  { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
];

function Metric({ icon, label, value, detail, count = false, reference = false }: {
  icon: DashboardIconName; label: string; value: string; detail?: string; count?: boolean; reference?: boolean;
}) {
  return <div className={styles.metric}>
    <span className={styles.metricIcon}><DashboardIcon name={icon} /></span>
    <div><h2>{label}</h2><p className={`${styles.metricValue} ${count ? styles.countValue : ""} ${reference ? styles.referenceValue : ""}`}>{value}</p>{detail && <p className={styles.metricDetail}>{detail}</p>}</div>
  </div>;
}

function Participation({ value }: { value: number }) {
  return <div className={styles.participation}><span className={styles.barTrack} aria-hidden="true"><span className={styles.barFill} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span><span>{porcentaje(value)}</span></div>;
}

export default function BrandsReport({ usuario, consulta, sedes, ventas, marcas, referencias, detalles, referenciasPorMarca = {} }: BrandsReportProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [marcaActiva, setMarcaActiva] = useState<BrandRankingItem | null>(null);
  const [detailView, setDetailView] = useState<"sedes" | "referencias">("sedes");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const marcaLider = marcas[0];
  const referenciaLider = referencias[0];
  const detalleSedes = marcaActiva ? detalles[marcaActiva.nombre] || [] : [];

  useEffect(() => {
    if (!marcaActiva || !dialogRef.current) return;
    const dialog = dialogRef.current;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, [marcaActiva]);

  function consultar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams({
      period: String(formData.get("period") || consulta.period),
      sedeId: String(formData.get("sedeId") || "TODAS"),
    });
    startTransition(() => router.push(`/dashboard/top-marcas-vendidas?${params.toString()}`));
  }

  function cerrarDetalle() {
    dialogRef.current?.close();
    setMarcaActiva(null);
    triggerRef.current?.focus({ preventScroll: true });
  }

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" width={42} height={42} alt="" priority /><strong>CONECTAMOS</strong></Link>
      <nav className={styles.navigation} aria-label="Navegación principal">{navigationItems.map(item => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === "/dashboard/reportes" ? styles.navActive : ""}`} aria-current={item.href === "/dashboard/reportes" ? "page" : undefined}><DashboardIcon name={item.icon} />{item.label}</Link>)}</nav>
      <div className={styles.profileWrap}><SalesProfile name={usuario.nombre} role={usuario.rolNombre} /></div>
    </header>
    <main className={styles.main}>
      <header className={styles.header}>
        <div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard/reportes">Reportes</Link><DashboardIcon name="chevron" /><span>Marcas y referencias</span></nav><h1>Marcas y referencias</h1><p>Rendimiento de ventas por marca y referencia.</p></div>
        <Link href="/dashboard/reportes" className={styles.backButton}><DashboardIcon name="arrow" />Volver a reportes</Link>
      </header>
      <section className={styles.metrics} aria-label="Resumen de ventas">
        <Metric icon="reports" label="Unidades vendidas" value={numero(ventas)} count />
        <Metric icon="trophy" label="Marca o categoría líder" value={marcaLider?.nombre || "Sin ventas"} detail={marcaLider ? `${numero(marcaLider.total)} unidades · ${porcentaje(marcaLider.porcentaje)}` : undefined} />
        <Metric icon="inventory" label="Referencia líder" value={referenciaLider?.nombre || "Sin ventas"} detail={referenciaLider ? `${numero(referenciaLider.total)} unidades · ${porcentaje(referenciaLider.porcentaje)}` : undefined} reference />
        <Metric icon="tag" label="Referencias vendidas" value={numero(referencias.length)} count />
      </section>
      <form onSubmit={consultar} className={styles.filters} aria-busy={pending}>
        <div className={styles.filterHeading}><span className={styles.sectionIcon}><DashboardIcon name="calendar" /></span><div><h2>Periodo y cobertura</h2><p>{capitalize(consulta.periodLabel)} · {consulta.cobertura}</p></div></div>
        <label>Mes comercial<span className={styles.inputWrapper}><DashboardIcon name="calendar" /><input type="month" name="period" required defaultValue={consulta.period} disabled={pending} /></span></label>
        <label>Cobertura<span className={styles.inputWrapper}><DashboardIcon name="store" /><select name="sedeId" defaultValue={consulta.sedeId} disabled={pending}><option value="TODAS">Todas las sedes</option>{sedes.map(sede => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</select></span></label>
        <button type="submit" className={styles.consultButton} disabled={pending}><DashboardIcon name="search" />{pending ? "Consultando…" : "Consultar"}</button>
      </form>
      {pending && <p className={styles.queryStatus} role="status">Consultando el mes y la cobertura seleccionados…</p>}
      <div className={styles.panels}>
        <section className={styles.brandsPanel} aria-labelledby="brands-heading">
          <div className={styles.panelHeading}><span className={styles.sectionIcon}><DashboardIcon name="reports" /></span><div><h2 id="brands-heading">Marcas y categorías</h2><p>Unidades vendidas y participación por grupo.</p></div><span className={styles.badge}>{numero(marcas.length)} grupos</span></div>
          <div className={styles.brandHint}><DashboardIcon name="store" /><span>Abre <strong>Ver detalle</strong> para consultar sedes y referencias de cada grupo.</span></div>
          <div className={styles.tableScroller}><table className={styles.brandTable}>
            <caption className={styles.visuallyHidden}>Marcas vendidas durante {consulta.periodLabel} en {consulta.cobertura}</caption>
            <thead><tr><th scope="col">#</th><th scope="col">Marca / Categoría</th><th scope="col" className={styles.numeric}>Unidades</th><th scope="col">Participación</th><th scope="col">Detalle</th></tr></thead>
            <tbody>{marcas.length === 0 ? <tr><td colSpan={5} className={styles.empty}>No hay marcas registradas durante este periodo.</td></tr> : marcas.map((item, index) => <tr key={item.nombre} className={index === 0 ? styles.leader : undefined}><td><span className={styles.position}>{index + 1}</span></td><th scope="row">{item.nombre}</th><td className={styles.numeric}>{numero(item.total)}</td><td><Participation value={item.porcentaje} /></td><td><button type="button" className={styles.detailButton} disabled={pending} aria-haspopup="dialog" aria-label={`Ver detalle de ${item.nombre}: ${numero(item.total)} unidades, ${porcentaje(item.porcentaje)}`} onClick={event => { triggerRef.current = event.currentTarget; setDetailView(["OTRAS MARCAS", "ELECTRODOMÉSTICOS"].includes(item.nombre) ? "referencias" : "sedes"); setMarcaActiva(item); }}>Ver detalle<DashboardIcon name="chevron" /></button></td></tr>)}</tbody>
          </table></div>
          <footer className={styles.panelFooter}>{numero(marcas.length)} grupos · {numero(ventas)} unidades vendidas</footer>
        </section>
        <ReferenceSalesPanel key={`${consulta.period}:${consulta.sedeId}`} topItems={referencias.slice(0, 10)} allItems={referencias} />
      </div>
    </main>
    {marcaActiva && <dialog ref={dialogRef} className={styles.brandDialog} aria-labelledby="brand-dialog-title" aria-describedby="brand-dialog-period" onCancel={event => { event.preventDefault(); cerrarDetalle(); }} onClose={() => { setMarcaActiva(null); triggerRef.current?.focus({ preventScroll: true }); }}>
      <div className={styles.dialogHeading}><div><span className={styles.dialogEyebrow}>Detalle de ventas</span><h2 id="brand-dialog-title">{marcaActiva.nombre}</h2></div><button type="button" className={styles.closeIcon} aria-label="Cerrar detalle" onClick={cerrarDetalle} autoFocus><DashboardIcon name="close" /></button></div>
      <div className={styles.dialogContext}><p id="brand-dialog-period">{capitalize(consulta.periodLabel)}</p><span>{consulta.cobertura}</span></div>
      <div className={styles.brandTotal}><span className={styles.metricIcon}><DashboardIcon name="inventory" /></span><div><p>Total vendido del grupo</p><p><strong>{numero(marcaActiva.total)}</strong> <span>unidades</span></p></div></div>
      <div className={styles.detailViews} role="group" aria-label="Vista del detalle"><button type="button" aria-pressed={detailView === "sedes"} onClick={() => setDetailView("sedes")}><DashboardIcon name="store" />Por sede</button><button type="button" aria-pressed={detailView === "referencias"} onClick={() => setDetailView("referencias")}><DashboardIcon name="inventory" />Referencias <span>{numero((referenciasPorMarca[marcaActiva.nombre] || []).length)}</span></button></div>
      {detailView === "referencias" ? <BrandReferenceList key={marcaActiva.nombre} label={marcaActiva.nombre} items={referenciasPorMarca[marcaActiva.nombre] || []} /> : <div className={styles.tableScroller}><table className={styles.sedeTable}><thead><tr><th scope="col">Sede</th><th scope="col">Unidades</th><th scope="col">Participación</th></tr></thead><tbody>{detalleSedes.map(sede => <tr key={sede.sedeId}><th scope="row">{sede.nombre}</th><td>{numero(sede.total)}</td><td><Participation value={sede.porcentaje} /></td></tr>)}</tbody><tfoot><tr><th scope="row">Total</th><td>{numero(marcaActiva.total)}</td><td><Participation value={marcaActiva.total > 0 ? 100 : 0} /></td></tr></tfoot></table></div>}
      <footer className={styles.dialogFooter}><button type="button" onClick={cerrarDetalle}>Cerrar</button></footer>
    </dialog>}
  </div>;
}
