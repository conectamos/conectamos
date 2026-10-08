"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, type CSSProperties } from "react";
import DashboardIcon, { type DashboardIconName } from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import { formatoPesos as formatoMoneda } from "@/lib/monthly-reports-view";
import { dinero, formatoFechaHoraVenta, type NumericValue, type VentaLike } from "@/lib/ventas-utils";
import { extraerFinancierasDetalle } from "@/lib/ventas-financieras";
import styles from "../sales.module.css";

export type Sale = VentaLike & {
  id: number;
  inventarioSede?: { id: number; referencia?: string; color?: string; costo?: NumericValue } | null;
};

export function formatoPesos(value: NumericValue) {
  return formatoMoneda(dinero(value));
}

export function SalesMetric({ icon, label, value, negative = false, primary = false }: {
  icon: DashboardIconName; label: string; value: string | number; negative?: boolean; primary?: boolean;
}) {
  const text = typeof value === "number" ? value.toLocaleString("es-CO") : value;
  return <article className={styles.metric}>
    <span className={`${styles.metricIcon} ${primary ? styles.metricIconPrimary : ""}`}><DashboardIcon name={icon} /></span>
    <div className={styles.metricContent} style={{ "--value-length": Math.max(1, text.length) } as CSSProperties}>
      <p>{label}</p><strong className={negative ? styles.negative : undefined}>{text}</strong>
    </div>
  </article>;
}

export function SalesProfile({ name, role }: { name: string; role: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!details.current?.contains(event.target as Node)) details.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && details.current?.open) { details.current.removeAttribute("open"); details.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <details ref={details} className={styles.profile}>
    <summary><span className={styles.avatar}>{letters || <DashboardIcon name="user" />}</span><span className={styles.profileIdentity}><strong>{name}</strong><span>{role}</span></span><DashboardIcon name="chevron" /></summary>
    <div className={styles.profileMenu}><strong>{name}</strong><span>{role}</span><Link href="/dashboard">Volver al inicio</Link><LogoutButton variant="light" /></div>
  </details>;
}

function ProtectedUtility({ value }: { value: NumericValue }) {
  return <span tabIndex={0} className={styles.protectedUtility} title="Enfoca o pasa el cursor para ver la utilidad."><span>*****</span><span className={dinero(value) < 0 ? styles.negative : undefined}>{formatoPesos(value)}</span></span>;
}

