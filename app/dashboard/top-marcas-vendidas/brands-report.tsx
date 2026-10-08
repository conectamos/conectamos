"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { DashboardSidebar, type NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import ReferenceSalesPanel from "./reference-sales-panel";
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
};

const numero = (valor: number) => Number(valor || 0).toLocaleString("es-CO");
const porcentaje = (valor: number) => `${Number(valor || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const navigationItems: NavigationItem[] = [
  { href: "/dashboard", icon: "home", label: "Inicio" },
  { href: "/ventas", icon: "sales", label: "Ventas" },
  { href: "/inventario", icon: "inventory", label: "Inventario" },
  { href: "/prestamos", icon: "loans", label: "Préstamos" },
  { href: "/caja", icon: "wallet", label: "Caja" },
  { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
  { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
  { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
];

function Metric({ icon, label, value, detail, count = false, reference = false }: {
  icon: DashboardIconName; label: string; value: string; detail?: string; count?: boolean; reference?: boolean;
}) {
  return <div className={styles.metric}>
    <span className={styles.metricIcon}><DashboardIcon name={icon} className="h-6 w-6" /></span>
    <div><h2>{label}</h2><p className={`${styles.metricValue} ${count ? styles.countValue : ""} ${reference ? styles.referenceValue : ""}`}>{value}</p>{detail && <p className={styles.metricDetail}>{detail}</p>}</div>
  </div>;
}

function Participation({ value }: { value: number }) {
  return <div className={styles.participation}><span className={styles.barTrack} aria-hidden="true"><span className={styles.barFill} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span><span>{porcentaje(value)}</span></div>;
}

export default function BrandsReport({ usuario, consulta, sedes, ventas, marcas, referencias, detalles }: BrandsReportProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [marcaActiva, setMarcaActiva] = useState<BrandRankingItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const userMenuRef = useRef<HTMLDetailsElement>(null);
  const marcaLider = marcas[0];
  const referenciaLider = referencias[0];
  const iniciales = usuario.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]?.toUpperCase()).join("");
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

  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) userMenuRef.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && userMenuRef.current?.open) {
        userMenuRef.current.open = false;
        userMenuRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", escape); };
  }, []);

  function consultar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <DashboardSidebar activeHref="/dashboard/reportes" coverageLabel={consulta.cobertura} items={navigationItems} />
    <div className={styles.content}><main className={styles.main}>
      <header className={styles.header}>
        <div><nav className={styles.breadcrumb} aria-label="Ruta de navegación"><Link href="/dashboard/reportes">Reportes</Link><DashboardIcon name="chevron" className="h-3 w-3 -rotate-90" /><span>Marcas y referencias</span></nav><h1>Marcas y referencias</h1><p>Rendimiento de ventas de marcas y referencias comercializadas</p></div>
        <details className={styles.userMenu} ref={userMenuRef}><summary><span className={styles.avatar}>{iniciales || <DashboardIcon name="user" />}</span><span className={styles.userIdentity}><strong>{usuario.nombre}</strong><span>{usuario.rolNombre}</span></span><DashboardIcon name="chevron" className="h-4 w-4" /></summary><div className={styles.userActions}><LogoutButton variant="light" className={styles.logout} /></div></details>
      </header>

      <form onSubmit={consultar} className={styles.filters} aria-busy={pending}>
        <label>Mes comercial<span className={styles.inputWrapper}><DashboardIcon name="calendar" className="h-4 w-4" /><input type="month" name="period" required defaultValue={consulta.period} disabled={pending} /></span></label>
        <label>Cobertura<span className={styles.inputWrapper}><DashboardIcon name="store" className="h-4 w-4" /><select name="sedeId" defaultValue={consulta.sedeId} disabled={pending}><option value="TODAS">Todas las sedes</option>{sedes.map((sede) => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</select></span></label>
        <button type="submit" className={styles.consultButton} disabled={pending}><DashboardIcon name="search" className="h-4 w-4" />{pending ? "Consultando…" : "Consultar"}</button>
        <Link href="/dashboard/reportes" className={styles.backButton}><DashboardIcon name="arrow" className="h-4 w-4 rotate-180" />Volver</Link>
      </form>
      {pending && <p className={styles.queryStatus} role="status">Consultando el mes y la cobertura seleccionados…</p>}

      <section className={styles.metrics} aria-label="Resumen de ventas">
        <Metric icon="reports" label="Unidades vendidas" value={numero(ventas)} count />
        <Metric icon="trophy" label="Marca líder" value={marcaLider?.nombre || "Sin ventas"} detail={marcaLider ? `${numero(marcaLider.total)} unidades · ${porcentaje(marcaLider.porcentaje)}` : undefined} />
        <Metric icon="inventory" label="Referencia líder" value={referenciaLider?.nombre || "Sin ventas"} detail={referenciaLider ? `${numero(referenciaLider.total)} unidades · ${porcentaje(referenciaLider.porcentaje)}` : undefined} reference />
        <Metric icon="tag" label="Referencias vendidas" value={numero(referencias.length)} count />
      </section>

      <div className={styles.panels}>
        <section className={styles.brandsPanel} aria-labelledby="brands-heading">
          <div className={styles.panelHeading}><DashboardIcon name="reports" className={styles.panelIcon} /><div><h2 id="brands-heading">Marcas vendidas</h2><p>Selecciona una marca para ver sus ventas por sede.</p></div><span className={styles.badge}>{numero(marcas.length)} marcas</span></div>
          {marcas.length === 0 ? <p className={styles.empty}>No hay marcas registradas durante este período.</p> : <>
            <div className={styles.brandColumns} aria-hidden="true"><span>#</span><span>Marca</span><span>Unidades</span><span>Participación</span><span /></div>
            <ol className={styles.brandList}>{marcas.map((item, index) => <li key={item.nombre}><button type="button" className={`${styles.brandRow} ${index === 0 ? styles.leader : ""}`} disabled={pending} aria-haspopup="dialog" aria-label={`${index + 1}. ${item.nombre}: ${numero(item.total)} unidades, ${porcentaje(item.porcentaje)}. Ver ventas por sede`} onClick={(event) => { triggerRef.current = event.currentTarget; setMarcaActiva(item); }}><span className={styles.position}>{index + 1}</span><span className={styles.brandName}><strong>{item.nombre}</strong>{index === 0 && <span>Ver por sede</span>}</span><span className={styles.brandUnits}>{numero(item.total)}</span><Participation value={item.porcentaje} /><DashboardIcon name="chevron" className="h-4 w-4 -rotate-90" /></button></li>)}</ol>
          </>}
        </section>
        <ReferenceSalesPanel key={`${consulta.period}:${consulta.sedeId}`} topItems={referencias.slice(0, 10)} allItems={referencias} />
      </div>
    </main></div>

    {marcaActiva && <dialog ref={dialogRef} className={styles.brandDialog} aria-labelledby="brand-dialog-title" aria-describedby="brand-dialog-period" onCancel={(event) => { event.preventDefault(); cerrarDetalle(); }} onClose={() => { setMarcaActiva(null); triggerRef.current?.focus({ preventScroll: true }); }}>
      <div className={styles.dialogHeading}><h2 id="brand-dialog-title">{marcaActiva.nombre}</h2><button type="button" className={styles.closeIcon} aria-label="Cerrar detalle" onClick={cerrarDetalle} autoFocus><DashboardIcon name="close" className="h-5 w-5" /></button></div>
      <div className={styles.dialogContext}><p id="brand-dialog-period">Ventas por sede · {capitalize(consulta.periodLabel)}</p><span>{consulta.cobertura}</span></div>
      <div className={styles.brandTotal}><p>Total vendido</p><p><strong>{numero(marcaActiva.total)}</strong> <span>unidades</span></p></div>
      <table className={styles.sedeTable}><thead><tr><th scope="col">Sede</th><th scope="col">Unidades</th><th scope="col">Participación</th></tr></thead><tbody>{detalleSedes.map((sede) => <tr key={sede.sedeId}><th scope="row">{sede.nombre}</th><td>{numero(sede.total)}</td><td><Participation value={sede.porcentaje} /></td></tr>)}</tbody><tfoot><tr><th scope="row">Total</th><td>{numero(marcaActiva.total)}</td><td><Participation value={marcaActiva.total > 0 ? 100 : 0} /></td></tr></tfoot></table>
      <footer className={styles.dialogFooter}><button type="button" onClick={cerrarDetalle}>Cerrar</button></footer>
    </dialog>}
  </div>;
}
