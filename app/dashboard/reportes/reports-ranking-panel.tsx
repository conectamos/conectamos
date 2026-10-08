"use client";

import { useEffect, useId, useRef, useState } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { formatoNumero, formatoPesos, type MonthlyReportsView } from "@/lib/monthly-reports-view";
import styles from "./reports-ranking.module.css";

type RankingKey = "oficina" | "sede" | "jalador" | "cerrador" | "financiera";

export type ReportsRankingPanelProps = {
  periodLabel: string;
  cobertura: string;
  rankings: MonthlyReportsView["rankings"];
};

const rankingOptions: {
  key: RankingKey;
  label: string;
  title: string;
  nameColumn: string;
  icon: DashboardIconName;
}[] = [
  { key: "oficina", label: "Por oficina", title: "Ventas de oficina", nameColumn: "Oficina", icon: "store" },
  { key: "sede", label: "Por sede", title: "Ventas por sede", nameColumn: "Sede", icon: "pin" },
  { key: "jalador", label: "Por jalador", title: "Ventas por jalador", nameColumn: "Jalador", icon: "users" },
  { key: "cerrador", label: "Por cerrador", title: "Ventas por cerrador", nameColumn: "Cerrador", icon: "user" },
  { key: "financiera", label: "Por financiera", title: "Ventas por financiera", nameColumn: "Financiera", icon: "reports" },
];

export default function ReportsRankingPanel({
  periodLabel,
  cobertura,
  rankings,
}: ReportsRankingPanelProps) {
  const [activeRanking, setActiveRanking] = useState<RankingKey | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showAmounts, setShowAmounts] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const headingId = `${panelId}-heading`;
  const dialogTitleId = `${panelId}-dialog-title`;
  const dialogContextId = `${panelId}-dialog-context`;
  const tableId = `${panelId}-table`;
  const selectedOption = rankingOptions.find((option) => option.key === activeRanking);
  const selectedItems = activeRanking ? rankings[activeRanking] : [];
  const visibleItems = showAll ? selectedItems : selectedItems.slice(0, 5);
  const isFinancial = activeRanking === "financiera";
  const countLabel = isFinancial ? "Usos" : "Ventas";

  useEffect(() => {
    if (!activeRanking || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    if (!dialog.open) dialog.showModal();
    if (scrollbarWidth > 0) {
      const padding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${padding + scrollbarWidth}px`;
    }
    body.style.overflow = "hidden";

    return () => {
      if (dialog.open) dialog.close();
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [activeRanking]);

  function closeRanking() {
    dialogRef.current?.close();
    setActiveRanking(null);
    triggerRef.current?.focus({ preventScroll: true });
  }

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.heading}>
        <DashboardIcon name="reports" className={styles.headingIcon} />
        <div>
          <h2 id={headingId}>Rankings del mes</h2>
          <p>Selecciona el reporte que deseas consultar.</p>
        </div>
      </header>

      <div className={styles.actions}>
        {rankingOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={styles.action}
            aria-haspopup="dialog"
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              setShowAll(false);
              setShowAmounts(false);
              setActiveRanking(option.key);
            }}
          >
            <DashboardIcon name={option.icon} className={styles.actionIcon} />
            <span>{option.label}</span>
            <DashboardIcon name="chevron" className={styles.actionArrow} />
          </button>
        ))}
      </div>

      {selectedOption && (
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          aria-labelledby={dialogTitleId}
          aria-describedby={dialogContextId}
          onCancel={(event) => {
            event.preventDefault();
            closeRanking();
          }}
          onClose={() => {
            setActiveRanking(null);
            triggerRef.current?.focus({ preventScroll: true });
          }}
        >
          <header className={styles.dialogHeader}>
            <div>
              <h2 id={dialogTitleId}>{selectedOption.title}</h2>
              <p id={dialogContextId}>{periodLabel} · {cobertura}</p>
            </div>
            <button type="button" className={styles.closeIcon} onClick={closeRanking} aria-label="Cerrar ranking" autoFocus>
              <DashboardIcon name="close" className={styles.closeSvg} />
            </button>
          </header>

          <div className={styles.controls}>
            <div className={styles.rangeControls} role="group" aria-label="Alcance del ranking">
              <button type="button" aria-pressed={!showAll} aria-controls={tableId} onClick={() => setShowAll(false)}>Top 5</button>
              <button type="button" aria-pressed={showAll} aria-controls={tableId} onClick={() => setShowAll(true)}>Todos</button>
            </div>
            {isFinancial && (
              <button type="button" className={styles.amountsButton} aria-pressed={showAmounts} aria-controls={tableId} onClick={() => setShowAmounts((value) => !value)}>
                <DashboardIcon name="wallet" className={styles.controlIcon} />
                Montos
              </button>
            )}
          </div>

          <div className={styles.dialogBody}>
            <table id={tableId} className={`${styles.table} ${isFinancial && showAmounts ? styles.hasAmounts : ""}`}>
              <caption className={styles.visuallyHidden}>
                {selectedOption.title} · {periodLabel} · {cobertura} · {showAll ? "Todos" : "Top 5"}
              </caption>
              <colgroup>
                <col className={styles.positionColumn} />
                <col />
                <col className={styles.countColumn} />
                {isFinancial && showAmounts && <col className={styles.amountColumn} />}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{selectedOption.nameColumn}</th>
                  <th scope="col" className={styles.numberHeading}>{countLabel}</th>
                  {isFinancial && showAmounts && <th scope="col" className={styles.numberHeading}>Monto</th>}
                </tr>
              </thead>
              <tbody>
                {visibleItems.length === 0 ? (
                  <tr>
                    <td colSpan={isFinancial && showAmounts ? 4 : 3} className={styles.empty}>
                      Sin movimientos registrados en este periodo.
                    </td>
                  </tr>
                ) : visibleItems.map((item, index) => (
                  <tr key={`${activeRanking}-${index}-${item.nombre}`}>
                    <td className={styles.positionCell}><span>{formatoNumero(index + 1)}</span></td>
                    <th scope="row" className={styles.name}>{item.nombre}</th>
                    <td className={styles.count} data-label={countLabel}>{formatoNumero(item.total)}</td>
                    {isFinancial && showAmounts && (
                      <td className={`${styles.amount} ${item.monto < 0 ? styles.negative : ""}`} data-label="Monto">
                        {formatoPesos(item.monto)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className={styles.dialogFooter}>
            <button type="button" onClick={closeRanking}>Cerrar</button>
          </footer>
        </dialog>
      )}
    </section>
  );
}
