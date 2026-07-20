"use client";

import { useMemo, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";

type ReferenceRankingItem = {
  nombre: string;
  total: number;
  porcentaje: number;
};

type RankedReferenceMatch = {
  item: ReferenceRankingItem;
  puesto: number;
};

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

function formatoPorcentaje(valor: number) {
  return `${Number(valor || 0).toLocaleString("es-CO", {
    maximumFractionDigits: 1,
  })}%`;
}

function normalizarBusqueda(valor: string) {
  return String(valor || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function RankingBar({ item, index }: { item: ReferenceRankingItem; index: number }) {
  const barWidth = `${Math.min(
    100,
    Math.max(item.porcentaje, item.total > 0 ? 2 : 0)
  )}%`;

  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition hover:border-red-200 hover:shadow-sm sm:grid-cols-[minmax(210px,1.25fr)_minmax(130px,0.85fr)_76px] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black",
            index === 0
              ? "bg-[#11161d] text-white"
              : "bg-slate-100 text-slate-700",
          ].join(" ")}
        >
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{item.nombre}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatoNumero(item.total)} {item.total === 1 ? "venta" : "ventas"}
          </p>
        </div>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={index === 0 ? "h-full rounded-full bg-[#e30613]" : "h-full rounded-full bg-[#ff6b75]"}
          style={{ width: barWidth }}
        />
      </div>

      <p className="text-left text-sm font-black text-slate-950 sm:text-right">
        {formatoPorcentaje(item.porcentaje)}
      </p>
    </div>
  );
}

export default function ReferenceSalesPanel({
  topItems,
  allItems,
}: {
  topItems: ReferenceRankingItem[];
  allItems: ReferenceRankingItem[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const termino = normalizarBusqueda(busqueda);
  const rankedItems = useMemo<RankedReferenceMatch[]>(
    () => allItems.map((item, index) => ({ item, puesto: index + 1 })),
    [allItems]
  );
  const matches = useMemo(() => {
    if (!termino) return [];

    return rankedItems
      .filter(({ item }) => normalizarBusqueda(item.nombre).includes(termino))
      .slice(0, 20);
  }, [rankedItems, termino]);
  const exactMatch = useMemo(() => {
    if (!termino) return null;

    return (
      rankedItems.find(({ item }) => normalizarBusqueda(item.nombre) === termino) ??
      matches[0] ??
      null
    );
  }, [rankedItems, matches, termino]);

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <DashboardIcon name="catalog" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e30613]">
              Rendimiento por referencia
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Top 10 referencias vendidas
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Consulta el ranking mensual completo por nombre.
            </p>
          </div>
        </div>
        <span className="w-max rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
          {topItems.length} posiciones
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
        <label
          htmlFor="buscar-referencia"
          className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600"
        >
          Buscar referencia
        </label>
        <div className="relative mt-2">
          <DashboardIcon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            id="buscar-referencia"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Escribe una marca o referencia"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-sm font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <DashboardIcon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>

        {termino ? (
          exactMatch ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#e30613]">
                    Mejor coincidencia
                  </p>
                  <p className="mt-1 break-words text-sm font-black text-slate-950">
                    {exactMatch.item.nombre}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-slate-100 px-3 py-2 text-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Puesto
                    </p>
                    <p className="mt-0.5 text-lg font-black text-slate-950">
                      #{formatoNumero(exactMatch.puesto)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-3 py-2 text-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Ventas
                    </p>
                    <p className="mt-0.5 text-lg font-black text-slate-950">
                      {formatoNumero(exactMatch.item.total)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-[#e30613]">
                      Participación
                    </p>
                    <p className="mt-0.5 text-lg font-black text-[#e30613]">
                      {formatoPorcentaje(exactMatch.item.porcentaje)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm font-semibold text-slate-500">
              No hay ventas registradas para esa referencia durante este mes.
            </div>
          )
        ) : (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
            <DashboardIcon name="search" className="mt-0.5 h-4 w-4 shrink-0" />
            Busca cualquier referencia para conocer su posición, ventas y participación, incluso si no aparece en el top 10.
          </div>
        )}

        {matches.length > 1 && (
          <div className="mt-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Otras coincidencias
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {matches.map(({ item, puesto }) => (
                <button
                  key={`match-${item.nombre}`}
                  type="button"
                  onClick={() => setBusqueda(item.nombre)}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-bold text-slate-800 transition hover:border-red-200 hover:text-[#e30613]"
                >
                  <span className="truncate">{item.nombre}</span>
                  <span className="shrink-0 text-slate-500">
                    #{formatoNumero(puesto)} · {formatoNumero(item.total)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 space-y-2.5">
        {topItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No hay referencias registradas durante este periodo.
          </div>
        ) : (
          topItems.map((item, index) => (
            <RankingBar key={`top-reference-${item.nombre}`} item={item} index={index} />
          ))
        )}
      </div>
    </section>
  );
}
