"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FRECUENCIAS_CUOTA,
  MEDIOS_PAGO,
  PLATAFORMAS_CREDITO,
  TIPOS_DOCUMENTO_CLIENTE,
} from "@/lib/vendor-sale-records";

type SessionProps = {
  nombre: string;
  sedeNombre: string;
  perfilNombre: string;
  perfilTipoLabel: string;
};

type RegistroResumen = {
  id: number;
  clienteNombre: string;
  plataformaCredito: string;
  referenciaEquipo: string | null;
  serialImei: string | null;
  creditoAutorizado: number | null;
  cuotaInicial: number | null;
  valorCuota: number | null;
  numeroCuotas: number | null;
  createdAt: string;
};

type FormState = {
  ciudad: string;
  puntoVenta: string;
  clienteNombre: string;
  tipoDocumento: string;
  documentoNumero: string;
  plataformaCredito: string;
  aceptaDeclaracionIntermediacion: boolean;
  aceptaPoliticaGarantia: boolean;
  aceptaCondicionesCredito: boolean;
  dobleCredito: boolean;
  observacion: string;
  referenciaEquipo: string;
  almacenamiento: string;
  color: string;
  serialImei: string;
  tipoEquipo: string;
  creditoAutorizado: string;
  cuotaInicial: string;
  valorCuota: string;
  numeroCuotas: string;
  frecuenciaCuota: string;
  correo: string;
  whatsapp: string;
  fechaNacimiento: string;
  fechaExpedicion: string;
  direccion: string;
  barrio: string;
  referenciaContacto: string;
  telefono: string;
  simCardRegistro1: string;
  simCardRegistro2: string;
  medioPago1Tipo: string;
  medioPago1Valor: string;
  medioPago2Tipo: string;
  medioPago2Valor: string;
  asesorNombre: string;
  cerradorNombre: string;
  confirmacionCliente: boolean;
};

function createInitialState(session: SessionProps): FormState {
  return {
    ciudad: "",
    puntoVenta: session.sedeNombre,
    clienteNombre: "",
    tipoDocumento: "CC",
    documentoNumero: "",
    plataformaCredito: "",
    aceptaDeclaracionIntermediacion: false,
    aceptaPoliticaGarantia: false,
    aceptaCondicionesCredito: false,
    dobleCredito: false,
    observacion: "",
    referenciaEquipo: "",
    almacenamiento: "",
    color: "",
    serialImei: "",
    tipoEquipo: "",
    creditoAutorizado: "",
    cuotaInicial: "",
    valorCuota: "",
    numeroCuotas: "",
    frecuenciaCuota: "",
    correo: "",
    whatsapp: "",
    fechaNacimiento: "",
    fechaExpedicion: "",
    direccion: "",
    barrio: "",
    referenciaContacto: "",
    telefono: "",
    simCardRegistro1: "",
    simCardRegistro2: "",
    medioPago1Tipo: "",
    medioPago1Valor: "",
    medioPago2Tipo: "",
    medioPago2Valor: "",
    asesorNombre: session.perfilNombre,
    cerradorNombre: "",
    confirmacionCliente: false,
  };
}

function inputClass(readOnly = false) {
  return `w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
    readOnly
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : "border-slate-300 bg-white text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
  }`;
}

