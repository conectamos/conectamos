import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function PayJoyFortySixtyPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (String(user.rolNombre || "").toUpperCase() !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#f5f6fa] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
              PayJoy 40/60
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
              40/60
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
              El boton ya quedo creado dentro del modulo PayJoy. Esta vista
              queda lista para que me pases las reglas de negocio del flujo
              40/60 y lo montamos aqui.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/payjoy"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Cartera PayJoy
            </Link>
            <Link
              href="/dashboard/payjoy/40-60"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              40/60
            </Link>
            <Link
              href="/dashboard"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Volver
            </Link>
          </div>
        </div>

        <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Pendiente por definir
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
            Siguiente paso
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Cuando me compartas las reglas del 40/60, te construyo aqui el
            cargue, calculos y la tabla final con el mismo estilo del panel de
            Cartera PayJoy.
          </p>
        </section>
      </div>
    </div>
  );
}
