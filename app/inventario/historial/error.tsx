"use client";

import Link from "next/link";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import styles from "./history.module.css";

export default function HistoryError({ reset }: { reset: () => void }) {
  return <div className={styles.page}><main className={styles.main}><div className={styles.heading}><h1>Centro de trazabilidad</h1></div><section className={styles.panel}><div className={styles.empty} role="alert"><span className={styles.emptyIllustration}><DashboardIcon name="warning" /></span><h3>No se pudo consultar el historial</h3><p>Intenta nuevamente. La consulta no modifica los datos del equipo.</p><div className={`${styles.headingActions} mt-5`}><Link href="/inventario/historial" className={styles.button}>Volver a la búsqueda</Link><button type="button" className={`${styles.button} ${styles.primary}`} onClick={reset}><DashboardIcon name="refresh" />Reintentar</button></div></div></section></main></div>;
}
