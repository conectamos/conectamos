"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";

type PriceListItem = {
  id: number;
  marca: string;
  referencia: string;
  precio: number;
  comisionVendedor: number;
  updatedAt: string;
};

type FormState = {
  marca: string;
  referencia: string;
  precio: string;
  comisionVendedor: string;
};

type SessionUser = {
  nombre: string;
  usuario: string;
  sedeNombre: string;
  rolNombre: string;
};

type SummaryMetric = readonly [
  DashboardIconName,
  string,
  number,
  string,
];

const emptyForm: FormState = {
  marca: "",
  referencia: "",
  precio: "",
  comisionVendedor: "",
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
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

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
      setPuedeEliminar(Boolean(data.puedeEliminar));
    } catch {
      setMensaje("Error cargando lista de precios");
      setMensajeTipo("error");
    } finally {
      setCargando(false);
    }
  };

  const cargarUsuario = async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setUser(data);
      }
    } catch {}
  };

  useEffect(() => {
    void cargarLista();
    void cargarUsuario();
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

  const totalMarcas = useMemo(
    () => new Set(items.map((item) => normalizarBusqueda(item.marca))).size,
    [items]
  );
  const referenciasConComision = useMemo(
    () => items.filter((item) => Number(item.comisionVendedor || 0) > 0).length,
    [items]
  );

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
    const comisionVendedor = limpiarPrecioInput(form.comisionVendedor);

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
          comisionVendedor,
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
      comisionVendedor: String(Math.round(Number(item.comisionVendedor || 0))),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminarPrecio = async (item: PriceListItem) => {
    if (!puedeEliminar) {
      setMensaje("El rol actual no puede eliminar precios");
      setMensajeTipo("error");
      return;
    }

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

  const nombreUsuario = user?.nombre || user?.usuario || "Administrador";
  const inicialesUsuario = nombreUsuario
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
  const inputClass =
    "min-h-[50px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50";

  const navigationItems: NavigationItem[] = [
    { href: "/dashboard", icon: "home", label: "Inicio" },
    { href: "/ventas", icon: "sales", label: "Ventas" },
    { href: "/inventario", icon: "inventory", label: "Inventario" },
    { href: "/prestamos", icon: "loans", label: "Préstamos" },
    { href: "/caja", icon: "cash", label: "Caja" },
    {
      href: "/dashboard/aprobaciones",
      icon: "approvals",
      label: "Aprobaciones",
    },
    { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
    { href: "/dashboard/sedes", icon: "settings", label: "Configuración" },
  ];

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/dashboard/sedes"
        coverageLabel={user?.sedeNombre || "Administración"}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                <Link href="/dashboard/sedes" className="transition hover:text-[#e30613]">
                  Configuración
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-600">Lista de precios</span>
              </nav>
              <h1 className="text-[30px] font-black tracking-tight sm:text-[34px]">
                Precios y comisiones
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                Administra las referencias, precios y comisiones que consulta el
                equipo comercial.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/vendedor/lista-precios"
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black tracking-[0.06em] text-white transition hover:bg-slate-800"
              >
                <DashboardIcon name="user" className="h-5 w-5" />
                VER COMO VENDEDOR
              </Link>
              <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || "AD"}
                </span>
                <div className="min-w-0 pr-2">
                  <p className="max-w-[150px] truncate text-sm font-bold">{nombreUsuario}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {user?.rolNombre || "Cargando"}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-[52px] uppercase" />
            </div>
          </header>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {(
              [
                [
                  "catalog",
                  "REFERENCIAS",
                  items.length,
                  "Registros activos en el catálogo.",
                ],
                [
                  "inventory",
                  "MARCAS",
                  totalMarcas,
                  "Marcas diferentes disponibles.",
                ],
                [
                  "cash",
                  "CON COMISIÓN",
                  referenciasConComision,
                  "Referencias con incentivo configurado.",
                ],
              ] satisfies SummaryMetric[]
            ).map(([icon, label, value, detail]) => (
              <article
                key={label}
                className="flex min-h-[126px] items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name={icon} className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-bold tracking-[0.12em] text-slate-500">{label}</p>
                  <p className="mt-1.5 text-2xl font-black">{value}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
                </div>
              </article>
            ))}
          </section>

          {mensaje && (
            <div
              role="status"
              className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                mensajeTipo === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <DashboardIcon
                name={mensajeTipo === "error" ? "warning" : "approvals"}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              {mensaje}
            </div>
          )}

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name={editandoId ? "settings" : "catalog"} className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    {editandoId ? "Edición activa" : "Nuevo registro"}
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                    {editandoId ? `Editar referencia #${editandoId}` : "Agregar precio"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {editandoId
                      ? "Actualiza la información y guarda los cambios."
                      : "Completa los datos para publicar una nueva referencia."}
                  </p>
                </div>
              </div>

              {editandoId && (
                <button
                  type="button"
                  onClick={limpiarFormulario}
                  className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 text-xs font-black tracking-[0.06em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                >
                  CANCELAR EDICIÓN
                </button>
              )}
            </div>

            <form
              onSubmit={(event) => void guardarPrecio(event)}
              className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_1.25fr_190px_190px_auto] lg:items-end"
            >
              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Marca
                <input
                  value={form.marca}
                  onChange={(event) => setField("marca", event.target.value)}
                  placeholder="Ej: Samsung"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Referencia
                <input
                  value={form.referencia}
                  onChange={(event) => setField("referencia", event.target.value)}
                  placeholder="Ej: Galaxy A25 128GB"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Precio
                <input
                  value={form.precio}
                  onChange={(event) =>
                    setField("precio", limpiarPrecioInput(event.target.value))
                  }
                  inputMode="numeric"
                  placeholder="1200000"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
                Comisión
                <input
                  value={form.comisionVendedor}
                  onChange={(event) =>
                    setField(
                      "comisionVendedor",
                      limpiarPrecioInput(event.target.value)
                    )
                  }
                  inputMode="numeric"
                  placeholder="50000"
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                disabled={guardando}
                className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#e30613] px-6 text-xs font-black tracking-[0.06em] text-white transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <DashboardIcon name="approvals" className="h-5 w-5" />
                {guardando
                  ? "GUARDANDO..."
                  : editandoId
                    ? "GUARDAR CAMBIOS"
                    : "AGREGAR"}
              </button>
            </form>
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:px-6 md:flex-row md:items-end md:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <DashboardIcon name="catalog" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                    Catálogo comercial
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                    {items.length} referencia{items.length === 1 ? "" : "s"}
                  </h2>
                </div>
              </div>

              <div className="relative w-full md:max-w-sm">
                <DashboardIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Buscar marca o referencia..."
                  className="min-h-[50px] w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-sm font-semibold outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-5 py-4">Marca</th>
                    <th className="px-5 py-4">Referencia</th>
                    <th className="px-5 py-4 text-right">Precio</th>
                    <th className="px-5 py-4 text-right">Comisión</th>
                    <th className="px-5 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cargando ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-500">
                        <span className="inline-flex items-center gap-3 font-semibold">
                          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
                          Cargando lista de precios...
                        </span>
                      </td>
                    </tr>
                  ) : itemsFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-500">
                        No hay precios que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    itemsFiltrados.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 transition hover:bg-slate-50/70"
                      >
                        <td className="px-5 py-4 font-black uppercase text-slate-950">
                          {item.marca}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-700">
                          {item.referencia}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-black text-emerald-700">
                          {formatoPesos(item.precio)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-black text-amber-700">
                          {formatoPesos(item.comisionVendedor)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => editarPrecio(item)}
                              className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 text-[10px] font-black tracking-[0.06em] text-slate-700 transition hover:bg-slate-100"
                            >
                              EDITAR
                            </button>
                            {puedeEliminar && (
                              <button
                                type="button"
                                onClick={() => void eliminarPrecio(item)}
                                disabled={eliminandoId === item.id}
                                className="min-h-[36px] rounded-lg border border-red-200 bg-red-50 px-3 text-[10px] font-black tracking-[0.06em] text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                              >
                                {eliminandoId === item.id ? "ELIMINANDO..." : "ELIMINAR"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
