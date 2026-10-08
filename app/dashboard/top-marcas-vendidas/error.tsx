"use client";

import Link from "next/link";
import { useTransition } from "react";
import styles from "./brands.module.css";

export default function BrandsReportError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <main className={styles.page}><section className={styles.statePage}><h1>Marcas y referencias</h1><p role="alert">No se pudo cargar el reporte. Reintenta la consulta o revisa el mes y la cobertura seleccionados.</p><div className={styles.stateActions}><button type="button" className={styles.consultButton} disabled={pending} onClick={() => startTransition(() => unstable_retry())}>{pending ? "Consultando…" : "Reintentar"}</button><a href="/dashboard/top-marcas-vendidas" className={styles.backButton}>Revisar filtros</a><Link href="/dashboard/reportes" className={styles.backButton}>Volver</Link></div></section></main>;
}
