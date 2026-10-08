import styles from "./brands.module.css";

export default function LoadingBrandsReport() {
  return <main className={styles.page}><section className={styles.statePage} aria-busy="true"><h1>Marcas y referencias</h1><p role="status">Cargando el reporte del mes y la cobertura consultados…</p><div className={styles.loadingStrip} aria-hidden="true" /><div className={styles.loadingStrip} aria-hidden="true" /></section></main>;
}
