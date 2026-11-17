"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { formatoPesos } from "@/lib/monthly-reports-view";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import styles from "./invoice-due-notifications.module.css";

type InvoiceAlerts = {
  today: string;
  counts: { overdue: number; dueToday: number; dueSoon: number };
  total: number;
  balance: number;
  fingerprint: string;
  more: boolean;
  items: { id: number; number: string; provider: string; dueDate: string; balance: number; dueStatus: string; version: number }[];
};
const dateLabel = (value: string) => new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric",
}).format(new Date(`${value}T12:00:00Z`));

function isInvoiceAlerts(value: unknown): value is InvoiceAlerts {
  if (!value || typeof value !== "object") return false;
  const data = value as InvoiceAlerts;
  const count = (number: unknown) => Number.isSafeInteger(number) && Number(number) >= 0;
  const date = (key: unknown) => typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(`${key}T12:00:00Z`));
  return date(data.today) && count(data.total) && Number.isFinite(data.balance) && data.balance >= 0 &&
    typeof data.fingerprint === "string" && Boolean(data.fingerprint) && typeof data.more === "boolean" &&
    Boolean(data.counts) && count(data.counts.overdue) && count(data.counts.dueToday) && count(data.counts.dueSoon) &&
    data.counts.overdue + data.counts.dueToday + data.counts.dueSoon === data.total &&
    Array.isArray(data.items) && data.items.length === Math.min(data.total, 10) &&
    data.items.every(item => item && count(item.id) && item.id > 0 && typeof item.number === "string" &&
      typeof item.provider === "string" && date(item.dueDate) && Number.isFinite(item.balance) && item.balance > 0 &&
      ["HOY", "PROXIMA", "VENCIDA"].includes(item.dueStatus));
}

export default function InvoiceDueNotifications({ userKey }: { userKey: string }) {
  return <InvoiceDueNotificationSession key={userKey} userKey={userKey} />;
}

export function InvoiceDueNotificationSession({ userKey }: { userKey: string }) {
  const [alerts, setAlerts] = useState<InvoiceAlerts | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const dismissedRef = useRef("");
  const storageKey = `conectamos:invoice-due-reviewed:${userKey}`;

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/pago-facturas/alerts", { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        setAlerts(null); setVisible(false); setAllowed(false); return;
      }
      if (!response.ok) throw new Error("No se pudieron consultar los avisos.");
      const data: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!isInvoiceAlerts(data)) throw new Error("La respuesta de los avisos no pudo verificarse.");
      setAlerts(data); setFailed(false);
      if (!data.total) { setVisible(false); return; }
      let reviewed = dismissedRef.current;
      try { reviewed = window.localStorage.getItem(storageKey) || reviewed; } catch {}
      // Reappear the next Bogotá day, or when any relevant invoice changes.
      if (reviewed !== data.fingerprint && !document.querySelector("dialog[open]")) setVisible(true);
    } catch {
      if (requestRef.current === controller) setFailed(true);
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [storageKey]);

  useLiveRefresh(refresh, { enabled: allowed, intervalMs: 60_000, runOnMount: true });
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, [userKey]);

  const close = useCallback(() => {
    if (alerts) {
      dismissedRef.current = alerts.fingerprint;
      try { window.localStorage.setItem(storageKey, alerts.fingerprint); } catch {}
    }
    setVisible(false);
  }, [alerts, storageKey]);

  useEffect(() => {
    if (!visible) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [visible]);

  if (!allowed) return null;
  return <>
    {(Boolean(alerts?.total) || failed) && <button type="button" className={styles.bell}
      aria-label={failed ? "No se pudieron actualizar los avisos de facturas. Reintentar" : `${alerts!.total} facturas requieren atención. Ver avisos`}
      onClick={() => { if (alerts?.total) setVisible(true); void refresh(); }}>
      <DashboardIcon name="bell" /><span>{failed ? "Revisar avisos" : "Facturas por pagar"}</span>
      <strong>{failed ? "!" : alerts!.total.toLocaleString("es-CO")}</strong>
    </button>}
    {visible && alerts && <dialog ref={dialogRef} className={styles.modal} aria-labelledby="invoice-due-title"
      aria-describedby="invoice-due-description" onCancel={event => { event.preventDefault(); close(); }}>
      <header className={styles.header}><div><p className={styles.eyebrow}>PAGO DE FACTURAS</p>
        <h2 id="invoice-due-title">Tienes pagos por atender</h2>
        <p id="invoice-due-description">Facturas vencidas o que vencen en los próximos 7 días, de todos los meses.</p>
      </div><button type="button" className={styles.close} onClick={close} aria-label="Cerrar avisos de facturas"><DashboardIcon name="close" /></button></header>
      <div className={styles.summary}><div><span>Saldo por pagar de estas facturas</span><strong>{formatoPesos(alerts.balance)}</strong></div>
        <span>{alerts.total.toLocaleString("es-CO")} {alerts.total === 1 ? "factura" : "facturas"}</span></div>
      <div className={styles.content}>
        <div className={styles.counts}><span>{alerts.counts.overdue} vencidas</span><span>{alerts.counts.dueToday} vencen hoy</span><span>{alerts.counts.dueSoon} próximas a vencer</span></div>
        {failed && <p role="status" className={styles.error}>No se pudo actualizar el aviso. Los datos pueden haber cambiado. <button type="button" onClick={() => void refresh()}>Reintentar</button></p>}
        <ol className={styles.items}>{alerts.items.map(item => <li key={item.id}>
          <div><strong>{item.provider}</strong><p>Factura {item.number}</p><span>Vence: <time dateTime={item.dueDate}>{dateLabel(item.dueDate)}</time></span></div>
          <div className={styles.value}><strong>{formatoPesos(item.balance)}</strong><span className={item.dueStatus === "VENCIDA" ? styles.overdue : styles.soon}>{item.dueStatus === "VENCIDA" ? "Vencida" : item.dueStatus === "HOY" ? "Vence hoy" : "Próxima a vencer"}</span></div>
        </li>)}</ol>
        {alerts.more && <p className={styles.additional}>Se muestran las 10 primeras por vencimiento. En Pago de facturas puedes ver todas.</p>}
      </div>
      <footer className={styles.footer}><button type="button" onClick={close}>Entendido</button><Link href="/pago-facturas" onClick={close}>Ir a pagar facturas<DashboardIcon name="arrow" /></Link></footer>
    </dialog>}
  </>;
}
