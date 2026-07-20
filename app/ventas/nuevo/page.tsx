"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import LogoutButton from "@/app/dashboard/_components/logout-button";
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
  return `$ ${num.toLocaleString("es-CO")}`;
}

function monedaGuardadaAInput(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "string") {
    const texto = value.trim();

    if (/^\d+(\.\d+)?$/.test(texto)) {
      return String(Math.round(Number(texto)));
    }
  }

  const numero = Number(value);

  if (Number.isFinite(numero) && numero > 0) {
    return String(Math.round(numero));
  }

  const digits = limpiarNumero(String(value));
  return digits ? String(Number(digits)) : "";
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
    sedeId: Number.isInteger(Number(row.sedeId)) ? Number(row.sedeId) : null,
    puntoVenta: typeof row.puntoVenta === "string" ? row.puntoVenta : null,
    clienteNombre: String(row.clienteNombre || ""),
    tipoDocumento: String(row.tipoDocumento || ""),
    documentoNumero: String(row.documentoNumero || ""),
    serialImei: typeof row.serialImei === "string" ? row.serialImei : null,
    correo: typeof row.correo === "string" ? row.correo : null,
    whatsapp: typeof row.whatsapp === "string" ? row.whatsapp : null,
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

function sectionTitleClass() {
  return "mb-5 text-xs font-black uppercase tracking-[0.18em] text-[#e30613]";
}

