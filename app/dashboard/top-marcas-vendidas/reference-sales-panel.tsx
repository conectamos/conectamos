"use client";

import { useMemo, useState } from "react";

type ReferenceRankingItem = {
  nombre: string;
  total: number;
  porcentaje: number;
};

const BRAND_BAR_COLORS = [
  { marca: "INFINIX", className: "bg-emerald-600" },
  { marca: "XIAOMI", className: "bg-orange-500" },
  { marca: "SAMSUNG", className: "bg-blue-900" },
  { marca: "HONOR", className: "bg-sky-400" },
  { marca: "TECNO", className: "bg-orange-300" },
  { marca: "OPPO", className: "bg-green-600" },
  { marca: "MOTOROLA", className: "bg-slate-950" },
];

function colorMarca(nombre: string) {
  const marcaNormalizada = String(nombre || "").trim().toUpperCase();
  return (
    BRAND_BAR_COLORS.find(({ marca }) => marcaNormalizada.includes(marca))
      ?.className ?? "bg-violet-600"
  );
}

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

function RankingBar({
  item,
  index,
}: {
  item: ReferenceRankingItem;
  index: number;
}) {
  const barWidth = `${Math.min(
    100,
    Math.max(item.porcentaje, item.total > 0 ? 2 : 0)
  )}%`;
  const colorClass = colorMarca(item.nombre);

  return (
    <div className="grid gap-2 rounded-2xl border border-[#eee6da] bg-[#fcfbf8] px-4 py-3 sm:grid-cols-[minmax(150px,220px)_minmax(0,1fr)_84px] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-950">
          {index + 1}. {item.nombre}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {formatoNumero(item.total)} {item.total === 1 ? "venta" : "ventas"}
        </p>
      </div>

      <div className="h-4 overflow-hidden rounded-full bg-slate-100">
        <div
          className={["h-full rounded-full", colorClass].join(" ")}
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
  const matches = useMemo(() => {
    if (!termino) {
      return [];
    }

    return allItems
      .filter((item) => normalizarBusqueda(item.nombre).includes(termino))
      .slice(0, 20);
  }, [allItems, termino]);
  const exactMatch = useMemo(() => {
    if (!termino) {
      return null;
    }

    return (
      allItems.find((item) => normalizarBusqueda(item.nombre) === termino) ??
      matches[0] ??
      null
    );
  }, [allItems, matches, termino]);

  return (
    <section className="rounded-[30px] border border-[#e9e3d8] bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Referencias
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
            Top 100 referencias vendidas
          </h2>
        </div>
        <div className="w-max rounded-full border border-[#e9e1d4] bg-[#f8f5ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          {topItems.length} visibles
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#eee6da] bg-[#fcfbf8] p-4">
        <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
          Buscar referencia
        </label>
        <input
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          placeholder="Escribe una referencia, ejemplo: INFINIX SMART 20"
          className="mt-2 w-full rounded-2xl border border-[#ded6c9] bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200"
        />

        {termino ? (
          exactMatch ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-emerald-950">
                  {exactMatch.nombre}
                </p>
                <p className="mt-1 text-xs font-semibold text-emerald-700">
                  Coincidencia en el listado mensual completo
                </p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-2 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                  Ventas
                </p>
                <p className="text-xl font-black text-emerald-900">
                  {formatoNumero(exactMatch.total)}
                </p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-2 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                  Participacion
                </p>
                <p className="text-xl font-black text-emerald-900">
                  {formatoPorcentaje(exactMatch.porcentaje)}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-[#e6ddcf] bg-white px-4 py-4 text-sm font-semibold text-slate-500">
              No hay ventas registradas para esa referencia en este mes.
            </div>
          )
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-[#e6ddcf] bg-white px-4 py-4 text-sm text-slate-500">
            Escribe cualquier referencia para consultar ventas y porcentaje, aunque no este en el top 100.
          </div>
        )}

        {matches.length > 1 && (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Coincidencias
            </p>
            {matches.map((item) => (
              <button
                key={`match-${item.nombre}`}
                type="button"
                onClick={() => setBusqueda(item.nombre)}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-50"
              >
                <span className="truncate">{item.nombre}</span>
                <span className="shrink-0 text-slate-500">
                  {formatoNumero(item.total)} | {formatoPorcentaje(item.porcentaje)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 max-h-[900px] space-y-3 overflow-y-auto pr-1">
        {topItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#e6ddcf] bg-[#fcfaf6] px-4 py-4 text-sm text-slate-500">
            Sin referencias registradas en este periodo.
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
