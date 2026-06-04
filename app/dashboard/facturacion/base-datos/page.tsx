import Link from "next/link";
import { redirect } from "next/navigation";
import { esRolAdministrativo } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import {
  getBogotaMonthRangeFromInput,
  getCurrentBogotaMonthInput,
} from "@/lib/ventas-utils";

export default async function FacturacionBaseDatosPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const session = await requireSessionPage();

  if (!esRolAdministrativo(session.rolNombre)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const requestedPeriod = params?.period || getCurrentBogotaMonthInput();
  const period =
    getBogotaMonthRangeFromInput(requestedPeriod)?.key ||
    getCurrentBogotaMonthInput();
  const periodLabel = getBogotaMonthRangeFromInput(period)?.label || period;
  const exportHref = `/api/facturador/base-datos?period=${encodeURIComponent(
    period
  )}`;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] px-4 py-8 text-slate-950">
      <main className="mx-auto max-w-5xl space-y-6">
        <section className="relative overflow-hidden rounded-[34px] border border-[#182233] bg-[linear-gradient(135deg,#101827_0%,#172033_48%,#7f1d1d_100%)] px-6 py-7 text-white shadow-[0_26px_85px_rgba(15,23,42,0.22)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_24%)]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-100">
                Facturacion
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                BASE DE DATOS
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
                Exporta los registros subidos por asesores que ya fueron
                convertidos en venta.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/16 bg-white/10 px-6 text-sm font-black text-white shadow-sm transition hover:bg-white/16"
            >
              Volver
            </Link>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#e7e3da] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#d8cdbb] bg-[#fffdf8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-700">
                Rango mensual
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight">
                Registros convertidos en venta
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Periodo actual:{" "}
                <span className="font-bold text-slate-950">{periodLabel}</span>.
                El archivo incluye cedula, nombre, referencia, IMEI,
                financiera, telefono y referencias familiares.
              </p>
            </div>

            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
              <label className="text-sm font-bold text-slate-700">
                Mes comercial
                <input
                  type="month"
                  name="period"
                  defaultValue={period}
                  className="mt-2 block min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-900"
                />
              </label>
              <button
                type="submit"
                className="min-h-12 rounded-2xl border border-slate-900 bg-white px-6 text-sm font-black text-slate-950 transition hover:bg-slate-50"
              >
                Consultar
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-[30px] border border-emerald-200 bg-emerald-50/70 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-600">
                Excel administrativo
              </p>
              <h3 className="mt-2 text-xl font-black text-emerald-900">
                Descargar base del periodo
              </h3>
              <p className="mt-2 text-sm leading-6 text-emerald-800">
                Disponible solo para administrador y auditor.
              </p>
            </div>
            <Link
              href={exportHref}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-7 text-sm font-black text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
            >
              Descargar Excel
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
