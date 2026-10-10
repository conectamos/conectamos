"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { esPerfilAdministrativo, esRolAdministrativo, puedeAccederPanelVendedor } from "@/lib/access-control";
import styles from "./sale-review.module.css";
import {
  calcularValorNetoFinanciera,
  type CatalogoFinanciera,
} from "@/lib/ventas-financieras";
const SERVICIOS = [
  "CONTADO",
  "FINANCIERA",
];

type EquipoInfo = {
  id: number;
  imei: string;
  referencia: string;
  color: string | null;
  costo: number;
  mensaje?: string;
  origen?: string;
  sedeNombre?: string | null;
  sedeId?: number | null;
  estadoActual?: string;
  registroVenta?: RegistroVentaRelacionado | null;
};

type FilaFin = {
  nombre: string;
  valor: string;
};

type RegistroVentaFinanciera = {
  plataformaCredito: string;
  creditoAutorizado: string | number | null;
  cuotaInicial?: string | number | null;
  tipoPagoInicial?: string | null;
  valorCuota?: string | number | null;
  numeroCuotas?: string | number | null;
  frecuenciaCuota?: string | null;
};

type RegistroVentaRelacionado = {
  id: number;
  sedeId: number | null;
  puntoVenta: string | null;
  clienteNombre: string;
  tipoDocumento: string;
  documentoNumero: string;
  serialImei: string | null;
  correo: string | null;
  whatsapp: string | null;
  telefono: string | null;
  sedeNombre: string | null;
  direccion: string | null;
  barrio: string | null;
  referenciaContacto: string | null;
  referenciaEquipo: string | null;
  asesorNombre: string | null;
  jaladorNombre: string | null;
  observacion: string | null;
  plataformaCredito: string | null;
  creditoAutorizado: string | number | null;
  cuotaInicial: string | number | null;
  medioPago1Tipo: string | null;
  medioPago1Valor: string | number | null;
  medioPago2Tipo: string | null;
  medioPago2Valor: string | number | null;
  financierasDetalle: RegistroVentaFinanciera[];
  createdAt: string;
  updatedAt: string;
};

type CatalogoPersonalResponse = {
  jaladores: Array<{ nombre: string }>;
  cerradores: Array<{ nombre: string }>;
  financieras: CatalogoFinanciera[];
};

type SessionResponse = {
  nombre?: string | null;
  perfilId?: number | null;
  usuario?: string | null;
  sedeNombre?: string | null;
  rolNombre?: string | null;
  perfilNombre?: string | null;
  perfilTipo?: string | null;
  perfilTipoLabel?: string | null;
};

function limpiarNumero(v: string) {
  return v.replace(/\D/g, "");
}

function formatoPesos(v: string | number) {
  if (v === "" || v === null || v === undefined) return "";
  const num = Number(v);
  if (!Number.isFinite(num)) return "";
  if (typeof v === "string" && v.includes(".")) {
    const [entero, decimales] = v.split(".");
    return `$ ${Number(entero).toLocaleString("es-CO")},${decimales}`;
  }
  return `$ ${num.toLocaleString("es-CO")}`;
}

function monedaGuardadaAInput(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const numero = Number(value);
  return Number.isFinite(numero) && numero >= 0 ? String(numero) : "";
}

function monedaEscrita(value: string) {
  const [entero, decimales] = value.replace(/[^\d,]/g, "").split(",");
  return entero + (decimales !== undefined ? "." + decimales.slice(0, 2) : "");
}

function normalizarRegistroVenta(value: unknown): RegistroVentaRelacionado | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = Number(row.id);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const financierasDetalle = Array.isArray(row.financierasDetalle)
    ? row.financierasDetalle
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const financiera = item as Record<string, unknown>;
          const plataformaCredito = String(financiera.plataformaCredito || "").trim();

          if (!plataformaCredito) {
            return null;
          }

          return {
            plataformaCredito,
            creditoAutorizado:
              (financiera.creditoAutorizado as string | number | null | undefined) ??
              null,
            cuotaInicial:
              (financiera.cuotaInicial as string | number | null | undefined) ??
              null,
            tipoPagoInicial:
              typeof financiera.tipoPagoInicial === "string"
                ? financiera.tipoPagoInicial
                : null,
            valorCuota:
              (financiera.valorCuota as string | number | null | undefined) ??
              null,
            numeroCuotas:
              (financiera.numeroCuotas as string | number | null | undefined) ??
              null,
            frecuenciaCuota:
              typeof financiera.frecuenciaCuota === "string"
                ? financiera.frecuenciaCuota
                : null,
          } satisfies RegistroVentaFinanciera;
        })
        .filter(Boolean) as RegistroVentaFinanciera[]
    : [];

  return {
    id,
    sedeId: row.sedeId != null && Number.isInteger(Number(row.sedeId)) ? Number(row.sedeId) : null,
    puntoVenta: typeof row.puntoVenta === "string" ? row.puntoVenta : null,
    clienteNombre: String(row.clienteNombre || ""),
    tipoDocumento: String(row.tipoDocumento || ""),
    documentoNumero: String(row.documentoNumero || ""),
    serialImei: typeof row.serialImei === "string" ? row.serialImei : null,
    correo: typeof row.correo === "string" ? row.correo : null,
    whatsapp: typeof row.whatsapp === "string" ? row.whatsapp : null,
    telefono: typeof row.telefono === "string" ? row.telefono : null,
    sedeNombre: typeof row.sedeNombre === "string" ? row.sedeNombre :
      row.sede && typeof row.sede === "object" && "nombre" in row.sede
        ? String(row.sede.nombre || "") : null,
    direccion: typeof row.direccion === "string" ? row.direccion : null,
    barrio: typeof row.barrio === "string" ? row.barrio : null,
    referenciaContacto:
      typeof row.referenciaContacto === "string" ? row.referenciaContacto : null,
    referenciaEquipo:
      typeof row.referenciaEquipo === "string" ? row.referenciaEquipo : null,
    asesorNombre: typeof row.asesorNombre === "string" ? row.asesorNombre : null,
    jaladorNombre:
      typeof row.jaladorNombre === "string" ? row.jaladorNombre : null,
    observacion: typeof row.observacion === "string" ? row.observacion : null,
    plataformaCredito:
      typeof row.plataformaCredito === "string" ? row.plataformaCredito : null,
    creditoAutorizado:
      (row.creditoAutorizado as string | number | null | undefined) ?? null,
    cuotaInicial:
      (row.cuotaInicial as string | number | null | undefined) ?? null,
    medioPago1Tipo:
      typeof row.medioPago1Tipo === "string" ? row.medioPago1Tipo : null,
    medioPago1Valor:
      (row.medioPago1Valor as string | number | null | undefined) ?? null,
    medioPago2Tipo:
      typeof row.medioPago2Tipo === "string" ? row.medioPago2Tipo : null,
    medioPago2Valor:
      (row.medioPago2Valor as string | number | null | undefined) ?? null,
    financierasDetalle,
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || ""),
  };
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
  const s = servicio.toUpperCase();
  return s === "CONTADO" || s === "CONTADO CLARO" || s === "CONTADO LIBRES";
}

