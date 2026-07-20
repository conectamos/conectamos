"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardIcon, { type DashboardIconName } from "./dashboard-icon";

export type OperationsToolLink = {
  href: string;
  keywords?: string[];
  label: string;
};

export type OperationsToolGroup = {
  description: string;
  icon: DashboardIconName;
  links: OperationsToolLink[];
  title: string;
};

type VisibleTool = {
  group: OperationsToolGroup;
  id: string;
  link: OperationsToolLink;
};

const INITIAL_FAVORITES = [
  "Registrar venta",
  "Bodega principal",
  "Cierre del día",
  "Panel analítico",
];

const CATEGORY_ORDER = [
  "Inventario y préstamos",
  "Registro comercial",
  "Facturación",
  "Plataformas financieras",
  "Caja y finanzas",
  "Radar de inventario",
  "Administración",
  "Análisis",
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .trim();
}

function toolId(groupTitle: string, link: OperationsToolLink) {
  return `${groupTitle}::${link.href}::${link.label}`;
}

function storageKey(usuario: string) {
  return `conectamos:centro-herramientas:favoritos:${normalize(usuario || "usuario")}`;
}

function ToolFavoriteButton({
  active,
  label,
  onToggle,
  tone = "light",
}: {
  active: boolean;
  label: string;
  onToggle: () => void;
  tone?: "dark" | "light";
}) {
  return (
    <button
      type="button"
      aria-label={`${active ? "Quitar" : "Agregar"} ${label} ${active ? "de" : "a"} favoritos`}
      aria-pressed={active}
      title={active ? "Quitar de accesos frecuentes" : "Agregar a accesos frecuentes"}
      onClick={onToggle}
      className={[
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e30613] focus-visible:ring-offset-2",
        tone === "dark"
          ? "text-white/65 hover:bg-white/10 hover:text-white"
          : active
            ? "text-[#e30613] hover:bg-red-50"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
      ].join(" ")}
    >
      <span aria-hidden="true">{active ? "★" : "☆"}</span>
    </button>
  );
}

