"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

export default function VentasAprobacionesWorkspace({
  session,
}: {
  session: SessionProps;
}) {
  const [registros, setRegistros] = useState<RegistroAprobacion[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);

  const esAdmin = String(session.rolNombre || "").trim().toUpperCase() === "ADMIN";

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

  return (
    <div className="min-h-screen bg-[#eef2f7] px-4 py-8">
      <div className="mx-auto max-w-[1840px]">
        <section className="overflow-hidden rounded-[34px] bg-[linear-gradient(135deg,#0f172a_0%,#111827_54%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Aprobacion de ventas
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Registros por aprobar
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 md:text-base">
                {esAdmin
                  ? "Consulta los registros digitales que subieron los vendedores y abre la venta real para completarla."
                  : `Consulta los registros digitales de ${session.sedeNombre} y continua la venta real desde aqui.`}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {esAdmin && (
                <Link
                  href="/dashboard/registros"
                  className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Gestionar registros
                </Link>
              )}
              <Link
                href="/ventas/nuevo"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Nueva venta
              </Link>
              <Link
                href="/ventas"
                className="rounded-2xl bg-white px-5 py-3 text-center text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Volver a ventas
              </Link>
            </div>
          </div>
        </section>

        {mensaje && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {mensaje}
          </div>
        )}

        <section className="mt-6 rounded-[30px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Filtro rapido
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                Buscar por cliente, cédula o IMEI
              </h2>
            </div>

            <div className="flex w-full flex-col gap-3 lg:w-[420px]">
              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Cliente, cédula, IMEI o referencia"
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="button"
                onClick={() => void cargarRegistros(busqueda)}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Buscar
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Pendientes
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
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
            <table className="min-w-[1460px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-4 text-left font-semibold">Fecha</th>
                  <th className="px-5 py-4 text-left font-semibold">Punto / Sede</th>
                  <th className="px-5 py-4 text-left font-semibold">Cliente</th>
                  <th className="px-5 py-4 text-left font-semibold">Equipo</th>
                  <th className="px-5 py-4 text-left font-semibold">Asesor</th>
                  <th className="px-5 py-4 text-left font-semibold">Financieras</th>
                  <th className="px-5 py-4 text-left font-semibold">Facturacion</th>
                  <th className="px-5 py-4 text-left font-semibold">Accion</th>
                </tr>
              </thead>

              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-slate-500">
                      Cargando registros...
                    </td>
                  </tr>
                ) : registrosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
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
                      <td className="px-5 py-5">
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
                        </div>
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
                          className="inline-flex rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
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
      </div>
    </div>
  );
}
