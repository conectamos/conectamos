import styles from "./reports.module.css";

export default function ReportsLoading() {
  return <main className={styles.page} aria-busy="true"><div className={styles.statePage}>
    <h1>Reportes</h1><p role="status">Cargando la consulta mensual…</p>
    <div className={styles.loadingGrid} aria-hidden="true"><div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
  </div></main>;
}
