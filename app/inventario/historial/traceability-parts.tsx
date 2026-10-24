"use client";

import { useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import type { NavigationItem } from "@/app/dashboard/_components/operations-dashboard";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import styles from "./history.module.css";

export function TraceabilityNavigation({ items, name, role, activeHref = "/inventario" }: {
  items: NavigationItem[]; name: string; role: string; activeHref?: string;
}) {
  const secondary = items.filter(item => ["/cierre", "/dashboard/reportes", "/dashboard/analitico", "/dashboard/sedes"].includes(item.href));
  const primary = items.filter(item => !secondary.includes(item));
  const link = (item: NavigationItem) => <Link key={item.href} href={item.href} className={`${styles.navItem} ${item.href === activeHref ? styles.navActive : ""}`} aria-current={item.href === activeHref ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>;
  return <header className={styles.topbar}>
    <Link href="/dashboard" className={styles.brand}><Image src="/branding/conectamos-logo.png" alt="" width={44} height={44} priority /><strong>CONECTAMOS</strong></Link>
    <nav aria-label="Navegación principal" className={styles.navigation}>
      {primary.map(link)}
      <div className={styles.extraNavigation}>{secondary.map(link)}</div>
      {secondary.length > 0 && <details className={styles.moreNavigation} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>Más<DashboardIcon name="chevron" /></summary><div>{secondary.map(link)}</div></details>}
    </nav>
    <SalesProfile name={name} role={role} />
  </header>;
}

export function TraceabilitySearch({ imei }: { imei: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <form className={styles.searchForm} action="/inventario/historial" onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const value = String(new FormData(event.currentTarget).get("imei") || "");
    startTransition(() => router.push(`/inventario/historial?${new URLSearchParams({ imei: value })}`));
  }} aria-busy={pending}>
    <div className={styles.searchField}>
      <label htmlFor="traceability-imei">IMEI del equipo</label>
      <div className={styles.inputWrap}><DashboardIcon name="barcode" /><input id="traceability-imei" key={imei} type="text" inputMode="numeric" name="imei" defaultValue={imei} placeholder="Escribe el IMEI de 15 dígitos" autoComplete="off" /></div>
    </div>
    <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={pending}><DashboardIcon name={pending ? "refresh" : "search"} />{pending ? "Consultando…" : "Buscar IMEI"}</button>
    {imei && <Link href="/inventario/historial" className={styles.button}>Limpiar</Link>}
  </form>;
}
