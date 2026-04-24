"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EqualityQuerySnapshot } from "@/lib/equality";

type EqualityApiResponse = {
  configured: boolean;
  search: string;
  result: EqualityQuerySnapshot | null;
  error?: string;
};

type QueryIntent = "consult" | "validate";

function normalizeDeviceUid(value: string) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function validationClass(tone: EqualityQuerySnapshot["validation"]["tone"]) {
  switch (tone) {
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "red":
      return "border-red-200 bg-red-50 text-red-800";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-800";
  }
}

function formatResultCode(value: string | null) {
  return value || "-";
}

function formatStatusCode(value: number | null) {
  return value === null ? "-" : String(value);
}

export function EqualityWorkspace({ esAdmin }: { esAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [resultado, setResultado] = useState<EqualityQuerySnapshot | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState<QueryIntent | null>(null);
  const resultadoRef = useRef<HTMLDivElement | null>(null);
  const bootstrappedRef = useRef(false);

  const syncUrl = useCallback((deviceUid: string) => {
    const normalized = normalizeDeviceUid(deviceUid);
    const nextUrl = normalized
      ? `/dashboard/equality?deviceUid=${encodeURIComponent(normalized)}`
      : "/dashboard/equality";

    window.history.replaceState(null, "", nextUrl);
  }, []);

  const consultar = useCallback(
    async (intent: QueryIntent, overrideValue?: string) => {
      const deviceUid = normalizeDeviceUid(overrideValue ?? search);

      if (!deviceUid) {
        setMensaje("Debes ingresar el IMEI o deviceUid del equipo.");
        return;
      }

      try {
        setCargando(intent);
        setMensaje("");

        const res = await fetch(
          `/api/equality?deviceUid=${encodeURIComponent(deviceUid)}`,
          {
            cache: "no-store",
          }
        );

        const data = (await res.json()) as EqualityApiResponse;

        if (!res.ok) {
          setMensaje(data.error || "Error consultando Equality Zero Touch.");
          return;
        }

        setConfigured(Boolean(data.configured));
        setResultado(data.result);
        setSearch(deviceUid);
        syncUrl(deviceUid);

        if (!data.configured) {
          setMensaje(
            "Configura las credenciales de Equality Zero Touch para usar este panel."
          );
          return;
        }

        if (!data.result) {
          setMensaje("No se recibio respuesta del equipo consultado.");
          return;
        }

        setMensaje(
          intent === "validate"
            ? `Validacion completada: ${data.result.validation.label}.`
            : "Consulta realizada correctamente."
        );

        setTimeout(() => {
          resultadoRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 80);
      } catch {
        setMensaje("Error consultando Equality Zero Touch.");
      } finally {
        setCargando(null);
      }
    },
    [search, syncUrl]
  );

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }

    bootstrappedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const deviceUid = normalizeDeviceUid(
      params.get("deviceUid") || params.get("imei") || ""
    );

    const bootstrap = async () => {
      try {
        const res = await fetch("/api/equality", {
          cache: "no-store",
        });

        const data = (await res.json()) as EqualityApiResponse;

        if (res.ok) {
          setConfigured(Boolean(data.configured));
        }
      } catch {}
    };

    void bootstrap();

    if (deviceUid) {
      setSearch(deviceUid);
      void consultar("consult", deviceUid);
    }
  }, [consultar]);

  const nextActions = [
    {
      label: "Inscribir",
      detail: "Enrolamiento del equipo en Equality.",
    },
    {
      label: "Bloquear",
      detail: "Bloqueo remoto del dispositivo.",
    },
    {
      label: "Desbloquear",
      detail: "Retiro del bloqueo operativo.",
    },
    ...(esAdmin
      ? [
          {
            label: "Liberar",
            detail: "Operacion exclusiva de administrador.",
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#f5f6fa] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[32px] border border-[#20242d] bg-[linear-gradient(135deg,#13161c_0%,#1a1f28_100%)] px-6 py-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#b98746]/40 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f3d7a8]">
                  Equality Zero Touch
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                  {esAdmin ? "Administrador" : "Supervisor"}
                </span>
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-[3.35rem]">
                HBM Equality
              </h1>

              <div className="mt-4 h-[3px] w-16 rounded-full bg-[#c79a57]" />

              <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">
                Consulta el equipo por IMEI o deviceUid y valida si el estado
                permite entregarlo.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Volver al dashboard
              </Link>
            </div>
          </div>
        </section>

        {mensaje ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {mensaje}
          </div>
        ) : null}

        <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Consulta
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
              Consultar equipo
            </h2>

            <p className="mt-3 text-sm leading-7 text-slate-600">
              Usa el IMEI o el deviceUid del equipo para revisar el estado real
              en Equality y validar si se puede entregar.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto]">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  IMEI / deviceUid
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ejemplo: 350182150759191"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <button
                  onClick={() => void consultar("consult")}
                  disabled={cargando !== null}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {cargando === "consult" ? "Consultando..." : "Consultar"}
                </button>

                <button
                  onClick={() => void consultar("validate")}
                  disabled={cargando !== null}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {cargando === "validate"
                    ? "Validando..."
                    : "Validar estado"}
                </button>
              </div>
            </div>

            {configured === false ? (
              <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
                Falta configurar el token de Equality en el servidor. Este
                panel espera la variable <span className="font-semibold">EQUALITY_HBM_TOKEN</span>.
              </div>
            ) : null}
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Siguiente
            </div>

            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
              Acciones pendientes
            </h2>

            <div className="mt-5 space-y-3">
              {nextActions.map((action) => (
                <div
                  key={action.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black tracking-tight text-slate-950">
                      {action.label}
                    </p>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Proximo
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {action.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {resultado ? (
          <section
            ref={resultadoRef}
            className="mt-6 rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Resultado
                </div>

                <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                  Validacion del equipo
                </h2>
              </div>

              <div
                className={[
                  "rounded-[24px] border px-4 py-4 text-sm shadow-sm lg:max-w-md",
                  validationClass(resultado.validation.tone),
                ].join(" ")}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                  Estado de entrega
                </p>
                <p className="mt-2 text-2xl font-black tracking-tight">
                  {resultado.validation.label}
                </p>
                <p className="mt-2 leading-6">{resultado.validation.detail}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  DeviceUid consultado
                </p>
                <p className="mt-2 text-base font-black text-slate-950">
                  {resultado.deviceUid}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Status code
                </p>
                <p className="mt-2 text-base font-black text-slate-950">
                  {formatStatusCode(resultado.statusCode)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Result code
                </p>
                <p className="mt-2 text-base font-black text-slate-950">
                  {formatResultCode(resultado.resultCode)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Bloqueo detectado
                </p>
                <p className="mt-2 text-base font-black text-slate-950">
                  {resultado.locked ? "Si" : "No"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Mensaje del hub
                </p>
                <p className="mt-2 text-base font-bold text-slate-950">
                  {resultado.resultMessage || "-"}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Estados detectados
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {resultado.statuses.length ? (
                    resultado.statuses.map((status) => (
                      <span
                        key={status}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {status}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">
                      No se detectaron estados claros en la respuesta.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Identificadores detectados
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {resultado.identifiers.length ? (
                    resultado.identifiers.map((identifier) => (
                      <span
                        key={identifier}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {identifier}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">
                      No llegaron identificadores adicionales en la respuesta.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <details className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                Ver respuesta tecnica
              </summary>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {JSON.stringify(resultado.raw, null, 2)}
              </pre>
            </details>
          </section>
        ) : null}
      </div>
    </div>
  );
}