function esServicioContado(servicio: unknown) {
  return ocultaFinancieras(String(servicio || ""));
}

function normalizarTipoIngresoDesdeRegistro(value: string | null | undefined) {
  const tipo = String(value || "").trim().toUpperCase();
  return tipo === "TRANSFERENCIA" || tipo === "VOUCHER" ? tipo : "EFECTIVO";
}

function tieneMonedaRegistrada(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }

  return String(value).trim() !== "";
}

function financierasDesdeRegistro(registro: RegistroVentaRelacionado) {
  if (esServicioContado(registro.plataformaCredito)) {
    return [];
  }

  if (registro.financierasDetalle.length) {
    return registro.financierasDetalle.filter(
      (item) => !esServicioContado(item.plataformaCredito)
    );
  }

  if (!registro.plataformaCredito) {
    return [];
  }

  return [
    {
      plataformaCredito: registro.plataformaCredito,
      creditoAutorizado: registro.creditoAutorizado,
      cuotaInicial: registro.cuotaInicial,
      tipoPagoInicial: registro.medioPago1Tipo,
      valorCuota: null,
      numeroCuotas: null,
      frecuenciaCuota: null,
    },
  ] satisfies RegistroVentaFinanciera[];
}

function pagosDesdeRegistro(registro: RegistroVentaRelacionado) {
  const pagosDirectos = [
    tieneMonedaRegistrada(registro.medioPago1Valor)
      ? {
          valor: Number(monedaGuardadaAInput(registro.medioPago1Valor) || 0),
          tipo: normalizarTipoIngresoDesdeRegistro(registro.medioPago1Tipo),
        }
      : null,
    tieneMonedaRegistrada(registro.medioPago2Valor)
      ? {
          valor: Number(monedaGuardadaAInput(registro.medioPago2Valor) || 0),
          tipo: normalizarTipoIngresoDesdeRegistro(registro.medioPago2Tipo),
        }
      : null,
  ].filter((item): item is { valor: number; tipo: string } => Boolean(item));

  if (pagosDirectos.length) {
    return pagosDirectos;
  }

  return financierasDesdeRegistro(registro)
    .map((item) =>
      tieneMonedaRegistrada(item.cuotaInicial)
        ? {
            valor: Number(monedaGuardadaAInput(item.cuotaInicial ?? null) || 0),
            tipo: normalizarTipoIngresoDesdeRegistro(item.tipoPagoInicial),
          }
        : null
    )
    .filter((item): item is { valor: number; tipo: string } => Boolean(item));
}

function inputBaseClass(readOnly = false) {
  return `min-h-11 w-full rounded-xl border px-4 py-3 text-sm outline-none transition ${
    readOnly
      ? "border-slate-200 bg-slate-50 text-slate-700"
      : "border-slate-300 bg-white text-slate-900 shadow-sm focus:border-[#e30613] focus:ring-3 focus:ring-red-100"
  }`;
}

function tipoPagoNormalizado(value: string) {
  return String(value || "").trim().toUpperCase();
}

