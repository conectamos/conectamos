"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveRefresh } from "@/lib/use-live-refresh";

type QueryType = "imei" | "device";

type LocalItem = {
  id: number;
  imei: string;
  referencia: string;
  color: string | null;
  costo: number;
  distribuidor: string | null;
  estadoActual: string;
  estadoFinanciero: string;
  deboA: string | null;
  sedeId: number;
  sede?: {
    nombre: string;
  };
};

type LocalPrincipal = {
  id: number;
  imei: string;
  referencia: string;
  color: string | null;
  costo: number;
  distribuidor: string | null;
  estado: string | null;
  estadoCobro: string | null;
  sedeDestinoId: number | null;
} | null;

type NuovoPayDevice = {
  deviceId: number;
  imei: string | null;
  imei2: string | null;
  serial: string | null;
  phone: string | null;
  name: string | null;
  model: string | null;
  make: string | null;
  status: string | null;
  locked: boolean;
  customerName: string | null;
  customerEmail: string | null;
  enrolledOn: string | null;
  enrollment: {
    approved: boolean;
    label: string;
    detail: string;
    tone: string;
  };
};

type NuovoPayResponse = {
  configured: boolean;
  canManage: boolean;
  queryType: QueryType;
  search: string;
  matches: NuovoPayDevice[];
  selectedDevice: NuovoPayDevice | null;
  localItems: LocalItem[];
  localPrincipal: LocalPrincipal;
};

type CarteraInsightRow = {
  id: number;
  cedula: string;
  numeroCredito: string | null;
  modalidad: string | null;
  sucursal: string | null;
  ubicacion: string | null;
  diasVencido: number;
  cuotasPendientes: number | null;
  valorCuota: number | null;
  saldoObligacion: number | null;
  estadoGestion: string | null;
  estado: string | null;
  abogado: string | null;
  abonoInsuficiente: boolean;
  beneficioPerdido: boolean;
  fechaApertura: string | null;
  fechaProximaCuota: string | null;
  ultimoAbonoEn: string | null;
  deviceId: number | null;
  deviceName: string | null;
  deviceImei: string | null;
  bloqueoAplicado: boolean;
  resultadoBloqueo: string | null;
};

type CarteraAnalytics = {
  totalBloqueables: number;
  totalBuenosClientes: number;
  totalPorFinalizar: number;
  blockCandidates: CarteraInsightRow[];
  topGoodClients: CarteraInsightRow[];
  topNearFinishClients: CarteraInsightRow[];
};

type CarteraImportSummary = {
  id: number;
  nombreArchivo: string;
  totalRegistros: number;
  totalMoraMayorCinco: number;
  totalCedulasAnalizadas: number;
  totalCoincidenciasNuovo: number;
  totalBloqueados: number;
  totalYaBloqueados: number;
  totalSinCoincidencia: number;
  procesadoBloqueoEn: string | null;
  createdAt: string;
  updatedAt: string;
  subidoPor: {
    id: number;
    nombre: string;
    usuario: string;
  };
  previewRows: CarteraInsightRow[];
  analytics: CarteraAnalytics;
};

type CarteraResponse = {
  configured: boolean;
  latestImport: CarteraImportSummary | null;
};

function limpiarImei(valor: string) {
  return String(valor || "").replace(/\D/g, "").slice(0, 15);
}

