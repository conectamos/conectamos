"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import {
  calcularValorNetoFinanciera,
  extraerFinancierasDetalle,
  type CatalogoFinanciera,
} from "@/lib/ventas-financieras";

const SERVICIOS = ["ACTIVACIÓN", "CONTADO CLARO", "CONTADO LIBRES", "FINANCIERA"];
type FilaFin = {
  nombre: string;
  valor: string;
};

type CatalogoPersonalResponse = {
  jaladores: Array<{ nombre: string }>;
  cerradores: Array<{ nombre: string }>;
  financieras: CatalogoFinanciera[];
};

type SessionResponse = {
  nombre?: string | null;
  usuario?: string | null;
  sedeNombre?: string | null;
  rolNombre?: string | null;
  perfilNombre?: string | null;
  perfilTipoLabel?: string | null;
};

type VentaDetalle = {
  id: number;
  idVenta: string;
  fecha: string;
  hora: string | null;
  servicio: string;
  descripcion: string | null;
  serial: string;
  jalador: string | null;
  cerrador: string | null;
  ingreso1: string | null;
  ingreso2: string | null;
  primerValor: string | number | null;
  segundoValor: string | number | null;
  alcanos: string | number | null;
  payjoy: string | number | null;
  sistecredito: string | number | null;
  addi: string | number | null;
  sumaspay: string | number | null;
  celya: string | number | null;
  bogota: string | number | null;
  alocredit: string | number | null;
  esmio: string | number | null;
  kaiowa: string | number | null;
  finser: string | number | null;
  gora: string | number | null;
  financierasDetalle?: unknown;
  comision: string | number | null;
  salida: string | number | null;
  sede: { id: number; nombre: string } | null;
  inventarioSede: {
    id: number;
    referencia: string;
    color: string | null;
    costo: number;
  } | null;
};

function limpiarNumero(v: string) {
  return v.replace(/\D/g, "");
}

function formatoPesos(v: string | number) {
  if (v === "" || v === null || v === undefined) return "";
  const num = Number(v);
  if (!Number.isFinite(num)) return "";
  return `$ ${num.toLocaleString("es-CO")}`;
}

function netoIngreso(valor: number, tipo: string) {
  return tipo.toUpperCase() === "VOUCHER" ? valor * 0.95 : valor;
}

function cajaIngreso(valor: number, tipo: string) {
  const t = tipo.toUpperCase();
  if (t === "TRANSFERENCIA") return 0;
  if (t === "VOUCHER") return valor * 0.95;
  return valor;
}

function ocultaFinancieras(servicio: string) {
  const s = String(servicio || "").trim().toUpperCase();
  return s.includes("ACTIVACI") || s === "CONTADO CLARO" || s === "CONTADO LIBRES";
}

function inputBaseClass(readOnly = false) {
  return `min-h-12 w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition ${
    readOnly
      ? "cursor-default border-slate-200 bg-slate-50 text-slate-600"
      : "border-slate-300 bg-white text-slate-950 shadow-sm focus:border-[#e30613] focus:ring-2 focus:ring-red-100"
  }`;
}

function sectionTitleClass() {
  return "text-lg font-black tracking-tight text-slate-950";
}

function normalizeServicio(servicio: string) {
  const upper = String(servicio || "").trim().toUpperCase();

  if (upper.includes("ACTIVACI")) return "ACTIVACIÓN";
  if (upper === "CONTADO CLARO") return "CONTADO CLARO";
  if (upper === "CONTADO LIBRES") return "CONTADO LIBRES";
  return "FINANCIERA";
}

function reverseIngresoBase(valorGuardado: string | number | null, tipo: string | null) {
  const numero = Number(valorGuardado || 0);

  if (!numero) {
    return "";
  }

  if (String(tipo || "").toUpperCase() === "VOUCHER") {
    return String(Math.round(numero / 0.95));
  }

  return String(Math.round(numero));
}

function finanzasDesdeVenta(venta: VentaDetalle): FilaFin[] {
  const items = extraerFinancierasDetalle(venta as Record<string, unknown>).map((item) => ({
    nombre: item.nombre,
    valor: String(Math.round(Number(item.valorBruto || 0))),
  }));

  while (items.length < 4) {
    items.push({ nombre: "", valor: "" });
  }

  return items.slice(0, 4);
}

