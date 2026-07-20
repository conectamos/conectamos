"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon, {
  type DashboardIconName,
} from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import { useLiveRefresh } from "@/lib/use-live-refresh";

type CajaMovimiento = {
  id: number;
  tipo: string;
  concepto: string;
  valor: number;
  descripcion: string | null;
  sedeId: number;
  createdAt: string;
  editable: boolean;
  sede?: {
    nombre: string;
  };
};

type CajaResumen = {
  totalIngresos: number;
  totalEgresos: number;
  saldo: number;
  totalMovimientos: number;
};

type CajaResponse =
  | CajaMovimiento[]
  | {
      movimientos: CajaMovimiento[];
      resumen: CajaResumen;
    };

type SessionUser = {
  id: number;
  nombre: string;
  usuario: string;
  sedeId: number;
  sedeNombre: string;
  rolId: number;
  rolNombre: string;
};

type Sede = {
  id: number;
  nombre: string;
};

function limpiarNumero(value: string) {
  return value.replace(/\D/g, "");
}

function formatoPesos(valor: string | number) {
  return `$ ${Number(valor || 0).toLocaleString("es-CO")}`;
}

function formatoFecha(valor: string) {
  return new Date(valor).toLocaleString("es-CO");
}

function extraerNombreArchivo(
  contentDisposition: string | null,
  fallback: string
) {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

function describirPeriodo(fechaDesde: string, fechaHasta: string) {
  if (fechaDesde && fechaHasta) {
    return fechaDesde === fechaHasta
      ? fechaDesde
      : `${fechaDesde} a ${fechaHasta}`;
  }

  if (fechaDesde) {
    return `Desde ${fechaDesde}`;
  }

  if (fechaHasta) {
    return `Hasta ${fechaHasta}`;
  }

  return "Todo el historial";
}

function tipoBadgeClass(tipo: string) {
  return String(tipo || "").toUpperCase() === "INGRESO"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
}

function CajaMetricCard({
  detail,
  icon,
  iconClass,
  label,
  value,
  valueClass,
}: {
  detail: string;
  icon: DashboardIconName;
  iconClass: string;
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <article className="min-h-[144px] rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <DashboardIcon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className={`mt-1.5 break-words text-[27px] font-black leading-tight tracking-tight ${valueClass}`}>
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

export default function CajaPage() {
  const [movimientos, setMovimientos] = useState<CajaMovimiento[]>([]);
  const [resumenCaja, setResumenCaja] = useState<CajaResumen | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [editandoMovimiento, setEditandoMovimiento] =
    useState<CajaMovimiento | null>(null);
  const [tipoEdicion, setTipoEdicion] = useState<"INGRESO" | "EGRESO">(
    "INGRESO"
  );
  const [conceptoEdicion, setConceptoEdicion] = useState("");
  const [valorEdicion, setValorEdicion] = useState("");
  const [descripcionEdicion, setDescripcionEdicion] = useState("");
  const [sedeEdicionId, setSedeEdicionId] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [cargandoCaja, setCargandoCaja] = useState(true);

  const esAdmin = ["ADMIN", "AUDITOR"].includes(user?.rolNombre?.toUpperCase() || "");

  const construirParametrosCaja = useCallback(() => {
    const params = new URLSearchParams();

    if (esAdmin && sedeFiltroId !== "TODAS") {
      params.set("sedeId", sedeFiltroId);
    }

    if (fechaDesde) {
      params.set("fechaDesde", fechaDesde);
    }

    if (fechaHasta) {
      params.set("fechaHasta", fechaHasta);
    }

    return params;
  }, [esAdmin, fechaDesde, fechaHasta, sedeFiltroId]);

  const cargarUsuario = async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setUser(data);
      }
    } catch {}
  };

  const cargarSedes = async () => {
    try {
      const res = await fetch("/api/sedes", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setSedes(Array.isArray(data) ? data : []);
      }
    } catch {}
  };

  const cargarCaja = useCallback(async () => {
    try {
      if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
        setMensaje("La fecha inicial no puede ser mayor que la fecha final");
        return;
      }

      const params = construirParametrosCaja();

      params.set("resumen", "1");
      params.set("limit", "300");

      const endpoint = params.size
        ? `/api/caja?${params.toString()}`
        : "/api/caja";

      const res = await fetch(endpoint, { cache: "no-store" });
      const data = (await res.json()) as CajaResponse;

      if (!res.ok) {
        setMensaje(
          typeof data === "object" && data && "error" in data
            ? String(data.error || "Error cargando caja")
            : "Error cargando caja"
        );
        return;
      }

      setMovimientos(Array.isArray(data) ? data : data.movimientos ?? []);
      setResumenCaja(Array.isArray(data) ? null : data.resumen ?? null);
      setMensaje("");
    } catch {
      setMensaje("Error cargando caja");
    } finally {
      setCargandoCaja(false);
    }
  }, [construirParametrosCaja, fechaDesde, fechaHasta]);

  useEffect(() => {
    const init = async () => {
      await cargarUsuario();
      await cargarSedes();
    };

    void init();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const timer = window.setTimeout(() => {
      void cargarCaja();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [cargarCaja, user]);

  useLiveRefresh(cargarCaja, { intervalMs: 30000 });

  const cancelarEdicion = () => {
    setEditandoMovimiento(null);
    setTipoEdicion("INGRESO");
    setConceptoEdicion("");
    setValorEdicion("");
    setDescripcionEdicion("");
    setSedeEdicionId("");
  };

  const iniciarEdicion = (movimiento: CajaMovimiento) => {
    setEditandoMovimiento(movimiento);
    setTipoEdicion(
      String(movimiento.tipo || "").toUpperCase() === "EGRESO"
        ? "EGRESO"
        : "INGRESO"
    );
    setConceptoEdicion(movimiento.concepto || "");
    setValorEdicion(String(Math.trunc(Number(movimiento.valor || 0))));
    setDescripcionEdicion(movimiento.descripcion || "");
    setSedeEdicionId(String(movimiento.sedeId || ""));
    setMensaje("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const guardarEdicion = async () => {
    if (!editandoMovimiento) {
      return;
    }

    try {
      setGuardandoEdicion(true);
      setMensaje("");

      if (!conceptoEdicion.trim()) {
        setMensaje("Debes ingresar el concepto");
        return;
      }

      if (!valorEdicion || Number(valorEdicion) <= 0) {
        setMensaje("Debes ingresar un valor mayor a 0");
        return;
      }

      if (!sedeEdicionId || Number(sedeEdicionId) <= 0) {
        setMensaje("Debes seleccionar la sede");
        return;
      }

      const res = await fetch(`/api/caja?id=${editandoMovimiento.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tipo: tipoEdicion,
          concepto: conceptoEdicion,
          valor: Number(valorEdicion),
          descripcion: descripcionEdicion,
          sedeId: Number(sedeEdicionId),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo actualizar el movimiento");
        return;
      }

      setMensaje(data.mensaje || "Movimiento actualizado correctamente");
      cancelarEdicion();
      await cargarCaja();
    } catch {
      setMensaje("Error actualizando movimiento");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const limpiarFiltroFechas = () => {
    setFechaDesde("");
    setFechaHasta("");
  };

  const exportarExcel = async () => {
    try {
      if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
        setMensaje("La fecha inicial no puede ser mayor que la fecha final");
        return;
      }

      setExportandoExcel(true);
      setMensaje("");

      const params = construirParametrosCaja();
      const endpoint = params.size
        ? `/api/caja/export?${params.toString()}`
        : "/api/caja/export";
      const res = await fetch(endpoint, { cache: "no-store" });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setMensaje(data.error || "No se pudo exportar el Excel");
        return;
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = extraerNombreArchivo(
        res.headers.get("Content-Disposition"),
        "movimientos-caja.xlsx"
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch {
      setMensaje("Error exportando el Excel de caja");
    } finally {
      setExportandoExcel(false);
    }
  };

  const sedeFiltroNombre = useMemo(() => {
    if (!esAdmin) {
      return user?.sedeNombre || "tu sede";
    }

    if (sedeFiltroId === "TODAS") {
      return "todas las sedes";
    }

    return (
      sedes.find((sede) => String(sede.id) === sedeFiltroId)?.nombre ||
      "la sede seleccionada"
    );
  }, [esAdmin, sedeFiltroId, sedes, user?.sedeNombre]);

  const periodoActivoTexto = useMemo(
    () => describirPeriodo(fechaDesde, fechaHasta),
    [fechaDesde, fechaHasta]
  );

  const totalIngresos = useMemo(
    () =>
      resumenCaja?.totalIngresos ??
      movimientos
          .filter((movimiento) => movimiento.tipo === "INGRESO")
          .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0),
    [movimientos, resumenCaja]
  );

  const totalEgresos = useMemo(
    () =>
      resumenCaja?.totalEgresos ??
      movimientos
          .filter((movimiento) => movimiento.tipo === "EGRESO")
          .reduce((acc, movimiento) => acc + Number(movimiento.valor || 0), 0),
    [movimientos, resumenCaja]
  );

  const saldo = resumenCaja?.saldo ?? totalIngresos - totalEgresos;
  const ultimoMovimiento = movimientos[0] ?? null;
  const totalMovimientos = resumenCaja?.totalMovimientos ?? movimientos.length;
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
  const inicialesUsuario = String(user?.nombre || user?.usuario || "Usuario")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/caja"
        coverageLabel={user?.sedeNombre || "Cargando cobertura"}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h1 className="text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                {esAdmin ? "Caja consolidada" : "Caja de la sede"}
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                Control de ingresos, egresos y saldo operativo
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Cobertura: {sedeFiltroNombre}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  {cargandoCaja ? "Actualizando movimientos" : `${totalMovimientos} movimientos`}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/caja/gestion"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e30613] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#bd0711]"
              >
                <span className="text-lg leading-none">+</span>
                Registrar movimiento
              </Link>
              <Link
                href="/caja/arqueo"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-[#e30613]"
              >
                Arqueo
              </Link>
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[185px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || <DashboardIcon name="user" className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {user?.nombre || user?.usuario || "Cargando usuario"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {user?.rolNombre || "Sesión activa"}
                  </p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-12 shrink-0 rounded-xl" />
            </div>
          </header>

          <section className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(210px,1fr)_180px_180px_auto_auto] xl:items-end">
              {esAdmin ? (
                <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                  Cobertura
                  <select
                    value={sedeFiltroId}
                    onChange={(event) => {
                      setCargandoCaja(true);
                      setSedeFiltroId(event.target.value);
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                  >
                    <option value="TODAS">Todas las sedes</option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={String(sede.id)}>
                        {sede.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="flex min-h-[46px] items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
                  {user?.sedeNombre || "Sede actual"}
                </div>
              )}

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Desde
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(event) => {
                    setCargandoCaja(true);
                    setFechaDesde(event.target.value);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Hasta
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(event) => {
                    setCargandoCaja(true);
                    setFechaHasta(event.target.value);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  setCargandoCaja(true);
                  limpiarFiltroFechas();
                }}
                className="min-h-[46px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-red-200 hover:text-[#e30613]"
              >
                Limpiar periodo
              </button>

              <button
                type="button"
                onClick={() => void exportarExcel()}
                disabled={exportandoExcel}
                className="min-h-[46px] rounded-xl bg-[#11161d] px-5 text-sm font-bold text-white transition hover:bg-[#e30613] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {exportandoExcel ? "Exportando..." : "Exportar Excel"}
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Periodo activo: <span className="font-bold text-slate-700">{periodoActivoTexto}</span>
              {ultimoMovimiento && (
                <> · Último registro: <span className="font-bold text-slate-700">{formatoFecha(ultimoMovimiento.createdAt)}</span></>
              )}
            </p>
          </section>

        {mensaje && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-700 shadow-sm">
            {mensaje}
          </div>
        )}

        {esAdmin && editandoMovimiento && (
          <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                  Edición de caja
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                  Movimiento #{editandoMovimiento.id}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Ajusta el ingreso o egreso manual registrado por la sede.
                </p>
              </div>

              <button
                type="button"
                onClick={cancelarEdicion}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Tipo
                <select
                  value={tipoEdicion}
                  onChange={(event) =>
                    setTipoEdicion(event.target.value as "INGRESO" | "EGRESO")
                  }
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200"
                >
                  <option value="INGRESO">INGRESO</option>
                  <option value="EGRESO">EGRESO</option>
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Sede
                <select
                  value={sedeEdicionId}
                  onChange={(event) => setSedeEdicionId(event.target.value)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200"
                >
                  <option value="">Seleccionar sede</option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={String(sede.id)}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Concepto
                <input
                  value={conceptoEdicion}
                  onChange={(event) => setConceptoEdicion(event.target.value)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Valor
                <input
                  value={valorEdicion ? formatoPesos(valorEdicion) : ""}
                  onChange={(event) =>
                    setValorEdicion(limpiarNumero(event.target.value))
                  }
                  placeholder="$ 0"
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                Descripcion
                <input
                  value={descripcionEdicion}
                  onChange={(event) => setDescripcionEdicion(event.target.value)}
                  placeholder="Detalle opcional"
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200"
                />
              </label>
            </div>

            <div className="flex justify-end border-t border-slate-200 px-6 py-5">
              <button
                type="button"
                onClick={() => void guardarEdicion()}
                disabled={guardandoEdicion}
                className="rounded-xl bg-[#e30613] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#bd0711] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </section>
        )}

        <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CajaMetricCard
            label="Ingresos"
            value={cargandoCaja ? "—" : formatoPesos(totalIngresos)}
            detail="Entradas registradas en caja."
            icon="trend"
            iconClass="bg-emerald-50 text-emerald-600"
            valueClass="text-emerald-600"
          />
          <CajaMetricCard
            label="Egresos"
            value={cargandoCaja ? "—" : formatoPesos(totalEgresos)}
            detail="Salidas operativas acumuladas."
            icon="cash"
            iconClass="bg-red-50 text-[#e30613]"
            valueClass="text-[#e30613]"
          />
          <CajaMetricCard
            label="Saldo"
            value={cargandoCaja ? "—" : formatoPesos(saldo)}
            detail="Balance neto de la vista actual."
            icon="cash"
            iconClass={saldo >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"}
            valueClass={saldo >= 0 ? "text-emerald-600" : "text-orange-600"}
          />
          <CajaMetricCard
            label="Último movimiento"
            value={cargandoCaja ? "—" : ultimoMovimiento?.concepto || "Sin registros"}
            detail={
              ultimoMovimiento
                ? formatoFecha(ultimoMovimiento.createdAt)
                : "Todavía no hay actividad en caja."
            }
            icon="reports"
            iconClass="bg-slate-100 text-slate-600"
            valueClass="text-slate-950"
          />
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#e30613]">
                Detalle operativo
              </div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                Movimientos de caja
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Historial limpio y legible de ingresos y egresos dentro de la
                cobertura actual.
              </p>
            </div>

            <div className="text-sm text-slate-500">
              Vista activa:{" "}
              <span className="font-semibold text-slate-900">
                {esAdmin
                  ? sedeFiltroId === "TODAS"
                    ? "Todas las sedes"
                    : sedeFiltroNombre
                  : user?.sedeNombre || "Sede actual"}
              </span>
              {" · "}Periodo:{" "}
              <span className="font-semibold text-slate-900">{periodoActivoTexto}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1280px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-4 text-left font-semibold">ID</th>
                  <th className="px-5 py-4 text-left font-semibold">Tipo</th>
                  <th className="px-5 py-4 text-left font-semibold">Concepto</th>
                  <th className="px-5 py-4 text-left font-semibold">Valor</th>
                  <th className="px-5 py-4 text-left font-semibold">Descripcion</th>
                  <th className="px-5 py-4 text-left font-semibold">Sede</th>
                  <th className="px-5 py-4 text-left font-semibold">Fecha</th>
                  {esAdmin && (
                    <th className="px-5 py-4 text-left font-semibold">Acciones</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {cargandoCaja ? (
                  <tr>
                    <td
                      colSpan={esAdmin ? 8 : 7}
                      className="px-6 py-16 text-center text-slate-500"
                    >
                      <span className="inline-flex items-center gap-3 font-semibold">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#e30613]" />
                        Cargando movimientos de caja...
                      </span>
                    </td>
                  </tr>
                ) : movimientos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={esAdmin ? 8 : 7}
                      className="px-6 py-16 text-center"
                    >
                      <div className="mx-auto max-w-md">
                        <p className="text-base font-semibold text-slate-900">
                          No hay movimientos para esta vista
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Cuando haya actividad en caja, aparecera aqui con el
                          mismo detalle operativo del resto del sistema.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  movimientos.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-slate-100 align-top transition hover:bg-slate-50/80"
                    >
                      <td className="px-5 py-5">
                        <span className="font-bold text-slate-950">#{item.id}</span>
                      </td>

                      <td className="px-5 py-5">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                            tipoBadgeClass(item.tipo),
                          ].join(" ")}
                        >
                          {item.tipo}
                        </span>
                      </td>

                      <td className="px-5 py-5">
                        <p className="max-w-[240px] font-semibold text-slate-950">
                          {item.concepto}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <p
                          className={[
                            "text-lg font-black",
                            item.tipo === "INGRESO"
                              ? "text-emerald-600"
                              : "text-red-600",
                          ].join(" ")}
                        >
                          {formatoPesos(item.valor)}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <p className="max-w-[360px] leading-6 text-slate-600">
                          {item.descripcion ?? "-"}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                          {item.sede?.nombre ?? "Sede sin configurar"}
                        </span>
                      </td>

                      <td className="px-5 py-5 text-slate-600">
                        {formatoFecha(item.createdAt)}
                      </td>

                      {esAdmin && (
                        <td className="px-5 py-5">
                          {item.editable ? (
                            <button
                              type="button"
                              onClick={() => iniciarEdicion(item)}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Editar
                            </button>
                          ) : (
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Protegido
                            </span>
                          )}
                        </td>
                      )}
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
