"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  financieraRequiereInicial,
  PLATAFORMAS_CREDITO,
  formatearPesoInput,
} from "@/lib/vendor-sale-records";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type FinancieraRegistro = {
  plataformaCredito?: string;
  creditoAutorizado?: string | number | null;
  cuotaInicial?: string | number | null;
};

type RegistroFacturacion = {
  id: number;
  createdAt: string;
  puntoVenta: string | null;
  clienteNombre: string;
  tipoDocumento: string;
  documentoNumero: string;
  correo: string | null;
  whatsapp: string | null;
  direccion: string | null;
  barrio: string | null;
  plataformaCredito: string;
  creditoAutorizado: number | null;
  cuotaInicial: number | null;
  referenciaEquipo: string | null;
  serialImei: string | null;
  tipoEquipo: string | null;
  jaladorNombre: string | null;
  numeroFactura: string | null;
  estadoFacturacion: string | null;
  financierasDetalle: FinancieraRegistro[] | null;
};

type EditFinancieraState = {
  plataformaCredito: string;
  creditoAutorizado: string;
  cuotaInicial: string;
};

type EditDraft = {
  id: number;
  documentoNumero: string;
  clienteNombre: string;
  correo: string;
  whatsapp: string;
  direccion: string;
  barrio: string;
  referenciaEquipo: string;
  serialImei: string;
  numeroFactura: string;
  estadoFacturacion: string;
  financierasDetalle: EditFinancieraState[];
};

const ESTADO_OPTIONS = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "FACTURADO", label: "Facturado" },
  { value: "NOTA_CREDITO", label: "Nota credito" },
] as const;

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

