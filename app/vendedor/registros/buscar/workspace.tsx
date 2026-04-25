"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RegistroVendedorDetalle } from "../types";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

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
  if (!value) {
    return "Sin fecha";
  }

  try {
    return new Date(value).toLocaleDateString("es-CO");
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

function resolveFinancieras(registro: RegistroVendedorDetalle) {
  if (Array.isArray(registro.financierasDetalle) && registro.financierasDetalle.length > 0) {
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

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">
        {value && String(value).trim().length > 0 ? value : "Sin dato"}
      </p>
    </div>
  );
}

function EstadoPill({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: "slate" | "emerald" | "amber";
}) {
  const tones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    emerald: "border-emerald-200 bg-emerald-100 text-emerald-700",
    amber: "border-amber-200 bg-amber-100 text-amber-700",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tones[tone]}`}>
      {label}
    </span>
  );
}

export default function BuscarRegistroWorkspace({
  session,
}: {
  session: SessionProps;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<RegistroVendedorDetalle[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [mensajeTipo, setMensajeTipo] = useState<"success" | "error">("success");
  const [buscando, setBuscando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);

  const descripcionPerfil = useMemo(() => {
    const tipo = String(session.perfilTipoLabel || "").trim();
    return tipo.length > 0 ? tipo : "Perfil operativo";
  }, [session.perfilTipoLabel]);

  const buscarRegistros = async () => {
    const criterio = busqueda.trim();
    const digits = criterio.replace(/\D/g, "");

    if (!digits) {
      setMensajeTipo("error");
      setMensaje("Debes ingresar un IMEI o una cedula para consultar.");
      return;
    }

    try {
      setBuscando(true);
      setBusquedaRealizada(true);
      setMensaje("");

      const res = await fetch(
        `/api/vendedor/registros?buscar=${encodeURIComponent(digits)}`,
        {
          cache: "no-store",
        }
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
        setMensaje("No se encontraron registros con ese IMEI o cedula.");
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

  const eliminarRegistro = async (id: number) => {
    const confirmar = window.confirm(
      "Vas a eliminar este registro del panel del vendedor. Deseas continuar?"
    );

    if (!confirmar) {
      return;
    }

    try {
      setEliminandoId(id);
      setMensaje("");

      const res = await fetch("/api/vendedor/registros", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          modo: "ELIMINAR",
        }),
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_52%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Vendedor / Registros
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Buscar registro
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                Consulta por IMEI o cedula todo lo que se cargo en Registrar venta,
                y desde aqui podras modificar o eliminar ese tramite.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/vendedor/registros"
                className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Volver a registrar venta
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

        <section className="mt-6 rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Consulta directa
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-600">
                Escribe el IMEI o la cedula del cliente para traer el registro
                completo subido desde el modulo de vendedor.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <input
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void buscarRegistros();
                    }
                  }}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Busca por IMEI o cedula"
                />

                <button
                  type="button"
                  onClick={() => void buscarRegistros()}
                  disabled={buscando}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {buscando ? "Buscando..." : "Buscar registro"}
                </button>
              </div>
            </div>

            <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sesion activa
              </p>
              <p className="mt-2 text-lg font-black text-slate-950">
                {session.perfilNombre}
              </p>
              <p className="mt-2 text-sm text-slate-600">{descripcionPerfil}</p>
              <p className="mt-2 text-sm text-slate-600">
                Cobertura: {session.sedeNombre}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-5">
          {busquedaRealizada && resultados.length === 0 && !buscando && (
            <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 text-sm text-slate-600 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              No hay registros para mostrar con esa consulta.
            </div>
          )}

          {resultados.map((registro) => {
            const financieras = resolveFinancieras(registro);
            const estadoFacturacion = String(registro.estadoFacturacion || "PENDIENTE")
              .replace(/_/g, " ")
              .trim();
            const estadoVenta = String(registro.estadoVentaRegistro || "PENDIENTE")
              .replace(/_/g, " ")
              .trim();

            return (
              <article
                key={registro.id}
                className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <EstadoPill label={`Registro #${registro.id}`} />
                      <EstadoPill label={`Venta: ${estadoVenta}`} tone="amber" />
                      <EstadoPill
                        label={`Facturacion: ${estadoFacturacion}`}
                        tone={registro.numeroFactura ? "emerald" : "slate"}
                      />
                    </div>

                    <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                      {registro.clienteNombre}
                    </h2>

                    <p className="mt-2 text-sm text-slate-600">
                      Cargado el {formatDate(registro.createdAt)}{" "}
                      {registro.updatedAt !== registro.createdAt
                        ? `| actualizado ${formatDate(registro.updatedAt)}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link
                      href={`/vendedor/registros?editar=${registro.id}`}
                      className="rounded-2xl bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Modificar
                    </Link>
                    <button
                      type="button"
                      onClick={() => void eliminarRegistro(registro.id)}
                      disabled={eliminandoId === registro.id}
                      className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {eliminandoId === registro.id ? "Eliminando..." : "Eliminar"}
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-2">
                  <section className="space-y-4">
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Cliente
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Nombre completo" value={registro.clienteNombre} />
                      <Field
                        label="Documento"
                        value={`${registro.tipoDocumento} ${registro.documentoNumero}`}
                      />
                      <Field label="Correo" value={registro.correo} />
                      <Field label="WhatsApp" value={registro.whatsapp} />
                      <Field label="Telefono" value={registro.telefono} />
                      <Field label="Ciudad" value={registro.ciudad} />
                      <Field
                        label="Fecha de nacimiento"
                        value={formatDateOnly(registro.fechaNacimiento)}
                      />
                      <Field
                        label="Fecha de expedicion"
                        value={formatDateOnly(registro.fechaExpedicion)}
                      />
                      <Field label="Direccion" value={registro.direccion} />
                      <Field label="Barrio" value={registro.barrio} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Equipo y tramite
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Punto / sede" value={registro.puntoVenta ?? registro.sedeNombre} />
                      <Field label="IMEI" value={registro.serialImei} />
                      <Field label="Referencia" value={registro.referenciaEquipo} />
                      <Field label="Almacenamiento" value={registro.almacenamiento} />
                      <Field label="Color" value={registro.color} />
                      <Field label="Tipo de equipo" value={registro.tipoEquipo} />
                      <Field label="Asesor" value={registro.asesorNombre} />
                      <Field label="Jalador" value={registro.jaladorNombre} />
                      <Field label="Registro SIM 1" value={registro.simCardRegistro1} />
                      <Field label="Registro SIM 2" value={registro.simCardRegistro2} />
                      <Field label="Numero de factura" value={registro.numeroFactura} />
                      <Field label="Observacion" value={registro.observacion} />
                    </div>
                  </section>
                </div>

                <section className="mt-6">
                  <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Financieras
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {financieras.map((financiera, index) => (
                      <div
                        key={`${registro.id}-financiera-${index}`}
                        className="rounded-[26px] border border-slate-200 bg-slate-50 p-4"
                      >
                        <p className="text-sm font-bold text-slate-900">
                          Financiera {index + 1}
                        </p>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <Field
                            label="Plataforma"
                            value={financiera.plataformaCredito}
                          />
                          <Field
                            label="Credito autorizado"
                            value={formatMoney(financiera.creditoAutorizado)}
                          />
                          <Field
                            label="Inicial"
                            value={formatMoney(financiera.cuotaInicial)}
                          />
                          <Field
                            label="Tipo pago inicial"
                            value={financiera.tipoPagoInicial}
                          />
                          <Field
                            label="Valor cuota"
                            value={formatMoney(financiera.valorCuota)}
                          />
                          <Field
                            label="Plazo"
                            value={
                              financiera.numeroCuotas
                                ? `${financiera.numeroCuotas} cuotas`
                                : "Sin dato"
                            }
                          />
                          <Field
                            label="Frecuencia"
                            value={financiera.frecuenciaCuota}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="mt-6 grid gap-5 xl:grid-cols-2">
                  <section className="space-y-4">
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Referencias y validacion
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        label="Referencia familiar 1"
                        value={registro.referenciaFamiliar1Nombre}
                      />
                      <Field
                        label="Telefono referencia 1"
                        value={registro.referenciaFamiliar1Telefono}
                      />
                      <Field
                        label="Referencia familiar 2"
                        value={registro.referenciaFamiliar2Nombre}
                      />
                      <Field
                        label="Telefono referencia 2"
                        value={registro.referenciaFamiliar2Telefono}
                      />
                      <Field
                        label="Acepta intermediacion"
                        value={registro.aceptaDeclaracionIntermediacion ? "Si" : "No"}
                      />
                      <Field
                        label="Acepta politica garantia"
                        value={registro.aceptaPoliticaGarantia ? "Si" : "No"}
                      />
                      <Field
                        label="Acepta condiciones credito"
                        value={registro.aceptaCondicionesCredito ? "Si" : "No"}
                      />
                      <Field
                        label="Confirmacion cliente"
                        value={registro.confirmacionCliente ? "Si" : "No"}
                      />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Medios adjuntos
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-700">
                          Firma del cliente
                        </p>
                        {registro.firmaClienteDataUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={registro.firmaClienteDataUrl}
                              alt="Firma del cliente"
                              className="mt-4 h-36 w-full rounded-2xl border border-slate-200 bg-white object-contain"
                            />
                          </>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">
                            Sin firma cargada.
                          </p>
                        )}
                      </div>

                      <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-700">
                          Foto de entrega
                        </p>
                        {registro.fotoEntregaDataUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={registro.fotoEntregaDataUrl}
                              alt="Foto de entrega"
                              className="mt-4 h-36 w-full rounded-2xl border border-slate-200 bg-white object-cover"
                            />
                          </>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">
                            Sin foto cargada.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
