"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { VendorWelcomeMessage } from "@/lib/vendor-welcome-message";
import DashboardIcon from "./dashboard-icon";
import VendorMessageBody from "./vendor-message-body";
import styles from "./vendor-welcome-modal.module.css";

const STORAGE_PREFIX = "conectamos:vendedor-bienvenida-cerrada";

export default function VendorWelcomeModal({
  mensaje,
  sessionKey,
}: {
  mensaje: VendorWelcomeMessage;
  sessionKey: string;
}) {
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const storageKey = `${STORAGE_PREFIX}:${sessionKey}:${mensaje.version}`;
  const visible = visibleKey === storageKey;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dismissedRef = useRef(new Set<string>());
  const titleId = useId();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (dismissedRef.current.has(storageKey)) return;
      try {
        if (window.sessionStorage.getItem(storageKey) === "1") return;
      } catch {
        // Browser storage restrictions must not prevent reading or closing the notice.
      }
      setVisibleKey(storageKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  const cerrar = useCallback(() => {
    dismissedRef.current.add(storageKey);
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Keep the acknowledgement in memory for this mounted session.
    }
    setVisibleKey(null);
  }, [storageKey]);

  useEffect(() => {
    if (!visible) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    // A native modal keeps focus inside the notice and the dashboard behind it inert.
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={styles.modal}
      onCancel={(event) => { event.preventDefault(); cerrar(); }}
    >
      <header className={styles.header}>
        <span className={styles.icon}><DashboardIcon name="document" /></span>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{mensaje.eyebrow}</p>
          <h2 id={titleId}>{mensaje.title}</h2>
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar mensaje de bienvenida"
          className={styles.close}
        ><DashboardIcon name="close" /></button>
      </header>

      <div className={styles.content}>
        <VendorMessageBody
          blocks={mensaje.bodyBlocks}
          className={styles.body}
          fontFamily={mensaje.fontFamily}
        />
      </div>

      <footer className={styles.footer}>
        <button type="button" onClick={cerrar} className={styles.primary}>
          {mensaje.buttonLabel}<DashboardIcon name="arrow" />
        </button>
      </footer>
    </dialog>
  );
}
