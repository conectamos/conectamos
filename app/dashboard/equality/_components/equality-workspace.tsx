"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EqualityQuerySnapshot } from "@/lib/equality";

type EqualityActionStep = {
  serviceCode: string;
  statusCode: number | null;
  resultCode: string | null;
  resultMessage: string | null;
  ok: boolean;
};

type EqualityApiResponse = {
  configured: boolean;
  search: string;
  result: EqualityQuerySnapshot | null;
  ok?: boolean;
  action?: string;
  message?: string;
  steps?: EqualityActionStep[];
  error?: string;
};

type QueryIntent = "consult" | "validate";
type MutationIntent = "enroll" | "lock" | "unlock" | "release";
type ActionIntent = QueryIntent | MutationIntent;

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

function feedbackClass(message: string) {
  const marker = message.toLowerCase();

  if (
    marker.includes("error") ||
    marker.includes("no fue posible") ||
    marker.includes("no se recibio") ||
    marker.includes("no encontrado")
  ) {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (
    marker.includes("correctamente") ||
    marker.includes("completada") ||
    marker.includes("apto")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function stepClass(ok: boolean) {
  return ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-red-200 bg-red-50 text-red-800";
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
  const [mensajeOperacion, setMensajeOperacion] = useState("");
  const [cargando, setCargando] = useState<ActionIntent | null>(null);
  const [ultimaAccion, setUltimaAccion] = useState<MutationIntent | null>(null);
  const [pasos, setPasos] = useState<EqualityActionStep[]>([]);
  const resultadoRef = useRef<HTMLDivElement | null>(null);
  const bootstrappedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const syncUrl = useCallback((deviceUid: string) => {
    const normalized = normalizeDeviceUid(deviceUid);
    const nextUrl = normalized
      ? `/dashboard/equality?deviceUid=${encodeURIComponent(normalized)}`
      : "/dashboard/equality";

    window.history.replaceState(null, "", nextUrl);
  }, []);

  const moveToResult = useCallback(() => {
    setTimeout(() => {
      resultadoRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }, []);

  const consultar = useCallback(
    async (intent: QueryIntent, overrideValue?: string) => {
      const deviceUid = normalizeDeviceUid(overrideValue ?? search);

      if (!deviceUid) {
        setMensaje("Debes ingresar el IMEI o deviceUid del equipo.");
        setMensajeOperacion("Primero escribe o consulta un IMEI / deviceUid.");
        inputRef.current?.focus();
        return;
      }

      try {
        setCargando(intent);
        setMensaje("");
        setMensajeOperacion("");
        setUltimaAccion(null);
        setPasos([]);

        const res = await fetch(
          `/api/equality?deviceUid=${encodeURIComponent(deviceUid)}`,
          {
            cache: "no-store",
          }
        );

        const data = (await res.json()) as EqualityApiResponse;

        if (!res.ok) {
          setConfigured(Boolean(data.configured));
          setResultado(data.result);
          setMensaje(data.error || "Error consultando Equality Zero Touch.");
          return;
        }

        setConfigured(Boolean(data.configured));
        setResultado(data.result);
        setSearch(deviceUid);
        syncUrl(deviceUid);

        if (!data.result) {
          setMensaje("No se recibio respuesta del equipo consultado.");
          return;
        }

        setMensaje(
          intent === "validate"
            ? `Validacion completada: ${data.result.validation.label}.`
            : "Consulta realizada correctamente."
        );
        setMensajeOperacion("");
        moveToResult();
      } catch {
        setMensaje("Error consultando Equality Zero Touch.");
        setMensajeOperacion("No fue posible consultar el equipo.");
      } finally {
        setCargando(null);
      }
    },
    [moveToResult, search, syncUrl]
  );

  const ejecutarAccion = useCallback(
    async (intent: MutationIntent) => {
      const deviceUid = normalizeDeviceUid(resultado?.deviceUid || search);

      if (!deviceUid) {
        setMensaje("Debes ingresar el IMEI o deviceUid del equipo.");
        setMensajeOperacion("Primero escribe o consulta un IMEI / deviceUid.");
        inputRef.current?.focus();
        return;
      }

      try {
        setCargando(intent);
        setMensaje("");
        setMensajeOperacion("");

        const res = await fetch("/api/equality", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: intent,
            deviceUid,
          }),
        });

        const data = (await res.json()) as EqualityApiResponse;

        setConfigured(Boolean(data.configured));
        setSearch(deviceUid);
        syncUrl(deviceUid);
        setUltimaAccion(intent);
        setPasos(data.steps || []);

        if (data.result) {
          setResultado(data.result);
        }

        if (!res.ok || data.ok === false) {
          const nextMessage =
            data.error ||
            data.message ||
            "Equality devolvio una respuesta para revisar.";
          setMensaje(nextMessage);
          setMensajeOperacion(nextMessage);
          moveToResult();
          return;
        }

        const nextMessage = data.message || "Accion ejecutada correctamente.";
        setMensaje(nextMessage);
        setMensajeOperacion(nextMessage);
        moveToResult();
      } catch {
        setMensaje("Error ejecutando accion en Equality Zero Touch.");
        setMensajeOperacion("No fue posible ejecutar la accion.");
      } finally {
        setCargando(null);
      }
    },
    [moveToResult, resultado?.deviceUid, search, syncUrl]
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

  const actionButtons: Array<{
    action: MutationIntent;
    label: string;
    detail: string;
    tone: string;
    buttonTone: string;
    adminOnly?: boolean;
  }> = [
    {
      action: "enroll",
      label: "Inscribir",
      detail: "Carga y activa el equipo en el hub.",
      tone: "border-amber-200 bg-amber-50/80 text-amber-900",
      buttonTone: "border-amber-300 bg-white text-amber-900 hover:bg-amber-100",
    },
    {
      action: "lock",
      label: "Bloquear",
      detail: "Aplica bloqueo remoto sobre el equipo.",
      tone: "border-red-200 bg-red-50/80 text-red-900",
      buttonTone: "border-red-300 bg-white text-red-900 hover:bg-red-100",
    },
    {
      action: "unlock",
      label: "Desbloquear",
      detail: "Retira el bloqueo operativo.",
      tone: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
      buttonTone:
        "border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100",
    },
    ...(esAdmin
      ? [
          {
            action: "release" as MutationIntent,
            label: "Liberar",
            detail: "Libera el equipo de forma definitiva.",
            tone: "border-violet-200 bg-violet-50/80 text-violet-900",
            buttonTone:
              "border-violet-300 bg-white text-violet-900 hover:bg-violet-100",
            adminOnly: true,
          },
        ]
      : []),
  ];

  const activeDeviceUid = normalizeDeviceUid(resultado?.deviceUid || search);
  const feedback = mensajeOperacion || mensaje;

  const statusCards = useMemo(
    () => [
      {
        label: "DeviceUid",
        value: resultado?.deviceUid || "-",
      },
      {
        label: "Status code",
        value: formatStatusCode(resultado?.statusCode ?? null),
      },
      {
        label: "Result code",
        value: formatResultCode(resultado?.resultCode ?? null),
      },
      {
        label: "Bloqueo",
        value: resultado?.locked ? "Si" : "No",
      },
    ],
    [resultado]
  );

  return (
    <div className="min-h-screen bg-[#f5f6fa] px-4 py-6 sm:px-5">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-[#20242d] bg-[linear-gradient(135deg,#13161c_0%,#181d26_55%,#202734_100%)] px-6 py-6 text-white shadow-[0_22px_60px_rgba(15,23,42,0.16)] sm:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#b98746]/40 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f3d7a8]">
                  Equality Zero Touch
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                  {esAdmin ? "Administrador" : "Supervisor"}
                </span>
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-[3.1rem]">
                HBM Equality
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Panel operativo para consultar, validar y ejecutar acciones
                directas del hub sobre un equipo.
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

        <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
            <div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Control
              </div>

              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                Consultar equipo
              </h2>

              <p className="mt-2 text-sm leading-7 text-slate-600">
                Escribe el IMEI o deviceUid del equipo y luego consulta o valida
                el estado.
              </p>

              <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center">
                <input
                  ref={inputRef}
                  id="equality-deviceuid"
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ejemplo: 351389360876777"
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />

                <div className="flex flex-wrap gap-3">
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
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Operaciones
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {activeDeviceUid
                      ? `Equipo activo: ${activeDeviceUid}`
                      : "Las acciones usan el IMEI o deviceUid escrito en el campo superior."}
                  </p>
                </div>

                {configured === false ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                    Revisar credencial
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {actionButtons.map((item) => (
                  <button
                    key={item.action}
                    onClick={() => void ejecutarAccion(item.action)}
                    disabled={cargando !== null}
                    className={[
                      "rounded-[20px] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                      item.tone,
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black tracking-tight">
                        {item.label}
                      </span>
                      {item.adminOnly ? (
                        <span className="rounded-full border border-current/20 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                          Admin
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 opacity-90">
                      {item.detail}
                    </p>
                    <span
                      className={[
                        "mt-4 inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition",
                        item.buttonTone,
                      ].join(" ")}
                    >
                      {cargando === item.action ? "Procesando..." : item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            className={[
              "mt-5 rounded-2xl border px-4 py-3 text-sm shadow-sm",
              feedback
                ? feedbackClass(feedback)
                : "border-dashed border-slate-300 bg-slate-50 text-slate-500",
            ].join(" ")}
          >
            {feedback ||
              "Consulta un equipo para ver su estado y ejecutar acciones sobre el deviceUid actual."}
          </div>
        </section>

        {!resultado ? (
          <section className="rounded-[30px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Sin resultado
            </p>
            <p className="mt-3 text-lg font-bold text-slate-900">
              Consulta un equipo para ver el estado de entrega y la respuesta del
              hub.
            </p>
          </section>
        ) : (
          <section
            ref={resultadoRef}
            className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:items-start"
          >
            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Resultado
                  </div>

                  <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
                    Equipo {resultado.deviceUid}
                  </h2>

                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {resultado.resultMessage ||
                      "Respuesta recibida correctamente desde HBM Equality."}
                  </p>
                </div>

                <div
                  className={[
                    "rounded-[24px] border px-4 py-4 text-sm shadow-sm lg:max-w-sm",
                    validationClass(resultado.validation.tone),
                  ].join(" ")}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                    Estado de entrega
                  </p>
                  <p className="mt-2 text-2xl font-black tracking-tight">
                    {resultado.validation.label}
                  </p>
                  <p className="mt-2 leading-6">
                    {resultado.validation.detail}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {statusCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {card.label}
                    </p>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {card.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
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
            </div>

            <div className="space-y-4">
              {ultimaAccion && pasos.length ? (
                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Ultima accion
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                        {ultimaAccion}
                      </h3>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                      {pasos.length} paso{pasos.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {pasos.map((step) => (
                      <div
                        key={`${ultimaAccion}-${step.serviceCode}`}
                        className={[
                          "rounded-2xl border px-4 py-4",
                          stepClass(step.ok),
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-black tracking-tight">
                            {step.serviceCode}
                          </p>
                          <span className="rounded-full border border-current/20 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                            {step.ok ? "OK" : "Revisar"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6">
                          {step.resultMessage || "-"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <details className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Ver respuesta tecnica
                </summary>
                <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                  {JSON.stringify(resultado.raw, null, 2)}
                </pre>
              </details>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
