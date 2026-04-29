"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type PriceListItem = {
  id: number;
  marca: string;
  referencia: string;
  precio: number;
  updatedAt: string;
};

type FormState = {
  marca: string;
  referencia: string;
  precio: string;
};

const emptyForm: FormState = {
  marca: "",
  referencia: "",
  precio: "",
};

function formatoPesos(value: number) {
  return `$ ${Number(value || 0).toLocaleString("es-CO")}`;
}

function limpiarPrecioInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizarBusqueda(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function ListaPreciosAdminWorkspace() {
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busqueda, setBusqueda] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"info" | "error">("info");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  const cargarLista = async () => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/lista-precios", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo cargar la lista de precios");
        setMensajeTipo("error");
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMensaje("Error cargando lista de precios");
      setMensajeTipo("error");
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

  const setField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const limpiarFormulario = () => {
    setForm(emptyForm);
    setEditandoId(null);
  };

  const guardarPrecio = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const marca = form.marca.trim();
    const referencia = form.referencia.trim();
    const precio = limpiarPrecioInput(form.precio);

    if (!marca || !referencia || !precio) {
      setMensaje("Completa marca, referencia y precio");
      setMensajeTipo("error");
      return;
    }

    try {
      setGuardando(true);
      setMensaje("");

      const res = await fetch("/api/lista-precios", {
        method: editandoId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editandoId,
          marca,
          referencia,
          precio,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo guardar el precio");
        setMensajeTipo("error");
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setMensaje(data.mensaje || "Lista de precios actualizada");
      setMensajeTipo("info");
      limpiarFormulario();
    } catch {
      setMensaje("Error guardando precio");
      setMensajeTipo("error");
    } finally {
      setGuardando(false);
    }
  };

  const editarPrecio = (item: PriceListItem) => {
    setEditandoId(item.id);
    setForm({
      marca: item.marca,
      referencia: item.referencia,
      precio: String(Math.round(Number(item.precio || 0))),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminarPrecio = async (item: PriceListItem) => {
    const confirmado = window.confirm(
      `Eliminar ${item.marca} ${item.referencia} de la lista de precios?`
    );

    if (!confirmado) {
      return;
    }

    try {
      setEliminandoId(item.id);
      setMensaje("");

      const res = await fetch(`/api/lista-precios?id=${item.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo eliminar el precio");
        setMensajeTipo("error");
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setMensaje(data.mensaje || "Precio eliminado correctamente");
      setMensajeTipo("info");

      if (editandoId === item.id) {
        limpiarFormulario();
      }
    } catch {
      setMensaje("Error eliminando precio");
      setMensajeTipo("error");
    } finally {
      setEliminandoId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f2ea_0%,#eef3f9_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172033_50%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Administracion
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                LISTA DE PRECIOS
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                Mantiene actualizada la informacion que consultan los vendedores.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/vendedor/lista-precios"
                className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Ver como vendedor
              </Link>
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver al panel
              </Link>
            </div>
          </div>
        </section>

        {mensaje && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-4 text-sm font-medium shadow-sm ${
              mensajeTipo === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {mensaje}
          </div>
        )}

        <section className="mt-6 rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Nuevo registro
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                {editandoId ? "Editar precio" : "Agregar precio"}
              </h2>
            </div>

            {editandoId && (
              <button
                type="button"
                onClick={limpiarFormulario}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-900"
              >
                Cancelar edicion
              </button>
            )}
          </div>

          <form
            onSubmit={(event) => void guardarPrecio(event)}
            className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr_220px_180px]"
          >
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              MARCA
              <input
                value={form.marca}
                onChange={(event) => setField("marca", event.target.value)}
                placeholder="Ej: Samsung"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              REFERENCIA
              <input
                value={form.referencia}
                onChange={(event) => setField("referencia", event.target.value)}
                placeholder="Ej: Galaxy A25 128GB"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
              PRECIO
              <input
                value={form.precio}
                onChange={(event) =>
                  setField("precio", limpiarPrecioInput(event.target.value))
                }
                inputMode="numeric"
                placeholder="1200000"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <div className="flex flex-col justify-end">
              <button
                type="submit"
                disabled={guardando}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {guardando
                  ? "Guardando..."
                  : editandoId
                    ? "Guardar cambios"
                    : "Agregar"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Catalogo
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                {items.length} precio{items.length === 1 ? "" : "s"}
              </h2>
            </div>

            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar marca o referencia..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 md:max-w-sm"
            />
          </div>

          <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200">
            <div className="grid min-w-[820px] grid-cols-[1fr_1.25fr_140px_190px] bg-slate-950 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              <span>Marca</span>
              <span>Referencia</span>
              <span className="text-right">Precio</span>
              <span className="text-right">Acciones</span>
            </div>

            {cargando ? (
              <div className="px-4 py-8 text-sm font-semibold text-slate-500">
                Cargando lista de precios...
              </div>
            ) : itemsFiltrados.length === 0 ? (
              <div className="px-4 py-8 text-sm font-semibold text-slate-500">
                No hay precios registrados.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {itemsFiltrados.map((item) => (
                  <div
                    key={item.id}
                    className="grid min-w-[820px] grid-cols-[1fr_1.25fr_140px_190px] items-center gap-3 px-4 py-4 text-sm"
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
                    <span className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => editarPrecio(item)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-900"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void eliminarPrecio(item)}
                        disabled={eliminandoId === item.id}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {eliminandoId === item.id ? "..." : "Eliminar"}
                      </button>
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
