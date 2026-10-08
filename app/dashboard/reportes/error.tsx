"use client";

import Link from "next/link";
import { useTransition } from "react";
import styles from "./reports.module.css";

export default function ReportsError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <main className={styles.page}><section className={styles.statePage}>
    <h1>Reportes</h1><p role="alert">No se pudo cargar el reporte. Reintenta la consulta o revisa el mes y la cobertura seleccionados.</p>
    <div className={styles.stateActions}>
      <button className={styles.consultButton} type="button" disabled={pending} onClick={() => startTransition(() => unstable_retry())}>{pending ? "Consultando…" : "Reintentar"}</button>
      <a className={styles.backButton} href="/dashboard/reportes">Revisar filtros</a>
      <Link className={styles.backButton} href="/dashboard">Volver</Link>
    </div>
  </section></main>;
}