function limpiarDevice(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function formatoPesos(valor: number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function formatoFecha(valor: string | null) {
  if (!valor) return "-";
  return new Date(valor).toLocaleString("es-CO");
}

function formatoFechaCorta(valor: string | null) {
  if (!valor) return "-";
  return new Date(valor).toLocaleDateString("es-CO");
}

function formatoCuotas(valor: number | null) {
  if (valor === null || Number.isNaN(Number(valor))) {
    return "-";
  }

  return `${valor} cuota${valor === 1 ? "" : "s"}`;
}

function toneClass(tone: string) {
  switch (tone) {
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "red":
      return "border-red-200 bg-red-50 text-red-700";
    case "indigo":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function bloqueoClass(locked: boolean) {
  return locked
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function estadoBusqueda(queryType: QueryType, search: string) {
  if (!search) {
    return "Mostrando dispositivos recientes de Nuovo.";
  }

  return queryType === "device"
    ? `Consulta exacta por DEVICE ${search}.`
    : `Coincidencias en Nuovo para IMEI ${search}.`;
}

export default function NuovoPayPage() {
  const [queryType, setQueryType] = useState<QueryType>("imei");
  const [search, setSearch] = useState("");
  const [resultado, setResultado] = useState<NuovoPayResponse | null>(null);
  const [carteraData, setCarteraData] = useState<CarteraResponse | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [subiendoCartera, setSubiendoCartera] = useState(false);
  const [bloqueandoCartera, setBloqueandoCartera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const consultarRef = useRef<
    (
      options?: {
        queryType?: QueryType;
        search?: string;
        deviceId?: number | null;
      }
    ) => Promise<void>
  >(async () => {});

  const syncUrl = useCallback(
    (
      nextQueryType: QueryType,
      nextSearch: string,
      selectedDeviceId?: number | null
    ) => {
      const params = new URLSearchParams();

      if (nextQueryType === "imei" && nextSearch) {
        params.set("imei", nextSearch);
      }

      if (nextQueryType === "device" && nextSearch) {
        params.set("device", nextSearch);
      }

      if (selectedDeviceId) {
        params.set("deviceId", String(selectedDeviceId));
      }

      const nextUrl = params.toString()
        ? `/dashboard/nuovopay?${params.toString()}`
        : "/dashboard/nuovopay";

      window.history.replaceState(null, "", nextUrl);
    },
    []
  );

  const cargarCartera = useCallback(async () => {
    try {
      const res = await fetch("/api/nuovopay/cartera", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error consultando cartera");
      }

      setCarteraData(data);
    } catch (error) {
      console.error("ERROR CARGANDO CARTERA NUOVO:", error);
    }
  }, []);

  const consultar = useCallback(
    async (options?: {
      queryType?: QueryType;
      search?: string;
      deviceId?: number | null;
    }) => {
      const nextQueryType = options?.queryType ?? queryType;
      const nextSearch =
        nextQueryType === "imei"
          ? limpiarImei(options?.search ?? search)
          : limpiarDevice(options?.search ?? search);
      const nextDeviceId = Number(options?.deviceId || 0);

      if (nextQueryType === "device" && !nextSearch && !nextDeviceId) {
        setMensaje("Debes ingresar un DEVICE ID valido");
        return;
      }

      try {
        setCargando(true);
        setMensaje("");

        const params = new URLSearchParams({
          queryType: nextQueryType,
        });

        if (nextSearch) {
          params.set("search", nextSearch);
        }

        if (nextDeviceId) {
          params.set("deviceId", String(nextDeviceId));
        }

        const res = await fetch(`/api/nuovopay?${params.toString()}`, {
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok) {
          setMensaje(data.error || "Error consultando Nuovo Pay");
          return;
        }

        setResultado(data);
        setQueryType(nextQueryType);
        setSearch(nextSearch);
        syncUrl(nextQueryType, nextSearch, data.selectedDevice?.deviceId || null);
      } catch {
        setMensaje("Error consultando Nuovo Pay");
      } finally {
        setCargando(false);
      }
    },
    [queryType, search, syncUrl]
  );

  useEffect(() => {
    consultarRef.current = consultar;
  }, [consultar]);

  useEffect(() => {
    void cargarCartera();
  }, [cargarCartera]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const imeiUrl = limpiarImei(params.get("imei") || params.get("search") || "");
    const deviceUrl = limpiarDevice(params.get("device") || "");
    const deviceIdUrl = Number(params.get("deviceId") || 0);

    if (deviceUrl) {
      setQueryType("device");
      setSearch(deviceUrl);
      void consultarRef.current({
        queryType: "device",
        search: deviceUrl,
        deviceId: deviceIdUrl || Number(deviceUrl),
      });
      return;
    }

    if (imeiUrl) {
      setQueryType("imei");
      setSearch(imeiUrl);
      void consultarRef.current({
        queryType: "imei",
        search: imeiUrl,
        deviceId: deviceIdUrl || null,
      });
      return;
    }

    if (deviceIdUrl) {
      setQueryType("device");
      setSearch(String(deviceIdUrl));
      void consultarRef.current({
        queryType: "device",
        search: String(deviceIdUrl),
        deviceId: deviceIdUrl,
      });
      return;
    }

    void consultarRef.current({
      queryType: "imei",
      search: "",
    });
  }, []);

  useLiveRefresh(
    async () => {
      await consultar({
        queryType,
        search,
        deviceId: resultado?.selectedDevice?.deviceId || null,
      });
    },
    {
      intervalMs: 12000,
      enabled: Boolean(
        resultado?.configured &&
          (resultado?.matches.length || resultado?.selectedDevice)
      ),
    }
  );

  useLiveRefresh(
    async () => {
      await cargarCartera();
    },
    {
      intervalMs: 15000,
      enabled: Boolean(carteraData?.latestImport),
    }
  );

  const ejecutarAccion = async (action: "lock" | "unlock") => {
    if (!resultado?.selectedDevice?.deviceId) {
      return;
    }

    try {
      setProcesando(true);
      setMensaje("");

      const res = await fetch("/api/nuovopay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          imei:
            resultado.selectedDevice.imei ||
            resultado.selectedDevice.imei2 ||
            "",
          deviceId: resultado.selectedDevice.deviceId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error ejecutando accion");
        return;
      }

      setResultado((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          selectedDevice: data.device,
          matches: current.matches.map((item) =>
            item.deviceId === data.device.deviceId ? data.device : item
          ),
        };
      });

      setMensaje(data.mensaje || "Accion ejecutada correctamente");
    } catch {
      setMensaje("Error ejecutando accion");
    } finally {
      setProcesando(false);
    }
  };

  const cargarArchivoCartera = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setSubiendoCartera(true);
      setMensaje("");

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/nuovopay/cartera", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error cargando archivo de cartera");
        return;
      }

      setCarteraData({
        configured: Boolean(data.configured),
        latestImport: data.latestImport,
      });
      setMensaje(data.mensaje || "Archivo cargado correctamente");
    } catch {
      setMensaje("Error cargando archivo de cartera");
    } finally {
      event.target.value = "";
      setSubiendoCartera(false);
    }
  };

  const ejecutarBloqueoCartera = async () => {
    if (!carteraData?.latestImport?.id) {
      setMensaje("Primero debes cargar un archivo de cartera.");
      return;
    }

    try {
      setBloqueandoCartera(true);
      setMensaje("");

      const res = await fetch("/api/nuovopay/cartera", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cargaId: carteraData.latestImport.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error generando bloqueo por cartera");
        return;
      }

      setCarteraData({
        configured: Boolean(data.configured),
        latestImport: data.latestImport,
      });
      setMensaje(data.mensaje || "Bloqueo procesado correctamente");
    } catch {
      setMensaje("Error generando bloqueo por cartera");
    } finally {
      setBloqueandoCartera(false);
    }
  };

  const lookupImei = useMemo(
    () =>
      resultado?.selectedDevice?.imei ||
      resultado?.selectedDevice?.imei2 ||
      (queryType === "imei" ? search : ""),
    [queryType, resultado, search]
  );

  const cantidadRegistrosLocales = resultado?.localItems.length ?? 0;
  const latestImport = carteraData?.latestImport ?? null;
  const analytics = latestImport?.analytics ?? null;

  return (
    <div className="min-h-screen bg-[#f5f6fa] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
              Integracion
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
              Nuovo Pay
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
              Consulta dispositivos directamente desde Nuovo, valida si la
              inscripcion quedo aprobada y ejecuta bloqueo o desbloqueo desde tu
              sistema.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Volver
            </Link>
          </div>
        </div>

        {mensaje && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {mensaje}
          </div>
        )}

        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex flex-col gap-3 lg:w-56">
              <span className="text-sm font-semibold text-slate-700">
                Tipo de consulta
              </span>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  onClick={() => {
                    setQueryType("imei");
                    setSearch("");
                    setResultado(null);
                    setMensaje("");
                    syncUrl("imei", "", null);
                    void consultar({
                      queryType: "imei",
                      search: "",
                    });
                  }}
                  className={[
                    "rounded-[18px] px-4 py-3 text-sm font-semibold transition",
                    queryType === "imei"
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  ].join(" ")}
                >
                  IMEI
                </button>

                <button
                  onClick={() => {
                    setQueryType("device");
                    setSearch("");
                    setResultado(null);
                    setMensaje("");
                    syncUrl("device", "", null);
                  }}
                  className={[
                    "rounded-[18px] px-4 py-3 text-sm font-semibold transition",
                    queryType === "device"
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  ].join(" ")}
                >
                  DEVICE
                </button>
              </div>
            </div>

            <div className="flex-1">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                {queryType === "imei"
                  ? "Buscar IMEI en dispositivos Nuovo"
                  : "Buscar por DEVICE ID"}
              </label>
              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    queryType === "imei"
                      ? limpiarImei(event.target.value)
                      : limpiarDevice(event.target.value)
                  )
                }
                placeholder={
                  queryType === "imei"
                    ? "Ingresa un IMEI o deja vacio para ver dispositivos"
                    : "Ingresa el DEVICE ID"
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <button
              onClick={() =>
                void consultar({
                  queryType,
                  search,
                })
              }
              disabled={cargando}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
            >
              {cargando
                ? "Consultando..."
                : queryType === "imei"
                  ? "Buscar en Nuovo"
                  : "Consultar device"}
            </button>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            {estadoBusqueda(queryType, search)}
          </p>
        </div>

        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Panel Nuovo exclusivo
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                Cargar archivo de cartera y analitica de riesgo
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sube el archivo TXT de cartera para conservar el historico del
                ultimo corte, detectar dispositivos bloqueables por mora mayor a
                5 dias y revisar el comportamiento comercial de tus clientes. En
                Nuovo el cruce se hace contra el{" "}
                <span className="font-semibold text-slate-700">Device Name</span>.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                onChange={(event) => void cargarArchivoCartera(event)}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={subiendoCartera}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
              >
                {subiendoCartera
                  ? "Cargando archivo..."
                  : "CARGAR ARCHIVO DE CARTERA"}
              </button>

              <button
                onClick={() => void ejecutarBloqueoCartera()}
                disabled={
                  bloqueandoCartera ||
                  !latestImport?.id ||
                  !Boolean(carteraData?.configured)
                }
                className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bloqueandoCartera
                  ? "Procesando bloqueo..."
                  : "Generar bloqueo mora > 5 dias"}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">
                Mora mayor a 5 dias
              </p>
              <p className="mt-3 text-3xl font-black text-red-700">
                {analytics?.totalBloqueables ?? 0}
              </p>
              <p className="mt-2 text-sm text-red-700/80">
                Dispositivos listos para bloqueo desde el ultimo cargue.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Top clientes al dia
              </p>
              <p className="mt-3 text-3xl font-black text-emerald-700">
                {analytics?.totalBuenosClientes ?? 0}
              </p>
              <p className="mt-2 text-sm text-emerald-700/80">
                Clientes con buen comportamiento de pago y sin mora.
              </p>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
                Por finalizar credito
              </p>
              <p className="mt-3 text-3xl font-black text-indigo-700">
                {analytics?.totalPorFinalizar ?? 0}
              </p>
              <p className="mt-2 text-sm text-indigo-700/80">
                Clientes que solo tienen 1 o 2 cuotas pendientes.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Dispositivos que tengo que bloquear
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Clientes con mora mayor a 5 dias identificados en el ultimo
                    archivo cargado. Se priorizan por dias vencidos y saldo.
                  </p>
                </div>

                {latestImport && (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    #{latestImport.id}
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {!latestImport ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                    Todavia no hay registros de cartera cargados.
                  </div>
                ) : !analytics || analytics.blockCandidates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-4 py-6 text-sm text-emerald-700">
                    No hay dispositivos con mora mayor a 5 dias en el ultimo
                    cargue.
                  </div>
                ) : (
                  analytics.blockCandidates.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-base font-black text-slate-950">
                            {item.deviceName || `Cedula ${item.cedula}`}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Cedula {item.cedula} | Credito {item.numeroCredito || "-"} |{" "}
                            {item.sucursal || item.ubicacion || "Sin ubicacion"}
                          </p>
                        </div>

                        <div className="grid gap-2 text-left lg:text-right">
                          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                            {item.diasVencido} dias vencido
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {item.resultadoBloqueo || (item.bloqueoAplicado ? "Bloqueado" : "Pendiente")}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Saldo
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {formatoPesos(item.saldoObligacion || 0)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Cuotas pendientes
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {formatoCuotas(item.cuotasPendientes)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Proxima cuota
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {formatoFechaCorta(item.fechaProximaCuota)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Device / IMEI
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {item.deviceId ? `#${item.deviceId}` : "Sin cruce"}
                            {item.deviceImei ? ` | ${item.deviceImei}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Ultimo cargue
                </p>
                {latestImport ? (
                  <>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {latestImport.nombreArchivo}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      {latestImport.totalRegistros} registros |{" "}
                      {latestImport.totalMoraMayorCinco} con mora mayor a 5 dias
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Subido por {latestImport.subidoPor.nombre} el{" "}
                      {formatoFecha(latestImport.createdAt)}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    Aun no se ha cargado un archivo de cartera.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Resumen de procesamiento
                </p>
                {latestImport ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Cedulas analizadas
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-950">
                        {latestImport.totalCedulasAnalizadas || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Coincidencias Nuovo
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-950">
                        {latestImport.totalCoincidenciasNuovo || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Bloqueados
                      </p>
                      <p className="mt-1 text-lg font-black text-red-600">
                        {latestImport.totalBloqueados || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Ya bloqueados
                      </p>
                      <p className="mt-1 text-lg font-black text-amber-600">
                        {latestImport.totalYaBloqueados || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Sin coincidencia
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-950">
                        {latestImport.totalSinCoincidencia || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Ultimo proceso
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {latestImport.procesadoBloqueoEn
                          ? formatoFecha(latestImport.procesadoBloqueoEn)
                          : "Pendiente"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    Cuando cargues el primer archivo veras aqui el resumen del
                    procesamiento.
                  </p>
                )}
              </div>

              {carteraData && !carteraData.configured && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  Configura <span className="font-semibold">NUOVOPAY_API_TOKEN</span>{" "}
                  para habilitar el bloqueo masivo.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Top 10 mejores clientes
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Clientes con mejor comportamiento segun mora, cuotas
                    pendientes y constancia de pago.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {!latestImport ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                    Todavia no hay cargues para calcular el top de clientes.
                  </div>
                ) : !analytics || analytics.topGoodClients.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                    El ultimo cargue no tiene clientes destacados para este top.
                  </div>
                ) : (
                  analytics.topGoodClients.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-base font-black text-slate-950">
                            #{index + 1} {item.deviceName || `Cedula ${item.cedula}`}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Credito {item.numeroCredito || "-"} | Cedula {item.cedula}
                          </p>
                        </div>

                        <div className="grid gap-2 text-left lg:text-right">
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Sin mora
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {formatoCuotas(item.cuotasPendientes)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Saldo
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {formatoPesos(item.saldoObligacion || 0)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Modalidad
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {item.modalidad || "-"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Ultimo abono
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            {formatoFechaCorta(item.ultimoAbonoEn)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Proxima cuota
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            {formatoFechaCorta(item.fechaProximaCuota)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Top 10 clientes por finalizar
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Clientes que estan a 1 o 2 cuotas de terminar su credito.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {!latestImport ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                    Todavia no hay cargues para calcular este top.
                  </div>
                ) : !analytics || analytics.topNearFinishClients.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                    El ultimo cargue no tiene clientes con 1 o 2 cuotas pendientes.
                  </div>
                ) : (
                  analytics.topNearFinishClients.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-base font-black text-slate-950">
                            #{index + 1} {item.deviceName || `Cedula ${item.cedula}`}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Credito {item.numeroCredito || "-"} | Cedula {item.cedula}
                          </p>
                        </div>

                        <div className="grid gap-2 text-left lg:text-right">
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                            {formatoCuotas(item.cuotasPendientes)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {item.diasVencido} dias vencido
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Saldo
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {formatoPesos(item.saldoObligacion || 0)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Valor cuota
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {formatoPesos(item.valorCuota || 0)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Proxima cuota
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            {formatoFechaCorta(item.fechaProximaCuota)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Gestion / Estado
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-700">
                            {item.estadoGestion || item.estado || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Vista previa del ultimo cargue
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Primeros registros del archivo para validar el corte cargado,
                  el cruce con Nuovo y el estado del bloqueo.
                </p>
              </div>

              {latestImport && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  #{latestImport.id}
                </span>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {!latestImport ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                  Todavia no hay registros de cartera cargados.
                </div>
              ) : latestImport.previewRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                  El cargue existe, pero no hay filas para mostrar en la vista previa.
                </div>
              ) : (
                latestImport.previewRows.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-base font-black text-slate-950">
                          Cedula {item.cedula}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Credito {item.numeroCredito || "-"} | {item.modalidad || "Sin modalidad"} |{" "}
                          {item.sucursal || item.ubicacion || "Sin ubicacion"}
                        </p>
                      </div>

                      <div className="grid gap-2 text-left lg:text-right">
                        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                          {item.diasVencido} dias vencido
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                          {item.resultadoBloqueo || (item.bloqueoAplicado ? "Bloqueado" : "Pendiente")}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Saldo obligacion
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {formatoPesos(item.saldoObligacion || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Device Nuovo
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {item.deviceName || "Pendiente de cruce"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Cuotas pendientes
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                          {formatoCuotas(item.cuotasPendientes)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Resultado
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                          {item.resultadoBloqueo || "Pendiente"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {resultado && !resultado.configured && (
          <div className="mb-6 rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
            Falta configurar <span className="font-semibold">NUOVOPAY_API_TOKEN</span>{" "}
            en el entorno del servidor para poder consultar dispositivos de
            Nuovo y ejecutar bloqueo o desbloqueo.
          </div>
        )}

        {resultado && (
          <>
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Nuovo dispositivos
                    </div>
                    <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                      Resultados desde Nuovo
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {resultado.matches.length} dispositivo
                      {resultado.matches.length === 1 ? "" : "s"} encontrado
                      {resultado.matches.length === 1 ? "" : "s"}.
                    </p>
                  </div>

                  <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {queryType.toUpperCase()}
                  </span>
                </div>

                <div className="mt-6 space-y-3">
                  {!resultado.configured ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      Configura el token para consultar el listado de Nuovo.
                    </div>
                  ) : resultado.matches.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      Nuovo no devolvio dispositivos para esta consulta.
                    </div>
                  ) : (
                    resultado.matches.map((device) => {
                      const selected =
                        resultado.selectedDevice?.deviceId === device.deviceId;

                      return (
                        <div
                          key={device.deviceId}
                          className={[
                            "rounded-2xl border px-4 py-4 transition",
                            selected
                              ? "border-slate-900 bg-slate-950 text-white shadow-md"
                              : "border-slate-200 bg-slate-50",
                          ].join(" ")}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={[
                                    "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                                    selected
                                      ? "border-white/15 bg-white/10 text-white"
                                      : "border-slate-200 bg-white text-slate-600",
                                  ].join(" ")}
                                >
                                  DEVICE #{device.deviceId}
                                </span>

                                <span
                                  className={[
                                    "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                                    selected
                                      ? "border-white/15 bg-white/10 text-white"
                                      : bloqueoClass(device.locked),
                                  ].join(" ")}
                                >
                                  {device.locked ? "Bloqueado" : "Desbloqueado"}
                                </span>
                              </div>

                              <div>
                                <p className="text-lg font-black">
                                  {device.customerName || device.name || "Sin nombre"}
                                </p>
                                <p
                                  className={[
                                    "mt-1 text-sm",
                                    selected ? "text-white/75" : "text-slate-500",
                                  ].join(" ")}
                                >
                                  IMEI: {device.imei || "-"}{" "}
                                  {device.imei2 ? `| IMEI 2: ${device.imei2}` : ""}
                                </p>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-3">
                                <div>
                                  <p
                                    className={[
                                      "text-[11px] font-semibold uppercase tracking-[0.18em]",
                                      selected ? "text-white/55" : "text-slate-500",
                                    ].join(" ")}
                                  >
                                    Estado
                                  </p>
                                  <p className="mt-1 text-sm font-semibold">
                                    {device.status || "-"}
                                  </p>
                                </div>

                                <div>
                                  <p
                                    className={[
                                      "text-[11px] font-semibold uppercase tracking-[0.18em]",
                                      selected ? "text-white/55" : "text-slate-500",
                                    ].join(" ")}
                                  >
                                    Serial
                                  </p>
                                  <p className="mt-1 text-sm font-semibold">
                                    {device.serial || "-"}
                                  </p>
                                </div>

                                <div>
                                  <p
                                    className={[
                                      "text-[11px] font-semibold uppercase tracking-[0.18em]",
                                      selected ? "text-white/55" : "text-slate-500",
                                    ].join(" ")}
                                  >
                                    Inscripcion
                                  </p>
                                  <p className="mt-1 text-sm font-semibold">
                                    {device.enrollment.label}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  void consultar({
                                    queryType,
                                    search,
                                    deviceId: device.deviceId,
                                  })
                                }
                                className={[
                                  "rounded-2xl px-4 py-3 text-sm font-semibold transition",
                                  selected
                                    ? "border border-white/15 bg-white text-slate-950 hover:bg-slate-100"
                                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                                ].join(" ")}
                              >
                                {selected ? "Seleccionado" : "Consultar"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Detalle Nuovo
                    </div>
                    <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                      Estado del dispositivo
                    </h2>
                  </div>

                  {resultado.selectedDevice && (
                    <span
                      className={[
                        "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]",
                        toneClass(resultado.selectedDevice.enrollment.tone),
                      ].join(" ")}
                    >
                      Inscripcion {resultado.selectedDevice.enrollment.label}
                    </span>
                  )}
                </div>

                {!resultado.selectedDevice ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Selecciona un dispositivo de la lista para ver detalle,
                    validacion de inscripcion y opciones de bloqueo.
                  </div>
                ) : (
                  <div className="mt-6 space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Device ID
                          </p>
                          <p className="mt-2 text-lg font-black text-slate-950">
                            #{resultado.selectedDevice.deviceId}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Bloqueo
                          </p>
                          <p className="mt-2 text-lg font-black text-slate-950">
                            {resultado.selectedDevice.locked
                              ? "Bloqueado"
                              : "Desbloqueado"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Estado Nuovo
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {resultado.selectedDevice.status || "-"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Inscrito en
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {formatoFecha(resultado.selectedDevice.enrolledOn)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      className={[
                        "rounded-2xl border px-4 py-4",
                        toneClass(resultado.selectedDevice.enrollment.tone),
                      ].join(" ")}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                        Verificacion de inscripcion
                      </p>
                      <p className="mt-2 text-lg font-black">
                        {resultado.selectedDevice.enrollment.label}
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        {resultado.selectedDevice.enrollment.detail}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          IMEI principal
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {resultado.selectedDevice.imei || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          IMEI secundario
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {resultado.selectedDevice.imei2 || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Cliente
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {resultado.selectedDevice.customerName || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Correo cliente
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {resultado.selectedDevice.customerEmail || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Equipo
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {resultado.selectedDevice.make || "-"}{" "}
                          {resultado.selectedDevice.model || ""}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Telefono
                        </p>
                        <p className="mt-2 text-base font-bold text-slate-950">
                          {resultado.selectedDevice.phone || "-"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() =>
                          void consultar({
                            queryType,
                            search,
                            deviceId: resultado.selectedDevice?.deviceId || null,
                          })
                        }
                        disabled={cargando}
                        className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
                      >
                        Refrescar estado
                      </button>

                      {resultado.canManage && !resultado.selectedDevice.locked && (
                        <button
                          onClick={() => void ejecutarAccion("lock")}
                          disabled={procesando}
                          className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-70"
                        >
                          {procesando ? "Procesando..." : "Bloquear dispositivo"}
                        </button>
                      )}

                      {resultado.canManage && resultado.selectedDevice.locked && (
                        <button
                          onClick={() => void ejecutarAccion("unlock")}
                          disabled={procesando}
                          className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
                        >
                          {procesando ? "Procesando..." : "Desbloquear dispositivo"}
                        </button>
                      )}
                    </div>

                    {!resultado.canManage && (
                      <p className="text-sm text-slate-500">
                        Este usuario no tiene permisos para ejecutar acciones en
                        Nuovo Pay.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>

            <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Sistema local
                  </div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                    Cruce con tu inventario
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {lookupImei
                      ? `${cantidadRegistrosLocales} registro${cantidadRegistrosLocales === 1 ? "" : "s"} local${cantidadRegistrosLocales === 1 ? "" : "es"} para el IMEI ${lookupImei}.`
                      : "Selecciona un dispositivo de Nuovo para revisar su rastro local."}
                  </p>
                </div>

                {lookupImei && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {lookupImei}
                  </span>
                )}
              </div>

              <div className="mt-6 space-y-4">
                {!lookupImei ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Aun no hay un IMEI seleccionado para cruzar contra el sistema
                    local.
                  </div>
                ) : resultado.localItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    No se encontraron registros en inventario de sede para este
                    IMEI dentro de tu alcance.
                  </div>
                ) : (
                  resultado.localItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-lg font-bold text-slate-950">
                            {item.referencia}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {item.sede?.nombre ?? `SEDE ${item.sedeId}`} |{" "}
                            {formatoPesos(item.costo)}
                          </p>
                        </div>

                        <Link
                          href="/inventario"
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Ver inventario
                        </Link>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-white bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Estado actual
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {item.estadoActual}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Estado financiero
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {item.estadoFinanciero}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Debe a
                          </p>
                          <p className="mt-2 text-base font-bold text-slate-950">
                            {item.deboA || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {resultado.localPrincipal && (
                  <div className="rounded-2xl border border-[#e7decb] bg-[#faf6ee] px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8f5b24]">
                      Bodega principal
                    </p>
                    <p className="mt-2 text-base font-bold text-slate-950">
                      {resultado.localPrincipal.referencia}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Estado: {resultado.localPrincipal.estado || "-"} | Cobro:{" "}
                      {resultado.localPrincipal.estadoCobro || "-"}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