export function SaleRows({ sale, expanded, esAdmin, puedeEliminar, deleting, onToggle, onDelete }: {
  sale: Sale; expanded: boolean; esAdmin: boolean; puedeEliminar: boolean; deleting: boolean;
  onToggle: () => void; onDelete: () => void;
}) {
  const financieras = extraerFinancierasDetalle(sale as Record<string, unknown>);
  const cobros = [{ tipo: sale.ingreso1, valor: sale.primerValor }, { tipo: sale.ingreso2, valor: sale.segundoValor }].filter((cobro) => cobro.tipo && String(cobro.tipo).trim());
  const detailId = `venta-detalle-${sale.id}`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const moneyClass = (value: NumericValue) => dinero(value) < 0 ? styles.negative : undefined;
  return <Fragment>
    <tr className={`${styles.saleRow} ${expanded ? styles.saleRowExpanded : ""}`}>
      <td data-label="Venta / Fecha"><strong>{sale.idVenta}</strong><p>{formatoFechaHoraVenta(sale.fecha, sale.hora)}</p><span className={`${styles.serviceBadge} ${String(sale.servicio).toUpperCase().includes("FINAN") ? styles.serviceFinancial : ""}`}>{sale.servicio}</span></td>
      <td data-label="Equipo / IMEI"><strong>{sale.descripcion || "Sin descripción"}</strong><p className={styles.imei}>IMEI: <span>{sale.serial}</span></p></td>
      <td data-label="Asesores"><strong>Jalador: {sale.jalador || "—"}</strong><p>Cerrador: {sale.cerrador || "—"}</p></td>
      <td data-label="Cobro"><strong className={moneyClass(sale.ingreso)}>{formatoPesos(sale.ingreso)}</strong><p>{sale.tipoIngreso || "Sin tipo de ingreso"}</p></td>
      <td data-label="Financieras">{financieras.length ? financieras.map((item, index) => <p key={`${item.nombreNormalizado}-${index}`} className={styles.financeLine}><span>{item.nombre}: </span><span className={moneyClass(item.valorBruto)}>{formatoPesos(item.valorBruto)}</span></p>) : <p>Sin financieras</p>}</td>
      <td data-label="Resultado"><p className={styles.utilityLine}>Utilidad: <ProtectedUtility value={sale.utilidad} /></p><p className={moneyClass(sale.cajaOficina)}>Caja: {formatoPesos(sale.cajaOficina)}</p></td>
      <td data-label="Sede"><strong>{sale.sede?.nombre || "—"}</strong></td>
      <td data-label="Acciones"><button type="button" ref={toggleRef} className={styles.rowToggle} aria-label={`${expanded ? "Cerrar" : "Ver"} detalle de ${sale.idVenta}`} aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg></button></td>
    </tr>
    {expanded && <tr className={styles.detailRow} id={detailId}><td colSpan={8}>
      <section className={styles.saleDetails} aria-label={`Detalle de ${sale.idVenta}`}>
        <button type="button" onClick={() => { onToggle(); toggleRef.current?.focus(); }} className={styles.detailClose} aria-label={`Cerrar detalle de ${sale.idVenta}`}><DashboardIcon name="chevron" /></button>
        <div className={styles.detailContent}>
          <h3>Detalle de la venta</h3>
          <dl className={styles.detailOverview}>
            <div><dt>Comisión</dt><dd className={moneyClass(sale.comision)}>{formatoPesos(sale.comision)}</dd></div>
            <div><dt>Salida</dt><dd className={moneyClass(sale.salida)}>{formatoPesos(sale.salida)}</dd></div>
            <div><dt>Servicio</dt><dd>{sale.servicio || "—"}</dd></div>
          </dl>
          <details className={styles.financialDetails}><summary>Cobros y más detalles</summary>
          <div className={styles.detailBreakdown}><h4>Desglose de cobros</h4><p>{cobros.length ? cobros.map((cobro, index) => <Fragment key={index}>{index > 0 && " | "}{cobro.tipo}: <span className={moneyClass(cobro.valor)}>{formatoPesos(cobro.valor)}</span></Fragment>) : "Sin detalle"}</p></div>
          {financieras.length > 0 && <details className={styles.financialDetails}><summary>Desglose de financieras</summary><div className={styles.financialDetailRows}>{financieras.map((item, index) => <dl key={`${item.nombreNormalizado}-${index}`}><div><dt>Financiera</dt><dd>{item.nombre}</dd></div><div><dt>Monto bruto</dt><dd>{formatoPesos(item.valorBruto)}</dd></div><div><dt>Monto neto</dt><dd className={moneyClass(item.valorNeto)}>{formatoPesos(item.valorNeto)}</dd></div>{item.aplicaIntermediacion && <div><dt>Intermediación</dt><dd>{item.porcentajeIntermediacion.toLocaleString("es-CO")}%</dd></div>}</dl>)}</div></details>}
          {sale.inventarioSede && <details className={styles.financialDetails}><summary>Equipo asociado</summary><dl className={styles.detailOverview}><div><dt>Referencia</dt><dd>{sale.inventarioSede.referencia || sale.descripcion || "—"}</dd></div><div><dt>Color</dt><dd>{sale.inventarioSede.color || "—"}</dd></div>{esAdmin && <div><dt>Costo del equipo</dt><dd className={moneyClass(sale.inventarioSede.costo)}>{formatoPesos(sale.inventarioSede.costo)}</dd></div>}</dl></details>}
          </details>
        </div>
        {esAdmin && <div className={styles.detailActions}><Link href={`/ventas/editar/${sale.id}`}>Editar</Link>{puedeEliminar && <button type="button" onClick={onDelete} disabled={deleting}>{deleting ? "Eliminando..." : "Eliminar"}</button>}</div>}
      </section>
    </td></tr>}
  </Fragment>;
}
