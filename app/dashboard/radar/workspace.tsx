"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
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
  detail,
  icon,
  iconClassName,
  label,
  value,
  valueClassName = "text-slate-950",
}: {
  detail: string;
  icon: DashboardIconName;
  iconClassName: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <article className="min-h-[142px] rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
        >
          <DashboardIcon name={icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p
            className={`mt-1.5 break-words text-[27px] font-black leading-tight tracking-tight ${valueClassName}`}
          >
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function AvailabilityValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "positive" | "primary";
}) {
  const toneClasses = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
    primary: "border-red-100 bg-red-50 text-[#e30613]",
  }[tone];

  return (
    <div className={`min-w-[105px] rounded-xl border px-3 py-2.5 ${toneClasses}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.13em] opacity-70">
        {label}
      </p>
      <p className="mt-1 text-xl font-black leading-none">{formatoNumero(value)}</p>
    </div>
  );
}

function ReferenceRow({ item }: { item: InventoryBrandReferenceSummary }) {
  const [mostrarSedes, setMostrarSedes] = useState(false);
  const tieneSedes = item.sedesDetalle.length > 0;

  return (
    <article className="border-t border-slate-100 px-4 py-4 first:border-t-0 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <DashboardIcon name="inventory" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h4 className="break-words text-sm font-black uppercase leading-5 tracking-tight text-slate-950">
                {item.referencia}
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                Disponibilidad actual en el sistema
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <AvailabilityValue
            label="Principal"
            value={item.bodegaPrincipal}
            tone={item.bodegaPrincipal > 0 ? "positive" : "neutral"}
          />

          {tieneSedes ? (
            <button
              type="button"
              onClick={() => setMostrarSedes((actual) => !actual)}
              aria-expanded={mostrarSedes}
              className="group min-w-[105px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
            >
              <span className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.13em] opacity-70">
                Sedes
                <DashboardIcon
                  name="arrow"
                  className={`h-3.5 w-3.5 transition-transform ${
                    mostrarSedes ? "rotate-90" : ""
                  }`}
                />
              </span>
              <span className="mt-1 block text-xl font-black leading-none">
                {formatoNumero(item.sedes)}
              </span>
            </button>
          ) : (
            <AvailabilityValue label="Sedes" value={0} tone="neutral" />
          )}

          <div className="col-span-2 sm:col-span-1">
            <AvailabilityValue label="Total" value={item.total} tone="primary" />
          </div>
        </div>
      </div>

      {mostrarSedes && tieneSedes && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <DashboardIcon name="store" className="h-4 w-4 text-[#e30613]" />
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">
              Disponibilidad por sede
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {item.sedesDetalle.map((detalle) => (
              <div
                key={`${item.referencia}-${detalle.sede}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <span className="min-w-0 truncate text-xs font-semibold text-slate-700">
                  {detalle.sede}
                </span>
                <strong className="shrink-0 text-sm font-black text-slate-950">
                  {formatoNumero(detalle.total)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function BrandCard({ brand }: { brand: InventoryBrandSummary }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/70 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
            <DashboardIcon name="catalog" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e30613]">
              Marca
            </p>
            <h3 className="mt-0.5 truncate text-xl font-black tracking-tight text-slate-950">
              {brand.marca}
            </h3>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4 text-right">
          <div className="hidden sm:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Referencias
            </p>
            <p className="mt-0.5 text-sm font-black text-slate-700">
              {formatoNumero(brand.referencias.length)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
            <p className="text-[10px] font-black uppercase tracking-[0.12em]">
              Disponibles
            </p>
            <p className="mt-0.5 text-xl font-black leading-none">
              {formatoNumero(brand.total)}
            </p>
          </div>
        </div>
      </div>

      {brand.referencias.length === 0 ? (
        <div className="flex min-h-[116px] flex-col items-center justify-center px-5 py-6 text-center">
          <DashboardIcon name="inventory" className="h-7 w-7 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Sin referencias disponibles
          </p>
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
    <>
      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          icon="inventory"
          iconClassName="bg-red-50 text-[#e30613]"
          label="Equipos disponibles"
          value={formatoNumero(summary.totalBodega)}
          detail="Total actual en estado BODEGA."
        />
        <MetricCard
          icon="store"
          iconClassName="bg-emerald-50 text-emerald-600"
          label="Bodega principal"
          value={formatoNumero(summary.totalBodegaPrincipal)}
          detail="Unidades listas en inventario principal."
          valueClassName="text-emerald-600"
        />
        <MetricCard
          icon="send"
          iconClassName="bg-blue-50 text-blue-600"
          label="Disponibles en sedes"
          value={formatoNumero(summary.totalSedes)}
          detail="Unidades disponibles dentro de las sedes."
        />
        <MetricCard
          icon="catalog"
          iconClassName="bg-violet-50 text-violet-600"
          label="Referencias activas"
          value={formatoNumero(summary.referenciasEnBodega)}
          detail="Modelos con al menos una unidad disponible."
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        <div className="flex flex-col gap-5 border-b border-slate-200 p-5 lg:flex-row lg:items-end lg:justify-between lg:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
              Consulta de disponibilidad
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Referencias disponibles por marca
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Busca por marca o referencia y abre el detalle para conocer la cantidad
              exacta en cada sede.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {puedeVerBodegaPrincipal && (
              <Link
                href="/inventario-principal"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <DashboardIcon name="store" className="h-4 w-4" />
                Bodega principal
              </Link>
            )}
            {puedeVerInventario && (
              <Link
                href="/inventario"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-4 text-sm font-bold text-white transition hover:bg-[#c9000b]"
              >
                <DashboardIcon name="inventory" className="h-4 w-4" />
                Ver inventario
              </Link>
            )}
          </div>
        </div>

        <div className="p-5 lg:p-6">
          <label htmlFor="radar-search" className="sr-only">
            Buscar marca o referencia
          </label>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xl">
              <DashboardIcon
                name="search"
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              />
              <input
                id="radar-search"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar por marca o referencia..."
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-12 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <DashboardIcon name="close" className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500" aria-live="polite">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                {formatoNumero(marcasFiltradas.length)} marcas
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                {formatoNumero(totalReferenciasFiltradas)} referencias
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {marcasFiltradas.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center xl:col-span-2">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-300 shadow-sm ring-1 ring-slate-200">
                  <DashboardIcon name="search" className="h-7 w-7" />
                </span>
                <p className="mt-4 text-base font-black text-slate-800">
                  No encontramos esa referencia
                </p>
                <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                  Revisa el nombre de la marca o modelo e intenta nuevamente.
                </p>
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              marcasFiltradas.map((brand) => (
                <BrandCard key={brand.marca} brand={brand} />
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}