function moneyLabel(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return `$ ${Number(digits).toLocaleString("es-CO")}`;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

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

export default function VendedorRegistroWorkspace({
  session,
}: {
  session: SessionProps;
}) {
  const [form, setForm] = useState<FormState>(() => createInitialState(session));
  const [registros, setRegistros] = useState<RegistroResumen[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargarRegistros = async () => {
    try {
      const res = await fetch("/api/vendedor/registros", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudieron cargar los registros");
        return;
      }

      setRegistros(Array.isArray(data.registros) ? data.registros : []);
    } catch {
      setMensaje("Error cargando registros");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarRegistros();
  }, []);

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const guardarRegistro = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      const res = await fetch("/api/vendedor/registros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo guardar el registro");
        return;
      }

      setMensaje(data.mensaje || "Registro guardado correctamente");
      setForm((current) => ({
        ...createInitialState(session),
        ciudad: current.ciudad,
        puntoVenta: current.puntoVenta,
        asesorNombre: current.asesorNombre,
      }));
      await cargarRegistros();
    } catch {
      setMensaje("Error guardando el registro");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4f7fb_0%,#e9eef7_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_52%,#0f766e_100%)] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                Formato digital
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                REGISTRAR VENTA
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-200 md:text-base">
                Version digital de la hoja de plataforma para capturar el tramite
                completo desde la sede.
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
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {mensaje}
          </div>
        )}

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="space-y-5">
            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Cliente y tramite
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Ciudad
                  <input
                    value={form.ciudad}
                    onChange={(event) => setField("ciudad", event.target.value)}
                    className={inputClass()}
                    placeholder="Ciudad"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Punto de venta
                  <input
                    value={form.puntoVenta}
                    readOnly
                    className={inputClass(true)}
                  />
                </label>

                <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Nombre del cliente
                  <input
                    value={form.clienteNombre}
                    onChange={(event) => setField("clienteNombre", event.target.value)}
                    className={inputClass()}
                    placeholder="Nombre completo"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Tipo documento
                  <select
                    value={form.tipoDocumento}
                    onChange={(event) => setField("tipoDocumento", event.target.value)}
                    className={inputClass()}
                  >
                    {TIPOS_DOCUMENTO_CLIENTE.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Numero de documento
                  <input
                    value={form.documentoNumero}
                    onChange={(event) =>
                      setField("documentoNumero", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Documento"
                  />
                </label>

                <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Plataforma de credito utilizada
                  <select
                    value={form.plataformaCredito}
                    onChange={(event) =>
                      setField("plataformaCredito", event.target.value)
                    }
                    className={inputClass()}
                  >
                    <option value="">Selecciona una plataforma</option>
                    {PLATAFORMAS_CREDITO.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-5 grid gap-3">
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.aceptaDeclaracionIntermediacion}
                    onChange={(event) =>
                      setField(
                        "aceptaDeclaracionIntermediacion",
                        event.target.checked
                      )
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    Confirmo que el cliente fue informado sobre la intermediacion
                    independiente del operador.
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.aceptaPoliticaGarantia}
                    onChange={(event) =>
                      setField("aceptaPoliticaGarantia", event.target.checked)
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    Confirmo que se socializo la politica de garantia y devoluciones.
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.aceptaCondicionesCredito}
                    onChange={(event) =>
                      setField("aceptaCondicionesCredito", event.target.checked)
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    Confirmo que se explicaron las condiciones del credito y la
                    responsabilidad de la entidad financiera.
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Detalle del credito
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.dobleCredito}
                    onChange={(event) => setField("dobleCredito", event.target.checked)}
                    className="h-4 w-4"
                  />
                  Doble credito
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Observacion
                  <input
                    value={form.observacion}
                    onChange={(event) => setField("observacion", event.target.value)}
                    className={inputClass()}
                    placeholder="Observacion"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Referencia
                  <input
                    value={form.referenciaEquipo}
                    onChange={(event) =>
                      setField("referenciaEquipo", event.target.value)
                    }
                    className={inputClass()}
                    placeholder="Referencia del equipo"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Almacenamiento
                  <input
                    value={form.almacenamiento}
                    onChange={(event) => setField("almacenamiento", event.target.value)}
                    className={inputClass()}
                    placeholder="128 GB"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Color
                  <input
                    value={form.color}
                    onChange={(event) => setField("color", event.target.value)}
                    className={inputClass()}
                    placeholder="Color"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Serial / IMEI
                  <input
                    value={form.serialImei}
                    onChange={(event) => setField("serialImei", event.target.value)}
                    className={inputClass()}
                    placeholder="Serial o IMEI"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Tipo de equipo
                  <input
                    value={form.tipoEquipo}
                    onChange={(event) => setField("tipoEquipo", event.target.value)}
                    className={inputClass()}
                    placeholder="Celular, tablet..."
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Credito autorizado
                  <input
                    value={form.creditoAutorizado}
                    onChange={(event) =>
                      setField("creditoAutorizado", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Valor"
                  />
                  <span className="text-xs text-slate-500">
                    {moneyLabel(form.creditoAutorizado)}
                  </span>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Inicial
                  <input
                    value={form.cuotaInicial}
                    onChange={(event) =>
                      setField("cuotaInicial", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Valor"
                  />
                  <span className="text-xs text-slate-500">
                    {moneyLabel(form.cuotaInicial)}
                  </span>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Valor de cuota
                  <input
                    value={form.valorCuota}
                    onChange={(event) =>
                      setField("valorCuota", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Valor"
                  />
                  <span className="text-xs text-slate-500">
                    {moneyLabel(form.valorCuota)}
                  </span>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Numero de cuotas
                  <input
                    value={form.numeroCuotas}
                    onChange={(event) =>
                      setField("numeroCuotas", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Cuotas"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Frecuencia
                  <select
                    value={form.frecuenciaCuota}
                    onChange={(event) =>
                      setField("frecuenciaCuota", event.target.value)
                    }
                    className={inputClass()}
                  >
                    <option value="">Selecciona frecuencia</option>
                    {FRECUENCIAS_CUOTA.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Contacto del cliente
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Correo
                  <input
                    value={form.correo}
                    onChange={(event) => setField("correo", event.target.value)}
                    className={inputClass()}
                    placeholder="correo@cliente.com"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Whatsapp
                  <input
                    value={form.whatsapp}
                    onChange={(event) =>
                      setField("whatsapp", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Whatsapp"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Fecha de nacimiento
                  <input
                    type="date"
                    value={form.fechaNacimiento}
                    onChange={(event) =>
                      setField("fechaNacimiento", event.target.value)
                    }
                    className={inputClass()}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Fecha de expedicion
                  <input
                    type="date"
                    value={form.fechaExpedicion}
                    onChange={(event) =>
                      setField("fechaExpedicion", event.target.value)
                    }
                    className={inputClass()}
                  />
                </label>

                <label className="md:col-span-2 flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Direccion
                  <input
                    value={form.direccion}
                    onChange={(event) => setField("direccion", event.target.value)}
                    className={inputClass()}
                    placeholder="Direccion"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Barrio
                  <input
                    value={form.barrio}
                    onChange={(event) => setField("barrio", event.target.value)}
                    className={inputClass()}
                    placeholder="Barrio"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Referencia
                  <input
                    value={form.referenciaContacto}
                    onChange={(event) =>
                      setField("referenciaContacto", event.target.value)
                    }
                    className={inputClass()}
                    placeholder="Referencia adicional"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Telefono
                  <input
                    value={form.telefono}
                    onChange={(event) =>
                      setField("telefono", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Telefono"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Simcard registro 1
                  <input
                    value={form.simCardRegistro1}
                    onChange={(event) =>
                      setField("simCardRegistro1", event.target.value)
                    }
                    className={inputClass()}
                    placeholder="Simcard"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Simcard registro 2
                  <input
                    value={form.simCardRegistro2}
                    onChange={(event) =>
                      setField("simCardRegistro2", event.target.value)
                    }
                    className={inputClass()}
                    placeholder="Simcard"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Pagos y responsables
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Medio de pago 1
                  <select
                    value={form.medioPago1Tipo}
                    onChange={(event) =>
                      setField("medioPago1Tipo", event.target.value)
                    }
                    className={inputClass()}
                  >
                    <option value="">Selecciona medio</option>
                    {MEDIOS_PAGO.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Valor pago 1
                  <input
                    value={form.medioPago1Valor}
                    onChange={(event) =>
                      setField("medioPago1Valor", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Valor"
                  />
                  <span className="text-xs text-slate-500">
                    {moneyLabel(form.medioPago1Valor)}
                  </span>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Medio de pago 2
                  <select
                    value={form.medioPago2Tipo}
                    onChange={(event) =>
                      setField("medioPago2Tipo", event.target.value)
                    }
                    className={inputClass()}
                  >
                    <option value="">Sin segundo pago</option>
                    {MEDIOS_PAGO.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Valor pago 2
                  <input
                    value={form.medioPago2Valor}
                    onChange={(event) =>
                      setField("medioPago2Valor", onlyDigits(event.target.value))
                    }
                    className={inputClass()}
                    placeholder="Valor"
                  />
                  <span className="text-xs text-slate-500">
                    {moneyLabel(form.medioPago2Valor)}
                  </span>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Asesor
                  <input
                    value={form.asesorNombre}
                    readOnly
                    className={inputClass(true)}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Cerrador
                  <input
                    value={form.cerradorNombre}
                    onChange={(event) => setField("cerradorNombre", event.target.value)}
                    className={inputClass()}
                    placeholder="Cerrador"
                  />
                </label>
              </div>

              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <input
                  type="checkbox"
                  checked={form.confirmacionCliente}
                  onChange={(event) =>
                    setField("confirmacionCliente", event.target.checked)
                  }
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Confirmo que el cliente valida digitalmente la informacion del
                  formato y acepta su registro.
                </span>
              </label>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => void guardarRegistro()}
                  disabled={guardando}
                  className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
                >
                  {guardando ? "Guardando..." : "Guardar registro"}
                </button>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Sesion
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                {session.nombre}
              </h2>
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Perfil
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-900">
                    {session.perfilTipoLabel}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Punto de venta
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-900">
                    {session.sedeNombre}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Registros recientes
                </div>
                <span className="text-sm font-semibold text-slate-500">
                  {cargando ? "..." : registros.length}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {cargando ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    Cargando registros...
                  </div>
                ) : registros.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    Aun no hay registros guardados en este modulo.
                  </div>
                ) : (
                  registros.map((registro) => (
                    <article
                      key={registro.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {registro.clienteNombre}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-emerald-700">
                            {registro.plataformaCredito}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">
                          #{registro.id}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-slate-600">
                        <p>
                          Equipo: {registro.referenciaEquipo || "Sin referencia"}
                        </p>
                        <p>IMEI: {registro.serialImei || "Sin dato"}</p>
                        <p>
                          Credito:{" "}
                          {registro.creditoAutorizado != null
                            ? `$ ${Number(registro.creditoAutorizado).toLocaleString("es-CO")}`
                            : "Sin valor"}
                        </p>
                        <p>
                          Cuota:{" "}
                          {registro.valorCuota != null
                            ? `$ ${Number(registro.valorCuota).toLocaleString("es-CO")}`
                            : "Sin valor"}{" "}
                          / {registro.numeroCuotas ?? 0} cuotas
                        </p>
                        <p>Creado: {formatDate(registro.createdAt)}</p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}
