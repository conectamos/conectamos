"use client";

import { useId, useMemo, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { normalizarBusquedaReferencias, type ReferenceRankingItem } from "@/lib/reference-sales-ranking";
import styles from "./brands.module.css";

const numero = (value: number) => value.toLocaleString("es-CO");

export default function BrandReferenceList({ items, label }: { items: ReferenceRankingItem[]; label: string }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const searchId = useId();
  const matches = useMemo(() => {
    const term = normalizarBusquedaReferencias(search);
    return items.map((item, index) => ({ item, rank: index + 1 })).filter(({ item }) => !term || normalizarBusquedaReferencias(item.nombre).includes(term));
  }, [items, search]);
  const pages = Math.max(1, Math.ceil(matches.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = matches.slice((currentPage - 1) * 10, currentPage * 10);

  return <section className={styles.brandReferences} aria-label={`Referencias de ${label}`}>
    <div className={styles.referenceTools}><label htmlFor={searchId}>Buscar referencia</label><div className={styles.referenceSearch}><DashboardIcon name="search" /><input id={searchId} type="search" placeholder="Nombre de la referencia" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div><p>Participación dentro de {label.toLowerCase()} · {numero(items.length)} referencias</p></div>
    <div className={styles.tableScroller}><table className={`${styles.sedeTable} ${styles.brandReferenceTable}`}>
      <caption className={styles.visuallyHidden}>Referencias vendidas de {label}</caption>
      <thead><tr><th scope="col">Referencia</th><th scope="col">Unidades</th><th scope="col">% del grupo</th></tr></thead>
      <tbody>{visible.length ? visible.map(({ item, rank }) => <tr key={item.nombre}><th scope="row"><span className={styles.referenceRank}>{rank}</span>{item.nombre}</th><td>{numero(item.total)}</td><td>{item.porcentaje.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%</td></tr>) : <tr><td colSpan={3} className={styles.empty}>{search ? "No hay referencias que coincidan con la búsqueda." : "No hay referencias vendidas en este grupo para la consulta."}</td></tr>}</tbody>
    </table></div>
    <footer className={styles.referencePagination}><p role="status" aria-live="polite">{matches.length ? `Mostrando ${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, matches.length)} de ${numero(matches.length)} referencias` : "0 referencias"}</p><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage} de {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div></footer>
  </section>;
}
