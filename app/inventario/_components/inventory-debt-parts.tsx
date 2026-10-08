"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { formatoNumero, formatoPesos } from "@/lib/monthly-reports-view";
import styles from "./inventory-debt.module.css";

export type DebtCreditor = {
  key: string;
  id: number | string | null;
  name: string;
  count: number;
  total: number;
};

export type CreditorsPanelProps = {
  creditors: DebtCreditor[];
  selectedKey: string | "TODOS";
  onSelect: (key: string) => void;
  search: string;
  onSearch: (value: string) => void;
  loading: boolean;
  error?: boolean;
};

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO").trim().replace(/\s+/g, " ");
}

export function CreditorsPanel({ creditors, selectedKey, onSelect, search, onSearch, loading, error = false }: CreditorsPanelProps) {
  const id = useId();
  const [showAll, setShowAll] = useState(false);
  const query = normalizeSearch(search);
  const filteredCreditors = useMemo(() => query ? creditors.filter(creditor => normalizeSearch(`${creditor.name} ${creditor.id ?? ""}`).includes(query)) : creditors, [creditors, query]);
  const visibleCreditors = query || showAll ? filteredCreditors : filteredCreditors.slice(0, 5);
  const totals = creditors.reduce((result, creditor) => ({ count: result.count + creditor.count, total: result.total + creditor.total }), { count: 0, total: 0 });
  const duplicateNames = useMemo(() => {
    const names = new Map<string, number>();
    creditors.forEach(creditor => {
      const name = normalizeSearch(creditor.name);
      names.set(name, (names.get(name) || 0) + 1);
    });
    return new Set([...names].filter(([, count]) => count > 1).map(([name]) => name));
  }, [creditors]);

  return <section className={styles.creditorsPanel} aria-labelledby={`${id}-title`} aria-busy={loading && !error}>
    <header className={styles.creditorsHeader}>
      <h2 id={`${id}-title`}>Acreedores</h2>
      <label className={styles.creditorSearch}>
        <DashboardIcon name="search" className={styles.searchIcon} />
        <input type="search" value={search} onChange={event => onSearch(event.target.value)} aria-label="Buscar acreedor" placeholder="Buscar acreedor" disabled={loading} />
      </label>
    </header>
    <button type="button" className={`${styles.creditorButton} ${styles.allCreditors} ${selectedKey === "TODOS" ? styles.selectedCreditor : ""}`} aria-pressed={selectedKey === "TODOS"} disabled={loading} onClick={() => onSelect("TODOS")}>
      <span className={styles.selectionMark}>{selectedKey === "TODOS" && <DashboardIcon name="approvals" className={styles.selectionIcon} />}</span>
      <span className={styles.creditorName}>Todos los acreedores<small>{error ? "Sin datos cargados" : loading ? "Cargando…" : `${formatoNumero(totals.count)} equipo${totals.count === 1 ? "" : "s"}`}</small></span>
      <strong className={`${styles.creditorAmount} ${totals.total < 0 ? styles.negative : ""}`}>{loading ? "—" : formatoPesos(totals.total)}</strong>
    </button>
    <div className={styles.creditorsList}>
      {error ? <p className={styles.empty} role="status">No se pudieron cargar los acreedores.</p> : loading ? <p className={styles.empty} role="status">Cargando acreedores…</p> : visibleCreditors.length ? visibleCreditors.map(creditor => <button type="button" key={creditor.key} className={`${styles.creditorButton} ${selectedKey === creditor.key ? styles.selectedCreditor : ""}`} aria-pressed={selectedKey === creditor.key} onClick={() => onSelect(creditor.key)}>
        <span className={styles.selectionMark}>{selectedKey === creditor.key && <DashboardIcon name="approvals" className={styles.selectionIcon} />}</span>
        <span className={styles.creditorName}>{creditor.name}<small>{formatoNumero(creditor.count)} equipo{creditor.count === 1 ? "" : "s"}</small>{creditor.id !== null && duplicateNames.has(normalizeSearch(creditor.name)) && <small className={styles.creditorId}>ID {creditor.id}</small>}</span>
        <strong className={`${styles.creditorAmount} ${creditor.total < 0 ? styles.negative : ""}`}>{formatoPesos(creditor.total)}</strong>
      </button>) : <p className={styles.empty} role="status">{query ? "No encontramos acreedores para esta búsqueda." : "No hay acreedores con deuda."}</p>}
    </div>
    {!loading && !query && creditors.length > 5 && <footer className={styles.creditorsFooter}>
      <button type="button" className={styles.viewAll} onClick={() => setShowAll(value => !value)} aria-expanded={showAll}>{showAll ? "Mostrar principales" : "Ver todos los acreedores"}<DashboardIcon name={showAll ? "chevron" : "arrow"} className={`${styles.viewAllIcon} ${showAll ? styles.upIcon : ""}`} /></button>
    </footer>}
  </section>;
}

export type DebtSummaryProps = { total: number; count: number; loading: boolean };