export default function OperationsToolCenter({
  groups,
  storageUserKey,
}: {
  groups: OperationsToolGroup[];
  storageUserKey: string;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  const orderedGroups = useMemo(
    () =>
      [...groups].sort((a, b) => {
        const aIndex = CATEGORY_ORDER.findIndex((title) => normalize(title) === normalize(a.title));
        const bIndex = CATEGORY_ORDER.findIndex((title) => normalize(title) === normalize(b.title));
        const safeA = aIndex === -1 ? CATEGORY_ORDER.length : aIndex;
        const safeB = bIndex === -1 ? CATEGORY_ORDER.length : bIndex;
        return safeA - safeB;
      }),
    [groups],
  );

  const allTools = useMemo<VisibleTool[]>(
    () =>
      orderedGroups.flatMap((group) =>
        group.links.map((link) => ({
          group,
          id: toolId(group.title, link),
          link,
        })),
      ),
    [orderedGroups],
  );

  useEffect(() => {
    const validIds = new Set(allTools.map((tool) => tool.id));
    let nextFavorites: string[] = [];

    try {
      const saved = window.localStorage.getItem(storageKey(storageUserKey));
      const parsed = saved ? JSON.parse(saved) : null;

      if (Array.isArray(parsed)) {
        nextFavorites = parsed.filter((id): id is string => typeof id === "string" && validIds.has(id));
      } else {
        nextFavorites = INITIAL_FAVORITES.flatMap((label) => {
          const tool = allTools.find((item) => normalize(item.link.label) === normalize(label));
          return tool ? [tool.id] : [];
        });
      }
    } catch {
      nextFavorites = INITIAL_FAVORITES.flatMap((label) => {
        const tool = allTools.find((item) => normalize(item.link.label) === normalize(label));
        return tool ? [tool.id] : [];
      });
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setFavoriteIds(nextFavorites);
      setFavoritesLoaded(true);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [allTools, storageUserKey]);

  useEffect(() => {
    if (!favoritesLoaded) return;
    try {
      window.localStorage.setItem(storageKey(storageUserKey), JSON.stringify(favoriteIds));
    } catch {
      // El centro sigue funcionando aunque el navegador bloquee el almacenamiento local.
    }
  }, [favoriteIds, favoritesLoaded, storageUserKey]);

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
  const filteredGroups = orderedGroups
    .filter((group) => category === "all" || group.title === category)
    .map((group) => {
      if (!normalizedQuery) return group;

      const groupMatches = normalize(`${group.title} ${group.description}`).includes(normalizedQuery);
      return {
        ...group,
        links: groupMatches
          ? group.links
          : group.links.filter((link) =>
              normalize(`${link.label} ${(link.keywords || []).join(" ")}`).includes(normalizedQuery),
            ),
      };
    })
    .filter((group) => group.links.length > 0);

  const favoriteSet = new Set(favoriteIds);
  const frequentTools = allTools
    .filter((tool) => favoriteSet.has(tool.id))
    .sort((a, b) => {
      const aIndex = INITIAL_FAVORITES.findIndex((label) => normalize(label) === normalize(a.link.label));
      const bIndex = INITIAL_FAVORITES.findIndex((label) => normalize(label) === normalize(b.link.label));
      const safeA = aIndex === -1 ? INITIAL_FAVORITES.length : aIndex;
      const safeB = bIndex === -1 ? INITIAL_FAVORITES.length : bIndex;
      return safeA - safeB;
    });

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) =>
      current.includes(id) ? current.filter((favoriteId) => favoriteId !== id) : [...current, id],
    );
  };

  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="operations-tool-center-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.17em] text-[#e30613]">
            Centro de herramientas
          </p>
          <h2
            id="operations-tool-center-title"
            className="mt-2 text-[28px] font-black tracking-tight text-[#11161d] sm:text-[34px]"
          >
            Centro de operaciones
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 sm:text-base">
            Todo lo que necesitas para gestionar las sedes, ventas y créditos.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm">
          {groups.length} categorías&nbsp; · &nbsp;{allTools.length} herramientas
        </span>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <label className="relative block">
          <span className="sr-only">Buscar herramientas</span>
          <DashboardIcon
            name="search"
            className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar herramienta, proceso o plataforma..."
            className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-14 pr-20 text-sm text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/60"
          />
          <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-400 sm:block">
            Ctrl / ⌘ K
          </kbd>
        </label>

        <label className="relative block">
          <span className="sr-only">Filtrar por categoría</span>
          <DashboardIcon
            name="catalog"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-14 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-12 pr-10 text-sm font-bold text-slate-800 shadow-[0_6px_18px_rgba(15,23,42,0.04)] outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200/60"
          >
            <option value="all">Todas las categorías</option>
            {orderedGroups.map((group) => (
              <option key={group.title} value={group.title}>
                {group.title}
              </option>
            ))}
          </select>
          <DashboardIcon
            name="arrow"
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-slate-500"
          />
        </label>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <h3 className="text-lg font-black tracking-tight text-[#11161d]">Accesos frecuentes</h3>
        <span className="text-xs text-slate-500">Marca una estrella para personalizar esta sección</span>
      </div>

      {frequentTools.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {frequentTools.slice(0, 8).map((tool, index) => (
            <article
              key={`frequent-${tool.id}`}
              className={[
                "group flex min-h-[76px] items-center overflow-hidden rounded-xl border bg-white shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.07)]",
                index === 0 ? "border-t-2 border-x-slate-200 border-b-slate-200 border-t-[#e30613]" : "border-slate-200",
              ].join(" ")}
            >
              <Link
                href={tool.link.href}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e30613]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#11161d]">
                  <DashboardIcon name={tool.group.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-900">{tool.link.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{tool.group.title}</span>
                </span>
                <DashboardIcon
                  name="arrow"
                  className="h-5 w-5 shrink-0 text-slate-700 transition group-hover:translate-x-0.5"
                />
              </Link>
              <div className="pr-2">
                <ToolFavoriteButton
                  active
                  label={tool.link.label}
                  onToggle={() => toggleFavorite(tool.id)}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6 text-sm text-slate-500">
          Aún no tienes accesos frecuentes. Marca la estrella de cualquier herramienta para agregarla aquí.
        </div>
      )}

      <div className="mt-7 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
        <h3 className="text-lg font-black tracking-tight text-[#11161d]">Herramientas por categoría</h3>
        <p className="text-xs text-slate-500">Selecciona una categoría para ver sus accesos</p>
      </div>

      {filteredGroups.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {filteredGroups.map((group) => {
            const [primaryLink, ...secondaryLinks] = group.links;
            const primaryId = primaryLink ? toolId(group.title, primaryLink) : "";

            return (
              <article
                key={group.title}
                className="flex min-h-[290px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_10px_26px_rgba(15,23,42,0.065)]"
              >
                <div className="flex items-start gap-3 p-4 pb-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#11161d]">
                    <DashboardIcon name={group.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-[15px] font-black leading-5 text-[#11161d]">{group.title}</h4>
                      <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[11px] font-black text-slate-600">
                        {group.links.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{group.description}</p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-3 pb-3">
                  {primaryLink && (
                    <div className="flex min-h-11 items-center rounded-lg bg-[#171d24] text-white transition hover:bg-[#242c35]">
                      <Link
                        href={primaryLink.href}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-l-lg px-3.5 py-3 text-sm font-black active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                      >
                        <span className="truncate">{primaryLink.label}</span>
                        <DashboardIcon name="arrow" className="h-4 w-4 shrink-0" />
                      </Link>
                      <div className="pr-1">
                        <ToolFavoriteButton
                          active={favoriteSet.has(primaryId)}
                          label={primaryLink.label}
                          onToggle={() => toggleFavorite(primaryId)}
                          tone="dark"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-1">
                    {secondaryLinks.map((link) => {
                      const id = toolId(group.title, link);

                      return (
                        <div
                          key={id}
                          className="group/row flex min-h-10 items-center border-b border-slate-100 last:border-b-0"
                        >
                          <Link
                            href={link.href}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-[#11161d] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e30613]"
                          >
                            <span className="truncate">{link.label}</span>
                            <DashboardIcon
                              name="arrow"
                              className="h-4 w-4 shrink-0 text-slate-500 transition group-hover/row:translate-x-0.5 group-hover/row:text-slate-900"
                            />
                          </Link>
                          <ToolFavoriteButton
                            active={favoriteSet.has(id)}
                            label={link.label}
                            onToggle={() => toggleFavorite(id)}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {secondaryLinks.length === 0 && (
                    <div className="mt-auto border-t border-slate-100 px-2 pt-4 text-xs text-slate-400">
                      Acceso directo disponible según tu rol.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <DashboardIcon name="search" className="mx-auto h-7 w-7 text-slate-400" />
          <p className="mt-3 text-base font-black text-slate-800">No encontramos herramientas</p>
          <p className="mt-1 text-sm text-slate-500">Prueba otra búsqueda o selecciona todas las categorías.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
              searchRef.current?.focus();
            }}
            className="mt-4 rounded-lg bg-[#11161d] px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#e30613] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e30613] focus-visible:ring-offset-2"
          >
            Limpiar búsqueda
          </button>
        </div>
      )}

      <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-600">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg" aria-hidden="true">
          ☆
        </span>
        <p>
          <strong className="text-slate-900">Consejo:</strong> marca tus herramientas favoritas para mantenerlas en Accesos frecuentes.
        </p>
      </div>
    </section>
  );
}