function sectionCardClass() {
  return "rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-6";
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
      setFinanzas([
        financierasRegistro[0]
          ? {
              nombre: financierasRegistro[0].plataformaCredito,
              valor: monedaGuardadaAInput(
                financierasRegistro[0].creditoAutorizado
              ),
            }
          : { nombre: "", valor: "" },
        financierasRegistro[1]
          ? {
              nombre: financierasRegistro[1].plataformaCredito,
              valor: monedaGuardadaAInput(
                financierasRegistro[1].creditoAutorizado
              ),
            }
          : { nombre: "", valor: "" },
        financierasRegistro[2]
          ? {
              nombre: financierasRegistro[2].plataformaCredito,
              valor: monedaGuardadaAInput(
                financierasRegistro[2].creditoAutorizado
              ),
            }
          : { nombre: "", valor: "" },
        financierasRegistro[3]
          ? {
              nombre: financierasRegistro[3].plataformaCredito,
              valor: monedaGuardadaAInput(
                financierasRegistro[3].creditoAutorizado
              ),
            }
          : { nombre: "", valor: "" },
      ]);
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

        if (!res.ok) {
          return;
        }

        setSessionActual(data);
        setEsAdminActual(
          ["ADMIN", "AUDITOR"].includes(String(data.rolNombre || "").trim().toUpperCase()) ||
            String(data.perfilTipo || "").trim().toUpperCase() === "ADMINISTRADOR"
        );
      } catch {}
    };

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

  const ingreso2Mostrado = useMemo(() => {
    const base = Number(ingreso2Base || 0);
    if (!base) return "";

    if (String(tipoIngreso2 || "").toUpperCase() === "VOUCHER") {
      return formatoPesos(base * 0.95);
    }

    return formatoPesos(base);
  }, [ingreso2Base, tipoIngreso2]);

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

  const buscarIMEI = async (
    imei: string,
    fallbackRegistro?: RegistroVentaRelacionado | null
  ) => {
    try {
      const res = await fetch("/api/ventas/buscar-imei", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serial: imei,
          registroVendedorId: fallbackRegistro?.id ?? registroVendedor?.id ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (fallbackRegistro) {
          aplicarRegistroVendedor(fallbackRegistro);
        } else {
          aplicarRegistroVendedor(null);
        }
        setReferencia(data.referencia || "");
        setColor(data.color || "");
        setCostoEquipo(Number(data.costo || 0));
        setDescripcion(data.referencia || "");
        setMensaje(`No se puede vender este equipo. ${data.mensaje || data.error || ""}`.trim());
        return;
      }

      const item = data as EquipoInfo & { mensaje?: string };
      const registro = normalizarRegistroVenta(item.registroVenta) ?? fallbackRegistro ?? null;
      setReferencia(item.referencia || "");
      setColor(item.color || "");
      setCostoEquipo(Number(item.costo || 0));
      setDescripcion(registro?.referenciaEquipo || item.referencia || "");
      aplicarRegistroVendedor(registro);

      if (item.mensaje) {
        setMensaje(item.mensaje);
      } else {
        setMensaje("");
      }
    } catch {
      if (fallbackRegistro) {
        aplicarRegistroVendedor(fallbackRegistro);
      } else {
        aplicarRegistroVendedor(null);
      }
      setReferencia("");
      setColor("");
      setCostoEquipo(0);
      setDescripcion("");
      setMensaje("Error consultando el IMEI");
    }
  };

  const cargarAprobacionSeleccionada = useEffectEvent(
    async (registroIdParamActual: string | null) => {
      const registroId = Number(registroIdParamActual);

      if (!Number.isInteger(registroId) || registroId <= 0) {
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
    if (index === 0) return true;
    return Number(finanzas[index - 1].valor || 0) > 0;
  };

  const limpiarTodo = () => {
    setSerial("");
    setServicio("");
    setDescripcion("");
    setJalador("");
    setCerrador("");
    setReferencia("");
    setColor("");
    setCostoEquipo(0);
    setRegistroVendedor(null);
    setIngreso1Base("");
    setIngreso2Base("");
    setTipoIngreso1("EFECTIVO");
    setTipoIngreso2("");
    setUsarIngreso2(false);
    setConfirmoEfectivoRecibido(false);
    setConfirmoTransferenciaValidada(false);
    setComision("");
    setSalida("");
    setFinanzas([
      { nombre: "", valor: "" },
      { nombre: "", valor: "" },
      { nombre: "", valor: "" },
      { nombre: "", valor: "" },
    ]);
  };

  const guardar = async () => {
    try {
      setGuardando(true);
      setMensaje("");

      if (!serial) return setMensaje("Ingrese el IMEI");
      if (!servicio) return setMensaje("Seleccione el servicio");
      if (!descripcion) return setMensaje("La descripcion es obligatoria");
      if (!jalador) return setMensaje("Seleccione el jalador");
      if (!cerrador) return setMensaje("Seleccione el cerrador");
      if (ingreso1Base === "") return setMensaje("Ingrese el valor del ingreso 1");
      if (usarIngreso2 && !ingreso2Base) {
        return setMensaje("Ingrese el valor del ingreso 2");
      }
      if (usarIngreso2 && !tipoIngreso2) {
        return setMensaje("Seleccione el tipo del ingreso 2");
      }
      if (requiereConfirmarEfectivo && !confirmoEfectivoRecibido) {
        return setMensaje("Debes confirmar que recibiste el efectivo");
      }
      if (requiereConfirmarTransferencia && !confirmoTransferenciaValidada) {
        return setMensaje("Debes confirmar que validaste la transferencia");
      }

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
        setMensaje(
          `No se puede vender este equipo. ${dataValidacion.mensaje || dataValidacion.error || ""}`.trim()
        );
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
          fin1Nombre: finanzas[0].nombre,
          fin1Valor: Number(finanzas[0].valor || 0),
          fin2Nombre: finanzas[1].nombre,
          fin2Valor: Number(finanzas[1].valor || 0),
          fin3Nombre: finanzas[2].nombre,
          fin3Valor: Number(finanzas[2].valor || 0),
          fin4Nombre: finanzas[3].nombre,
          fin4Valor: Number(finanzas[3].valor || 0),
          confirmoEfectivoRecibido,
          confirmoTransferenciaValidada,
          registroVendedorId: registroVendedor?.id ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error al guardar");
        return;
      }

      setMensaje("Venta guardada correctamente");
      limpiarTodo();
    } catch {
      setMensaje("Error al guardar la venta");
    } finally {
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
  const inicialesUsuario = usuarioActual
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
  const equipoValidado = Boolean(serial.length === 15 && referencia);
  const pagoConfirmado = Boolean(
    registroVendedor && !confirmacionesIngresoPendientes
  );
  const mensajeEsExito = /(correctamente|encontrado)/i.test(mensaje);

  return (
    <div className="min-h-screen bg-[#f5f6f8] font-[Arial,Helvetica,sans-serif] text-slate-950">
      <DashboardSidebar
        activeHref="/ventas"
        coverageLabel={esAdminActual ? "Todas las sedes" : coberturaActual}
        items={navigationItems}
      />

      <div className="lg:pl-[252px]">
        <main className="w-full px-4 py-5 sm:px-6 lg:px-7 lg:py-7 2xl:px-9">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <span>Ventas</span>
                <DashboardIcon name="arrow" className="h-3.5 w-3.5" />
                <span className="text-[#e30613]">
                  {esModoAprobacion ? "Aprobación" : "Nueva venta"}
                </span>
              </div>
              <h1 className="mt-2 text-[29px] font-black tracking-tight text-slate-950 sm:text-[32px]">
                {esModoAprobacion ? "Aprobar venta" : "Nueva venta"}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500 sm:text-base">
                {esModoAprobacion
                  ? "Revisa el registro del vendedor, confirma los ingresos y completa el cierre"
                  : "Registra la información comercial y financiera de la operación"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  <DashboardIcon name="store" className="h-4 w-4 text-slate-500" />
                  {esAdminActual ? "Todas las sedes" : coberturaActual}
                </span>
                {esModoAprobacion && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700">
                    Registro #{registroIdParam}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/ventas/aprobaciones"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
              >
                <DashboardIcon name="approvals" className="h-4 w-4" />
                Ver pendientes
              </Link>
              <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 shadow-sm sm:min-w-[205px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">
                  {inicialesUsuario || (
                    <DashboardIcon name="user" className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {usuarioActual}
                  </p>
                  <p className="truncate text-xs text-slate-500">{rolActual}</p>
                </div>
              </div>
              <LogoutButton variant="light" className="min-h-12 shrink-0 rounded-xl" />
            </div>
          </header>

          {esModoAprobacion && (
            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    completed: Boolean(registroVendedor),
                    label: "Registro recibido",
                    number: 1,
                  },
                  {
                    completed: equipoValidado,
                    label: "Equipo validado",
                    number: 2,
                  },
                  {
                    completed: pagoConfirmado,
                    label: "Ingresos confirmados",
                    number: 3,
                  },
                  {
                    completed: false,
                    label: "Aprobar y guardar",
                    number: 4,
                  },
                ].map((step) => (
                  <div
                    key={step.number}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <span
                      className={[
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black",
                        step.completed
                          ? "bg-emerald-100 text-emerald-700"
                          : step.number === 4
                            ? "bg-red-100 text-[#e30613]"
                            : "bg-white text-slate-500 ring-1 ring-slate-200",
                      ].join(" ")}
                    >
                      {step.number}
                    </span>
                    <span className="text-xs font-bold text-slate-700">{step.label}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {cargandoRegistroInicial && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
              Cargando aprobación seleccionada...
            </div>
          )}

          {mensaje && (
            <div
              className={[
                "mt-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold",
                mensajeEsExito
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              ].join(" ")}
            >
              <DashboardIcon
                name={mensajeEsExito ? "approvals" : "warning"}
                className="h-5 w-5 shrink-0"
              />
              {mensaje}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-6">
                <div className={sectionCardClass()}>
                  <h3 className={sectionTitleClass()}>Equipo</h3>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        IMEI
                      </label>
                      <input
                        value={serial}
                        readOnly={bloqueoRegistroAsesor}
                        onChange={(e) => {
                          if (bloqueoRegistroAsesor) return;
                          const v = limpiarNumero(e.target.value).slice(0, 15);
                          setSerial(v);
                          if (v.length === 15) void buscarIMEI(v);
                          if (v.length < 15) {
                            setRegistroVendedor(null);
                            setReferencia("");
                            setColor("");
                            setCostoEquipo(0);
                          }
                        }}
                        className={inputBaseClass(bloqueoRegistroAsesor)}
                        placeholder="Ingrese IMEI"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Servicio
                      </label>
                      <select
                        value={servicio}
                        onChange={(e) => setServicio(e.target.value)}
                        disabled={bloqueoRegistroAsesor}
                        className={inputBaseClass(bloqueoRegistroAsesor)}
                      >
                        <option value="">Seleccionar</option>
                        {SERVICIOS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Descripcion
                      </label>
                      <input
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        readOnly={bloqueoRegistroAsesor}
                        className={inputBaseClass(bloqueoRegistroAsesor)}
                        placeholder="Descripcion automatica"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Costo equipo
                      </label>
                      <input
                        value={costoEquipo ? formatoPesos(costoEquipo) : ""}
                        readOnly
                        className={inputBaseClass(true)}
                        placeholder="$ 0"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Color
                      </label>
                      <input
                        value={color || ""}
                        readOnly
                        className={inputBaseClass(true)}
                        placeholder="Color del equipo"
                      />
                    </div>
                  </div>
                </div>

                {registroVendedor && (
                  <div className={sectionCardClass()}>
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                        Registro del vendedor
                      </h3>
                      <span className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                        {bloqueoRegistroAsesor
                          ? "Solo comision y salida editables"
                          : "Admin puede editar el registro"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Cliente
                        </p>
                        <p className="mt-2 text-lg font-bold text-slate-900">
                          {registroVendedor.clienteNombre}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {registroVendedor.tipoDocumento} {registroVendedor.documentoNumero}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Contacto
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {registroVendedor.whatsapp || "Sin WhatsApp"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {registroVendedor.correo || "Sin correo"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 md:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Asesor y sede
                        </p>
                        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <p className="text-sm font-semibold text-slate-900">
                            {registroVendedor.asesorNombre || "Sin asesor"}
                          </p>
                          <p className="text-sm font-bold text-slate-600">
                            {registroVendedor.puntoVenta || "Sin punto de venta"}
                          </p>
                        </div>
                      </div>

                      <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                          Observacion del asesor
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-800">
                          {registroVendedor.observacion || "Sin observacion registrada"}
                        </p>
                      </div>

                      <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {esServicioContado(registroVendedor.plataformaCredito)
                            ? "Servicio registrado"
                            : "Financieras registradas"}
                        </p>
                        {esServicioContado(registroVendedor.plataformaCredito) ? (
                          <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                            <p className="text-sm font-bold text-emerald-800">
                              CONTADO
                            </p>
                            <p className="mt-2 text-sm text-slate-600">
                              Ingreso registrado:{" "}
                              <span className="font-semibold text-slate-900">
                                {formatoPesos(
                                  Number(registroVendedor.medioPago1Valor || 0) +
                                    Number(registroVendedor.medioPago2Valor || 0)
                                )}
                              </span>
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {financierasDesdeRegistro(registroVendedor).map((item, index) => (
                              <div
                                key={`${registroVendedor.id}-${item.plataformaCredito}-${index}`}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                              >
                                <p className="text-sm font-bold text-slate-900">
                                  {item.plataformaCredito}
                                </p>
                                <p className="mt-2 text-sm text-slate-600">
                                  Credito autorizado:{" "}
                                  <span className="font-semibold text-slate-900">
                                    {formatoPesos(Number(item.creditoAutorizado || 0))}
                                  </span>
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                  Cuota:{" "}
                                  <span className="font-semibold text-slate-900">
                                    {formatoPesos(Number(item.valorCuota || 0))}
                                  </span>
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className={sectionCardClass()}>
                  <h3 className={sectionTitleClass()}>Equipo comercial</h3>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Jalador
                      </label>
                      <select
                        value={jalador}
                        onChange={(e) => setJalador(e.target.value)}
                        className={inputBaseClass(false)}
                      >
                        <option value="">Seleccionar</option>
                        {jaladoresDisponibles.map((j) => (
                          <option key={j} value={j}>
                            {j}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Cerrador
                      </label>
                      <select
                        value={cerrador}
                        onChange={(e) => setCerrador(e.target.value)}
                        disabled={bloqueoRegistroAsesor}
                        className={inputBaseClass(bloqueoRegistroAsesor)}
                      >
                        <option value="">Seleccionar</option>
                        {cerradoresDisponibles.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className={sectionCardClass()}>
                  <h3 className={sectionTitleClass()}>Ingresos</h3>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Ingreso 1 valor
                      </label>
                      <input
                        value={ingreso1Base ? formatoPesos(ingreso1Base) : ""}
                        onChange={(e) => setIngreso1Base(limpiarNumero(e.target.value))}
                        readOnly={bloqueoRegistroAsesor}
                        className={inputBaseClass(bloqueoRegistroAsesor)}
                        placeholder="$ 0"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Tipo ingreso 1
                      </label>
                      <select
                        value={tipoIngreso1}
                        onChange={(e) => setTipoIngreso1(e.target.value)}
                        disabled={bloqueoRegistroAsesor}
                        className={inputBaseClass(bloqueoRegistroAsesor)}
                      >
                        <option value="EFECTIVO">EFECTIVO</option>
                        <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                        <option value="VOUCHER">VOUCHER</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Ingreso 1 neto
                      </label>
                      <input
                        value={formatoPesos(ingreso1Neto)}
                        readOnly
                        className={inputBaseClass(true)}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    {!usarIngreso2 ? (
                      bloqueoRegistroAsesor ? null : (
                        <button
                          type="button"
                          onClick={() => setUsarIngreso2(true)}
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                        >
                          + Agregar ingreso 2
                        </button>
                      )
                    ) : (
                      <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                              Ingreso 2
                            </label>
                            <input
                              value={ingreso2Mostrado}
                              onChange={(e) =>
                                setIngreso2Base(limpiarNumero(e.target.value))
                              }
                              readOnly={bloqueoRegistroAsesor}
                              className={inputBaseClass(bloqueoRegistroAsesor)}
                              placeholder="$ 0"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                              Tipo ingreso 2
                            </label>
                            <select
                              value={tipoIngreso2}
                              onChange={(e) => setTipoIngreso2(e.target.value)}
                              disabled={bloqueoRegistroAsesor}
                              className={inputBaseClass(bloqueoRegistroAsesor)}
                            >
                              <option value="">Seleccionar</option>
                              <option value="VOUCHER">VOUCHER</option>
                              <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                            </select>
                          </div>
                        </div>

                        {!bloqueoRegistroAsesor && (
                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setUsarIngreso2(false)}
                              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Quitar ingreso 2
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {ventaDesdeRegistro &&
                    (requiereConfirmarEfectivo ||
                      requiereConfirmarTransferencia) && (
                      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
                          Confirmacion de ingreso
                        </p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {requiereConfirmarEfectivo && (
                            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                              <input
                                type="checkbox"
                                checked={confirmoEfectivoRecibido}
                                onChange={(e) =>
                                  setConfirmoEfectivoRecibido(e.target.checked)
                                }
                                className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
                              />
                              Recibi el efectivo
                            </label>
                          )}

                          {requiereConfirmarTransferencia && (
                            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                              <input
                                type="checkbox"
                                checked={confirmoTransferenciaValidada}
                                onChange={(e) =>
                                  setConfirmoTransferenciaValidada(e.target.checked)
                                }
                                className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                              />
                              Valide la transferencia
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                </div>

                <div className={sectionCardClass()}>
                  <h3 className={sectionTitleClass()}>Financieras</h3>

                  {!mostrarFinancieras ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      Este servicio no utiliza financieras.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {[0, 1, 2, 3].map((i) =>
                        visibleFin(i) ? (
                          <div key={i} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <select
                              value={finanzas[i].nombre}
                              onChange={(e) => actualizarFin(i, "nombre", e.target.value)}
                              disabled={bloqueoRegistroAsesor}
                              className={inputBaseClass(bloqueoRegistroAsesor)}
                            >
                              <option value="">Seleccionar financiera</option>
                              {financierasCatalogo.map((f) => (
                                <option key={f.id} value={f.nombre}>
                                  {f.nombre}
                                </option>
                              ))}
                            </select>

                            <input
                              value={finanzas[i].valor ? formatoPesos(finanzas[i].valor) : ""}
                              onChange={(e) =>
                                actualizarFin(i, "valor", limpiarNumero(e.target.value))
                              }
                              readOnly={bloqueoRegistroAsesor}
                              className={inputBaseClass(bloqueoRegistroAsesor)}
                              placeholder="$ 0"
                            />
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>

                <div className={sectionCardClass()}>
                  <h3 className={sectionTitleClass()}>Descuentos y salida</h3>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Comision
                      </label>
                      <input
                        value={comision ? formatoPesos(comision) : ""}
                        onChange={(e) => setComision(limpiarNumero(e.target.value))}
                        className={inputBaseClass()}
                        placeholder="$ 0"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Salida
                      </label>
                      <input
                        value={salida ? formatoPesos(salida) : ""}
                        onChange={(e) => setSalida(limpiarNumero(e.target.value))}
                        className={inputBaseClass()}
                        placeholder="$ 0"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-5 xl:sticky xl:top-5 xl:self-start">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                  <div className="border-b border-slate-200 px-5 py-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#e30613]">
                        <DashboardIcon name="sales" className="h-5 w-5" />
                      </span>
                      <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#e30613]">
                      Resumen de venta
                    </p>
                    <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                      Cierre proyectado
                    </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-500">
                      Valores calculados en tiempo real antes de aprobar.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 p-4">
                    <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200/80">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                        Caja oficina
                      </p>
                      <p className="mt-2 break-words text-xl font-black leading-tight text-slate-900">
                        {formatoPesos(cajaOficina)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-emerald-50 p-3.5 ring-1 ring-emerald-100">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                        Utilidad
                      </p>
                      <p className="mt-2 break-words text-xl font-black leading-tight text-emerald-600">
                        {formatoPesos(utilidad)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-blue-50 p-3.5 ring-1 ring-blue-100">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
                        Ingresos netos
                      </p>
                      <p className="mt-2 break-words text-lg font-black leading-tight text-blue-700">
                        {formatoPesos(totalIngresosNetos)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-violet-50 p-3.5 ring-1 ring-violet-100">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">
                        Financieras netas
                      </p>
                      <p className="mt-2 break-words text-lg font-black leading-tight text-violet-700">
                        {formatoPesos(totalFinancierasNetas)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className={sectionCardClass()}>
                  <h3 className={sectionTitleClass()}>Acciones</h3>

                  <div className="flex flex-col gap-3">
                    <Link
                      href="/ventas/aprobaciones"
                      className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-center text-xs font-black uppercase tracking-[0.08em] text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-[#e30613]"
                    >
                      Volver a pendientes
                    </Link>

                    <button
                      onClick={guardar}
                      disabled={guardando || confirmacionesIngresoPendientes}
                      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#e30613] px-5 text-xs font-black uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-[#c9000b] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {guardando
                        ? "Guardando..."
                        : esModoAprobacion
                          ? "Aprobar y guardar venta"
                          : "Guardar venta"}
                    </button>

                    <button
                      type="button"
                      onClick={salirFormulario}
                      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-100 px-5 text-xs font-black uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-200"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>

                <div className={sectionCardClass()}>
                  <h3 className={sectionTitleClass()}>Vista rapida</h3>

                  <div className="space-y-3 text-sm text-slate-600">
                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span>Servicio</span>
                      <span className="font-semibold text-slate-900">
                        {servicio || "-"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span>Jalador</span>
                      <span className="font-semibold text-slate-900">
                        {jalador || "-"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span>Cerrador</span>
                      <span className="font-semibold text-slate-900">
                        {cerrador || "-"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span>Equipo</span>
                      <span className="font-semibold text-slate-900">
                        {descripcion || referencia || "-"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <span>Costo</span>
                      <span className="font-semibold text-slate-900">
                        {formatoPesos(costoEquipo)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
      </div>
    </div>
  );
}
