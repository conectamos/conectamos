"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./reminder-status.module.css";

type ReminderStatus = {
  enabled: boolean;
  configured: boolean;
  recipient: string | null;
  hour: 8;
  timeZone: "America/Bogota";
  lastSentAt: string | null;
  pending: number;
  failed: number;
  uncertain: number;
};

function validStatus(value: unknown): value is ReminderStatus {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.enabled === "boolean" && typeof item.configured === "boolean"
    && (item.recipient === null || typeof item.recipient === "string")
    && item.hour === 8 && item.timeZone === "America/Bogota"
    && (item.lastSentAt === null || (typeof item.lastSentAt === "string" && Number.isFinite(Date.parse(item.lastSentAt))))
    && [item.pending, item.failed, item.uncertain].every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0);
}

const dateLabel = (value: string) => new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));

export default function InvoiceReminderStatus() {
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/pago-facturas/reminders", { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { setStatus(null); setAllowed(false); return; }
      if (!response.ok) throw new Error("No se pudo consultar el estado de WhatsApp.");
      const value: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!validStatus(value)) throw new Error("No se pudo confirmar el estado de WhatsApp.");
      setStatus(value); setFailed(false);
    } catch {
      if (requestRef.current === controller) setFailed(true);
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, []);

  useLiveRefresh(refresh, { enabled: allowed, intervalMs: 60_000, runOnMount: true });
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);

  if (!allowed) return null;
  const active = Boolean(status?.enabled && status.configured);
  const title = failed ? "Estado de WhatsApp no actualizado" : !status ? "Consultando recordatorios de WhatsApp…" : active ? "Recordatorio por WhatsApp activo" : status.configured && !status.enabled ? "WhatsApp desactivado" : "WhatsApp pendiente de activar";

  return <section className={styles.card} aria-label="Recordatorios por WhatsApp" aria-busy={!status && !failed}>
    <span className={`${styles.icon} ${active && !failed ? styles.activeIcon : ""}`}><DashboardIcon name="bell" /></span>
    <div className={styles.content}>
      <h2>{title}</h2>
      <p>{active ? "El día del vencimiento, a las 8:00 a. m. de Colombia, aunque la aplicación esté cerrada." : "Programación: día del vencimiento, 8:00 a. m. de Colombia."}{status?.recipient && <span className={styles.recipient}>Destino: {status.recipient}</span>}</p>
      {status && !active && !failed && <p className={styles.secondary}>Los envíos se habilitan cuando la configuración esté activa.</p>}
      {failed && <p className={styles.error} role="status">No se pudo consultar el estado actual.{status && " Se muestra la última información recibida."} <button type="button" onClick={() => void refresh()}>Reintentar</button></p>}
      {status && <div className={styles.details}><span>{status.lastSentAt ? `Último envío aceptado por el proveedor: ${dateLabel(status.lastSentAt)}.` : "Sin envíos aceptados por el proveedor."}</span><div className={styles.counts}><span>{status.pending.toLocaleString("es-CO")} pendientes</span><span className={status.failed ? styles.problem : undefined}>{status.failed.toLocaleString("es-CO")} fallidos</span><span className={status.uncertain ? styles.problem : undefined}>{status.uncertain.toLocaleString("es-CO")} por confirmar</span></div></div>}
    </div>
  </section>;
}
