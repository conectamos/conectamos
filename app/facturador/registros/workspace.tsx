"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type RegistroFacturacion = {
  id: number;
  createdAt: string;
  puntoVenta: string | null;
  clienteNombre: string;
  tipoDocumento: string;
  documentoNumero: string;
  plataformaCredito: string;
  referenciaEquipo: string | null;
  serialImei: string | null;
  tipoEquipo: string | null;
  jaladorNombre: string | null;
  numeroFactura: string | null;
  financierasDetalle: Array<{
    plataformaCredito?: string;
  }> | null;
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

function resolveFinancieras(registro: RegistroFacturacion) {
  const detalle = Array.isArray(registro.financierasDetalle)
    ? registro.financierasDetalle
        .map((item) => String(item?.plataformaCredito || "").trim())
        .filter(Boolean)
    : [];

  return detalle.length > 0 ? detalle.join(", ") : registro.plataformaCredito;
}

export default function FacturadorRegistrosWorkspace({
  session,
}: {
  session: SessionProps;
}) {
  const [registros, setRegistros] = useState<RegistroFacturacion[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<number | null>(null);
  const [facturasDraft, setFacturasDraft] = useState<Record<number, string>>({});

  const cargarRegistros = async () => {
    try {
      const res = await fetch("/api/facturador/registros", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudieron cargar los registros");
        return;
      }

      const nextRegistros = Array.isArray(data.registros) ? data.registros : [];

      setRegistros(nextRegistros);
      setFacturasDraft((current) => {
        const next = { ...current };

        for (const item of nextRegistros) {
          next[item.id] = current[item.id] ?? item.numeroFactura ?? "";
        }

        return next;
      });
    } catch {
      setMensajeTipo("error");
      setMensaje("Error cargando registros");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarRegistros();
  }, []);

  const pendientes = useMemo(
    () => registros.filter((item) => !item.numeroFactura).length,
    [registros]
  );

  const facturados = registros.length - pendientes;

  const guardarFactura = async (registroId: number) => {
    const numeroFactura = String(facturasDraft[registroId] || "").trim();

    if (!numeroFactura) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el numero de factura");
      return;
    }

    try {
      setGuardandoId(registroId);
      setMensaje("");

      const res = await fetch("/api/facturador/registros", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: registroId,
          numeroFactura,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo guardar el numero de factura");
        return;
      }

      setRegistros((current) =>
        current.map((item) =>
          item.id === registroId
            ? {
                ...item,
                numeroFactura,
              }
            : item
        )
      );
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Numero de factura actualizado");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error guardando numero de factura");
    } finally {
      setGuardandoId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_52%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Facturacion
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                REGISTROS GUARDADOS
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                Revisa los registros capturados por los asesores en todas las sedes,
                agrega el numero de factura y deja marcada la fila como facturada.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver a CONECTAMOS
              </Link>
            </div>
          </div>
        </section>

        {mensaje && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-4 text-sm font-medium shadow-sm ${
              mensajeTipo === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            {mensaje}
          </div>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Perfil
            </p>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {session.perfilNombre}
            </p>
            <p className="mt-2 text-sm text-slate-500">{session.perfilTipoLabel}</p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pendientes
            </p>
            <p className="mt-2 text-2xl font-black tracking-tight text-amber-600">
              {pendientes}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Registros globales sin numero de factura.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Facturados
            </p>
            <p className="mt-2 text-2xl font-black tracking-tight text-emerald-600">
              {facturados}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Filas globales en verde con numero de factura.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Tabla horizontal
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Registros para facturar
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Cuando agregas el numero de factura, la fila queda marcada en verde.
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[1320px] border-separate border-spacing-y-3">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Punto / sede</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Documento</th>
                  <th className="px-4 py-2">Financieras</th>
                  <th className="px-4 py-2">IMEI</th>
                  <th className="px-4 py-2">Referencia</th>
                  <th className="px-4 py-2">Tipo equipo</th>
                  <th className="px-4 py-2">Jalador</th>
                  <th className="px-4 py-2">Numero de factura</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Accion</th>
                </tr>
              </thead>

              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-sm text-slate-500">
                      Cargando registros...
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-sm text-slate-500">
                      No hay registros guardados para facturar.
                    </td>
                  </tr>
                ) : (
                  registros.map((registro) => {
                    const facturado = Boolean(registro.numeroFactura);
                    const draft = facturasDraft[registro.id] ?? registro.numeroFactura ?? "";

                    return (
                      <tr
                        key={registro.id}
                        className={`rounded-[24px] ${
                          facturado
                            ? "bg-emerald-50 text-emerald-950"
                            : "bg-slate-50 text-slate-900"
                        }`}
                      >
                        <td className="rounded-l-[24px] border-y border-l border-slate-200 px-4 py-4 text-sm">
                          {formatDate(registro.createdAt)}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.puntoVenta || "Sin punto"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm font-semibold">
                          {registro.clienteNombre}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.tipoDocumento} {registro.documentoNumero}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {resolveFinancieras(registro)}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.serialImei || "Sin IMEI"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.referenciaEquipo || "Sin referencia"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.tipoEquipo || "Sin tipo"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.jaladorNombre || "Sin jalador"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4">
                          <input
                            value={draft}
                            onChange={(event) =>
                              setFacturasDraft((current) => ({
                                ...current,
                                [registro.id]: event.target.value,
                              }))
                            }
                            className={`w-48 rounded-2xl border px-4 py-3 text-sm outline-none transition ${
                              facturado
                                ? "border-emerald-300 bg-white text-emerald-950 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                : "border-slate-300 bg-white text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                            }`}
                            placeholder="Factura"
                          />
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                              facturado
                                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {facturado ? "Facturado" : "Pendiente"}
                          </span>
                        </td>
                        <td className="rounded-r-[24px] border-y border-r border-slate-200 px-4 py-4">
                          <button
                            type="button"
                            onClick={() => void guardarFactura(registro.id)}
                            disabled={guardandoId === registro.id || !String(draft).trim()}
                            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                              facturado
                                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                                : "bg-slate-900 text-white hover:bg-slate-800"
                            } disabled:cursor-not-allowed disabled:bg-slate-300`}
                          >
                            {guardandoId === registro.id ? "Guardando..." : "Guardar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