export default function NuevaVentaPage() {
  const searchParams = useSearchParams();
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

  const [ingreso1Base, setIngreso1Base] = useState("");
  const [ingreso2Base, setIngreso2Base] = useState("");
  const [tipoIngreso1, setTipoIngreso1] = useState("EFECTIVO");
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
  const [registroVendedor, setRegistroVendedor] =
    useState<RegistroVentaRelacionado | null>(null);
  const [cargandoRegistroInicial, setCargandoRegistroInicial] = useState(false);

  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmoEfectivoRecibido, setConfirmoEfectivoRecibido] = useState(false);
  const [confirmoTransferenciaValidada, setConfirmoTransferenciaValidada] =
    useState(false);
  const [esAdminActual, setEsAdminActual] = useState(false);
  const [sessionActual, setSessionActual] = useState<SessionResponse | null>(null);
  const registroIdParam = searchParams.get("registroId");
  const [equipoConsultado, setEquipoConsultado] = useState<EquipoInfo | null>(null);
  const [consultandoEquipo, setConsultandoEquipo] = useState(false);
  const [sesionCargada, setSesionCargada] = useState(false);
  const [catalogoCargado, setCatalogoCargado] = useState(false);
  const [errorConfiguracion, setErrorConfiguracion] = useState("");
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [registroDesactualizado, setRegistroDesactualizado] = useState(false);
  const guardandoRef = useRef(false);
  const guardadoRef = useRef(false);
  const consultaEquipoRef = useRef(0);
  const ajustesRef = useRef<HTMLDivElement>(null);

  const ventaDesdeRegistro = Boolean(registroVendedor);
  const bloqueoRegistroAsesor = ventaDesdeRegistro && !esAdminActual;
  const mostrarFinancieras = !ocultaFinancieras(servicio);
  const jaladoresDisponibles = useMemo(() => {
    const values = new Set(
      [...jaladores, jalador].map((item) => String(item || "").trim()).filter(Boolean)
    );
    return Array.from(values);
  }, [jalador, jaladores]);
  const cerradoresDisponibles = useMemo(() => {
    const values = new Set(
      [...cerradores, cerrador].map((item) => String(item || "").trim()).filter(Boolean)
    );
    return Array.from(values);
  }, [cerrador, cerradores]);

  const aplicarRegistroVendedor = (registro: RegistroVentaRelacionado | null) => {
    setRegistroVendedor(registro);

    if (!registro) {
      setIngreso1Base("");
      setIngreso2Base("");
      setTipoIngreso1("EFECTIVO");
      setTipoIngreso2("");
      setUsarIngreso2(false);
      setConfirmoEfectivoRecibido(false);
      setConfirmoTransferenciaValidada(false);
      setFinanzas([
        { nombre: "", valor: "" },
        { nombre: "", valor: "" },
        { nombre: "", valor: "" },
        { nombre: "", valor: "" },
      ]);
      return;
    }

    setConfirmoEfectivoRecibido(false);
    setConfirmoTransferenciaValidada(false);

    if (registro.referenciaEquipo) {
      setDescripcion(registro.referenciaEquipo);
    }

    if (registro.jaladorNombre) {
      setJalador(registro.jaladorNombre);
    }

    if (registro.asesorNombre) {
      setCerrador(registro.asesorNombre);
    }

    const financierasRegistro = financierasDesdeRegistro(registro);
    const ingresosRegistrados = pagosDesdeRegistro(registro);

    if (ingresosRegistrados.length === 0) {
      setIngreso1Base("");
      setIngreso2Base("");
      setTipoIngreso1("EFECTIVO");
      setTipoIngreso2("");
      setUsarIngreso2(false);
    } else if (
      ingresosRegistrados.length > 1 &&
      ingresosRegistrados[0].tipo !== ingresosRegistrados[1].tipo
    ) {
      setIngreso1Base(String(ingresosRegistrados[0].valor));
      setTipoIngreso1(ingresosRegistrados[0].tipo);
      setIngreso2Base(String(ingresosRegistrados[1].valor));
      setTipoIngreso2(ingresosRegistrados[1].tipo);
      setUsarIngreso2(true);
    } else {
      const ingreso1DesdeRegistro = ingresosRegistrados.reduce(
        (total, item) => total + item.valor,
        0
      );
      setIngreso1Base(String(ingreso1DesdeRegistro));
      setTipoIngreso1(ingresosRegistrados[0].tipo);
      setIngreso2Base("");
      setTipoIngreso2("");
      setUsarIngreso2(false);
    }

    if (financierasRegistro.length) {
      setServicio("FINANCIERA");
      const filas = financierasRegistro.map(item => ({
        nombre: item.plataformaCredito,
        valor: monedaGuardadaAInput(item.creditoAutorizado),
      }));
      setFinanzas(filas);
    } else {
      setFinanzas([
        { nombre: "", valor: "" },
        { nombre: "", valor: "" },
        { nombre: "", valor: "" },
        { nombre: "", valor: "" },
      ]);
      if (esServicioContado(registro.plataformaCredito)) {
        setServicio("CONTADO");
      }
    }
  };

  useEffect(() => {
    const cargarSesion = async () => {
      try {
        const res = await fetch("/api/session", { cache: "no-store" });
        const data = (await res.json()) as SessionResponse;

        if (!res.ok) throw new Error("No se pudo validar la sesión. Actualiza la página.");

        setSessionActual(data);
        setEsAdminActual(esRolAdministrativo(data.rolNombre) || esPerfilAdministrativo(data.perfilTipo));
        setSesionCargada(true);
      } catch {
        setErrorConfiguracion("No se pudo validar la sesión. Actualiza la página.");
      }
    };

    const cargarCatalogoPersonal = async () => {
      try {
        const res = await fetch("/api/ventas/catalogo-personal", {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok) throw new Error("No se pudo cargar el catálogo.");

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
        setCatalogoCargado(true);
      } catch {
        setErrorConfiguracion("No se pudo cargar el catálogo. Actualiza la página antes de aprobar.");
      }
    };

    void cargarSesion();
    void cargarCatalogoPersonal();
  }, []);

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

  const requiereConfirmarEfectivo = useMemo(() => {
    if (!ventaDesdeRegistro) return false;

    return (
      (Number(ingreso1Base || 0) > 0 &&
        tipoPagoNormalizado(tipoIngreso1) === "EFECTIVO") ||
      (usarIngreso2 &&
        Number(ingreso2Base || 0) > 0 &&
        tipoPagoNormalizado(tipoIngreso2) === "EFECTIVO")
    );
  }, [ingreso1Base, ingreso2Base, tipoIngreso1, tipoIngreso2, usarIngreso2, ventaDesdeRegistro]);

  const requiereConfirmarTransferencia = useMemo(() => {
    if (!ventaDesdeRegistro) return false;

    return (
      (Number(ingreso1Base || 0) > 0 &&
        tipoPagoNormalizado(tipoIngreso1) === "TRANSFERENCIA") ||
      (usarIngreso2 &&
        Number(ingreso2Base || 0) > 0 &&
        tipoPagoNormalizado(tipoIngreso2) === "TRANSFERENCIA")
    );
  }, [ingreso1Base, ingreso2Base, tipoIngreso1, tipoIngreso2, usarIngreso2, ventaDesdeRegistro]);

  useEffect(() => {
    if (!requiereConfirmarEfectivo) {
      setConfirmoEfectivoRecibido(false);
    }

    if (!requiereConfirmarTransferencia) {
      setConfirmoTransferenciaValidada(false);
    }
  }, [requiereConfirmarEfectivo, requiereConfirmarTransferencia]);

  const ingreso1Neto = useMemo(
    () => netoIngreso(Number(ingreso1Base || 0), tipoIngreso1),
    [ingreso1Base, tipoIngreso1]
  );

  const ingreso2Neto = useMemo(
    () => netoIngreso(Number(ingreso2Base || 0), tipoIngreso2 || ""),
    [ingreso2Base, tipoIngreso2]
  );

  const totalIngresosNetos = ingreso1Neto + (usarIngreso2 ? ingreso2Neto : 0);

  const totalIngresosCaja = useMemo(
    () =>
      cajaIngreso(Number(ingreso1Base || 0), tipoIngreso1) +
      (usarIngreso2
        ? cajaIngreso(Number(ingreso2Base || 0), tipoIngreso2 || "")
        : 0),
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
  }, [
    totalIngresosNetos,
    totalFinancierasNetas,
    costoEquipo,
    comision,
    salida,
  ]);

  const cajaOficina = useMemo(() => {
    return totalIngresosCaja - Number(comision || 0) - Number(salida || 0);
  }, [totalIngresosCaja, comision, salida]);

  const confirmacionesIngresoPendientes =
    (requiereConfirmarEfectivo && !confirmoEfectivoRecibido) ||
    (requiereConfirmarTransferencia && !confirmoTransferenciaValidada);

  const buscarIMEI = async (imei: string, fallbackRegistro?: RegistroVentaRelacionado | null) => {
    const consultaId = ++consultaEquipoRef.current;
    setConsultandoEquipo(true);
    setEquipoConsultado(null);
    try {
      const res = await fetch("/api/ventas/buscar-imei", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial: imei, registroVendedorId: fallbackRegistro?.id ?? registroVendedor?.id ?? null }),
      });
      const data = await res.json();
      if (consultaId !== consultaEquipoRef.current) return;
      if (!res.ok) {
        if (fallbackRegistro) aplicarRegistroVendedor(fallbackRegistro);
        setReferencia(data.referencia || "");
        setColor(data.color || "");
        setCostoEquipo(Number(data.costo || 0));
        setMensaje(`No se puede vender este equipo. ${data.mensaje || data.error || ""}`.trim());
        return;
      }
      const item = data as EquipoInfo;
      const registro = normalizarRegistroVenta(item.registroVenta) ?? fallbackRegistro ?? null;
      setReferencia(item.referencia || "");
      setColor(item.color || "");
      setCostoEquipo(Number(item.costo || 0));
      setDescripcion(registro?.referenciaEquipo || item.referencia || "");
      aplicarRegistroVendedor(registro);
      setRegistroDesactualizado(false);
      setEquipoConsultado(item);
      setMensaje("");
    } catch {
      if (consultaId !== consultaEquipoRef.current) return;
      setMensaje("No se pudo verificar el equipo. Vuelve a consultar el IMEI.");
    } finally {
      if (consultaId === consultaEquipoRef.current) setConsultandoEquipo(false);
    }
  };

  const cargarAprobacionSeleccionada = useEffectEvent(
    async (registroIdParamActual: string | null) => {
      const registroId = Number(registroIdParamActual);

      if (!registroIdParamActual) return;
      if (!Number.isInteger(registroId) || registroId <= 0) {
        setMensaje("El número de registro no es válido.");
        return;
      }

      try {
        setCargandoRegistroInicial(true);
        const res = await fetch(`/api/ventas/aprobaciones?id=${registroId}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok) {
          setMensaje(data.error || "No se pudo cargar la aprobacion seleccionada");
          return;
        }

        const registro = normalizarRegistroVenta(data.registro);

        if (!registro || !registro.serialImei) {
          setMensaje("La aprobacion seleccionada no tiene IMEI valido");
          return;
        }

        setSerial(registro.serialImei);
        aplicarRegistroVendedor(registro);
        await buscarIMEI(registro.serialImei, registro);
      } catch {
        setMensaje("Error cargando la aprobacion seleccionada");
      } finally {
        setCargandoRegistroInicial(false);
      }
    }
  );

  useEffect(() => {
    void cargarAprobacionSeleccionada(registroIdParam);
  }, [registroIdParam]);

  const actualizarFin = (
    index: number,
    campo: "nombre" | "valor",
    valor: string
  ) => {
    const copia = [...finanzas];
    copia[index] = { ...copia[index], [campo]: valor };
    setFinanzas(copia);
  };

  const visibleFin = (index: number) => {
    if (!mostrarFinancieras) return false;
    if (index === 0 || finanzas[index].nombre || finanzas[index].valor) return true;
    return Number(finanzas[index - 1]?.valor || 0) > 0;
  };

  const guardar = async () => {
    if (guardandoRef.current || guardadoRef.current) return;
    if (!puedeGuardar) {
      setMensaje(motivoBloqueo || "Revisa los campos requeridos.");
      revelarAjustes();
      return;
    }
    guardandoRef.current = true;
    try {
      setGuardando(true);
      setMensaje("");

      const resValidacion = await fetch("/api/ventas/buscar-imei", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serial,
          registroVendedorId: registroVendedor?.id ?? null,
        }),
      });

      const dataValidacion = await resValidacion.json();

      if (!resValidacion.ok) {
        setEquipoConsultado(null);
        setMensaje(
          `No se puede vender este equipo. ${dataValidacion.mensaje || dataValidacion.error || ""}`.trim()
        );
        return;
      }

      const registroFresco = normalizarRegistroVenta(dataValidacion.registroVenta);
      if (registroVendedor?.updatedAt && registroFresco?.updatedAt !== registroVendedor.updatedAt) {
        setRegistroDesactualizado(true);
        setMensaje("El registro cambió. Actualiza sus datos y revisa la proyección antes de aprobar.");
        return;
      }

      if (dataValidacion.imei !== serial || dataValidacion.estadoActual !== "BODEGA" ||
          (registroVendedor?.sedeId != null && dataValidacion.sedeId !== registroVendedor.sedeId)) {
        setEquipoConsultado(null);
        setMensaje("La disponibilidad o sede del equipo cambió. Consulta nuevamente el IMEI.");
        return;
      }
      if (Number(dataValidacion.costo) !== costoEquipo) {
        setCostoEquipo(Number(dataValidacion.costo));
        setEquipoConsultado(dataValidacion);
        setMensaje("El costo del equipo cambió. Revisa la proyección antes de aprobar.");
        revelarAjustes();
        return;
      }

      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serial,
          servicio,
          descripcion,
          jalador,
          cerrador,
          ingreso1Base: Number(ingreso1Base || 0),
          ingreso2Base: usarIngreso2 ? Number(ingreso2Base || 0) : 0,
          tipoIngreso1,
          tipoIngreso2: usarIngreso2 ? tipoIngreso2 : "",
          comision: Number(comision || 0),
          salida: Number(salida || 0),
          financierasDetalle: mostrarFinancieras ? finanzas.filter(item => item.nombre || item.valor).map(item => ({ nombre: item.nombre, valor: Number(item.valor || 0) })) : [],
          fin1Nombre: finanzas[0]?.nombre || "",
          fin1Valor: Number(finanzas[0]?.valor || 0),
          fin2Nombre: finanzas[1]?.nombre || "",
          fin2Valor: Number(finanzas[1]?.valor || 0),
          fin3Nombre: finanzas[2]?.nombre || "",
          fin3Valor: Number(finanzas[2]?.valor || 0),
          fin4Nombre: finanzas[3]?.nombre || "",
          fin4Valor: Number(finanzas[3]?.valor || 0),
          confirmoEfectivoRecibido,
          confirmoTransferenciaValidada,
          registroVendedorId: registroVendedor?.id ?? null,
          registroRevision: registroVendedor?.updatedAt || undefined,
          costoEquipoEsperado: costoEquipo,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "REGISTRO_CAMBIO") setRegistroDesactualizado(true);
        if (data.code === "COSTO_CAMBIO") setEquipoConsultado(null);
        setMensaje(data.error || "Error al guardar");
        revelarAjustes();
        return;
      }

      guardadoRef.current = true;
      setGuardado(true);
      setMensaje("Venta guardada correctamente");
    } catch {
      setMensaje("Error al guardar la venta");
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const salirFormulario = () => {
    window.location.href = "/dashboard";
  };

  const esModoAprobacion = Boolean(registroIdParam);
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
      href: esAdminActual ? "/dashboard/reportes" : "/dashboard/analitico",
      icon: "reports",
      label: "Reportes",
    },
    ...(esAdminActual
      ? ([
          {
            href: "/dashboard/sedes",
            icon: "settings",
            label: "Configuración",
          },
        ] satisfies NavigationItem[])
      : []),
  ];
  const usuarioActual =
    sessionActual?.perfilNombre ||
    sessionActual?.nombre ||
    sessionActual?.usuario ||
    "Usuario";
  const rolActual =
    sessionActual?.perfilTipoLabel ||
    sessionActual?.rolNombre ||
    (esAdminActual ? "Administrador" : "Supervisor");
  const coberturaActual = sessionActual?.sedeNombre || "Tu sede";
  const sedeRegistro = registroVendedor?.sedeNombre || registroVendedor?.puntoVenta || equipoConsultado?.sedeNombre || coberturaActual;
  const equipoValidado = Boolean(/^\d{15}$/.test(serial) && equipoConsultado?.imei === serial &&
    equipoConsultado?.estadoActual === "BODEGA" &&
    (registroVendedor?.sedeId == null || equipoConsultado?.sedeId === registroVendedor.sedeId));
  const ingreso1Valido = ingreso1Base !== "" && Number.isFinite(Number(ingreso1Base)) && Number(ingreso1Base) >= 0;
  const ingreso2Valido = !usarIngreso2 || (ingreso2Base !== "" && Number.isFinite(Number(ingreso2Base)) && Number(ingreso2Base) >= 0 && Boolean(tipoIngreso2));
  const ajustesValidos = [comision, salida].every(value => Number.isFinite(Number(value || 0)) && Number(value || 0) >= 0);
  const financierasValidas = !mostrarFinancieras || finanzas.every(item => Number.isFinite(Number(item.valor || 0)) && Number(item.valor || 0) >= 0 && (Number(item.valor || 0) === 0 || Boolean(item.nombre.trim())));
  const pagoConfirmado = ingreso1Valido && ingreso2Valido && !confirmacionesIngresoPendientes;
  const datosCompletos = Boolean(servicio && descripcion.trim() && jalador && cerrador && ajustesValidos && financierasValidas);
  const registroRecibido = Boolean(registroVendedor && (!esModoAprobacion || registroVendedor.id === Number(registroIdParam)));
  const puedeGuardar = Boolean(sesionCargada && catalogoCargado && !cargandoRegistroInicial && !consultandoEquipo && !guardando && !guardado && !registroDesactualizado && equipoValidado && pagoConfirmado && datosCompletos && (!esModoAprobacion || registroRecibido));
  const motivoBloqueo = errorConfiguracion || (!sesionCargada || !catalogoCargado ? "Validando sesión y catálogo…" : cargandoRegistroInicial ? "Cargando el registro…" :
    registroDesactualizado ? "Actualiza el registro y revisa sus valores antes de aprobar." :
    esModoAprobacion && !registroRecibido ? "Se requiere un registro pendiente válido." :
    !equipoValidado ? "Verifica la disponibilidad del equipo en la sede." :
    !ingreso1Valido || !ingreso2Valido ? "Completa los valores y medios de pago de los ingresos." :
    confirmacionesIngresoPendientes ? "Confirma los ingresos recibidos en Ingresos y ajustes." :
    !financierasValidas ? "Revisa los valores y nombres de las financieras." :
    !datosCompletos ? "Completa los datos comerciales y revisa los ajustes." : "");
  const puedeEditarCliente = Boolean(!guardado && registroVendedor && sessionActual &&
    (sessionActual.perfilId || esAdminActual) && puedeAccederPanelVendedor(sessionActual.perfilTipo, sessionActual.rolNombre));
  const revelarAjustes = () => {
    setAjustesAbiertos(true);
    requestAnimationFrame(() => {
      const target = ajustesRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], input[type="checkbox"]:not(:checked), input');
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };
  const estadoAvance = [
    { label: "Registro recibido", completo: registroRecibido },
    { label: "Equipo validado", completo: equipoValidado },
    { label: pagoConfirmado ? "Ingresos confirmados" : "Ingresos por confirmar", completo: pagoConfirmado },
    { label: "Aprobar y guardar", completo: guardado },
  ];
  const pasoActual = estadoAvance.findIndex(paso => !paso.completo);
  const financierasRegistradas = registroVendedor ? financierasDesdeRegistro(registroVendedor) : [];
  const financierasDisponibles = Array.from(new Set([...financierasCatalogo.map(item => item.nombre), ...finanzas.map(item => item.nombre)].filter(Boolean)));

  useEffect(() => {
    setConfirmoEfectivoRecibido(false);
    setConfirmoTransferenciaValidada(false);
  }, [ingreso1Base, ingreso2Base, tipoIngreso1, tipoIngreso2, usarIngreso2]);

  useEffect(() => {
    if (registroVendedor && (!ingreso1Valido || !ingreso2Valido || confirmacionesIngresoPendientes || !ajustesValidos)) setAjustesAbiertos(true);
  }, [registroVendedor, ingreso1Valido, ingreso2Valido, confirmacionesIngresoPendientes, ajustesValidos]);

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/dashboard" className={styles.brand} aria-label="CONECTAMOS, inicio"><Image src="/branding/conectamos-logo.png" alt="" width={42} height={42} priority /><span>CONECTAMOS</span></Link>
        <nav className={styles.navigation} aria-label="Navegación principal">{navigationItems.map(item => <Link key={item.href} href={item.href} className={item.href === "/ventas" ? styles.navActive : undefined} aria-current={item.href === "/ventas" ? "page" : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
        <SalesProfile name={usuarioActual} role={rolActual} />
      </header>
      <main className={styles.main}>
        <header className={styles.heading}>
          <div><h1>{esModoAprobacion ? "Revisar venta" : "Nueva venta"}</h1><p>{registroVendedor ? `Registro #${registroVendedor.id} · ${sedeRegistro}` : cargandoRegistroInicial ? "Cargando registro…" : sedeRegistro}</p></div>
          <span className={guardado ? styles.saved : styles.projection}>{guardado ? "Venta guardada" : "Proyección · Venta sin aprobar"}</span>
        </header>
        <section className={styles.metrics} aria-label={guardado ? "Resumen de la venta" : "Proyección de la venta"}>
          {([
            { label: "Caja oficina", value: cajaOficina, icon: "store", tone: "" },
            { label: "Utilidad", value: utilidad, icon: "cash", tone: styles.greenIcon },
            { label: "Ingresos netos", value: totalIngresosNetos, icon: "send", tone: styles.blueIcon },
            { label: "Financieras netas", value: totalFinancierasNetas, icon: "document", tone: styles.redIcon },
          ] as const).map(item => <div className={styles.metric} key={item.label}><span className={`${styles.metricIcon} ${item.tone}`}><DashboardIcon name={item.icon} /></span><div><p>{item.label}</p><strong className={item.value < 0 ? styles.negative : undefined}>{formatoPesos(item.value)}</strong></div></div>)}
        </section>
        {esModoAprobacion && <ol className={styles.progress} aria-label="Avance de aprobación">{estadoAvance.map((paso, index) => <li key={index} className={`${paso.completo ? styles.stepComplete : ""} ${index === pasoActual ? styles.stepCurrent : ""}`} aria-current={index === pasoActual ? "step" : undefined}><span className={styles.stepNumber}>{index + 1}</span><strong>{paso.label}</strong>{paso.completo && <svg viewBox="0 0 20 20" aria-label="Completado"><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="m6 10 3 3 5-6" stroke="white" fill="none" strokeWidth="2" /></svg>}<span className={styles.stepLine} /></li>)}</ol>}
        {(cargandoRegistroInicial || consultandoEquipo) && <div className={styles.loading} role="status"><DashboardIcon name="refresh" />{cargandoRegistroInicial ? "Cargando registro y verificando equipo…" : "Verificando disponibilidad del equipo…"}</div>}
        {(mensaje || errorConfiguracion) && <div className={`${styles.message} ${guardado ? styles.success : styles.error}`} role={guardado ? "status" : "alert"}><DashboardIcon name={guardado ? "approvals" : "warning"} /><span>{mensaje || errorConfiguracion}</span>{registroDesactualizado && <button type="button" className={styles.button} onClick={() => void buscarIMEI(serial, registroVendedor)}>Actualizar registro</button>}</div>}
        <form onSubmit={event => { event.preventDefault(); void guardar(); }} noValidate>
          <fieldset className={styles.formBody} disabled={guardando || guardado || cargandoRegistroInicial}>
            <legend className={styles.srOnly}>Datos de la venta</legend>
            <div className={styles.primaryGrid}>
              <section className={styles.card} aria-labelledby="equipo-title">
                <header className={styles.cardHeader}><span className={styles.sectionIcon}><DashboardIcon name="inventory" /></span><h2 id="equipo-title">Equipo</h2><span className={equipoValidado ? styles.available : styles.unverified}>{guardado ? "Vendido" : equipoValidado ? "Disponible en la sede" : consultandoEquipo ? "Verificando…" : "Por verificar"}</span></header>
                <div className={styles.equipmentFields}>
                  <div className={styles.field}><label htmlFor="sale-imei">IMEI</label><input id="sale-imei" value={serial} inputMode="numeric" autoComplete="off" maxLength={15} readOnly={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)} aria-invalid={Boolean(serial && !/^\d{15}$/.test(serial))} onChange={event => {
                    const value = limpiarNumero(event.target.value).slice(0, 15);
                    setSerial(value); setEquipoConsultado(null); ++consultaEquipoRef.current;
                    if (value.length === 15) void buscarIMEI(value);
                    else { setConsultandoEquipo(false); aplicarRegistroVendedor(null); setReferencia(""); setColor(""); setCostoEquipo(0); setDescripcion(""); }
                  }} placeholder="15 dígitos" />{serial && serial.length !== 15 && <span className={styles.fieldError}>El IMEI debe tener 15 dígitos.</span>}</div>
                  <div className={styles.field}><label htmlFor="sale-service">Servicio</label><select id="sale-service" value={servicio} onChange={event => setServicio(event.target.value)} disabled={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)}><option value="">Seleccionar servicio</option>{Array.from(new Set([...SERVICIOS, servicio].filter(Boolean))).map(item => <option key={item} value={item}>{item}</option>)}</select></div>
                  <div className={styles.field}><label htmlFor="sale-description">Descripción</label><input id="sale-description" value={descripcion} onChange={event => setDescripcion(event.target.value)} readOnly={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)} placeholder="Referencia del equipo" /></div>
                  <div className={styles.field}><label htmlFor="sale-cost">Costo del equipo</label><input id="sale-cost" value={formatoPesos(costoEquipo)} readOnly className={inputBaseClass(true)} /></div>
                  <div className={`${styles.field} ${styles.fullWidth}`}><label htmlFor="sale-color">Color</label><input id="sale-color" value={color} readOnly className={inputBaseClass(true)} placeholder="Sin dato" /></div>
                  {!equipoValidado && serial.length === 15 && !consultandoEquipo && <button type="button" onClick={() => void buscarIMEI(serial, registroVendedor)} className={styles.textButton}><DashboardIcon name="refresh" />Verificar equipo</button>}
                  {referencia && referencia !== descripcion && <p className={styles.reference}>Referencia de inventario: {referencia}</p>}
                </div>
              </section>
              <section className={styles.card} aria-labelledby="cliente-title">
                <header className={styles.cardHeader}><span className={styles.sectionIcon}><DashboardIcon name="user" /></span><h2 id="cliente-title">Cliente</h2>{puedeEditarCliente && <Link href={`/vendedor/registros?editar=${registroVendedor?.id}`} className={styles.editButton}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L21 6l-5-5L3 14l1 6Z" /></svg>Editar</Link>}</header>
                {registroVendedor ? <dl className={styles.clientFields}><div><dt>Nombre</dt><dd>{registroVendedor.clienteNombre || "Sin dato"}</dd></div><div><dt>Cédula{registroVendedor.tipoDocumento ? ` · ${registroVendedor.tipoDocumento}` : ""}</dt><dd>{registroVendedor.documentoNumero.replace(/[.\s]/g, "") || "Sin dato"}</dd></div><div><dt>Celular</dt><dd>{registroVendedor.telefono || registroVendedor.whatsapp || "Sin dato"}</dd></div><div><dt>Correo</dt><dd>{registroVendedor.correo || "Sin dato"}</dd></div>{registroVendedor.telefono && registroVendedor.whatsapp && registroVendedor.telefono !== registroVendedor.whatsapp && <div><dt>WhatsApp</dt><dd>{registroVendedor.whatsapp}</dd></div>}</dl> : <p className={styles.emptyClient}>{cargandoRegistroInicial ? "Cargando datos del cliente…" : "Los datos del cliente se muestran al consultar un registro."}</p>}
              </section>
            </div>
            <section className={styles.card} aria-labelledby="comercial-title">
              <header className={styles.cardHeader}><span className={styles.sectionIcon}><DashboardIcon name="users" /></span><h2 id="comercial-title">Equipo comercial</h2></header>
              <div className={styles.commercialFields}><div className={styles.field}><label htmlFor="sale-referrer">Jalador</label><select id="sale-referrer" value={jalador} onChange={event => setJalador(event.target.value)} className={inputBaseClass()}><option value="">Seleccionar jalador</option>{jaladoresDisponibles.map(item => <option key={item} value={item}>{item}</option>)}</select></div><div className={styles.field}><label htmlFor="sale-closer">Cerrador</label><select id="sale-closer" value={cerrador} onChange={event => setCerrador(event.target.value)} disabled={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)}><option value="">Seleccionar cerrador</option>{cerradoresDisponibles.map(item => <option key={item} value={item}>{item}</option>)}</select></div><div className={styles.field}><label htmlFor="sale-location">Sede</label><input id="sale-location" value={sedeRegistro} readOnly className={inputBaseClass(true)} /></div></div>
            </section>
            <section className={styles.card} aria-labelledby="financiacion-title">
              <header className={styles.cardHeader}><span className={styles.sectionIcon}><DashboardIcon name="document" /></span><h2 id="financiacion-title">Financiación</h2></header>
              {!mostrarFinancieras ? <p className={styles.noFinance}>Este servicio no utiliza financieras.</p> : <div className={styles.financeScroll}><table className={styles.financeTable}><thead><tr><th scope="col">Financiera</th><th scope="col">Crédito autorizado</th><th scope="col">Cuota</th></tr></thead><tbody>{finanzas.map((item, index) => visibleFin(index) && <tr key={index}><td data-label="Financiera"><label htmlFor={`sale-financier-${index}`} className={styles.srOnly}>Financiera {index + 1}</label><select id={`sale-financier-${index}`} value={item.nombre} onChange={event => actualizarFin(index, "nombre", event.target.value)} disabled={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)}><option value="">Seleccionar financiera</option>{financierasDisponibles.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}</select></td><td data-label="Crédito autorizado"><label htmlFor={`sale-credit-${index}`} className={styles.srOnly}>Crédito autorizado {index + 1}</label><input id={`sale-credit-${index}`} value={item.valor !== "" ? formatoPesos(item.valor) : ""} onChange={event => actualizarFin(index, "valor", monedaEscrita(event.target.value))} readOnly={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)} inputMode="decimal" placeholder="$ 0" aria-invalid={Boolean(Number(item.valor) > 0 && !item.nombre)} /></td><td data-label="Cuota"><span>{financierasRegistradas[index]?.valorCuota != null ? formatoPesos(Number(financierasRegistradas[index].valorCuota)) : "Sin dato"}</span>{financierasRegistradas[index]?.cuotaInicial != null && <small>Inicial: {formatoPesos(Number(financierasRegistradas[index].cuotaInicial))}{financierasRegistradas[index].tipoPagoInicial ? ` · ${financierasRegistradas[index].tipoPagoInicial}` : ""}</small>}{financierasRegistradas[index]?.numeroCuotas && <small>{financierasRegistradas[index].numeroCuotas} cuotas{financierasRegistradas[index].frecuenciaCuota ? ` · ${financierasRegistradas[index].frecuenciaCuota}` : ""}</small>}</td></tr>)}</tbody></table></div>}
              {mostrarFinancieras && !bloqueoRegistroAsesor && <button type="button" className={`${styles.textButton} ${styles.addFinance}`} onClick={() => setFinanzas([...finanzas, { nombre: "", valor: "" }])}>+ Agregar financiera</button>}
            </section>
            <section className={`${styles.card} ${styles.adjustments}`} aria-labelledby="ajustes-title">
              <button id="ajustes-title" type="button" className={styles.adjustmentsToggle} aria-expanded={ajustesAbiertos} aria-controls="sale-adjustments" onClick={() => setAjustesAbiertos(!ajustesAbiertos)}><DashboardIcon name="reports" /><strong>Ingresos y ajustes</strong>{!pagoConfirmado && <span className={styles.pendingBadge}>Por confirmar</span>}<DashboardIcon name="chevron" className={ajustesAbiertos ? styles.chevronOpen : styles.chevron} /></button>
              <div id="sale-adjustments" ref={ajustesRef} hidden={!ajustesAbiertos} className={styles.adjustmentContent}>
                <div className={styles.incomeFields}>
                  <div className={styles.field}><label htmlFor="sale-income1">Ingreso 1 valor</label><input id="sale-income1" value={ingreso1Base !== "" ? formatoPesos(ingreso1Base) : ""} onChange={event => setIngreso1Base(monedaEscrita(event.target.value))} readOnly={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)} inputMode="decimal" placeholder="$ 0" aria-invalid={!ingreso1Valido} aria-describedby={!ingreso1Valido ? "income1-error" : undefined} />{!ingreso1Valido && <span id="income1-error" className={styles.fieldError}>Ingresa un valor, incluso si es $ 0.</span>}</div>
                  <div className={styles.field}><label htmlFor="sale-payment1">Tipo ingreso 1</label><select id="sale-payment1" value={tipoIngreso1} onChange={event => setTipoIngreso1(event.target.value)} disabled={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)}>{["EFECTIVO", "TRANSFERENCIA", "VOUCHER"].map(item => <option key={item} value={item}>{item}</option>)}</select></div>
                  <div className={styles.field}><label htmlFor="sale-net1">Ingreso 1 neto</label><input id="sale-net1" value={formatoPesos(ingreso1Neto)} readOnly className={inputBaseClass(true)} /></div>
                </div>
                {!usarIngreso2 && !bloqueoRegistroAsesor && <button type="button" onClick={() => setUsarIngreso2(true)} className={styles.textButton}>+ Agregar ingreso 2</button>}
                {usarIngreso2 && <div className={styles.secondIncome}><div className={styles.incomeFields}><div className={styles.field}><label htmlFor="sale-income2">Ingreso 2 valor</label><input id="sale-income2" value={ingreso2Base !== "" ? formatoPesos(ingreso2Base) : ""} onChange={event => setIngreso2Base(monedaEscrita(event.target.value))} readOnly={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)} inputMode="decimal" placeholder="$ 0" aria-invalid={!ingreso2Valido} /></div><div className={styles.field}><label htmlFor="sale-payment2">Tipo ingreso 2</label><select id="sale-payment2" value={tipoIngreso2} onChange={event => setTipoIngreso2(event.target.value)} disabled={bloqueoRegistroAsesor} className={inputBaseClass(bloqueoRegistroAsesor)} aria-invalid={Boolean(!tipoIngreso2)}><option value="">Seleccionar medio de pago</option>{["EFECTIVO", "TRANSFERENCIA", "VOUCHER"].map(item => <option key={item} value={item}>{item}</option>)}</select></div><div className={styles.field}><label htmlFor="sale-net2">Ingreso 2 neto</label><input id="sale-net2" value={formatoPesos(ingreso2Neto)} readOnly className={inputBaseClass(true)} /></div></div>{!bloqueoRegistroAsesor && <button type="button" onClick={() => setUsarIngreso2(false)} className={styles.textButton}>Quitar ingreso 2</button>}</div>}
                {ventaDesdeRegistro && (requiereConfirmarEfectivo || requiereConfirmarTransferencia) && <div className={styles.confirmations}><h3>Confirmación de ingresos</h3><div>{requiereConfirmarEfectivo && <label><input id="sale-confirm-cash" type="checkbox" checked={confirmoEfectivoRecibido} onChange={event => setConfirmoEfectivoRecibido(event.target.checked)} />Recibí el efectivo</label>}{requiereConfirmarTransferencia && <label><input id="sale-confirm-transfer" type="checkbox" checked={confirmoTransferenciaValidada} onChange={event => setConfirmoTransferenciaValidada(event.target.checked)} />Validé la transferencia</label>}</div></div>}
                <div className={styles.adjustmentFields}><div className={styles.field}><label htmlFor="sale-commission">Comisión</label><input id="sale-commission" value={comision !== "" ? formatoPesos(comision) : ""} onChange={event => setComision(monedaEscrita(event.target.value))} className={inputBaseClass()} inputMode="decimal" placeholder="$ 0" /></div><div className={styles.field}><label htmlFor="sale-outflow">Salida</label><input id="sale-outflow" value={salida !== "" ? formatoPesos(salida) : ""} onChange={event => setSalida(monedaEscrita(event.target.value))} className={inputBaseClass()} inputMode="decimal" placeholder="$ 0" /></div></div>
              </div>
            </section>
            {registroVendedor && <section className={`${styles.card} ${styles.observation}`} aria-labelledby="observacion-title"><header className={styles.cardHeader}><span className={styles.sectionIcon}><DashboardIcon name="document" /></span><h2 id="observacion-title">Observación</h2></header><p>{registroVendedor.observacion || "Sin observación del asesor."}</p></section>}
          </fieldset>
          {!guardado && motivoBloqueo && <p className={styles.validationNote}><DashboardIcon name="shield" />{motivoBloqueo}{equipoValidado && !pagoConfirmado && <button type="button" onClick={revelarAjustes}>Revisar ingresos</button>}</p>}
          <footer className={styles.actions}>
            <button type="button" onClick={salirFormulario} disabled={guardando} className={styles.button}>Cancelar</button>
            <div><Link href="/ventas/aprobaciones" className={styles.button}><DashboardIcon name="arrow" className={styles.backIcon} />Volver a pendientes</Link><button type="submit" disabled={!puedeGuardar} className={`${styles.button} ${styles.primaryButton}`}>{guardando ? "Guardando…" : guardado ? "Venta guardada" : esModoAprobacion ? "Aprobar y guardar" : "Guardar venta"}</button></div>
          </footer>
        </form>
      </main>
    </div>
  );
}
