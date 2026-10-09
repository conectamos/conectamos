"use client";

import { useEffect, useRef, type ReactNode } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import styles from "../loans.module.css";

export default function LoanDialog({ title, open, busy, onClose, children, footer }: {
  title: string; open: boolean; busy: boolean; onClose: () => void; children: ReactNode; footer: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [open]);
  return <dialog ref={dialog} className={styles.modal} aria-label={title}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || busy) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <header className={styles.modalHeader}><h2>{title}</h2><button type="button" aria-label="Cerrar confirmación" disabled={busy} onClick={onClose}><DashboardIcon name="close" /></button></header>
    <div className={styles.modalBody}>{children}</div><footer className={styles.modalFooter}>{footer}</footer>
  </dialog>;
}
