"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PriceListItem = {
  id: number;
  marca: string;
  referencia: string;
  precio: number;
  updatedAt: string;
};

function formatoPesos(value: number) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
}

function normalizarBusqueda(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function ListaPreciosVendedorWorkspace() {
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargarLista = async () => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/lista-precios", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo cargar la lista de precios");
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMensaje("Error cargando lista de precios");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarLista();
  }, []);

  const itemsFiltrados = useMemo(() => {
    const filtro = normalizarBusqueda(busqueda.trim());

    if (!filtro) {
      return items;
    }

    return items.filter((item) =>
      normalizarBusqueda(`${item.marca} ${item.referencia}`).includes(filtro)
    );
  }, [busqueda, items]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172033_50%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Consulta comercial
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                LISTA DE PRECIOS
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                Referencias y precios actualizados por administracion.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/vendedor/registros"
                className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Registrar venta
              </Link>
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver a CONECTAMOS
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Precios
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                Catalogo actualizado
              </h2>
            </div>

            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar marca o referencia..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 md:max-w-sm"
            />
          </div>

          {mensaje && (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-medium text-rose-900">
              {mensaje}
            </div>
          )}

          <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
            <div className="grid min-w-[620px] grid-cols-[1fr_1.25fr_140px] bg-slate-950 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              <span>Marca</span>
              <span>Referencia</span>
              <span className="text-right">Precio</span>
            </div>

            {cargando ? (
              <div className="px-4 py-8 text-sm font-semibold text-slate-500">
                Cargando lista de precios...
              </div>
            ) : itemsFiltrados.length === 0 ? (
              <div className="px-4 py-8 text-sm font-semibold text-slate-500">
                No hay precios disponibles.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {itemsFiltrados.map((item) => (
                  <div
                    key={item.id}
                    className="grid min-w-[620px] grid-cols-[1fr_1.25fr_140px] items-center gap-3 px-4 py-4 text-sm"
                  >
                    <span className="min-w-0 truncate font-black uppercase text-slate-950">
                      {item.marca}
                    </span>
                    <span className="min-w-0 truncate font-semibold text-slate-700">
                      {item.referencia}
                    </span>
                    <span className="text-right font-black text-emerald-700">
                      {formatoPesos(item.precio)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
