"use client";

import { useEffect, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import styles from "./admin-delete-dialog.module.css";

export default function AdminDeleteDialog({ entityLabel, targetName, busy, error, onCancel, onConfirm }: {
  entityLabel: string; targetName: string; busy: boolean; error: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    cancelButton.current?.focus();
    return () => { if (element?.open) element.close(); };
  }, []);

  return <dialog ref={dialog} className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="admin-delete-title" aria-describedby="admin-delete-description" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <header className={styles.heading}><span><DashboardIcon name="warning" /></span><div><p>Administración central</p><h2 id="admin-delete-title">Eliminar {entityLabel}</h2></div><button type="button" aria-label="Cerrar confirmación de eliminación" disabled={busy} onClick={onCancel}><DashboardIcon name="close" /></button></header>
    <div className={styles.body}>
      <div className={styles.target}><small>{entityLabel}</small><strong>{targetName}</strong></div>
      <p id="admin-delete-description">Se retirará de la operación y se bloquearán sus accesos. Las ventas, facturas y demás registros históricos se conservan.</p>
      {entityLabel === "sede" && <p className={styles.note}>No se eliminará si tiene equipos, cobros o solicitudes pendientes.</p>}
      <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /><span>Confirmo que deseo eliminar {targetName}.</span></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
    <footer className={styles.footer}><button type="button" ref={cancelButton} disabled={busy} onClick={onCancel}>Cancelar</button><button type="button" className={styles.danger} disabled={busy || !confirmed} onClick={() => { if (confirmed && !busy) onConfirm(); }}><DashboardIcon name={busy ? "refresh" : "close"} />{busy ? "Eliminando…" : `Eliminar ${entityLabel}`}</button></footer>
  </dialog>;
}