export function DebtSummary({ total, count, loading }: DebtSummaryProps) {
  return <section className={styles.summary} aria-label="Resumen de deudas por acreedor" aria-busy={loading}>
    <div className={styles.summaryMetric}>
      <span className={styles.summarySymbol}><DashboardIcon name="coins" className={styles.summaryIcon} /></span>
      <div className={styles.summaryContent}><p className={styles.summaryLabel}>Deuda total</p><strong className={`${styles.summaryValue} ${total < 0 ? styles.negative : ""}`}>{loading ? "—" : formatoPesos(total)}</strong></div>
    </div>
    <div className={styles.summaryMetric}>
      <span className={styles.summarySymbol}><DashboardIcon name="inventory" className={styles.summaryIcon} /></span>
      <div className={styles.summaryContent}><strong className={styles.summaryValue}>{loading ? "—" : formatoNumero(count)}</strong><p className={styles.summaryLabel}>equipos con deuda</p></div>
    </div>
  </section>;
}

export type DebtSelectionBarProps = {
  selectedCount: number;
  total: number;
  resultsCount: number;
  pageCount: number;
  allSelected: boolean;
  pageSelected: boolean;
  onSelectAll: () => void;
  onSelectPage: () => void;
  onClear: () => void;
  onPay: () => void;
  payDisabled: boolean;
  busy: boolean;
};

export function DebtSelectionBar({ selectedCount, total, resultsCount, pageCount, allSelected, pageSelected, onSelectAll, onSelectPage, onClear, onPay, payDisabled, busy }: DebtSelectionBarProps) {
  return <section className={styles.selectionBar} aria-label="Selección de equipos con deuda" aria-busy={busy}>
    <p className={styles.selectionSummary} aria-live="polite">{formatoNumero(selectedCount)} seleccionado{selectedCount === 1 ? "" : "s"}<span>·</span><strong className={total < 0 ? styles.negative : undefined}>{formatoPesos(total)}</strong></p>
    <div className={styles.selectionActions}>
      <button type="button" className={styles.secondaryButton} aria-label={`${allSelected ? "Quitar selección de" : "Seleccionar"} todos los resultados filtrados de todas las páginas (${formatoNumero(resultsCount)})`} aria-pressed={allSelected} disabled={busy || resultsCount === 0} onClick={onSelectAll}>{allSelected ? "Quitar selección de resultados" : "Seleccionar resultados"} ({formatoNumero(resultsCount)})</button>
      <button type="button" className={styles.secondaryButton} aria-pressed={pageSelected} disabled={busy || pageCount === 0} onClick={onSelectPage}>{pageSelected ? "Quitar selección de página actual" : "Seleccionar página actual"} ({formatoNumero(pageCount)})</button>
      {selectedCount > 0 && <button type="button" className={styles.clearSelection} disabled={busy} onClick={onClear}>Limpiar selección</button>}
      <button type="button" className={styles.payButton} disabled={busy || payDisabled || selectedCount === 0} onClick={onPay}>Pagar seleccionados</button>
    </div>
  </section>;
}

export type DebtEquipmentFiltersProps = {
  search: string;
  onSearch: (value: string) => void;
  states: string[];
  onToggleState: (state: string) => void;
  onClear: () => void;
  resultsCount: number;
  creditorLabel: string;
};

const EQUIPMENT_STATES = [
  { value: "BODEGA", label: "Bodega" },
  { value: "VENDIDO", label: "Vendidos" },
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "GARANTIA", label: "Garantía" },
  { value: "PRESTAMO", label: "Préstamo" },
  { value: "PRESTAMO_PAGO", label: "Préstamo pago" },
  { value: "TRASLADO", label: "Traslado" },
  { value: "PRESTAMO_POR_ACEPTAR", label: "Por aceptar" },
];

export function DebtEquipmentFilters({ search, onSearch, states, onToggleState, onClear, resultsCount, creditorLabel }: DebtEquipmentFiltersProps) {
  const id = useId();
  const dropdownRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !dropdownRef.current?.contains(event.target) && dropdownRef.current) dropdownRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <header className={styles.equipmentHeader}>
    <div className={styles.equipmentHeading}><h2>Equipos con deuda</h2><span aria-live="polite">{formatoNumero(resultsCount)} resultado{resultsCount === 1 ? "" : "s"}</span></div>
    <div className={styles.equipmentControls}>
      <label className={styles.equipmentSearch}><DashboardIcon name="search" className={styles.searchIcon} /><input type="search" value={search} onChange={event => onSearch(event.target.value)} aria-label="Buscar equipos con deuda por IMEI o referencia" placeholder="Buscar IMEI o referencia" /></label>
      <details ref={dropdownRef} className={styles.stateDropdown} onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); if (dropdownRef.current) dropdownRef.current.open = false; summaryRef.current?.focus({ preventScroll: true }); } }}>
        <summary ref={summaryRef} className={styles.stateSummary} aria-controls={`${id}-states`}>Estado del equipo{states.length > 0 && <span className={styles.stateCount}>{states.length}</span>}<DashboardIcon name="chevron" className={styles.stateChevron} /></summary>
        <fieldset id={`${id}-states`} className={styles.stateOptions}><legend className={styles.visuallyHidden}>Estados del equipo</legend>{EQUIPMENT_STATES.map(state => <label key={state.value} className={styles.stateOption}><input type="checkbox" checked={states.includes(state.value)} onChange={() => onToggleState(state.value)} /><span>{state.label}</span></label>)}</fieldset>
      </details>
      <button type="button" className={styles.clearFilters} onClick={onClear}><DashboardIcon name="close" className={styles.clearIcon} />Limpiar filtros</button>
    </div>
    <p className={styles.currentCreditor}>{creditorLabel}</p>
  </header>;
}
