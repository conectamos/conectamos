"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import { formatoNumero, formatoPesos } from "@/lib/monthly-reports-view";
import { etiquetaEstadoInventario } from "@/lib/prestamos";
import styles from "./inventory-row.module.css";

export type InventoryItem = {
  id: number;
  imei: string;
  referencia: string;
  tipoProducto: string;
  color: string | null;
  costo: number;
  distribuidor: string | null;
  deboA: string | null;
  estadoActual: string | null;
  estadoFinanciero: string | null;
  origen: string | null;
  sedeId: number;
  sede?: { id: number; nombre: string; soloInventarioPorCobrar: boolean } | null;
  facturaStand?: { id: number; estado: string; nombre: string | null; url: string | null; error: string | null } | null;
  prestamoDestino?: { id: number; nombre: string; prestamoId: number; estado: string } | null;
};

export type InventoryAction = {
  key: string;
  label: string;
  icon: DashboardIconName;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export type InventoryMetricProps = {
  icon: DashboardIconName;
  label: string;
  value: string | number;
  detail?: string;
  alert?: boolean;
  financial?: boolean;
};

export function InventoryMetric({ icon, label, value, detail, alert = false, financial = false }: InventoryMetricProps) {
  const displayValue = typeof value === "number" ? financial ? formatoPesos(value) : formatoNumero(value) : value;
  const negative = typeof value === "number" ? value < 0 : value.trim().startsWith("-");

  return <article className={`${styles.metric} ${financial ? styles.financialMetric : ""} ${alert ? styles.alertMetric : ""}`}>
    <span className={styles.metricSymbol}><DashboardIcon name={icon} className={styles.metricIcon} /></span>
    <div className={styles.metricContent}>
      <p className={styles.metricLabel}>{label}</p>
      <p className={`${styles.metricValue} ${negative ? styles.negative : ""}`} style={{ "--value-length": displayValue.length } as CSSProperties}>{displayValue}</p>
      {detail && <p className={styles.metricDetail}>{detail}</p>}
    </div>
  </article>;
}

export type InventoryRowProps = {
  item: InventoryItem;
  selected: boolean;
  onSelect: () => void;
  expanded: boolean;
  onToggle: () => void;
  destino: string;
  actions: InventoryAction[];
};

function InventoryActionControl({ action, onAction, menu = false }: { action: InventoryAction; onAction?: () => void; menu?: boolean }) {
  const className = `${styles.action} ${menu ? styles.menuAction : ""} ${action.danger ? styles.dangerAction : ""}`;
  const content = <><DashboardIcon name={action.icon} className={styles.actionIcon} /><span>{action.label}</span></>;
  const run = () => { onAction?.(); action.onClick?.(); };

  if (action.href && !action.disabled) {
    return <Link href={action.href} className={className} onClick={run}>{content}</Link>;
  }

  return <button type="button" className={className} disabled={action.disabled} onClick={run}>{content}</button>;
}

export function InventoryRow({ item, selected, onSelect, expanded, onToggle, destino, actions }: InventoryRowProps) {
  const detailId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menuToggleRef = useRef<HTMLElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const normalizedState = String(item.estadoActual || "").trim().toUpperCase();
  const normalizedFinancialState = String(item.estadoFinanciero || "").trim().toUpperCase();
  const stateAlert = ["PENDIENTE", "GARANTIA", "PRESTAMO_POR_ACEPTAR"].includes(normalizedState);
  const operationalAction = ["prestamo", "pago", "bodega", "cambio"].map(key => actions.find(action => action.key === key)).find(Boolean);
  const primaryActions = [actions.find(action => action.key === "historial"), operationalAction, actions.find(action => action.key === "editar")].filter((action): action is InventoryAction => Boolean(action));

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
    menuToggleRef.current?.focus({ preventScroll: true });
  }

  function closeDetail() {
    onToggle();
    toggleRef.current?.focus({ preventScroll: true });
  }

  function openMenu() {
    if (menuRef.current) menuRef.current.open = true;
    menuToggleRef.current?.focus({ preventScroll: true });
  }

  function handleMenuToggle(open: boolean) {
    setMenuOpen(open);
    if (!open || !menuToggleRef.current) return;
    const bounds = menuToggleRef.current.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth - 32);
    const desiredHeight = Math.min(actions.length * 44 + 14, 400);
    const below = window.innerHeight - bounds.bottom - 12;
    const above = bounds.top - 12;
    const openAbove = below < desiredHeight && above > below;
    const maxHeight = Math.min(desiredHeight, Math.max(44, openAbove ? above : below));
    setMenuPosition({
      left: Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8)),
      top: openAbove ? Math.max(8, bounds.top - maxHeight - 4) : Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - maxHeight - 8)),
      maxHeight,
    });
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        if (menuRef.current) menuRef.current.open = false;
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (menuRef.current) menuRef.current.open = false;
        menuToggleRef.current?.focus({ preventScroll: true });
      }
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuListRef.current?.contains(event.target)) return;
      if (menuRef.current) menuRef.current.open = false;
    };
    const onResize = () => { if (menuRef.current) menuRef.current.open = false; };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  return <Fragment>
    <tr className={`${styles.row} ${selected ? styles.selectedRow : ""} ${expanded ? styles.expandedRow : ""}`}>
      <td className={styles.controlsCell}>
        <div className={styles.controls}>
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Seleccionar equipo ${item.imei}`} className={styles.checkbox} />
          <button ref={toggleRef} type="button" className={styles.toggle} onClick={onToggle} aria-label={`${expanded ? "Cerrar" : "Ver"} detalle del equipo ${item.imei}`} aria-expanded={expanded} aria-controls={detailId}>
            <DashboardIcon name="chevron" className={`${styles.toggleIcon} ${expanded ? styles.toggleIconExpanded : ""}`} />
          </button>
        </div>
      </td>
      <td className={styles.equipmentCell} data-label="Equipo / IMEI">
        <strong className={styles.reference}>{item.referencia}</strong>
        <span className={styles.equipmentMeta}>{item.color ?? "-"} · ID {item.id}</span>
        <span className={styles.imei}>IMEI: {item.imei}</span>
      </td>
      <td className={`${styles.costCell} ${item.costo < 0 ? styles.negative : ""}`} data-label="Costo">{formatoPesos(item.costo)}</td>
      <td className={styles.sedeCell} data-label="Sede">{item.sede?.nombre ?? "Sede sin configurar"}</td>
      <td className={styles.creditorCell} data-label="Acreedor">{item.deboA ?? "-"}</td>
      <td className={styles.stateCell} data-label="Estado"><span className={`${styles.badge} ${stateAlert ? styles.alertBadge : ""}`}>{etiquetaEstadoInventario(item.estadoActual)}</span></td>
      <td className={styles.financialCell} data-label="Financiero"><span className={`${styles.badge} ${normalizedFinancialState === "DEUDA" ? styles.alertBadge : ""}`}>{item.estadoFinanciero ?? "-"}</span></td>
      <td className={styles.actionsCell} data-label="Acciones">
        {actions.length > 0 ? <details ref={menuRef} className={styles.menu} onToggle={event => handleMenuToggle(event.currentTarget.open)}>
          <summary ref={menuToggleRef} className={styles.menuToggle} aria-label={`Acciones del equipo ${item.imei}`}>
            <svg viewBox="0 0 24 24" fill="currentColor" className={styles.ellipsis} aria-hidden="true"><circle cx="5" cy="12" r="1.65" /><circle cx="12" cy="12" r="1.65" /><circle cx="19" cy="12" r="1.65" /></svg>
          </summary>
          <div ref={menuListRef} className={styles.menuList} style={menuPosition ? menuPosition : { visibility: "hidden" }} role="group" aria-label={`Acciones disponibles para ${item.referencia}`}>
            {actions.map(action => <InventoryActionControl key={action.key} action={action} menu onAction={closeMenu} />)}
          </div>
        </details> : <span className={styles.noActions}>—</span>}
      </td>
    </tr>
    {expanded && <tr className={styles.detailRow}>
      <td colSpan={8} className={styles.detailCell}>
        <section id={detailId} className={styles.detail} aria-label={`Detalle del equipo ${item.referencia}`} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeDetail(); } }}>
          <div className={styles.detailHeading}><h3>Detalle del equipo</h3><button type="button" className={styles.closeDetail} aria-label={`Cerrar detalle del equipo ${item.imei}`} onClick={closeDetail}><DashboardIcon name="close" className={styles.closeIcon} /></button></div>
          <div className={styles.detailLayout}>
            <dl className={styles.primaryDetails}>
              <div><dt>Origen</dt><dd>{item.origen ?? "-"}</dd></div>
              <div><dt>Destino del préstamo</dt><dd>{destino}</dd></div>
              <div><dt>ID</dt><dd>{item.id}</dd></div>
            </dl>
            {actions.length > 0 && <div className={styles.detailActions} role="group" aria-label="Acciones del equipo">
              {primaryActions.map(action => <InventoryActionControl key={action.key} action={action} />)}
              <button type="button" className={`${styles.action} ${styles.moreActions}`} onClick={openMenu}>Más acciones<DashboardIcon name="chevron" className={styles.moreIcon} /></button>
            </div>}
          </div>
          <details className={styles.additionalInfo}>
            <summary>Información adicional<DashboardIcon name="chevron" className={styles.additionalIcon} /></summary>
            <dl className={styles.extraDetails}>
            <div><dt>Tipo de producto</dt><dd>{item.tipoProducto || "TELEFONIA"}</dd></div>
            <div><dt>Distribuidor</dt><dd>{item.distribuidor ?? "-"}</dd></div>
            {item.facturaStand && <div className={styles.invoiceDetail}>
              <dt>Factura</dt>
              <dd>{item.facturaStand.url ? <a href={item.facturaStand.url} target="_blank" rel="noreferrer" className={styles.invoiceLink}>{item.facturaStand.nombre || "Ver factura"}</a> : <span>{item.facturaStand.nombre || `Factura: ${item.facturaStand.estado}`}</span>}</dd>
              <dd className={styles.invoiceState}>Estado: {item.facturaStand.estado} · ID {item.facturaStand.id}</dd>
              {item.facturaStand.error && <dd className={styles.invoiceError}>{item.facturaStand.error}</dd>}
            </div>}
            </dl>
          </details>
        </section>
      </td>
    </tr>}
  </Fragment>;
}
