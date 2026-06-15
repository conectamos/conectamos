"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  InventoryAdminSummary,
  InventoryBrandReferenceSummary,
  InventoryBrandSummary,
} from "@/lib/dashboard-inventory-summary";

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
}

function normalizarBusqueda(valor: string) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function MetricCard({
  label,
  value,
  detail,
  valueClassName = "text-slate-950",
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[26px] border border-[#e7e3da] bg-white px-5 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className={["mt-3 text-3xl font-black tracking-tight", valueClassName].join(" ")}>
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function ReferenceRow({ item }: { item: InventoryBrandReferenceSummary }) {
  const [mostrarSedes, setMostrarSedes] = useState(false);
  const tieneSedes = item.sedesDetalle.length > 0;

  return (
    <div className="grid gap-3 border-t border-slate-100 px-4 py-4 first:border-t-0 md:grid-cols-[1fr_auto] md:items-start">
      <div className="min-w-0">
        <p className="text-sm font-black uppercase leading-5 tracking-tight text-slate-950">
          {item.referencia}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
            Principal: {formatoNumero(item.bodegaPrincipal)}
          </span>
          {tieneSedes ? (
            <button
              type="button"
              onClick={() => setMostrarSedes((actual) => !actual)}
              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-sky-700 transition hover:bg-sky-100"
            >
              Sedes: {formatoNumero(item.sedes)}
            </button>
          ) : (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              Sedes: 0
            </span>
          )}
        </div>

        {mostrarSedes && tieneSedes && (
          <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-700">
              Sedes con disponibilidad
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.sedesDetalle.map((detalle) => (
                <span
                  key={`${item.referencia}-${detalle.sede}`}
                  className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                >
                  {detalle.sede}: {formatoNumero(detalle.total)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-center text-white md:min-w-[92px] md:w-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">
          Total
        </p>
        <p className="text-xl font-black leading-none">
          {formatoNumero(item.total)}
        </p>
      </div>
    </div>
  );
}

function BrandCard({ brand }: { brand: InventoryBrandSummary }) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[#e7e0d5] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-4 border-b border-[#ebe4d8] bg-[#fbfaf7] px-5 py-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
            Marca
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            {brand.marca}
          </h2>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
            Bodega
          </p>
          <p className="text-2xl font-black text-emerald-700">
            {formatoNumero(brand.total)}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700/70">
            {formatoNumero(brand.referencias.length)} refs
          </p>
        </div>
      </div>

      {brand.referencias.length === 0 ? (
        <div className="px-5 py-5 text-sm font-semibold text-slate-500">
          Sin referencias en BODEGA.
        </div>
      ) : (
        <div>
          {brand.referencias.map((item) => (
            <ReferenceRow key={`${brand.marca}-${item.referencia}`} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function DashboardRadarWorkspace({
  summary,
  puedeVerBodegaPrincipal,
  puedeVerInventario,
}: {
  summary: InventoryAdminSummary;
  puedeVerBodegaPrincipal: boolean;
  puedeVerInventario: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");

  const marcasFiltradas = useMemo(() => {
    const filtro = normalizarBusqueda(busqueda.trim());

    if (!filtro) {
      return summary.marcas;
    }

    return summary.marcas
      .map((brand) => {
        const referencias = brand.referencias.filter((item) =>
          normalizarBusqueda(`${brand.marca} ${item.referencia}`).includes(filtro)
        );

        return {
          ...brand,
          total: referencias.reduce((acumulado, item) => acumulado + item.total, 0),
          referencias,
        };
      })
      .filter((brand) => brand.referencias.length > 0);
  }, [busqueda, summary.marcas]);

  const totalReferenciasFiltradas = useMemo(
    () =>
      marcasFiltradas.reduce(
        (acumulado, brand) => acumulado + brand.referencias.length,
        0
      ),
    [marcasFiltradas]
  );

  return (
    <section className="rounded-[30px] border border-[#e9e3d8] bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-[#d7eee5] bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Estado BODEGA
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
            Referencias disponibles por marca
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Busca una referencia y valida cuantas unidades hay en bodega principal y
            cuantas estan repartidas por sedes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {puedeVerBodegaPrincipal && (
            <Link
              href="/inventario-principal"
              className="inline-flex min-h-[42px] items-center justify-center rounded-2xl border border-[#e4ddd2] bg-[#fcfbf8] px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-white hover:text-slate-950"
            >
              Bodega principal
            </Link>
          )}
          {puedeVerInventario && (
            <Link
              href="/inventario"
              className="inline-flex min-h-[42px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Ver inventario
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          label="Total BODEGA"
          value={formatoNumero(summary.totalBodega)}
          detail="Equipos disponibles en estado BODEGA."
          valueClassName="text-emerald-600"
        />
        <MetricCard
          label="Bodega principal"
          value={formatoNumero(summary.totalBodegaPrincipal)}
          detail="Estado BODEGA en inventario principal."
        />
        <MetricCard
          label="Sedes"
          value={formatoNumero(summary.totalSedes)}
          detail="Estado BODEGA dentro de sedes."
        />
        <MetricCard
          label="Referencias"
          value={formatoNumero(summary.referenciasEnBodega)}
          detail="Referencias con al menos un equipo en BODEGA."
        />
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-[#fbfaf7] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Busqueda por referencia
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {totalReferenciasFiltradas > 0
                ? `${formatoNumero(totalReferenciasFiltradas)} referencias visibles con el filtro actual.`
                : "No hay referencias que coincidan con la busqueda."}
            </p>
          </div>

          <input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar marca o referencia..."
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 lg:max-w-md"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        {marcasFiltradas.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-semibold text-slate-500 xl:col-span-2">
            No hay referencias disponibles con ese filtro.
          </div>
        ) : (
          marcasFiltradas.map((brand) => <BrandCard key={brand.marca} brand={brand} />)
        )}
      </div>
    </section>
  );
}
