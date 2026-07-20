"use client";

import { FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import DashboardIcon from "./dashboard-icon";

type SedeOption = {
  id: number;
  nombre: string;
};

export default function DashboardFilters({
  esAdmin,
  period,
  sedeId,
  sedeLabel,
  sedes,
}: {
  esAdmin: boolean;
  period: string;
  sedeId: number | null;
  sedeLabel: string;
  sedes: SedeOption[];
}) {
  const router = useRouter();
  const [actualizando, startTransition] = useTransition();

  const aplicarFiltros = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const periodo = String(data.get("period") || "");
    const sede = String(data.get("sedeId") || "TODAS");
    const params = new URLSearchParams();

    if (/^\d{4}-\d{2}$/.test(periodo)) {
      params.set("period", periodo);
    }

    if (esAdmin && /^\d+$/.test(sede)) {
      params.set("sedeId", sede);
    }

    startTransition(() => {
      router.replace(`/dashboard?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <form
      onSubmit={aplicarFiltros}
      className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
      aria-busy={actualizando}
    >
      {esAdmin ? (
        <label className="relative flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[210px]">
          <DashboardIcon name="store" className="h-5 w-5 shrink-0 text-slate-500" />
          <span className="sr-only">Sede</span>
          <select
            name="sedeId"
            defaultValue={sedeId ? String(sedeId) : "TODAS"}
            className="min-w-0 flex-1 appearance-none bg-transparent pr-6 text-sm font-semibold text-slate-700 outline-none"
          >
            <option value="TODAS">Todas las sedes</option>
            {sedes.map((sede) => (
              <option key={sede.id} value={sede.id}>
                {sede.nombre}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 text-xs text-slate-400">⌄</span>
        </label>
      ) : (
        <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[210px]">
          <DashboardIcon name="store" className="h-5 w-5 shrink-0 text-slate-500" />
          <span className="truncate text-sm font-semibold text-slate-700">
            {sedeLabel}
          </span>
        </div>
      )}

      <label className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[178px]">
        <DashboardIcon name="calendar" className="h-5 w-5 shrink-0 text-slate-500" />
        <span className="sr-only">Periodo</span>
        <input
          type="month"
          name="period"
          defaultValue={period}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={actualizando}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#e30613] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#c9000c] disabled:cursor-wait disabled:opacity-70"
      >
        {actualizando ? "Actualizando…" : "Aplicar"}
      </button>
    </form>
  );
}
