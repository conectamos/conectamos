"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import DashboardIcon, { type DashboardIconName } from "./dashboard-icon";
import styles from "./operations-tools.module.css";

export type OperationsToolLink = {
  href: string;
  keywords?: string[];
  label: string;
  description?: string;
  icon?: DashboardIconName;
};

export type OperationsToolGroup = {
  description: string;
  icon: DashboardIconName;
  links: OperationsToolLink[];
  title: string;
};

export type OperationsQuickAction = {
  href: string;
  icon: DashboardIconName;
  label: string;
};

type VisibleTool = {
  group: OperationsToolGroup;
  id: string;
  link: OperationsToolLink;
};

const INITIAL_FAVORITES = ["Registrar venta", "Bodega principal", "Cierre del día", "Panel analítico"];
const CATEGORY_ORDER = [
  "Inventario y préstamos", "Registro comercial", "Facturación", "Plataformas financieras",
  "Caja y finanzas", "Radar de inventario", "Administración", "Análisis", "Proveedores",
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO").trim();
}

function toolId(groupTitle: string, link: OperationsToolLink) {
  return `${groupTitle}::${link.href}::${link.label}`;
}

function storageKey(usuario: string) {
  return `conectamos:centro-herramientas:favoritos:${normalize(usuario || "usuario")}`;
}

