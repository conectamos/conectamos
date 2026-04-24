import Link from "next/link";
import { requireVendorPage } from "@/lib/page-access";

export default async function VendedorRegistrosPage() {
  const session = await requireVendorPage();
  const sedeNombre = session.sedeNombre ?? "Tu sede";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_52%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Modulo vendedor
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Registros tipo venta
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                Este espacio queda aislado del resto del sistema para que el perfil
                vendedor solo trabaje aqui.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver al dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Acceso exclusivo
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
              Tarjeta especial para subir registros
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Aqui vamos a construir el flujo de carga de registros tipo venta del
              vendedor. No tiene acceso a inventario, caja, prestamos, reportes ni
              a los demas modulos operativos.
            </p>

            <div className="mt-6 rounded-[26px] border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Proximo bloque
              </p>
              <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                Nuevo registro tipo venta
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Deje este modulo listo para conectarle el formulario cuando
                definamos los campos exactos del registro que va a subir el vendedor.
              </p>
              <button
                type="button"
                disabled
                className="mt-5 rounded-2xl border border-slate-200 bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-500"
              >
                Formulario en preparacion
              </button>
            </div>
          </div>

          <aside className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Sesion activa
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              {session.nombre}
            </h2>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Perfil
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {session.perfilTipoLabel ?? "Vendedor"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Sede
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {sedeNombre}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Alcance
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  Solo modulo de registros
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
