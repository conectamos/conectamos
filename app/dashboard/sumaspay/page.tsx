import Link from "next/link";
import { redirect } from "next/navigation";
import { esRolAdministrativo } from "@/lib/access-control";
import { requireSessionPage } from "@/lib/page-access";
import SumasPayBatchWorkspace from "./sumaspay-batch-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SumasPayBatchPage() {
  const session = await requireSessionPage();

  if (!esRolAdministrativo(session.rolNombre)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] text-slate-950">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172033_52%,#0f766e_100%)] px-6 py-6 text-white shadow-[0_26px_85px_rgba(15,23,42,0.2)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90">
                Plataforma externa
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Consulta SUMASPAY
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                Carga masiva de cedulas para consultar nombre y valor de cuota
                con vigencia de 2 meses.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex min-h-[46px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/15"
            >
              Volver
            </Link>
          </div>
        </section>

        <div className="mt-6">
          <SumasPayBatchWorkspace />
        </div>
      </main>
    </div>
  );
}