function toolIcon(tool: VisibleTool): DashboardIconName {
  if (tool.link.icon) return tool.link.icon;
  const path = tool.link.href.split(/[?#]/)[0];
  const icons: Record<string, DashboardIconName> = {
    "/inventario-principal": "inventory",
    "/inventario/historial": "barcode",
    "/prestamos/nuevo": "document-add",
    "/dashboard/deuda-sedes": "transfer",
    "/alertas/prestamos": "bell",
    "/dashboard/radar": "radar",
    "/caja/cierre-dia": "calendar",
    "/vendedor/registros/buscar": "document-search",
    "/dashboard/financiero": "reports",
    "/dashboard/financiero/cartera": "wallet",
    "/caja/cartera": "wallet",
  };
  return icons[path] || tool.group.icon;
}

function ToolFavoriteButton({ active, disabled, label, onToggle }: {
  active: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return <button
    type="button"
    aria-label={`${active ? "Quitar" : "Agregar"} ${label} ${active ? "de" : "a"} favoritos`}
    aria-pressed={active}
    title={active ? "Quitar de accesos frecuentes" : "Agregar a accesos frecuentes"}
    onClick={onToggle}
    disabled={disabled}
    className={`${styles.favoriteButton} ${active ? styles.favoriteActive : ""}`}
  ><DashboardIcon name="star" className={styles.starIcon} /></button>;
}

export default function OperationsToolCenter({ groups, storageUserKey, legacyStorageUserKey, quickActions = [] }: {
  groups: OperationsToolGroup[];
  storageUserKey: string;
  legacyStorageUserKey?: string;
  quickActions?: OperationsQuickAction[];
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const categoriesRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<{ key: string; ids: string[] } | null>(null);
  const sectionId = useId();
  const currentStorageKey = storageKey(storageUserKey);
  const legacyStorageKey = legacyStorageUserKey ? storageKey(legacyStorageUserKey) : null;
  const favoritesLoaded = favorites?.key === currentStorageKey;
  const favoriteIds = favoritesLoaded ? favorites.ids : [];

  const orderedGroups = useMemo(() => [...groups].sort((a, b) => {
    const aIndex = CATEGORY_ORDER.findIndex((title) => normalize(title) === normalize(a.title));
    const bIndex = CATEGORY_ORDER.findIndex((title) => normalize(title) === normalize(b.title));
    return (aIndex < 0 ? CATEGORY_ORDER.length : aIndex) - (bIndex < 0 ? CATEGORY_ORDER.length : bIndex);
  }), [groups]);
  const allTools = useMemo<VisibleTool[]>(() => orderedGroups.flatMap((group) =>
    group.links.map((link) => ({ group, id: toolId(group.title, link), link }))
  ), [orderedGroups]);

  useEffect(() => {
    const validIds = new Set(allTools.map((tool) => tool.id));
    const defaultFavorites = () => INITIAL_FAVORITES.flatMap((label) => {
      const tool = allTools.find((item) => normalize(item.link.label) === normalize(label));
      return tool ? [tool.id] : [];
    });
    let nextFavorites: string[];

    try {
      const currentSaved = window.localStorage.getItem(currentStorageKey);
      const saved = currentSaved === null && legacyStorageKey && legacyStorageKey !== currentStorageKey
        ? window.localStorage.getItem(legacyStorageKey)
        : currentSaved;
      const parsed = saved ? JSON.parse(saved) : null;
      nextFavorites = Array.isArray(parsed) ? Array.from(new Set(parsed.flatMap((id) => {
        if (typeof id !== "string") return [];
        if (validIds.has(id)) return [id];
        const [, previousHref, previousLabel] = id.split("::");
        const movedTool = allTools.find((tool) => tool.link.href === previousHref &&
          normalize(tool.link.label) === normalize(previousLabel || ""));
        return movedTool ? [movedTool.id] : [];
      }))) : defaultFavorites();
    } catch {
      nextFavorites = defaultFavorites();
    }

    const frame = window.requestAnimationFrame(() => setFavorites({ key: currentStorageKey, ids: nextFavorites }));
    return () => window.cancelAnimationFrame(frame);
  }, [allTools, currentStorageKey, legacyStorageKey]);

  useEffect(() => {
    if (!favoritesLoaded) return;
    try {
      window.localStorage.setItem(currentStorageKey, JSON.stringify(favorites.ids));
    } catch {
      // Los accesos siguen disponibles cuando el navegador bloquea localStorage.
    }
  }, [favorites, favoritesLoaded, currentStorageKey]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const normalizedQuery = normalize(query);
  const selectedGroup = orderedGroups.find((group) => group.title === category) || orderedGroups[0];
  const visibleTools = normalizedQuery
    ? allTools.filter(({ group, link }) => normalize(`${group.title} ${group.description} ${link.label} ${link.description || ""} ${(link.keywords || []).join(" ")}`).includes(normalizedQuery))
    : allTools.filter((tool) => tool.group === selectedGroup);
  const favoriteSet = new Set(favoriteIds);
  const frequentTools = allTools.filter((tool) => favoriteSet.has(tool.id)).sort((a, b) => {
    const aIndex = INITIAL_FAVORITES.findIndex((label) => normalize(label) === normalize(a.link.label));
    const bIndex = INITIAL_FAVORITES.findIndex((label) => normalize(label) === normalize(b.link.label));
    return (aIndex < 0 ? INITIAL_FAVORITES.length : aIndex) - (bIndex < 0 ? INITIAL_FAVORITES.length : bIndex);
  });

  function toggleFavorite(id: string, fromFrequent = false) {
    setFavorites((current) => {
      if (current?.key !== currentStorageKey) return current;
      return { key: currentStorageKey, ids: current.ids.includes(id)
        ? current.ids.filter((favoriteId) => favoriteId !== id)
        : [...current.ids, id] };
    });
    if (fromFrequent) {
      window.requestAnimationFrame(() => {
        const activeCategory = categoriesRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
          || categoriesRef.current?.querySelector<HTMLButtonElement>("button");
        activeCategory?.focus({ preventScroll: true });
      });
    }
  }

  if (groups.length === 0 && quickActions.length === 0) return null;

  return <section className={styles.center} aria-labelledby={`${sectionId}-title`}>
    <header className={styles.header}>
      <h2 id={`${sectionId}-title`}>Herramientas</h2>
      <div className={styles.searchField}>
        <label htmlFor={`${sectionId}-search`} className={styles.visuallyHidden}>Buscar herramientas</label>
        <DashboardIcon name="search" className={styles.searchIcon} />
        <input id={`${sectionId}-search`} ref={searchRef} type="search" value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}
          placeholder="Buscar herramienta…" aria-controls={`${sectionId}-tools`} />
        {query && <button type="button" className={styles.clearSearch} aria-label="Limpiar búsqueda" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><DashboardIcon name="close" className={styles.clearIcon} /></button>}
      </div>
    </header>

    <div className={styles.favorites} aria-label="Accesos frecuentes">
      {!favoritesLoaded ? <p className={styles.favoriteState} role="status">Cargando accesos frecuentes…</p>
        : frequentTools.length === 0 ? <p className={styles.favoriteState}>Marca la estrella de una herramienta para agregarla a tus accesos frecuentes.</p>
          : frequentTools.map((tool) => <article key={`frequent-${tool.id}`} className={styles.favoriteCard}>
            <Link href={tool.link.href} className={styles.favoriteLink}>
              <DashboardIcon name={toolIcon(tool)} className={styles.favoriteToolIcon} />
              <span>{tool.link.label}</span>
            </Link>
            <ToolFavoriteButton active disabled={!favoritesLoaded} label={tool.link.label} onToggle={() => toggleFavorite(tool.id, true)} />
          </article>)}
    </div>

    <div className={styles.workspace}>
      <nav ref={categoriesRef} className={styles.categories} aria-label="Categorías de herramientas">
        {orderedGroups.map((group) => <button key={group.title} type="button"
          aria-pressed={!normalizedQuery && group === selectedGroup} aria-controls={`${sectionId}-tools`}
          className={`${styles.category} ${!normalizedQuery && group === selectedGroup ? styles.categoryActive : ""}`}
          onClick={() => { setCategory(group.title); setQuery(""); }}>
          <DashboardIcon name={group.icon} className={styles.categoryIcon} />
          <span className={styles.categoryName}>{group.title}</span>
          <span className={styles.categoryCount}>{group.links.length.toLocaleString("es-CO")}</span>
        </button>)}
      </nav>

      <div className={styles.toolPane} id={`${sectionId}-tools`}>
        <div className={styles.paneHeading}>
          <h3>{normalizedQuery ? "Resultados de búsqueda" : selectedGroup?.title || "Herramientas"}</h3>
          <span>{visibleTools.length.toLocaleString("es-CO")} {visibleTools.length === 1 ? "herramienta" : "herramientas"}</span>
        </div>
        {normalizedQuery && <p className={styles.searchStatus} role="status">Búsqueda en todas las categorías.</p>}
        <div className={styles.toolGrid}>
          {visibleTools.length === 0 ? <div className={styles.empty}>
            <p>{normalizedQuery ? "No encontramos herramientas para esta búsqueda." : "No hay herramientas disponibles en esta categoría."}</p>
            {normalizedQuery && <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>Limpiar búsqueda</button>}
          </div> : visibleTools.map((tool) => <article key={tool.id} className={styles.toolCard}>
            <Link href={tool.link.href} className={styles.toolLink}>
              <span className={styles.toolIconBackground}><DashboardIcon name={toolIcon(tool)} className={styles.toolIcon} /></span>
              <span className={styles.toolLabel}>{tool.link.label}{normalizedQuery && <span className={styles.toolCategory}>{tool.group.title}</span>}</span>
              <DashboardIcon name="arrow" className={styles.toolArrow} />
            </Link>
            <ToolFavoriteButton active={favoriteSet.has(tool.id)} disabled={!favoritesLoaded} label={tool.link.label} onToggle={() => toggleFavorite(tool.id)} />
          </article>)}
        </div>
        {quickActions.length > 0 && <div className={styles.quickActions} aria-label="Acciones rápidas">
          {quickActions.map((action, index) => <Link key={`${action.href}-${action.label}`} href={action.href} className={`${styles.quickAction} ${index === 0 ? styles.primaryAction : ""}`}>
            <DashboardIcon name={action.icon} className={styles.quickIcon} /><span>{action.label}</span>
          </Link>)}
        </div>}
      </div>
    </div>
  </section>;
}
