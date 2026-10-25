"use client";

import { useEffect, useRef } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import styles from "./dispatch-dialog.module.css";

type DispatchConfirmationProps = {
  equipo: { id: number; imei: string; referencia: string };
  sedes: { id: number; nombre: string }[];
  sedeDestinoId: string;
  acreedorNombre: string;
  busy: boolean;
  error: string;
  onDestinoChange: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export default function DispatchConfirmationDialog({
  equipo, sedes, sedeDestinoId, acreedorNombre, busy, error, onDestinoChange, onConfirm, onClose,
}: DispatchConfirmationProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const destinoRef = useRef<HTMLSelectElement>(null);
  const destino = sedes.find(sede => String(sede.id) === sedeDestinoId);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    destinoRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <dialog ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dispatch-title" aria-describedby="dispatch-description" aria-busy={busy} className={styles.modal}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>CONECTAMOS · ENVÍO A SEDE</p><h2 id="dispatch-title">Confirmar despacho</h2><p id="dispatch-description">Revisa el equipo y la sede que lo recibirá.</p></div>
      <button type="button" className={styles.close} aria-label="Cerrar confirmación de despacho" disabled={busy} onClick={() => { if (!busy) onClose(); }}><DashboardIcon name="close" /></button>
    </header>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!busy && destino) onConfirm(); }}>
      <div className={styles.body}>
        <section className={styles.equipment} aria-label="Equipo a despachar">
          <div className={styles.equipmentHeading}><span><DashboardIcon name="inventory" />Equipo</span><span>#{equipo.id}</span></div>
          <dl><div><dt>Referencia</dt><dd>{equipo.referencia}</dd></div><div><dt><DashboardIcon name="barcode" />IMEI</dt><dd className={styles.imei}>{equipo.imei}</dd></div></dl>
        </section>
        <label className={styles.destination} htmlFor="dispatch-destination"><span><DashboardIcon name="pin" />Sede destino</span>
          <select id="dispatch-destination" ref={destinoRef} required value={sedeDestinoId} disabled={busy || sedes.length === 0} onChange={event => onDestinoChange(event.target.value)} aria-describedby={sedes.length === 0 ? "dispatch-no-destinations" : undefined}>
            <option value="">Seleccionar sede</option>{sedes.map(sede => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}
          </select>
        </label>
        {sedes.length === 0 && <p className={styles.noDestinations} id="dispatch-no-destinations">No hay sedes de destino disponibles. Actualiza el inventario y vuelve a intentarlo.</p>}
        <section className={styles.arrival} aria-label="Resumen del despacho">
          <div className={styles.route}><span>Bodega principal</span><DashboardIcon name="arrow" /><strong>{destino?.nombre || "Selecciona una sede destino"}</strong></div>
          <dl><div><dt>El equipo ingresará en</dt><dd><span className={styles.state}>BODEGA</span><span className={styles.debt}>DEUDA ACTIVA</span></dd></div><div><dt>Acreedor</dt><dd>{acreedorNombre}</dd></div></dl>
        </section>
        {error && <div className={styles.error} role="alert"><DashboardIcon name="warning" /><span>{error}</span></div>}
        {busy && <p className={styles.processing} role="status"><DashboardIcon name="refresh" />Enviando equipo. Espera la confirmación del servidor.</p>}
      </div>
      <footer className={styles.footer}><button type="button" className={styles.secondary} disabled={busy} onClick={() => { if (!busy) onClose(); }}>Cancelar</button><button type="submit" className={styles.primary} disabled={busy || !destino}><DashboardIcon name="send" />{busy ? "Enviando…" : "Confirmar envío"}</button></footer>
    </form>
  </dialog>;
}
