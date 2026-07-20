"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  DashboardSidebar,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import type { RegistroVendedorDetalle } from "../types";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  rolNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type NavigationItem = {
  href: string;
  icon: DashboardIconName;
  label: string;
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";

  try {
    return new Date(value).toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function formatDateOnly(value: string | null) {
  if (!value) return "Sin fecha";

  try {
    return new Date(value).toLocaleDateString("es-CO");
  } catch {
    return value;
  }
}

function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Sin valor";

  const parsed =
    typeof value === "number" ? value : Number(String(value).replace(/[^\d.]/g, ""));

  if (!Number.isFinite(parsed)) return "Sin valor";

  return `$ ${parsed.toLocaleString("es-CO")}`;
}

function initials(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function resolveFinancieras(registro: RegistroVendedorDetalle) {
  if (
    Array.isArray(registro.financierasDetalle) &&
    registro.financierasDetalle.length > 0
  ) {
    return registro.financierasDetalle;
  }

  return [
    {
      plataformaCredito: registro.plataformaCredito,
      creditoAutorizado: registro.creditoAutorizado,
      cuotaInicial: registro.cuotaInicial,
      tipoPagoInicial: registro.medioPago1Tipo,
      valorCuota: registro.valorCuota,
      numeroCuotas: registro.numeroCuotas,
      frecuenciaCuota: registro.frecuenciaCuota,
    },
  ].filter((item) => item.plataformaCredito || item.creditoAutorizado !== null);
}

function esServicioContado(value: unknown) {
  return String(value || "").trim().toUpperCase() === "CONTADO";
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const visible = value && String(value).trim().length > 0 ? value : "Sin dato";

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-[#f8fafc] px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1.5 break-words text-sm font-semibold leading-5 text-slate-950">
        {visible}
      </p>
    </div>
  );
}

function SectionHeading({
  description,
  icon,
  title,
}: {
  description: string;
  icon: DashboardIconName;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
        <DashboardIcon name={icon} className="h-5 w-5" />
      </span>
      <div>
        <h3 className="text-base font-black text-slate-950">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function SummaryCell({
  icon,
  label,
  value,
}: {
  icon: DashboardIconName;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <DashboardIcon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-bold text-slate-950">
          {value && String(value).trim().length > 0 ? value : "Sin dato"}
        </p>
      </div>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  const normalized = label.trim().toUpperCase();
  const positive = ["COMPLETADO", "APROBADO", "FINALIZADO", "VENDIDO"].some(
    (status) => normalized.includes(status)
  );

  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
        positive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function AttachmentCard({
  alt,
  children,
  src,
  title,
}: {
  alt: string;
  children?: ReactNode;
  src: string | null;
  title: string;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-[#f8fafc]">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <DashboardIcon name="document" className="h-4 w-4 text-slate-500" />
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-700">
          {title}
        </p>
      </div>
      <div className="p-3">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className="h-44 w-full rounded-xl border border-slate-200 bg-white object-contain"
          />
        ) : (
          <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-5 text-center text-sm text-slate-500">
            {children ?? "Sin archivo cargado."}
          </div>
        )}
      </div>
    </article>
  );
}

export default function BuscarRegistroWorkspace({ session }: { session: SessionProps }) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<RegistroVendedorDetalle[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [buscando, setBuscando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);

  const rolNormalizado = String(session.rolNombre || "").trim().toUpperCase();
  const puedeEliminar = rolNormalizado === "ADMIN";
  const esAdministrador = rolNormalizado === "ADMIN" || rolNormalizado === "AUDITOR";
  const coverageLabel = esAdministrador ? "Todas las sedes" : session.sedeNombre;

  const navigationItems = useMemo<NavigationItem[]>(() => {
    const base: NavigationItem[] = [
      { href: "/dashboard", icon: "home", label: "Inicio" },
      { href: "/ventas", icon: "sales", label: "Ventas" },
      { href: "/inventario", icon: "inventory", label: "Inventario" },
      { href: "/prestamos", icon: "loans", label: "Préstamos" },
      { href: "/caja", icon: "cash", label: "Caja" },
      { href: "/dashboard/aprobaciones", icon: "approvals", label: "Aprobaciones" },
      { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
    ];

    if (esAdministrador) {
      base.push({ href: "/dashboard/sedes", icon: "settings", label: "Configuración" });
    }

    return base;
  }, [esAdministrador]);

  const buscarRegistros = async () => {
    const criterio = busqueda.trim();
    const digits = criterio.replace(/\D/g, "");

    if (!digits) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar un IMEI o una cédula para consultar.");
      return;
    }

    try {
      setBuscando(true);
      setBusquedaRealizada(true);
      setMensaje("");

      const res = await fetch(
        `/api/vendedor/registros?buscar=${encodeURIComponent(digits)}`,
        { cache: "no-store" }
      );
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo consultar el registro.");
        setResultados([]);
        return;
      }

      const nextResultados = Array.isArray(data.resultados) ? data.resultados : [];
      setResultados(nextResultados);

      if (nextResultados.length === 0) {
        setMensajeTipo("error");
        setMensaje("No se encontraron registros con ese IMEI o cédula.");
        return;
      }

      setMensajeTipo("success");
      setMensaje(
        nextResultados.length === 1
          ? "Registro encontrado correctamente."
          : `Se encontraron ${nextResultados.length} registros.`
      );
    } catch {
      setMensajeTipo("error");
      setMensaje("Error consultando el registro.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const limpiarBusqueda = () => {
    setBusqueda("");
    setResultados([]);
    setMensaje("");
    setBusquedaRealizada(false);
  };

  const eliminarRegistro = async (id: number) => {
    const confirmar = window.confirm(
      "Vas a eliminar este registro del panel del vendedor. ¿Deseas continuar?"
    );

    if (!confirmar) return;

    try {
      setEliminandoId(id);
      setMensaje("");

      const res = await fetch("/api/vendedor/registros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, modo: "ELIMINAR" }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo eliminar el registro.");
        return;
      }

      setResultados((current) => current.filter((item) => item.id !== id));
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Registro eliminado correctamente.");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error eliminando el registro.");
    } finally {
      setEliminandoId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] font-[Arial,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/ventas"
        coverageLabel={coverageLabel}
        items={navigationItems}
      />

      <main className="min-w-0 lg:pl-[252px]">
        <div className="mx-auto w-full max-w-[1700px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <nav className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-500" aria-label="Ruta de navegación">
                <Link href="/ventas" className="transition hover:text-[#e30613]">
                  Ventas
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-slate-800">Buscar registro</span>
              </nav>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-[34px]">
                Buscar registro
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 sm:text-base">
                Consulta la información registrada por IMEI o documento del cliente.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/vendedor/registros"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-[#c80511]"
              >
                <DashboardIcon name="sales" className="h-4 w-4" />
                Registrar venta
              </Link>
              <div className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {initials(session.perfilNombre || session.nombre) || "US"}
                </span>
                <div className="min-w-0">
                  <p className="max-w-40 truncate text-xs font-bold text-slate-900">
                    {session.perfilNombre || session.nombre}
                  </p>
                  <p className="text-[10px] text-slate-500">{session.perfilTipoLabel}</p>
                </div>
              </div>
              <LogoutButton
                variant="light"
                className="min-h-11 rounded-xl text-xs font-black uppercase tracking-[0.06em]"
              />
            </div>
          </header>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-xl">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e30613]">
                  Consulta de registros
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">
                  Buscar por IMEI o cédula
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Ingresa uno de los dos datos para consultar el registro completo sin modificar su información.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                <DashboardIcon name="store" className="h-4 w-4 text-[#e30613]" />
                Cobertura: <span className="font-black text-slate-900">{coverageLabel}</span>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px]">
              <div className="relative">
                <DashboardIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void buscarRegistros();
                    }
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="IMEI o cédula"
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-12 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#e30613] focus:ring-4 focus:ring-red-50"
                  placeholder="Escribe el IMEI o número de documento"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={limpiarBusqueda}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <DashboardIcon name="close" className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => void buscarRegistros()}
                disabled={buscando}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#11161d] px-5 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#e30613] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <DashboardIcon name="search" className="h-4 w-4" />
                {buscando ? "Buscando..." : "Buscar registro"}
              </button>
            </div>
          </section>

          {mensaje && (
            <div
              role={mensajeTipo === "error" ? "alert" : "status"}
              className={[
                "mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold",
                mensajeTipo === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800",
              ].join(" ")}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80">
                <DashboardIcon
                  name={mensajeTipo === "success" ? "approvals" : "warning"}
                  className="h-4 w-4"
                />
              </span>
              {mensaje}
            </div>
          )}

          <section className="mt-5 space-y-5" aria-live="polite">
            {buscando && (
              <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <div className="h-4 w-32 rounded bg-slate-200" />
                <div className="mt-4 h-8 w-72 max-w-full rounded bg-slate-200" />
                <div className="mt-6 grid gap-3 md:grid-cols-4">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className="h-16 rounded-xl bg-slate-100" />
                  ))}
                </div>
              </div>
            )}

            {!buscando && !busquedaRealizada && (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-[#e30613]">
                  <DashboardIcon name="search" className="h-7 w-7" />
                </span>
                <h2 className="mt-4 text-lg font-black text-slate-950">
                  Consulta un registro comercial
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                  Usa el IMEI del equipo o el documento del cliente. Los datos solo se mostrarán y no cambiarán durante la consulta.
                </p>
              </div>
            )}

            {!buscando && busquedaRealizada && resultados.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <DashboardIcon name="warning" className="h-7 w-7" />
                </span>
                <h2 className="mt-4 text-lg font-black">No encontramos coincidencias</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Verifica el número ingresado e intenta nuevamente.
                </p>
                <button
                  type="button"
                  onClick={limpiarBusqueda}
                  className="mt-5 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-slate-800 transition hover:border-[#e30613] hover:text-[#e30613]"
                >
                  Nueva búsqueda
                </button>
              </div>
            )}

            {!buscando &&
              resultados.map((registro) => {
                const financieras = resolveFinancieras(registro);
                const estadoVenta = String(registro.estadoVentaRegistro || "PENDIENTE")
                  .replace(/_/g, " ")
                  .trim();

                return (
                  <article
                    key={registro.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
                  >
                    <header className="border-b border-slate-200 px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700">
                              Registro #{registro.id}
                            </span>
                            <StatusPill label={`Venta: ${estadoVenta}`} />
                          </div>
                          <h2 className="mt-3 break-words text-2xl font-black tracking-tight text-slate-950">
                            {registro.clienteNombre}
                          </h2>
                          <p className="mt-1.5 text-xs leading-5 text-slate-500">
                            Cargado el {formatDate(registro.createdAt)}
                            {registro.updatedAt !== registro.createdAt
                              ? ` · Actualizado ${formatDate(registro.updatedAt)}`
                              : ""}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Link
                            href={`/vendedor/registros?editar=${registro.id}`}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#11161d] px-5 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#e30613]"
                          >
                            <DashboardIcon name="document" className="h-4 w-4" />
                            Modificar
                          </Link>
                          {puedeEliminar && (
                            <button
                              type="button"
                              onClick={() => void eliminarRegistro(registro.id)}
                              disabled={eliminandoId === registro.id}
                              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-xs font-black uppercase tracking-[0.08em] text-[#e30613] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              <DashboardIcon name="close" className="h-4 w-4" />
                              {eliminandoId === registro.id ? "Eliminando..." : "Eliminar"}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <SummaryCell
                          icon="store"
                          label="Punto / sede"
                          value={registro.puntoVenta ?? registro.sedeNombre}
                        />
                        <SummaryCell icon="inventory" label="IMEI" value={registro.serialImei} />
                        <SummaryCell
                          icon="catalog"
                          label="Modalidad"
                          value={registro.plataformaCredito}
                        />
                        <SummaryCell icon="user" label="Asesor" value={registro.asesorNombre} />
                      </div>
                    </header>

                    <div className="grid gap-5 p-5 sm:p-6 2xl:grid-cols-2">
                      <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                        <SectionHeading
                          icon="user"
                          title="Datos del cliente"
                          description="Identificación, contacto y ubicación registrados."
                        />
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <Field label="Nombre completo" value={registro.clienteNombre} />
                          <Field
                            label="Documento"
                            value={`${registro.tipoDocumento} ${registro.documentoNumero}`}
                          />
                          <Field label="Correo" value={registro.correo} />
                          <Field label="WhatsApp" value={registro.whatsapp} />
                          <Field label="Teléfono" value={registro.telefono} />
                          <Field label="Ciudad" value={registro.ciudad} />
                          <Field
                            label="Fecha de nacimiento"
                            value={formatDateOnly(registro.fechaNacimiento)}
                          />
                          <Field
                            label="Fecha de expedición"
                            value={formatDateOnly(registro.fechaExpedicion)}
                          />
                          <Field label="Dirección" value={registro.direccion} />
                          <Field label="Barrio" value={registro.barrio} />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                        <SectionHeading
                          icon="inventory"
                          title="Equipo y trámite"
                          description="Información comercial y participantes de la operación."
                        />
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <Field
                            label="Punto / sede"
                            value={registro.puntoVenta ?? registro.sedeNombre}
                          />
                          <Field label="IMEI" value={registro.serialImei} />
                          <Field label="Referencia" value={registro.referenciaEquipo} />
                          <Field label="Almacenamiento" value={registro.almacenamiento} />
                          <Field label="Color" value={registro.color} />
                          <Field label="Tipo de equipo" value={registro.tipoEquipo} />
                          <Field label="Tipo de producto" value={registro.tipoProducto} />
                          <Field label="Asesor" value={registro.asesorNombre} />
                          <Field label="Jalador" value={registro.jaladorNombre} />
                          <Field label="Cerrador" value={registro.cerradorNombre} />
                          <Field label="Registro SIM 1" value={registro.simCardRegistro1} />
                          <Field label="Registro SIM 2" value={registro.simCardRegistro2} />
                          <div className="sm:col-span-2">
                            <Field label="Observación" value={registro.observacion} />
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200 p-4 sm:p-5 2xl:col-span-2">
                        <SectionHeading
                          icon="cash"
                          title="Información financiera"
                          description="Ingresos y financieras guardados en el registro."
                        />

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <Field label="Ingreso 1" value={registro.medioPago1Tipo} />
                          <Field label="Valor ingreso 1" value={formatMoney(registro.medioPago1Valor)} />
                          <Field label="Ingreso 2" value={registro.medioPago2Tipo} />
                          <Field label="Valor ingreso 2" value={formatMoney(registro.medioPago2Valor)} />
                        </div>

                        {financieras.length > 0 ? (
                          <div className="mt-4 grid gap-4 xl:grid-cols-2">
                            {financieras.map((financiera, index) => (
                              <div
                                key={`${registro.id}-financiera-${index}`}
                                className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-4"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-black text-slate-950">
                                    {financiera.plataformaCredito || `Financiera ${index + 1}`}
                                  </p>
                                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                                    {index + 1} de {financieras.length}
                                  </span>
                                </div>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  <Field
                                    label="Crédito autorizado"
                                    value={formatMoney(financiera.creditoAutorizado)}
                                  />
                                  <Field label="Inicial" value={formatMoney(financiera.cuotaInicial)} />
                                  <Field label="Pago inicial" value={financiera.tipoPagoInicial} />
                                  <Field label="Valor cuota" value={formatMoney(financiera.valorCuota)} />
                                  <Field
                                    label="Plazo"
                                    value={
                                      financiera.numeroCuotas
                                        ? `${financiera.numeroCuotas} cuotas`
                                        : "Sin dato"
                                    }
                                  />
                                  <Field label="Frecuencia" value={financiera.frecuenciaCuota} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                            Este registro no tiene financieras asociadas.
                          </p>
                        )}
                      </section>

                      <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                        <SectionHeading
                          icon="approvals"
                          title="Referencias y validaciones"
                          description="Contactos y aceptaciones registradas por el cliente."
                        />
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <Field label="Referencia familiar 1" value={registro.referenciaFamiliar1Nombre} />
                          <Field label="Teléfono referencia 1" value={registro.referenciaFamiliar1Telefono} />
                          <Field label="Referencia familiar 2" value={registro.referenciaFamiliar2Nombre} />
                          <Field label="Teléfono referencia 2" value={registro.referenciaFamiliar2Telefono} />
                          <Field label="Acepta intermediación" value={registro.aceptaDeclaracionIntermediacion ? "Sí" : "No"} />
                          <Field label="Acepta política de garantía" value={registro.aceptaPoliticaGarantia ? "Sí" : "No"} />
                          <Field label="Acepta condiciones de crédito" value={registro.aceptaCondicionesCredito ? "Sí" : "No"} />
                          <Field label="Confirmación del cliente" value={registro.confirmacionCliente ? "Sí" : "No"} />
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                        <SectionHeading
                          icon="document"
                          title="Documentos adjuntos"
                          description="Evidencias almacenadas junto con el registro."
                        />
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <AttachmentCard
                            title="Firma del cliente"
                            src={registro.firmaClienteDataUrl}
                            alt="Firma del cliente"
                          />
                          <AttachmentCard
                            title="Foto de entrega"
                            src={registro.fotoEntregaDataUrl}
                            alt="Foto de entrega"
                          />

                          {esServicioContado(registro.plataformaCredito) ? (
                            <AttachmentCard
                              title="Soporte de la venta"
                              src={registro.facturaFotoDataUrl}
                              alt="Soporte de la venta"
                            />
                          ) : (
                            <>
                              <AttachmentCard
                                title="Cédula frente"
                                src={registro.clienteSinCedulaFisica ? null : registro.cedulaFrenteDataUrl}
                                alt="Cédula frente"
                              >
                                {registro.clienteSinCedulaFisica
                                  ? "Cliente reportado sin cédula física."
                                  : "Sin foto frontal cargada."}
                              </AttachmentCard>
                              <AttachmentCard
                                title="Cédula reverso"
                                src={registro.clienteSinCedulaFisica ? null : registro.cedulaReversoDataUrl}
                                alt="Cédula reverso"
                              >
                                {registro.clienteSinCedulaFisica
                                  ? "Cliente reportado sin cédula física."
                                  : "Sin foto posterior cargada."}
                              </AttachmentCard>
                            </>
                          )}
                        </div>
                      </section>
                    </div>
                  </article>
                );
              })}
          </section>
        </div>
      </main>
    </div>
  );
}
