"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  rolNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type FinancieraRegistro = {
  plataformaCredito?: string;
  creditoAutorizado?: string | number | null;
};

type RegistroAprobacion = {
  id: number;
  createdAt: string;
  puntoVenta: string | null;
  clienteNombre: string;
  tipoDocumento: string;
  documentoNumero: string;
  referenciaEquipo: string | null;
  serialImei: string | null;
  asesorNombre: string | null;
  jaladorNombre: string | null;
  numeroFactura: string | null;
  estadoFacturacion: string | null;
  estadoVentaRegistro: string | null;
  observacion: string | null;
  plataformaCredito: string | null;
  medioPago1Tipo: string | null;
  medioPago1Valor: string | number | null;
  medioPago2Tipo: string | null;
  medioPago2Valor: string | number | null;
  financierasDetalle: FinancieraRegistro[];
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Sin valor";
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^\d.]/g, ""));

  if (!Number.isFinite(parsed)) {
    return "Sin valor";
  }

  return `$ ${parsed.toLocaleString("es-CO")}`;
}

function esRegistroContado(registro: Pick<RegistroAprobacion, "plataformaCredito">) {
  const servicio = String(registro.plataformaCredito || "").trim().toUpperCase();
  return (
    servicio === "CONTADO" ||
    servicio === "CONTADO CLARO" ||
    servicio === "CONTADO LIBRES"
  );
}

function totalIngresosRegistro(registro: RegistroAprobacion) {
  const primero = Number(registro.medioPago1Valor ?? 0);
  const segundo = Number(registro.medioPago2Valor ?? 0);
  return (Number.isFinite(primero) ? primero : 0) + (Number.isFinite(segundo) ? segundo : 0);
}

