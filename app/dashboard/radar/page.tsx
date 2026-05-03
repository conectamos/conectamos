import Link from "next/link";
import { redirect } from "next/navigation";
import { esRolAdmin } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import {
  getAdminInventorySummary,
  type InventoryAdminSummary,
  type InventoryBrandReferenceSummary,
  type InventoryBrandSummary,
} from "@/lib/dashboard-inventory-summary";

function formatoNumero(valor: number) {
  return Number(valor || 0).toLocaleString("es-CO");
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
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-slate-100 px-4 py-3 first:border-t-0">
      <p className="min-w-0 text-sm font-black uppercase leading-5 tracking-tight text-slate-950">
        {item.referencia}
      </p>
      <div className="min-w-[74px] rounded-2xl bg-slate-950 px-3 py-2 text-center text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">
          Cant.
        </p>
        <p className="text-lg font-black leading-none">
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

function InventoryRadar({ summary }: { summary: InventoryAdminSummary }) {
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
            Solo se cuentan equipos cuyo estado actual es BODEGA.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventario-principal"
            className="inline-flex min-h-[42px] items-center justify-center rounded-2xl border border-[#e4ddd2] bg-[#fcfbf8] px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-white hover:text-slate-950"
          >
            Bodega principal
          </Link>
          <Link
            href="/inventario"
            className="inline-flex min-h-[42px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800"
          >
            Ver inventario
          </Link>
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

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        {summary.marcas.map((brand) => (
          <BrandCard key={brand.marca} brand={brand} />
        ))}
      </div>
    </section>
  );
}

export default async function DashboardRadarPage() {
  const session = await requireSessionPage();

  if (!esRolAdmin(session.rolNombre)) {
    redirect("/dashboard");
  }

  const summary = await getAdminInventorySummary();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] text-slate-950">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172033_52%,#0f766e_100%)] px-6 py-6 text-white shadow-[0_26px_85px_rgba(15,23,42,0.2)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90">
                Panel admin
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                RADAR
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                Conteo simple de equipos disponibles en BODEGA por marca y referencia.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex min-h-[48px] w-max items-center justify-center rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_16px_38px_rgba(15,23,42,0.18)] transition hover:bg-slate-100"
            >
              Volver
            </Link>
          </div>
        </section>

        <div className="mt-6">
          <InventoryRadar summary={summary} />
        </div>
      </main>
    </div>
  );
}
