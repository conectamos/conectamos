"use client";

import { useId, useMemo, useRef, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import {
  getReferenceRanking,
  normalizarBusquedaReferencias,
  type ReferenceRankingItem,
} from "@/lib/reference-sales-ranking";
import styles from "./reference-sales.module.css";

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

function formatoPorcentaje(valor: number) {
  return `${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 1,
  })}%`;
}

export default function ReferenceSalesPanel({
  topItems,
  allItems,
}: {
  topItems: ReferenceRankingItem[];
  allItems: ReferenceRankingItem[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [showAll, setShowAll] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const searchId = `${panelId}-search`;
  const helperId = `${panelId}-helper`;
  const rankingId = `${panelId}-ranking`;
  const titleId = `${panelId}-title`;
  const termino = normalizarBusquedaReferencias(busqueda);
  const visibleItems = useMemo(
    () => getReferenceRanking({ topItems, allItems, query: busqueda, showAll }),
    [topItems, allItems, busqueda, showAll]
  );

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <header className={styles.header}>
        <DashboardIcon name="inventory" className={styles.headingIcon} />
        <div className={styles.heading}>
          <h2 id={titleId}>Referencias más vendidas</h2>
          <p>Consulta el ranking de referencias por unidades vendidas.</p>
        </div>
        <span className={styles.badge}>
          {termino ? "BÚSQUEDA" : showAll ? "TODAS" : "TOP 10"}
        </span>
      </header>

      <div className={styles.searchArea}>
        <label htmlFor={searchId} className={styles.visuallyHidden}>
          Buscar marca o referencia
        </label>
        <div className={styles.searchField}>
          <DashboardIcon name="search" className={styles.searchIcon} />
          <input
            id={searchId}
            ref={searchInput}
            type="search"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar marca o referencia"
            aria-describedby={helperId}
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                searchInput.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className={styles.clearSearch}
            >
              <DashboardIcon name="close" className={styles.clearIcon} />
            </button>
          )}
        </div>
        <p id={helperId} className={styles.searchHelper}>Busca también fuera del top 10.</p>
        <p className={styles.visuallyHidden} role="status" aria-live="polite">
          {termino
            ? `${formatoNumero(visibleItems.length)} referencias encontradas`
            : showAll
              ? `Ranking completo: ${formatoNumero(visibleItems.length)} referencias`
              : `${formatoNumero(visibleItems.length)} referencias destacadas`}
        </p>
      </div>

      <table id={rankingId} className={styles.table}>
        <caption className={styles.visuallyHidden}>
          {termino ? "Resultados de búsqueda" : showAll ? "Ranking completo de referencias" : "Top 10 referencias vendidas"}
        </caption>
        <colgroup>
          <col className={styles.positionColumn} />
          <col />
          <col className={styles.unitsColumn} />
          <col className={styles.shareColumn} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Referencia</th>
            <th scope="col" className={styles.unitsHeading}>Unidades</th>
            <th scope="col" className={styles.shareHeading}>
              <span aria-hidden="true">%</span>
              <span className={styles.visuallyHidden}>Participación</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.length === 0 ? (
            <tr>
              <td colSpan={4} className={styles.empty}>
                {termino
                  ? "No se encontraron referencias para esta búsqueda durante el periodo."
                  : "No hay referencias registradas durante este periodo."}
              </td>
            </tr>
          ) : visibleItems.map(({ item, puesto }) => {
            const exactMatch = Boolean(termino) && normalizarBusquedaReferencias(item.nombre) === termino;
            const barWidth = Math.max(0, Math.min(100, item.porcentaje));

            return (
              <tr key={`${puesto}-${item.nombre}`} className={exactMatch ? styles.exactMatch : undefined}>
                <td className={styles.positionCell}>
                  <span className={styles.position}>{formatoNumero(puesto)}</span>
                </td>
                <th scope="row" className={styles.reference}>
                  {item.nombre}
                  {exactMatch && <span className={styles.visuallyHidden}> · Coincidencia exacta</span>}
                </th>
                <td className={styles.units}>{formatoNumero(item.total)}</td>
                <td className={styles.share}>
                  <div className={styles.shareValue}>
                    <span className={styles.track} aria-hidden="true">
                      <span className={styles.fill} style={{ width: `${barWidth}%` }} />
                    </span>
                    <span className={styles.percentage}>{formatoPorcentaje(item.porcentaje)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button
        type="button"
        onClick={() => {
          setBusqueda("");
          setShowAll((value) => !value);
        }}
        className={styles.rankingButton}
        aria-controls={rankingId}
        aria-expanded={showAll}
        disabled={allItems.length === 0}
      >
        {showAll ? "Volver al top 10" : "Ver ranking completo"}
        <DashboardIcon name="arrow" className={showAll ? styles.backArrow : styles.buttonArrow} />
      </button>
    </section>
  );
}
