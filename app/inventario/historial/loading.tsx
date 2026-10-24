import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import styles from "./history.module.css";

export default function LoadingHistory() {
  return <div className={styles.page}><main className={styles.main} aria-busy="true" aria-live="polite"><div className={styles.heading}><h1>Centro de trazabilidad</h1></div><section className={styles.panel}><div className={styles.loading}><DashboardIcon name="refresh" className="mb-3 h-6 w-6 text-[#e30613]" />Consultando el historial del equipo…</div></section></main></div>;
}
