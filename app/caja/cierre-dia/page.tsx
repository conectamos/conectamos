"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getTodayBogotaDateKey } from "@/lib/ventas-utils";

type SessionUser = {
  id: number;
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre: string;
  rolId: number;
  rolNombre: string;
};

type Sede = {
  id: number;
  nombre: string;
};

export default function CierreDiaPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [fecha, setFecha] = useState(() => getTodayBogotaDateKey());
  const [sedeId, setSedeId] = useState("TODAS");
  const [mensaje, setMensaje] = useState("");

  const esAdmin = String(user?.rolNombre || "").toUpperCase() === "ADMIN";

  useEffect(() => {
    const init = async () => {
      try {
        const sessionRes = await fetch("/api/session", { cache: "no-store" });
        const sessionData = await sessionRes.json();

        if (!sessionRes.ok) {
          setMensaje(sessionData.error || "No se pudo cargar la sesion");
          return;
        }

        setUser(sessionData);

        if (String(sessionData?.rolNombre || "").toUpperCase() === "ADMIN") {
          const sedesRes = await fetch("/api/sedes", { cache: "no-store" });
          const sedesData = await sedesRes.json();

          if (sedesRes.ok) {
            setSedes(Array.isArray(sedesData) ? sedesData : []);
          }
        }
      } catch {
        setMensaje("Error cargando filtros del cierre");
      }
    };

    void init();
  }, []);

  const cobertura = useMemo(() => {
    if (!esAdmin) {
      return user?.sedeNombre || "Tu sede";
    }

    if (sedeId === "TODAS") {
      return "Todas las sedes";
    }

    return sedes.find((sede) => String(sede.id) === sedeId)?.nombre || "Sede";
  }, [esAdmin, sedeId, sedes, user?.sedeNombre]);

  const generarCierre = () => {
    if (!fecha) {
      setMensaje("Selecciona una fecha para generar el cierre");
      return;
    }

    const params = new URLSearchParams({
      fecha,
    });

    if (esAdmin && sedeId !== "TODAS") {
      params.set("sedeId", sedeId);
    }

    window.open(`/api/caja/cierre-dia?${params.toString()}`, "_blank", "noopener");
  };

  const generarCierrePrueba = (formato: "pdf" | "excel") => {
    if (!fecha) {
      setMensaje("Selecciona una fecha para generar el cierre");
      return;
    }

    const params = new URLSearchParams({
      fecha,
      vista: "tabla",
      formato,
    });

    if (esAdmin && sedeId !== "TODAS") {
      params.set("sedeId", sedeId);
    }

    window.open(`/api/caja/cierre-dia?${params.toString()}`, "_blank", "noopener");
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f4ee_0%,#eef2f7_100%)] px-4 py-8 text-slate-950">
      <main className="mx-auto max-w-5xl space-y-6">
        <section className="relative overflow-hidden rounded-[34px] border border-[#1f2937] bg-[linear-gradient(135deg,#0f172a_0%,#172033_50%,#7f1d1d_100%)] px-6 py-7 text-white shadow-[0_26px_85px_rgba(15,23,42,0.22)] sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.22),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_24%)]" />

          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-100">
                Caja
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                CIERRE DEL DIA
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
                Genera el PDF de cierre por fecha y cobertura, con ventas,
                ingresos, egresos, comisiones, salidas y caja acumulada.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex min-h-[46px] items-center justify-center rounded-2xl border border-white/12 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Volver
            </Link>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#e4dccd] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              Fecha del cierre
              <input
                type="date"
                value={fecha}
                onChange={(event) => setFecha(event.target.value)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            {esAdmin ? (
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Sede
                <select
                  value={sedeId}
                  onChange={(event) => setSedeId(event.target.value)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="TODAS">Todas las sedes</option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={String(sede.id)}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Sede
                <input
                  value={user?.sedeNombre || ""}
                  readOnly
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none"
                />
              </label>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Configuracion actual
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              Fecha: {fecha || "-"} | Cobertura: {cobertura}
            </p>
          </div>

          {mensaje && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {mensaje}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generarCierre}
              className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Generar PDF
            </button>
            <button
              type="button"
              onClick={() => generarCierrePrueba("pdf")}
              className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              PDF prueba
            </button>
            <button
              type="button"
              onClick={() => generarCierrePrueba("excel")}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              Excel prueba
            </button>
            <Link
              href="/caja"
              className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Ver caja
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
