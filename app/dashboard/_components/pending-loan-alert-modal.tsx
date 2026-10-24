"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import DashboardIcon from "./dashboard-icon";
import styles from "./pending-loan-alert-modal.module.css";

type PrestamoPendiente = {
  costo: number;
  creadoEn: string;
  id: number;
  imei: string;
  referencia: string;
  sedeOrigenNombre: string;
};

type PrestamosPendientesResponse = {
  items: PrestamoPendiente[];
  total: number;
};

const STORAGE_PREFIX = "conectamos:prestamos-destino-revisados";

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

export default function PendingLoanAlertModal({
  sessionKey,
}: {
  sessionKey: string;
}) {
  const [prestamos, setPrestamos] = useState<PrestamosPendientesResponse>({
    items: [],
    total: 0,
  });
  const [visible, setVisible] = useState(false);
  const storageKey = `${STORAGE_PREFIX}:${sessionKey}`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dismissedRef = useRef<Record<string, string>>({});

  const cargarPendientes = useCallback(async () => {
    try {
      const response = await fetch("/api/prestamos/pendientes-destino", {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as PrestamosPendientesResponse;
      const items = Array.isArray(data.items) ? data.items : [];
      const total = Number(data.total || 0);
      const siguiente = { items, total };

      setPrestamos(siguiente);

      if (total <= 0 || items.length === 0) {
        setVisible(false);
        return;
      }

      const firmaActual = items
        .map((prestamo) => prestamo.id)
        .sort((a, b) => a - b)
        .join(",");

      let firmaRevisada = dismissedRef.current[storageKey];
      try {
        firmaRevisada = window.sessionStorage.getItem(storageKey) || firmaRevisada;
      } catch {
        // The alert remains dismissible when browser storage is unavailable.
      }
      if (firmaRevisada !== firmaActual) setVisible(true);
    } catch {
      // La alerta no debe bloquear el dashboard si la consulta temporalmente falla.
    }
  }, [storageKey]);

  useLiveRefresh(cargarPendientes, {
    intervalMs: 30000,
    runOnMount: true,
  });

  const firmaActual = useMemo(
    () =>
      prestamos.items
        .map((prestamo) => prestamo.id)
        .sort((a, b) => a - b)
        .join(","),
    [prestamos.items]
  );

  const cerrar = useCallback(() => {
    if (firmaActual) {
      dismissedRef.current[storageKey] = firmaActual;
      try {
        window.sessionStorage.setItem(storageKey, firmaActual);
      } catch {
        // Keep the dismissal for this mounted session even without storage.
      }
    }
    setVisible(false);
  }, [firmaActual, storageKey]);

  useEffect(() => {
    if (!visible) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    // The native modal traps keyboard focus and excludes the dashboard behind it.
    dialog?.showModal();
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  const visibles = prestamos.items.slice(0, 6);
  const adicionales = Math.max(0, prestamos.total - visibles.length);

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-alerta-prestamo"
      aria-describedby="detalle-alerta-prestamo"
      className={styles.modal}
      onCancel={event => { event.preventDefault(); cerrar(); }}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CONECTAMOS · APROBACIONES</p>
          <h2 id="titulo-alerta-prestamo">Pendientes por aprobar</h2>
          <p id="detalle-alerta-prestamo" className={styles.description}>Revisa los equipos enviados a tu sede antes de recibirlos.</p>
        </div>
        <button type="button" onClick={cerrar} aria-label="Cerrar alerta de préstamo" className={styles.close}><DashboardIcon name="close" /></button>
      </header>

      <div className={styles.summary}>
        <span className={styles.summaryIcon}><DashboardIcon name="approvals" /></span>
        <div><strong>{prestamos.total.toLocaleString("es-CO")}</strong><span>{prestamos.total === 1 ? "equipo por recibir" : "equipos por recibir"}</span></div>
        <span className={styles.status}><span />Aprobación pendiente</span>
      </div>

      <div className={styles.content}>
        <div className={styles.listHeading}><h3>Solicitudes recientes</h3><span>Mostrando {visibles.length} de {prestamos.total.toLocaleString("es-CO")}</span></div>
        <div className={styles.items}>
          {visibles.map(prestamo => <article key={prestamo.id} className={styles.item}>
            <span className={styles.deviceIcon}><DashboardIcon name="inventory" /></span>
            <div className={styles.itemInfo}>
              <div className={styles.itemOrigin}><span>Préstamo #{prestamo.id}</span><span>Envía: <strong>{prestamo.sedeOrigenNombre}</strong></span></div>
              <h4>{prestamo.referencia}</h4>
              <p className={styles.imei}>IMEI <span>{prestamo.imei}</span></p>
            </div>
            <div className={styles.itemValue}><span>Valor del equipo</span><strong>{formatoPesos(prestamo.costo)}</strong></div>
          </article>)}
        </div>
        {adicionales > 0 && <p className={styles.additional}><DashboardIcon name="document-search" />Consulta {adicionales.toLocaleString("es-CO")} {adicionales === 1 ? "equipo adicional" : "equipos adicionales"} en la bandeja de préstamos.</p>}
      </div>

      <footer className={styles.footer}>
        <button type="button" onClick={cerrar} className={styles.secondary}>Recordar después</button>
        <Link href="/prestamos" onClick={cerrar} className={styles.primary}>Revisar y aprobar<DashboardIcon name="arrow" /></Link>
      </footer>
    </dialog>
  );
}