export default function EditarVentaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ventaId = Number(params?.id);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [ventaIdTexto, setVentaIdTexto] = useState("");
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [sessionActual, setSessionActual] = useState<SessionResponse | null>(null);
  const [jaladores, setJaladores] = useState<string[]>([]);
  const [cerradores, setCerradores] = useState<string[]>([]);
  const [financierasCatalogo, setFinancierasCatalogo] = useState<CatalogoFinanciera[]>([]);

  const [serial, setSerial] = useState("");
  const [servicio, setServicio] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [jalador, setJalador] = useState("");
  const [cerrador, setCerrador] = useState("");

  const [referencia, setReferencia] = useState("");
  const [color, setColor] = useState("");
  const [costoEquipo, setCostoEquipo] = useState(0);
  const [sedeNombre, setSedeNombre] = useState("");

  const [ingreso1Base, setIngreso1Base] = useState("");
  const [ingreso2Base, setIngreso2Base] = useState("");
  const [tipoIngreso1] = useState("EFECTIVO");
  const [tipoIngreso2, setTipoIngreso2] = useState("");
  const [usarIngreso2, setUsarIngreso2] = useState(false);

  const [comision, setComision] = useState("");
  const [salida, setSalida] = useState("");
  const [finanzas, setFinanzas] = useState<FilaFin[]>([
    { nombre: "", valor: "" },
    { nombre: "", valor: "" },
    { nombre: "", valor: "" },
    { nombre: "", valor: "" },
  ]);

  const mostrarFinancieras = !ocultaFinancieras(servicio);

  useEffect(() => {
    if (!mostrarFinancieras) {
      setFinanzas([
        { nombre: "", valor: "" },
        { nombre: "", valor: "" },
        { nombre: "", valor: "" },
        { nombre: "", valor: "" },
      ]);
    }
  }, [mostrarFinancieras]);

  useEffect(() => {
    if (!usarIngreso2) {
      setIngreso2Base("");
      setTipoIngreso2("");
    }
  }, [usarIngreso2]);

  useEffect(() => {
    const cargarCatalogoPersonal = async () => {
      try {
        const res = await fetch("/api/ventas/catalogo-personal", {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok) {
          return;
        }

        const catalogo = data as CatalogoPersonalResponse;

        setJaladores(
          Array.isArray(catalogo?.jaladores) && catalogo.jaladores.length
            ? catalogo.jaladores.map((item) => item.nombre)
            : []
        );
        setCerradores(
          Array.isArray(catalogo?.cerradores) && catalogo.cerradores.length
            ? catalogo.cerradores.map((item) => item.nombre)
            : []
        );
        setFinancierasCatalogo(
          Array.isArray(catalogo?.financieras) && catalogo.financieras.length
            ? catalogo.financieras
            : []
        );
      } catch {}
    };

    void cargarCatalogoPersonal();
  }, []);

  useEffect(() => {
    const cargarVenta = async () => {
      if (!Number.isInteger(ventaId) || ventaId <= 0) {
        setMensaje("La venta no es valida");
        setCargando(false);
        return;
      }

      try {
        const sessionRes = await fetch("/api/session", { cache: "no-store" });
        const sessionData = await sessionRes.json();

        if (!sessionRes.ok || !["ADMIN", "AUDITOR"].includes(String(sessionData?.rolNombre || "").toUpperCase())) {
          setMensaje("Solo el administrador puede editar ventas");
          setCargando(false);
          return;
        }

        setSessionActual(sessionData as SessionResponse);
        setPuedeEditar(true);

        const res = await fetch(`/api/ventas?id=${ventaId}`, { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          setMensaje(data.error || "No se pudo cargar la venta");
          setCargando(false);
          return;
        }

        const venta = data as VentaDetalle;
        setVentaIdTexto(venta.idVenta);
        setSerial(venta.serial || "");
        setServicio(normalizeServicio(venta.servicio || ""));
        setDescripcion(venta.descripcion || venta.inventarioSede?.referencia || "");
        setJalador(venta.jalador || "");
        setCerrador(venta.cerrador || "");
        setReferencia(venta.inventarioSede?.referencia || venta.descripcion || "");
        setColor(venta.inventarioSede?.color || "");
        setCostoEquipo(Number(venta.inventarioSede?.costo || 0));
        setSedeNombre(venta.sede?.nombre || "");
        setIngreso1Base(String(Math.round(Number(venta.primerValor || 0))));

        const baseIngreso2 = reverseIngresoBase(venta.segundoValor, venta.ingreso2);
        setIngreso2Base(baseIngreso2);
        setTipoIngreso2(venta.ingreso2 || "");
        setUsarIngreso2(Boolean(baseIngreso2 && Number(baseIngreso2) > 0));

        setComision(String(Math.round(Number(venta.comision || 0))));
        setSalida(String(Math.round(Number(venta.salida || 0))));
        setFinanzas(finanzasDesdeVenta(venta));
      } catch {
        setMensaje("Error cargando la venta");
      } finally {
        setCargando(false);
      }
    };

    void cargarVenta();
  }, [ventaId]);

  const ingreso1Neto = useMemo(
    () => netoIngreso(Number(ingreso1Base || 0), tipoIngreso1),
    [ingreso1Base, tipoIngreso1]
  );

  const ingreso2Neto = useMemo(
    () => netoIngreso(Number(ingreso2Base || 0), tipoIngreso2 || ""),
    [ingreso2Base, tipoIngreso2]
  );

  const ingreso2Mostrado = useMemo(() => {
    const base = Number(ingreso2Base || 0);
    if (!base) return "";

    if (String(tipoIngreso2 || "").toUpperCase() === "VOUCHER") {
      return formatoPesos(base);
    }

    return formatoPesos(base);
  }, [ingreso2Base, tipoIngreso2]);

  const totalIngresosNetos = ingreso1Neto + (usarIngreso2 ? ingreso2Neto : 0);

  const totalIngresosCaja = useMemo(
    () =>
      cajaIngreso(Number(ingreso1Base || 0), tipoIngreso1) +
      (usarIngreso2 ? cajaIngreso(Number(ingreso2Base || 0), tipoIngreso2 || "") : 0),
    [ingreso1Base, ingreso2Base, tipoIngreso1, tipoIngreso2, usarIngreso2]
  );

  const totalFinancierasNetas = useMemo(() => {
    if (!mostrarFinancieras) return 0;
    return finanzas.reduce(
      (acc, f) =>
        acc +
        calcularValorNetoFinanciera(
          f.nombre,
          Number(f.valor || 0),
          financierasCatalogo
        ),
      0
    );
  }, [finanzas, financierasCatalogo, mostrarFinancieras]);

  const utilidad = useMemo(() => {
    return (
      totalIngresosNetos +
      totalFinancierasNetas -
      Number(costoEquipo || 0) -
      Number(comision || 0) -
      Number(salida || 0)
    );
  }, [totalIngresosNetos, totalFinancierasNetas, costoEquipo, comision, salida]);

  const cajaOficina = useMemo(() => {
    return totalIngresosCaja - Number(comision || 0) - Number(salida || 0);
  }, [totalIngresosCaja, comision, salida]);

  const actualizarFin = (index: number, campo: "nombre" | "valor", valor: string) => {
    const copia = [...finanzas];
    copia[index] = { ...copia[index], [campo]: valor };
    setFinanzas(copia);
  };

  const visibleFin = (index: number) => {
    if (!mostrarFinancieras) return false;
    if (index === 0) return true;
    return Number(finanzas[index - 1].valor || 0) > 0;
  };

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      if (!puedeEditar) {
        setMensaje("Solo el administrador puede editar ventas");
        return;
      }

      if (!servicio) return setMensaje("Selecciona el servicio");
      if (!descripcion) return setMensaje("La descripcion es obligatoria");
      if (!jalador) return setMensaje("Selecciona el jalador");
      if (!cerrador) return setMensaje("Selecciona el cerrador");
      if (ingreso1Base === "") return setMensaje("Ingresa el valor del ingreso 1");
      if (usarIngreso2 && !ingreso2Base) return setMensaje("Ingresa el valor del ingreso 2");
      if (usarIngreso2 && !tipoIngreso2) return setMensaje("Selecciona el tipo del ingreso 2");

      const res = await fetch("/api/ventas", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: ventaId,
          servicio,
          descripcion,
          jalador,
          cerrador,
          ingreso1Base: Number(ingreso1Base || 0),
          ingreso2Base: usarIngreso2 ? Number(ingreso2Base || 0) : 0,
          tipoIngreso2: usarIngreso2 ? tipoIngreso2 : "",
          comision: Number(comision || 0),
          salida: Number(salida || 0),
          fin1Nombre: finanzas[0].nombre,
          fin1Valor: Number(finanzas[0].valor || 0),
          fin2Nombre: finanzas[1].nombre,
          fin2Valor: Number(finanzas[1].valor || 0),
          fin3Nombre: finanzas[2].nombre,
          fin3Valor: Number(finanzas[2].valor || 0),
          fin4Nombre: finanzas[3].nombre,
          fin4Valor: Number(finanzas[3].valor || 0),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "No se pudo actualizar la venta");
        return;
      }

      router.push("/ventas");
      router.refresh();
    } catch {
      setMensaje("Error actualizando la venta");
    } finally {
      setGuardando(false);
    }
  };

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
    { href: "/dashboard/reportes", icon: "reports", label: "Reportes" },
    {
      href: "/dashboard/sedes",
      icon: "settings",
      label: "Configuración",
    },
  ];
  const usuarioActual =
    sessionActual?.perfilNombre ||
    sessionActual?.nombre ||
    sessionActual?.usuario ||
    "Administrador";
  const rolActual = sessionActual?.rolNombre || "Administrador";
  const inicialesUsuario = usuarioActual
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
  const coberturaActual = sessionActual?.sedeNombre || "Todas las sedes";
  const cardClass =
    "rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6";
  const fieldLabelClass = "mb-2 block text-sm font-bold text-slate-700";

  if (cargando) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
        <DashboardSidebar
          activeHref="/ventas"
          coverageLabel="Todas las sedes"
          items={navigationItems}
        />
        <div className="lg:pl-[252px]">
          <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
            <div className="animate-pulse space-y-5" aria-live="polite">
              <div className="h-8 w-56 rounded-lg bg-slate-200" />
              <div className="h-4 w-96 max-w-full rounded bg-slate-200" />
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="h-[430px] rounded-2xl border border-slate-200 bg-white" />
                <div className="h-[360px] rounded-2xl border border-slate-200 bg-white" />
              </div>
              <span className="sr-only">Cargando venta</span>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!puedeEditar) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
        <DashboardSidebar
          activeHref="/ventas"
          coverageLabel={coberturaActual}
          items={navigationItems}
        />
        <div className="lg:pl-[252px]">
          <main className="flex min-h-screen items-center justify-center px-4 py-10">
            <section className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                <DashboardIcon name="lock" className="h-6 w-6" />
              </div>
              <h1 className="mt-5 text-2xl font-black">No se puede editar esta venta</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {mensaje || "No tienes permisos para acceder a esta operación."}
              </p>
              <Link
                href="/ventas"
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#11161d] px-5 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-slate-800"
              >
                Volver a ventas
              </Link>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/ventas"
        coverageLabel="Todas las sedes"
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <Link href="/ventas" className="transition hover:text-[#e30613]">
                  Ventas
                </Link>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-[#e30613]">Editar venta</span>
              </div>
              <h1 className="mt-2 text-[29px] font-black tracking-tight sm:text-[34px]">
                Editar venta
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                Actualiza la información comercial y financiera del registro sin alterar su trazabilidad.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  {ventaIdTexto || `Venta #${ventaId}`}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  {sedeNombre || "Sede sin asignar"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/ventas"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <DashboardIcon name="arrow" className="h-4 w-4 rotate-180" />
                Volver a ventas
              </Link>
              <div className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || "AD"}
                </span>
                <span className="min-w-0 pr-1">
                  <span className="block max-w-40 truncate text-xs font-black text-slate-900">
                    {usuarioActual}
                  </span>
                  <span className="block text-[11px] text-slate-500">{rolActual}</span>
                </span>
              </div>
              <LogoutButton variant="light" className="min-h-11 rounded-xl text-xs font-black uppercase tracking-[0.06em]" />
            </div>
          </header>

          {mensaje && (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-semibold text-red-700"
            >
              <DashboardIcon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{mensaje}</span>
            </div>
          )}

          <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-5">
              <section className={cardClass}>
                <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                    <DashboardIcon name="inventory" className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className={sectionTitleClass()}>Equipo y operación</h2>
                    <p className="mt-1 text-sm text-slate-500">Datos base del equipo asociado a la venta.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClass}>ID venta</label>
                    <input value={ventaIdTexto} readOnly className={inputBaseClass(true)} />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>IMEI</label>
                    <input value={serial} readOnly className={inputBaseClass(true)} />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Servicio</label>
                    <select
                      value={servicio}
                      onChange={(event) => setServicio(event.target.value)}
                      className={inputBaseClass()}
                    >
                      <option value="">Seleccionar servicio</option>
                      {SERVICIOS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Sede</label>
                    <input value={sedeNombre} readOnly className={inputBaseClass(true)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={fieldLabelClass}>Descripción</label>
                    <input
                      value={descripcion}
                      onChange={(event) => setDescripcion(event.target.value)}
                      className={inputBaseClass()}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Referencia</label>
                    <input value={referencia || descripcion} readOnly className={inputBaseClass(true)} />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Color</label>
                    <input value={color || "Sin dato"} readOnly className={inputBaseClass(true)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={fieldLabelClass}>Costo del equipo</label>
                    <input
                      value={costoEquipo ? formatoPesos(costoEquipo) : formatoPesos(0)}
                      readOnly
                      className={inputBaseClass(true)}
                    />
                    <p className="mt-2 text-xs text-slate-500">Información financiera visible solo para perfiles autorizados.</p>
                  </div>
                </div>
              </section>

              <section className={cardClass}>
                <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <DashboardIcon name="user" className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className={sectionTitleClass()}>Equipo comercial</h2>
                    <p className="mt-1 text-sm text-slate-500">Responsables comerciales registrados en la operación.</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClass}>Jalador</label>
                    <select value={jalador} onChange={(event) => setJalador(event.target.value)} className={inputBaseClass()}>
                      <option value="">Seleccionar jalador</option>
                      {jaladores.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Cerrador</label>
                    <select value={cerrador} onChange={(event) => setCerrador(event.target.value)} className={inputBaseClass()}>
                      <option value="">Seleccionar cerrador</option>
                      {cerradores.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              <section className={cardClass}>
                <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <DashboardIcon name="cash" className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className={sectionTitleClass()}>Ingresos</h2>
                    <p className="mt-1 text-sm text-slate-500">El neto y el efecto en caja se recalculan automáticamente.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClass}>Ingreso 1</label>
                    <input
                      inputMode="numeric"
                      value={ingreso1Base ? formatoPesos(ingreso1Base) : ""}
                      onChange={(event) => setIngreso1Base(limpiarNumero(event.target.value))}
                      className={inputBaseClass()}
                      placeholder="$ 0"
                    />
                    <p className="mt-2 text-xs font-semibold text-slate-500">Tipo fijo: EFECTIVO</p>
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Ingreso 1 neto</label>
                    <input value={formatoPesos(ingreso1Neto)} readOnly className={inputBaseClass(true)} />
                  </div>
                </div>

                <div className="mt-4">
                  {!usarIngreso2 ? (
                    <button
                      type="button"
                      onClick={() => setUsarIngreso2(true)}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50"
                    >
                      Agregar ingreso 2
                    </button>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className={fieldLabelClass}>Ingreso 2</label>
                          <input
                            inputMode="numeric"
                            value={ingreso2Mostrado}
                            onChange={(event) => setIngreso2Base(limpiarNumero(event.target.value))}
                            className={inputBaseClass()}
                            placeholder="$ 0"
                          />
                        </div>
                        <div>
                          <label className={fieldLabelClass}>Tipo de ingreso 2</label>
                          <select value={tipoIngreso2} onChange={(event) => setTipoIngreso2(event.target.value)} className={inputBaseClass()}>
                            <option value="">Seleccionar tipo</option>
                            <option value="VOUCHER">VOUCHER</option>
                            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setUsarIngreso2(false)}
                          className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-100"
                        >
                          Quitar ingreso 2
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className={cardClass}>
                <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <DashboardIcon name="store" className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className={sectionTitleClass()}>Financieras</h2>
                    <p className="mt-1 text-sm text-slate-500">Hasta cuatro financieras, según el servicio seleccionado.</p>
                  </div>
                </div>

                {!mostrarFinancieras ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Este servicio no utiliza financieras.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {[0, 1, 2, 3].map((index) =>
                      visibleFin(index) ? (
                        <div key={index} className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className={fieldLabelClass}>Financiera {index + 1}</label>
                            <select
                              value={finanzas[index].nombre}
                              onChange={(event) => actualizarFin(index, "nombre", event.target.value)}
                              className={inputBaseClass()}
                            >
                              <option value="">Seleccionar financiera</option>
                              {financierasCatalogo.map((item) => (
                                <option key={item.id} value={item.nombre}>{item.nombre}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabelClass}>Valor financiado</label>
                            <input
                              inputMode="numeric"
                              value={finanzas[index].valor ? formatoPesos(finanzas[index].valor) : ""}
                              onChange={(event) => actualizarFin(index, "valor", limpiarNumero(event.target.value))}
                              className={inputBaseClass()}
                              placeholder="$ 0"
                            />
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </section>

              <section className={cardClass}>
                <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <DashboardIcon name="trend" className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className={sectionTitleClass()}>Ajustes de la operación</h2>
                    <p className="mt-1 text-sm text-slate-500">Comisión y salida aplicadas al resultado final.</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClass}>Comisión</label>
                    <input
                      inputMode="numeric"
                      value={comision ? formatoPesos(comision) : ""}
                      onChange={(event) => setComision(limpiarNumero(event.target.value))}
                      className={inputBaseClass()}
                      placeholder="$ 0"
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClass}>Salida</label>
                    <input
                      inputMode="numeric"
                      value={salida ? formatoPesos(salida) : ""}
                      onChange={(event) => setSalida(limpiarNumero(event.target.value))}
                      className={inputBaseClass()}
                      placeholder="$ 0"
                    />
                  </div>
                </div>
              </section>
            </div>

            <aside className="min-w-0 space-y-5 xl:sticky xl:top-6">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                <div className="border-b border-slate-200 bg-[#11161d] px-5 py-5 text-white">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Resumen de la venta</p>
                  <h2 className="mt-2 text-xl font-black">Resultado actualizado</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Los valores cambian en tiempo real.</p>
                </div>

                <div className="divide-y divide-slate-100 px-5">
                  <div className="py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Caja oficina</p>
                    <p className="mt-1 break-words text-2xl font-black text-slate-950">{formatoPesos(cajaOficina)}</p>
                  </div>
                  <div className="py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Utilidad</p>
                    <p className={`mt-1 break-words text-2xl font-black ${utilidad >= 0 ? "text-emerald-600" : "text-[#e30613]"}`}>
                      {formatoPesos(utilidad)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Ingresos netos</p>
                      <p className="mt-1 break-words text-lg font-black text-slate-950">{formatoPesos(totalIngresosNetos)}</p>
                    </div>
                    <div className="min-w-0 border-l border-slate-100 pl-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Financieras netas</p>
                      <p className="mt-1 break-words text-lg font-black text-slate-950">{formatoPesos(totalFinancierasNetas)}</p>
                    </div>
                  </div>
                </div>

                <dl className="border-t border-slate-200 bg-slate-50/70 px-5 py-4 text-sm">
                  {[
                    ["Servicio", servicio || "Pendiente"],
                    ["Equipo", descripcion || referencia || "Sin dato"],
                    ["Jalador", jalador || "Pendiente"],
                    ["Cerrador", cerrador || "Pendiente"],
                    ["IMEI", serial || "Sin dato"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4 py-2">
                      <dt className="shrink-0 text-slate-500">{label}</dt>
                      <dd className="min-w-0 break-words text-right font-bold text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#e30613]">Acciones</p>
                <div className="mt-4 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => void guardar()}
                    disabled={guardando || !puedeEditar}
                    className="min-h-12 rounded-xl bg-[#e30613] px-5 text-sm font-black uppercase tracking-[0.06em] text-white shadow-sm transition hover:bg-[#c90511] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {guardando ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/ventas")}
                    disabled={guardando}
                    className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 text-sm font-black uppercase tracking-[0.06em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Los cambios se guardarán sobre la venta existente. No se creará un registro nuevo.
                </p>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
