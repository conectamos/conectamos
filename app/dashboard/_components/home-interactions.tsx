"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import DashboardIcon from "./dashboard-icon";
import LogoutButton from "./logout-button";
import styles from "./home.module.css";

export function OperationsTabs({ sales, evolution, financial }: { sales: ReactNode; evolution: ReactNode; financial: ReactNode }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const labels = ["Ventas por sede", "Evolución", "Financieras"];
  return <div className={styles.tabs}>
    <div className={styles.tabList} role="tablist" aria-label="Resumen comercial">
      {labels.map((label, index) => <button key={label} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} ref={(element) => { buttons.current[index] = element; }} onClick={() => setActive(index)} onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
        if (next !== null) { event.preventDefault(); setActive(next); buttons.current[next]?.focus(); }
      }}>{label}</button>)}
    </div>
    {[sales, evolution, financial].map((content, index) => <div key={index} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={active !== index} tabIndex={0} className={styles.tabPanel}>{content}</div>)}
  </div>;
}

export function HomeDetailDialog({ title, context, buttonLabel, children, className }: { title: string; context: string; buttonLabel: string; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousOverflow = useRef("");
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    return () => { if (element?.open) document.body.style.overflow = previousOverflow.current; };
  }, []);
  const close = () => dialog.current?.close();
  return <>
    <button ref={trigger} type="button" className={className ?? styles.detailLink} onClick={() => { previousOverflow.current = document.body.style.overflow; dialog.current?.showModal(); document.body.style.overflow = "hidden"; }}>{buttonLabel}<DashboardIcon name="arrow" /></button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-context`} onClose={() => { document.body.style.overflow = previousOverflow.current; trigger.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
      <header className={styles.dialogHeader}><div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-context`}>{context}</p></div><button type="button" onClick={close} aria-label="Cerrar ventana"><DashboardIcon name="close" /></button></header>
      <div className={styles.dialogBody}>{children}</div>
      <footer className={styles.dialogFooter}><button type="button" onClick={close}>Cerrar</button></footer>
    </dialog>
  </>;
}

export function HomeProfile({ usuario, rolUsuario }: { usuario: string; rolUsuario: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const letters = usuario.split(/\s+/).filter(Boolean).slice(0, 2).map((name) => name[0]?.toUpperCase()).join("");
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!details.current?.contains(event.target as Node)) details.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && details.current?.open) { details.current.removeAttribute("open"); details.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);
  return <details ref={details} className={styles.profile}><summary><span className={styles.avatar}>{letters || <DashboardIcon name="user" />}</span><span>{usuario}</span><DashboardIcon name="chevron" /></summary><div className={styles.profileMenu}><strong>{usuario}</strong><span>{rolUsuario}</span><LogoutButton variant="light" /></div></details>;
}