function onlyDigits(value: string, maxLength?: number) {
  const digits = value.replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
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

function resolveFinancieras(registro: RegistroFacturacion) {
  const detalle = Array.isArray(registro.financierasDetalle)
    ? registro.financierasDetalle
        .map((item) => ({
          plataformaCredito: String(item?.plataformaCredito || "").trim(),
          creditoAutorizado: item?.creditoAutorizado ?? null,
          cuotaInicial: item?.cuotaInicial ?? null,
        }))
        .filter(
          (item) =>
            item.plataformaCredito ||
            item.creditoAutorizado !== null ||
            item.cuotaInicial !== null
        )
    : [];

  if (detalle.length > 0) {
    return detalle;
  }

  return [
    {
      plataformaCredito: registro.plataformaCredito,
      creditoAutorizado: registro.creditoAutorizado,
      cuotaInicial: registro.cuotaInicial,
    },
  ].filter((item) => item.plataformaCredito || item.creditoAutorizado !== null);
}

function resolveEstadoBadge(estadoFacturacion: string | null, numeroFactura: string | null) {
  const estado = String(estadoFacturacion || "").trim().toUpperCase();

  if (estado === "NOTA_CREDITO") {
    return {
      label: "Nota credito",
      rowClass: "bg-amber-50 text-amber-950",
      pillClass: "border-amber-200 bg-amber-100 text-amber-700",
      inputClass:
        "border-amber-300 bg-white text-amber-950 focus:border-amber-500 focus:ring-2 focus:ring-amber-100",
      buttonClass: "bg-amber-600 text-white hover:bg-amber-500",
    };
  }

  if (estado === "FACTURADO" || numeroFactura) {
    return {
      label: "Facturado",
      rowClass: "bg-emerald-50 text-emerald-950",
      pillClass: "border-emerald-200 bg-emerald-100 text-emerald-700",
      inputClass:
        "border-emerald-300 bg-white text-emerald-950 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100",
      buttonClass: "bg-emerald-600 text-white hover:bg-emerald-500",
    };
  }

  return {
    label: "Pendiente",
    rowClass: "bg-slate-50 text-slate-900",
    pillClass: "border-amber-200 bg-amber-50 text-amber-700",
    inputClass:
      "border-slate-300 bg-white text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100",
    buttonClass: "bg-slate-900 text-white hover:bg-slate-800",
  };
}

function createEditDraft(registro: RegistroFacturacion): EditDraft {
  const financieras = resolveFinancieras(registro).map((item) => ({
    plataformaCredito: item.plataformaCredito,
    creditoAutorizado: formatearPesoInput(item.creditoAutorizado ?? ""),
    cuotaInicial:
      item.cuotaInicial === null || item.cuotaInicial === undefined
        ? ""
        : formatearPesoInput(item.cuotaInicial),
  }));

  return {
    id: registro.id,
    documentoNumero: registro.documentoNumero,
    clienteNombre: registro.clienteNombre,
    correo: registro.correo ?? "",
    whatsapp: registro.whatsapp ?? "",
    direccion: registro.direccion ?? "",
    barrio: registro.barrio ?? "",
    referenciaEquipo: registro.referenciaEquipo ?? "",
    serialImei: registro.serialImei ?? "",
    numeroFactura: registro.numeroFactura ?? "",
    estadoFacturacion: registro.estadoFacturacion ?? (registro.numeroFactura ? "FACTURADO" : "PENDIENTE"),
    financierasDetalle: financieras.length > 0
      ? financieras
      : [
          {
            plataformaCredito: "",
            creditoAutorizado: "",
            cuotaInicial: "",
          },
        ],
  };
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
  const [editando, setEditando] = useState<EditDraft | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

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
    () =>
      registros.filter(
        (item) =>
          resolveEstadoBadge(item.estadoFacturacion, item.numeroFactura).label ===
          "Pendiente"
      ).length,
    [registros]
  );

  const facturados = useMemo(
    () =>
      registros.filter(
        (item) =>
          resolveEstadoBadge(item.estadoFacturacion, item.numeroFactura).label ===
          "Facturado"
      ).length,
    [registros]
  );

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

      const registroActualizado = data.registro as RegistroFacturacion;

      setRegistros((current) =>
        current.map((item) =>
          item.id === registroId ? registroActualizado : item
        )
      );
      setFacturasDraft((current) => ({
        ...current,
        [registroId]: registroActualizado.numeroFactura ?? numeroFactura,
      }));
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Numero de factura actualizado");
    } catch {
      setMensajeTipo("error");
      setMensaje("Error guardando numero de factura");
    } finally {
      setGuardandoId(null);
    }
  };

  const guardarEdicion = async () => {
    if (!editando) {
      return;
    }

    if (!editando.documentoNumero.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el numero de cedula");
      return;
    }

    if (!editando.clienteNombre.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el nombre completo");
      return;
    }

    if (!editando.direccion.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar la direccion");
      return;
    }

    if (!editando.barrio.trim()) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar el barrio");
      return;
    }

    if (
      (editando.estadoFacturacion === "FACTURADO" ||
        editando.estadoFacturacion === "NOTA_CREDITO") &&
      !editando.numeroFactura.trim()
    ) {
      setMensajeTipo("error");
      setMensaje("Debes conservar el numero de factura para ese estado");
      return;
    }

    try {
      setGuardandoEdicion(true);
      setMensaje("");

      const res = await fetch("/api/facturador/registros", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          modo: "EDITAR",
          id: editando.id,
          documentoNumero: editando.documentoNumero,
          clienteNombre: editando.clienteNombre,
          correo: editando.correo,
          whatsapp: editando.whatsapp,
          direccion: editando.direccion,
          barrio: editando.barrio,
          referenciaEquipo: editando.referenciaEquipo,
          serialImei: editando.serialImei,
          numeroFactura: editando.numeroFactura,
          estadoFacturacion: editando.estadoFacturacion,
          financierasDetalle: editando.financierasDetalle,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensajeTipo("error");
        setMensaje(data.error || "No se pudo actualizar el registro");
        return;
      }

      const registroActualizado = data.registro as RegistroFacturacion;

      setRegistros((current) =>
        current.map((item) =>
          item.id === registroActualizado.id ? registroActualizado : item
        )
      );
      setFacturasDraft((current) => ({
        ...current,
        [registroActualizado.id]: registroActualizado.numeroFactura ?? "",
      }));
      setMensajeTipo("success");
      setMensaje(data.mensaje || "Registro actualizado correctamente");
      setEditando(null);
    } catch {
      setMensajeTipo("error");
      setMensaje("Error actualizando el registro");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto w-full max-w-none">
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
                Puedes revisar los datos, guardar la factura y modificar el registro
                si necesitas hacer una nota credito.
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[2360px] border-separate border-spacing-y-3">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Punto / sede</th>
                  <th className="px-4 py-2">Numero de cedula</th>
                  <th className="px-4 py-2">Nombre completo</th>
                  <th className="px-4 py-2">Correo electronico</th>
                  <th className="px-4 py-2">WhatsApp</th>
                  <th className="px-4 py-2">Direccion</th>
                  <th className="px-4 py-2">Barrio</th>
                  <th className="px-4 py-2">Referencia</th>
                  <th className="px-4 py-2">IMEI</th>
                  <th className="px-4 py-2">Inicial</th>
                  <th className="px-4 py-2">
                    Creditos autorizados / financiera
                  </th>
                  <th className="px-4 py-2">Numero de factura</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Accion</th>
                </tr>
              </thead>

              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={15} className="px-4 py-8 text-sm text-slate-500">
                      Cargando registros...
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-4 py-8 text-sm text-slate-500">
                      No hay registros guardados para facturar.
                    </td>
                  </tr>
                ) : (
                  registros.map((registro) => {
                    const estado = resolveEstadoBadge(
                      registro.estadoFacturacion,
                      registro.numeroFactura
                    );
                    const draft = facturasDraft[registro.id] ?? registro.numeroFactura ?? "";
                    const financieras = resolveFinancieras(registro);
                    const financierasConInicial = financieras.filter(
                      (item, index) =>
                        financieraRequiereInicial(index) &&
                        item.cuotaInicial !== null &&
                        item.cuotaInicial !== undefined &&
                        item.cuotaInicial !== ""
                    );

                    return (
                      <tr
                        key={registro.id}
                        className={`rounded-[24px] ${estado.rowClass}`}
                      >
                        <td className="rounded-l-[24px] border-y border-l border-slate-200 px-4 py-4 text-sm">
                          {formatDate(registro.createdAt)}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.puntoVenta || "Sin punto"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.documentoNumero}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm font-semibold">
                          {registro.clienteNombre}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.correo || "Sin correo"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.whatsapp || "Sin WhatsApp"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.direccion || "Sin direccion"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.barrio || "Sin barrio"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.referenciaEquipo || "Sin referencia"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {registro.serialImei || "Sin IMEI"}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          {financierasConInicial.length > 0 ? (
                            <div className="space-y-2">
                              {financierasConInicial.map((item, index) => (
                                <div
                                  key={`${registro.id}-inicial-${index}`}
                                  className="min-w-40"
                                >
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {item.plataformaCredito || `Financiera ${index + 1}`}
                                  </div>
                                  <div className="mt-1 font-semibold text-slate-900">
                                    {formatMoney(item.cuotaInicial)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500">No aplica</span>
                          )}
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4 text-sm">
                          <div className="space-y-2">
                            {financieras.map((item, index) => (
                              <div key={`${registro.id}-credito-${index}`} className="min-w-48">
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
                        <td className="border-y border-slate-200 px-4 py-4">
                          <input
                            value={draft}
                            onChange={(event) =>
                              setFacturasDraft((current) => ({
                                ...current,
                                [registro.id]: event.target.value,
                              }))
                            }
                            className={`w-48 rounded-2xl border px-4 py-3 text-sm outline-none transition ${estado.inputClass}`}
                            placeholder="Factura"
                          />
                        </td>
                        <td className="border-y border-slate-200 px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${estado.pillClass}`}
                          >
                            {estado.label}
                          </span>
                        </td>
                        <td className="rounded-r-[24px] border-y border-r border-slate-200 px-4 py-4">
                          <div className="flex min-w-44 flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => void guardarFactura(registro.id)}
                              disabled={guardandoId === registro.id || !String(draft).trim()}
                              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${estado.buttonClass} disabled:cursor-not-allowed disabled:bg-slate-300`}
                            >
                              {guardandoId === registro.id ? "Guardando..." : "Guardar"}
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditando(createEditDraft(registro))}
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                            >
                              Modificar
                            </button>
                          </div>
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

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_90px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Modificar registro
                </div>
                <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                  Nota credito / ajuste de factura
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Puedes actualizar los datos visibles del registro y corregir la
                  informacion de financieras antes de facturar.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditando(null)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Numero de cedula
                <input
                  value={editando.documentoNumero}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            documentoNumero: onlyDigits(event.target.value),
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Nombre completo
                <input
                  value={editando.clienteNombre}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            clienteNombre: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Correo electronico
                <input
                  value={editando.correo}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            correo: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                WhatsApp
                <input
                  value={editando.whatsapp}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            whatsapp: onlyDigits(event.target.value),
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Direccion
                <input
                  value={editando.direccion}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            direccion: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Barrio
                <input
                  value={editando.barrio}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            barrio: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Referencia
                <input
                  value={editando.referenciaEquipo}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            referenciaEquipo: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                IMEI
                <input
                  value={editando.serialImei}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            serialImei: onlyDigits(event.target.value, 15),
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Numero de factura
                <input
                  value={editando.numeroFactura}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            numeroFactura: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Puedes cambiarlo o dejarlo vacio"
                />
              </label>

              <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Estado
                <select
                  value={editando.estadoFacturacion}
                  onChange={(event) =>
                    setEditando((current) =>
                      current
                        ? {
                            ...current,
                            estadoFacturacion: event.target.value,
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {ESTADO_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Financieras
              </div>

              <div className="mt-5 space-y-4">
                {editando.financierasDetalle.map((financiera, index) => (
                  <div
                    key={`edicion-financiera-${index}`}
                    className="rounded-[26px] border border-slate-200 bg-white p-4"
                  >
                    <p className="text-sm font-bold text-slate-900">
                      Financiera {index + 1}
                    </p>

                    <div
                      className={`mt-4 grid gap-4 ${
                        financieraRequiereInicial(index)
                          ? "md:grid-cols-3"
                          : "md:grid-cols-2"
                      }`}
                    >
                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Financiera
                        <select
                          value={financiera.plataformaCredito}
                          onChange={(event) =>
                            setEditando((current) =>
                              current
                                ? {
                                    ...current,
                                    financierasDetalle: current.financierasDetalle.map(
                                      (item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              plataformaCredito: event.target.value,
                                            }
                                          : item
                                    ),
                                  }
                                : current
                            )
                          }
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        >
                          <option value="">Selecciona una financiera</option>
                          {PLATAFORMAS_CREDITO.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        Credito autorizado
                        <input
                          value={financiera.creditoAutorizado}
                          onChange={(event) =>
                            setEditando((current) =>
                              current
                                ? {
                                    ...current,
                                    financierasDetalle: current.financierasDetalle.map(
                                      (item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              creditoAutorizado: formatearPesoInput(
                                                event.target.value
                                              ),
                                            }
                                          : item
                                    ),
                                  }
                                : current
                            )
                          }
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        />
                      </label>

                      {financieraRequiereInicial(index) && (
                        <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                          Inicial
                          <input
                            value={financiera.cuotaInicial}
                            onChange={(event) =>
                              setEditando((current) =>
                                current
                                  ? {
                                      ...current,
                                      financierasDetalle: current.financierasDetalle.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                cuotaInicial: formatearPesoInput(
                                                  event.target.value
                                                ),
                                              }
                                            : item
                                      ),
                                    }
                                  : current
                              )
                            }
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => void guardarEdicion()}
                disabled={guardandoEdicion}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