export default function VentasAprobacionesWorkspace({
  session,
}: {
  session: SessionProps;
}) {
  const [registros, setRegistros] = useState<RegistroAprobacion[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(String(session.rolNombre || "").trim().toUpperCase());

  const cargarRegistros = async (termino = "") => {
    try {
      setCargando(true);
      const params = new URLSearchParams();

      if (termino.trim()) {
        params.set("q", termino.trim());
      }

      const endpoint = params.size
        ? `/api/ventas/aprobaciones?${params.toString()}`
        : "/api/ventas/aprobaciones";

      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudieron cargar las aprobaciones");
        setRegistros([]);
        return;
      }

      setMensaje("");
      setRegistros(Array.isArray(data.registros) ? data.registros : []);
    } catch {
      setMensaje("Error cargando aprobaciones de ventas");
      setRegistros([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarRegistros();
  }, []);

  const registrosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    if (!termino) {
      return registros;
    }

    return registros.filter((registro) => {
      const base = [
        registro.clienteNombre,
        registro.documentoNumero,
        registro.serialImei,
        registro.referenciaEquipo,
        registro.puntoVenta,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return base.includes(termino);
    });
  }, [busqueda, registros]);

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
    {
      href: esAdmin ? "/dashboard/reportes" : "/dashboard/analitico",
      icon: "reports",
      label: "Reportes",
    },
    ...(esAdmin
      ? ([
          {
            href: "/dashboard/sedes",
            icon: "settings",
            label: "Configuración",
          },
        ] satisfies NavigationItem[])
      : []),
  ];
  const inicialesUsuario = String(session.nombre || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/dashboard/aprobaciones"
        coverageLabel={esAdmin ? "Todas las sedes" : session.sedeNombre}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                Registros por aprobar
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                {esAdmin
                  ? "Revisa los registros digitales y completa la venta real"
                  : `Registros digitales pendientes de ${session.sedeNombre}`}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Cobertura: {esAdmin ? "Todas las sedes" : session.sedeNombre}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  {cargando
                    ? "Actualizando registros"
                    : `${registrosFiltrados.length} pendientes visibles`}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/ventas/nuevo"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#bd0711]"
              >
                <span className="text-lg leading-none">+</span>
                Nueva venta
              </Link>
              {esAdmin && (
                <Link
                  href="/dashboard/registros"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
                >
                  Gestionar registros
                </Link>
              )}
              <Link
                href="/ventas"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
              >
                Volver a ventas
              </Link>
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[185px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || <DashboardIcon name="user" className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {session.nombre}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {session.rolNombre || session.perfilTipoLabel}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-12 shrink-0 rounded-xl" />
            </div>
          </header>

        {mensaje && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-800 shadow-sm" role="alert">
            {mensaje}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Filtro rápido
              </p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                Buscar por cliente, cédula o IMEI
              </h2>
            </div>

            <div className="flex w-full flex-col gap-3 lg:w-[420px]">
              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Cliente, cédula, IMEI o referencia"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
              />
              <button
                type="button"
                onClick={() => void cargarRegistros(busqueda)}
                className="rounded-xl bg-[#11161d] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#e30613]"
              >
                Buscar
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
              Pendientes
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Registros listos para completar
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {registrosFiltrados.length} registro{registrosFiltrados.length === 1 ? "" : "s"} visible{registrosFiltrados.length === 1 ? "" : "s"}.
            </p>
            {esAdmin && (
              <p className="mt-2 text-sm text-slate-500">
                Como administrador puedes gestionar todos los registros desde el panel de facturacion.
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1620px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-4 text-left font-semibold">Fecha</th>
                  <th className="px-5 py-4 text-left font-semibold">Punto / Sede</th>
                  <th className="px-5 py-4 text-left font-semibold">Cliente</th>
                  <th className="px-5 py-4 text-left font-semibold">Equipo</th>
                  <th className="px-5 py-4 text-left font-semibold">Asesor</th>
                  <th className="px-5 py-4 text-left font-semibold">Observacion</th>
                  <th className="px-5 py-4 text-left font-semibold">Financieras</th>
                  <th className="px-5 py-4 text-left font-semibold">Facturacion</th>
                  <th className="px-5 py-4 text-left font-semibold">Accion</th>
                </tr>
              </thead>

              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-slate-500">
                      Cargando registros...
                    </td>
                  </tr>
                ) : registrosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <p className="text-base font-semibold text-slate-900">
                        No hay registros pendientes para esta vista
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        Cuando un vendedor suba una venta de tu sede, aparecera aqui.
                      </p>
                    </td>
                  </tr>
                ) : (
                  registrosFiltrados.map((registro) => (
                    <tr
                      key={registro.id}
                      className="border-t border-slate-200 align-top transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-5 text-slate-700">
                        {formatDate(registro.createdAt)}
                      </td>
                      <td className="px-5 py-5 font-semibold text-slate-900">
                        {registro.puntoVenta || "Sin punto"}
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-semibold text-slate-950">
                          {registro.clienteNombre}
                        </p>
                        <p className="mt-1 text-slate-500">
                          {registro.tipoDocumento} {registro.documentoNumero}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-semibold text-slate-950">
                          {registro.referenciaEquipo || "Sin referencia"}
                        </p>
                        <p className="mt-1 text-slate-500">
                          IMEI: {registro.serialImei || "Sin IMEI"}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-semibold text-slate-900">
                          {registro.asesorNombre || "Sin asesor"}
                        </p>
                        <p className="mt-1 text-slate-500">
                          Jalador: {registro.jaladorNombre || "Sin jalador"}
                        </p>
                      </td>
                      <td className="px-5 py-5 text-slate-700">
                        <p className="max-w-[260px] leading-6">
                          {registro.observacion || "Sin observacion"}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        {esRegistroContado(registro) ? (
                          <div className="min-w-48">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                              CONTADO
                            </div>
                            <div className="mt-1 font-semibold text-slate-900">
                              {formatMoney(totalIngresosRegistro(registro))}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {[registro.medioPago1Tipo, registro.medioPago2Tipo]
                                .filter(Boolean)
                                .join(" / ") || "Sin detalle"}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {registro.financierasDetalle.map((item, index) => (
                              <div key={`${registro.id}-fin-${index}`} className="min-w-48">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  {item.plataformaCredito || `Financiera ${index + 1}`}
                                </div>
                                <div className="mt-1 font-semibold text-slate-900">
                                  {formatMoney(item.creditoAutorizado)}
                                </div>
                              </div>
                            ))}
                            {(registro.medioPago1Valor || registro.medioPago2Valor) && (
                              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                                <div className="font-semibold uppercase tracking-[0.14em]">
                                  Inicial
                                </div>
                                <div className="mt-1">
                                  {registro.medioPago1Tipo || "INGRESO 1"}:{" "}
                                  {formatMoney(registro.medioPago1Valor)}
                                </div>
                                {registro.medioPago2Valor && (
                                  <div className="mt-1">
                                    {registro.medioPago2Tipo || "INGRESO 2"}:{" "}
                                    {formatMoney(registro.medioPago2Valor)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-5">
                        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {registro.estadoFacturacion || "PENDIENTE"}
                        </div>
                        <p className="mt-2 text-slate-500">
                          Factura: {registro.numeroFactura || "Pendiente"}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        <Link
                          href={`/ventas/nuevo?registroId=${registro.id}`}
                          className="inline-flex rounded-xl bg-[#e30613] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#bd0711]"
                        >
                          Completar venta
                        </Link>
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
