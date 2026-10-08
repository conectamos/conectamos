"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { esDeudaEntreSedes } from "@/lib/prestamos";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { esSedeOperativaInventario } from "@/lib/sedes";
import { TIPOS_PRODUCTO } from "@/lib/product-types";
import {
  DashboardSidebar,
  type NavigationItem,
} from "@/app/dashboard/_components/operations-dashboard";
import DashboardIcon from "@/app/dashboard/_components/dashboard-icon";
import { SalesProfile } from "@/app/ventas/_components/sales-dashboard-parts";
import { formatoPesos as formatoMoneda } from "@/lib/monthly-reports-view";
import { InventoryMetric, InventoryRow, type InventoryAction } from "./_components/inventory-dashboard-parts";
import { CreditorsPanel, DebtSummary, DebtSelectionBar, DebtEquipmentFilters } from "./_components/inventory-debt-parts";
import { agruparDeudasPorAcreedor, deudaPendienteInventario, identidadAcreedor } from "@/lib/inventory-debt-view";
import styles from "./inventory.module.css";

type InventarioItem = {
  id: number;
  imei: string;
  referencia: string;
  tipoProducto: string;
  color: string | null;
  costo: number;
  distribuidor: string | null;
  deboA: string | null;
  acreedorId?: number | null;
  acreedorNombre?: string | null;
  deudaPendiente?: number;
  estadoActual: string | null;
  estadoFinanciero: string | null;
  origen: string | null;
  sedeId: number;
  sede?: {
    id: number;
    nombre: string;
    soloInventarioPorCobrar: boolean;
  } | null;
  facturaStand?: {
    id: number;
    estado: string;
    nombre: string | null;
    url: string | null;
    error: string | null;
  } | null;
  prestamoDestino?: {
    id: number;
    nombre: string;
    prestamoId: number;
    estado: string;
  } | null;
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

type EstadoOperativoFiltro =
  | "BODEGA"
  | "VENDIDO"
  | "PENDIENTE"
  | "GARANTIA"
  | "PRESTAMO"
  | "PRESTAMO_PAGO"
  | "TRASLADO"
  | "PRESTAMO_POR_ACEPTAR";

type EstadoFinancieroFiltro = "PAGO" | "DEUDA";
type EstadoFiltro = EstadoOperativoFiltro | EstadoFinancieroFiltro;

const ESTADOS_OPERATIVOS_FILTRO: EstadoOperativoFiltro[] = [
  "BODEGA",
  "VENDIDO",
  "PENDIENTE",
  "GARANTIA",
  "PRESTAMO",
  "PRESTAMO_PAGO",
  "TRASLADO",
  "PRESTAMO_POR_ACEPTAR",
];

const ESTADOS_FINANCIEROS_FILTRO: EstadoFinancieroFiltro[] = [
  "PAGO",
  "DEUDA",
];

type EditarInventarioForm = {
  referencia: string;
  tipoProducto: string;
  color: string;
  costo: string;
  distribuidor: string;
  estadoFinanciero: string;
  deboA: string;
};

type FacturaStandResultado = {
  id: number;
  estado: string;
  nombre: string;
  url: string | null;
  total: number;
  cantidad: number;
  sedeNombre: string;
  diasVencimiento: number;
  facturaAnteriorAnulada?: {
    factura: string;
    notaCredito: string | null;
  } | null;
};

function formatoPesos(valor: number) {
  return formatoMoneda(valor);
}

function coincideBusquedaInventario(item: InventarioItem, termino: string) {
  if (!termino) return true;

  return (
    (item.imei || "").toLowerCase().includes(termino) ||
    (item.referencia || "").toLowerCase().includes(termino) ||
    (item.color || "").toLowerCase().includes(termino) ||
    (item.distribuidor || "").toLowerCase().includes(termino) ||
    (item.deboA || "").toLowerCase().includes(termino) ||
    (item.origen || "").toLowerCase().includes(termino) ||
    (item.prestamoDestino?.nombre || "").toLowerCase().includes(termino) ||
    (item.sede?.nombre || "").toLowerCase().includes(termino)
  );
}

function esFiltroFinanciero(
  estado: EstadoFiltro
): estado is EstadoFinancieroFiltro {
  return ESTADOS_FINANCIEROS_FILTRO.some((item) => item === estado);
}

function coincideEstadosOperativos(
  item: InventarioItem,
  filtros: EstadoOperativoFiltro[]
) {
  if (filtros.length === 0) return true;

  const estado = String(item.estadoActual || "").trim().toUpperCase();
  return filtros.some((filtro) => filtro === estado);
}

function coincideEstadosFinancieros(
  item: InventarioItem,
  filtros: EstadoFinancieroFiltro[]
) {
  if (filtros.length === 0) return true;

  const estado = String(item.estadoFinanciero || "").trim().toUpperCase();
  return filtros.some((filtro) => filtro === estado);
}

function etiquetaDestinoPrestamo(item: InventarioItem) {
  const destino = item.prestamoDestino?.nombre?.trim();
  const estadoActual = String(item.estadoActual || "").trim().toUpperCase();
  const estadoPrestamo = String(item.prestamoDestino?.estado || "")
    .trim()
    .toUpperCase();
  const destinoEsLaMismaSede = item.prestamoDestino?.id === item.sedeId;
  const estadoPermiteDestino = [
    "PRESTAMO",
    "PRESTAMO_PAGO",
    "PRESTAMO_POR_ACEPTAR",
    "TRASLADO",
  ].includes(estadoActual);

  if (!destino || destinoEsLaMismaSede || !estadoPermiteDestino) {
    return "-";
  }

  if (estadoActual === "PRESTAMO_POR_ACEPTAR" || estadoPrestamo === "PENDIENTE") {
    return `Pendiente: ${destino}`;
  }

  if (estadoActual === "PRESTAMO_PAGO") {
    return `Pagado por ${destino}`;
  }

  if (estadoActual === "TRASLADO" || estadoPrestamo === "FINALIZADO") {
    return `Trasladado a ${destino}`;
  }

  return destino;
}

export default function InventarioPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const [cargandoInventario, setCargandoInventario] = useState(false);
  const [inventarioCargado, setInventarioCargado] = useState(false);
  const [consultaCargada, setConsultaCargada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [filasPorPagina, setFilasPorPagina] = useState(10);
  const [idsExpandidos, setIdsExpandidos] = useState<number[]>([]);
  const [filtrosEstado, setFiltrosEstado] = useState<EstadoFiltro[]>([]);
  const [pestana, setPestana] = useState<"equipos" | "deudas">("equipos");
  const [acreedorDeudaClave, setAcreedorDeudaClave] = useState("TODOS");
  const [busquedaDeudas, setBusquedaDeudas] = useState("");
  const [busquedaAcreedores, setBusquedaAcreedores] = useState("");
  const [filtrosEstadoDeudas, setFiltrosEstadoDeudas] = useState<string[]>([]);
  const [paginaDeudas, setPaginaDeudas] = useState(1);
  const [filasPorPaginaDeudas, setFilasPorPaginaDeudas] = useState(10);
  const [busqueda, setBusqueda] = useState("");
  const [sedeFiltroId, setSedeFiltroId] = useState("TODAS");
  const inventarioRequestId = useRef(0);

  const [mostrarModalPrestamo, setMostrarModalPrestamo] = useState(false);
  const [mostrarModalPrestamoMasivo, setMostrarModalPrestamoMasivo] = useState(false);
  const [itemPrestamo, setItemPrestamo] = useState<InventarioItem | null>(null);
  const [sedeDestinoId, setSedeDestinoId] = useState("");

  const [mostrarModalPago, setMostrarModalPago] = useState(false);
  const [mostrarModalPagoMasivo, setMostrarModalPagoMasivo] = useState(false);
  const pagoMasivoDialog = useRef<HTMLDivElement>(null);
  const [itemPago, setItemPago] = useState<InventarioItem | null>(null);
  const [idsSeleccionados, setIdsSeleccionados] = useState<number[]>([]);
  useEffect(() => {
    if (!mostrarModalPagoMasivo || !pagoMasivoDialog.current) return;
    const previousFocus = document.activeElement;
    pagoMasivoDialog.current.querySelector<HTMLButtonElement>("button[data-cancel-payment]")?.focus();
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, [mostrarModalPagoMasivo]);
  const [mostrarModalFacturaStand, setMostrarModalFacturaStand] = useState(false);
  const [facturaStandResultado, setFacturaStandResultado] =
    useState<FacturaStandResultado | null>(null);

  const [modalEliminar, setModalEliminar] = useState(false);
  const [idsEliminar, setIdsEliminar] = useState<number[]>([]);
  const [mostrarModalEditar, setMostrarModalEditar] = useState(false);
  const [itemEditar, setItemEditar] = useState<InventarioItem | null>(null);
  const [formularioEditar, setFormularioEditar] = useState<EditarInventarioForm>({
    referencia: "",
    tipoProducto: "TELEFONIA",
    color: "",
    costo: "",
    distribuidor: "",
    estadoFinanciero: "PAGO",
    deboA: "",
  });
  const [mostrarModalCambio, setMostrarModalCambio] = useState(false);
  const [itemCambio, setItemCambio] = useState<InventarioItem | null>(null);
  const [imeiCambio, setImeiCambio] = useState("");
  const [estadoRetornoCambio, setEstadoRetornoCambio] = useState("BODEGA");
  const [observacionCambio, setObservacionCambio] = useState("");

  const rolActual = String(user?.rolNombre || "").toUpperCase();
  const esAdmin = ["ADMIN", "AUDITOR"].includes(rolActual);
  const puedeEliminar = rolActual === "ADMIN";
  const consultaScope = esAdmin ? `admin:${sedeFiltroId}` : `sede:${user?.sedeId ?? ""}`;

  const cargarUsuario = useCallback(async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error cargando usuario");
        return;
      }

      setUser(data);
    } catch {
      setMensaje("Error cargando usuario");
    }
  }, []);

  const cargarInventario = useCallback(async (preservarMensaje = false) => {
    const requestId = inventarioRequestId.current + 1;
    inventarioRequestId.current = requestId;

    try {
      if (!preservarMensaje) setMensaje("");
      setCargandoInventario(true);
      const params = new URLSearchParams();

      if (esAdmin && sedeFiltroId !== "TODAS") {
        params.set("sedeId", sedeFiltroId);
      }

      const endpoint = params.size
        ? `/api/inventario?${params.toString()}`
        : "/api/inventario";

      const res = await fetch(endpoint, {
        cache: "no-store",
      });

      const data = await res.json();

      if (requestId !== inventarioRequestId.current) {
        return;
      }

      if (!res.ok) {
        setMensaje(data.error || "Error cargando inventario");
        return;
      }

      if (!Array.isArray(data)) {
        setMensaje("No se pudo leer el inventario. Actualiza para reintentar.");
        return;
      }

      setItems(data);
      setInventarioCargado(true);
      setConsultaCargada(consultaScope);
    } catch {
      if (requestId === inventarioRequestId.current) {
        setMensaje("Error cargando inventario");
      }
    } finally {
      if (requestId === inventarioRequestId.current) {
        setCargandoInventario(false);
      }
    }
  }, [consultaScope, esAdmin, sedeFiltroId]);

  const cargarSedes = useCallback(async () => {
    try {
      const res = await fetch("/api/sedes", { cache: "no-store" });
      const data = await res.json();

      if (res.ok) {
        setSedes(Array.isArray(data) ? data : []);
      }
    } catch {}
  }, []);

  const cambiarEstado = async (
    item: InventarioItem,
    estadoActual: "PENDIENTE" | "GARANTIA" | "BODEGA"
  ) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario/cambiar-estado", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          estadoActual,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error actualizando estado");
        return;
      }

      setMensaje(`Estado actualizado a ${estadoActual}`);
      await cargarInventario(true);
    } catch {
      setMensaje("Error actualizando estado");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await cargarUsuario();
      await cargarSedes();
    };

    void init();
  }, [cargarSedes, cargarUsuario]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void cargarInventario();
  }, [cargarInventario, user]);

  useEffect(() => {
    setIdsSeleccionados((actuales) =>
      actuales.filter((id) => items.some((item) => item.id === id))
    );
  }, [items]);

  useLiveRefresh(
    async () => {
      await cargarInventario(true);
    },
    { enabled: Boolean(user), intervalMs: 60000 }
  );

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

  const totalBodega = useMemo(
    () =>
      items.filter((item) => (item.estadoActual || "").toUpperCase() === "BODEGA").length,
    [items]
  );

  const totalPendiente = useMemo(
    () =>
      items.filter((item) => (item.estadoActual || "").toUpperCase() === "PENDIENTE").length,
    [items]
  );

  const totalGarantia = useMemo(
    () =>
      items.filter((item) => (item.estadoActual || "").toUpperCase() === "GARANTIA").length,
    [items]
  );

  const totalPrestamo = useMemo(
    () =>
      items.filter((item) => (item.estadoActual || "").toUpperCase() === "PRESTAMO").length,
    [items]
  );

  const valorPrestamosPorCobrar = useMemo(
    () =>
      items
        .filter((item) => (item.estadoActual || "").toUpperCase() === "PRESTAMO")
        .reduce((acc, item) => acc + Number(item.costo || 0), 0),
    [items]
  );

  const totalPagados = useMemo(
    () =>
      items.filter((item) => (item.estadoFinanciero || "").toUpperCase() === "PAGO").length,
    [items]
  );

  const totalCancelados = useMemo(
    () =>
      items.filter((item) => (item.estadoFinanciero || "").toUpperCase() === "CANCELADO").length,
    [items]
  );

  const totalDeuda = useMemo(
    () =>
      items
        .filter((item) => (item.estadoFinanciero || "").toUpperCase() === "DEUDA")
        .reduce((acc, item) => acc + Number(item.costo || 0), 0),
    [items]
  );

  const totalPagado = useMemo(
    () =>
      items
        .filter((item) => (item.estadoFinanciero || "").toUpperCase() === "PAGO")
        .reduce((acc, item) => acc + Number(item.costo || 0), 0),
    [items]
  );

  const filtrosOperativosSeleccionados = useMemo(
    () =>
      filtrosEstado.filter(
        (estado): estado is EstadoOperativoFiltro => !esFiltroFinanciero(estado)
      ),
    [filtrosEstado]
  );

  const filtrosFinancierosSeleccionados = useMemo(
    () => filtrosEstado.filter(esFiltroFinanciero),
    [filtrosEstado]
  );

  const itemsDeudaBase = useMemo(
    () => items.filter((item) => String(item.estadoFinanciero || "").trim().toUpperCase() === "DEUDA"),
    [items]
  );
  const resumenDeudaPorAcreedor = useMemo(() => agruparDeudasPorAcreedor(itemsDeudaBase), [itemsDeudaBase]);
  const totalDeudaVista = useMemo(() => itemsDeudaBase.reduce((total, item) => total + deudaPendienteInventario(item), 0), [itemsDeudaBase]);
  const itemsDeudaFiltrados = useMemo(() => {
    const termino = busquedaDeudas.trim().toLocaleLowerCase("es-CO");
    return itemsDeudaBase.filter((item) =>
      (acreedorDeudaClave === "TODOS" || identidadAcreedor(item).key === acreedorDeudaClave) &&
      (!filtrosEstadoDeudas.length || filtrosEstadoDeudas.includes(String(item.estadoActual || "").trim().toUpperCase())) &&
      (!termino || item.imei.toLocaleLowerCase("es-CO").includes(termino) || item.referencia.toLocaleLowerCase("es-CO").includes(termino))
    );
  }, [acreedorDeudaClave, busquedaDeudas, filtrosEstadoDeudas, itemsDeudaBase]);
  useEffect(() => {
    if (inventarioCargado && consultaCargada === consultaScope && acreedorDeudaClave !== "TODOS" && !resumenDeudaPorAcreedor.some((creditor) => creditor.key === acreedorDeudaClave)) {
      setAcreedorDeudaClave("TODOS"); setIdsSeleccionados([]); setPaginaDeudas(1);
    }
  }, [acreedorDeudaClave, consultaCargada, consultaScope, inventarioCargado, resumenDeudaPorAcreedor]);

  const itemsPrestamoConBusqueda = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return items
      .filter((item) => (item.estadoActual || "").toUpperCase() === "PRESTAMO")
      .filter((item) =>
        coincideEstadosFinancieros(item, filtrosFinancierosSeleccionados)
      )
      .filter((item) => coincideBusquedaInventario(item, termino));
  }, [busqueda, filtrosFinancierosSeleccionados, items]);

  const totalPrestamoVista = useMemo(
    () =>
      itemsPrestamoConBusqueda.reduce(
        (acc, item) => acc + Number(item.costo || 0),
        0
      ),
    [itemsPrestamoConBusqueda]
  );

  const itemsFiltrados = useMemo(() => items.filter((item) =>
    coincideEstadosOperativos(item, filtrosOperativosSeleccionados) &&
    coincideEstadosFinancieros(item, filtrosFinancierosSeleccionados) &&
    coincideBusquedaInventario(item, busqueda.trim().toLowerCase())
  ), [busqueda, filtrosFinancierosSeleccionados, filtrosOperativosSeleccionados, items]);
  const itemsVista = pestana === "deudas" ? itemsDeudaFiltrados : itemsFiltrados;
  useEffect(() => {
    setIdsSeleccionados((actuales) => {
      const restantes = actuales.filter((id) => itemsVista.some((item) => item.id === id));
      return restantes.length === actuales.length ? actuales : restantes;
    });
  }, [itemsVista]);

  const alternarFiltroEstado = (estado: EstadoFiltro) => {
    setPagina(1);
    setIdsSeleccionados([]);
    setFiltrosEstado((actuales) =>
      actuales.includes(estado)
        ? actuales.filter((item) => item !== estado)
        : [...actuales, estado]
    );
  };

  const eliminar = async (ids: number[]) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario/eliminar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });

      const data = await res.json();

      if (!res.ok) {
        const detalleBloqueados = Array.isArray(data.bloqueados) && data.bloqueados.length
          ? ` ${data.bloqueados.slice(0, 3).join(" | ")}`
          : "";
        setMensaje(`${data.error || "Error eliminando equipo"}${detalleBloqueados}`);
        return;
      }

      const eliminados = Number(data.eliminados ?? 0);
      const bloqueados = Array.isArray(data.bloqueados) ? data.bloqueados : [];

      setMensaje(
        [
          eliminados === 1
            ? "1 equipo eliminado correctamente."
            : `${eliminados} equipos eliminados correctamente.`,
          bloqueados.length
            ? `${bloqueados.length} no se eliminaron. ${bloqueados.slice(0, 3).join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );

      setIdsSeleccionados((actuales) => actuales.filter((id) => !ids.includes(id)));
      await cargarInventario(true);
    } catch {
      setMensaje("Error eliminando equipo");
    } finally {
      setCargando(false);
    }
  };

  const abrirEdicion = (item: InventarioItem) => {
    setItemEditar(item);
    setFormularioEditar({
      referencia: item.referencia || "",
      tipoProducto: item.tipoProducto || "TELEFONIA",
      color: item.color || "",
      costo: String(item.costo || ""),
      distribuidor: item.distribuidor || "",
      estadoFinanciero: item.estadoFinanciero || "PAGO",
      deboA: item.deboA || "",
    });
    setMostrarModalEditar(true);
  };

  const cerrarEdicion = () => {
    setMostrarModalEditar(false);
    setItemEditar(null);
    setFormularioEditar({
      referencia: "",
      tipoProducto: "TELEFONIA",
      color: "",
      costo: "",
      distribuidor: "",
      estadoFinanciero: "PAGO",
      deboA: "",
    });
  };

  const guardarEdicion = async () => {
    if (!itemEditar) return;

    if (!formularioEditar.referencia.trim()) {
      setMensaje("Debes ingresar la referencia");
      return;
    }

    if (!formularioEditar.costo || Number(formularioEditar.costo) <= 0) {
      setMensaje("Debes ingresar un costo valido");
      return;
    }

    if (!formularioEditar.distribuidor.trim()) {
      setMensaje("Debes seleccionar un distribuidor");
      return;
    }

    if (
      formularioEditar.estadoFinanciero === "DEUDA" &&
      !formularioEditar.deboA.trim()
    ) {
      setMensaje("Debes indicar a quien se debe");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario/actualizar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: itemEditar.id,
          referencia: formularioEditar.referencia,
          tipoProducto: formularioEditar.tipoProducto,
          color: formularioEditar.color,
          costo: Number(formularioEditar.costo),
          distribuidor: formularioEditar.distribuidor,
          estadoFinanciero: formularioEditar.estadoFinanciero,
          deboA:
            formularioEditar.estadoFinanciero === "DEUDA"
              ? formularioEditar.deboA
              : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error actualizando equipo");
        return;
      }

      setMensaje("Equipo actualizado correctamente");
      cerrarEdicion();
      await cargarInventario(true);
    } catch {
      setMensaje("Error actualizando equipo");
    } finally {
      setCargando(false);
    }
  };

  const abrirCambioEquipo = (item: InventarioItem) => {
    setItemCambio(item);
    setImeiCambio("");
    setEstadoRetornoCambio("BODEGA");
    setObservacionCambio("");
    setMostrarModalCambio(true);
  };

  const cerrarCambioEquipo = () => {
    setMostrarModalCambio(false);
    setItemCambio(null);
    setImeiCambio("");
    setEstadoRetornoCambio("BODEGA");
    setObservacionCambio("");
  };

  const ejecutarCambioEquipo = async () => {
    if (!itemCambio) return;

    const estado = String(itemCambio.estadoActual || "").toUpperCase();
    const esReemplazoVendido = estado === "VENDIDO";
    const imeiLimpio = imeiCambio.replace(/\D/g, "");

    if (imeiLimpio.length !== 15) {
      setMensaje(
        esReemplazoVendido
          ? "El IMEI nuevo debe tener exactamente 15 digitos."
          : "El IMEI anterior debe tener exactamente 15 digitos."
      );
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario/cambio-equipo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: itemCambio.id,
          imeiAnterior: esReemplazoVendido ? undefined : imeiLimpio,
          imeiNuevo: esReemplazoVendido ? imeiLimpio : undefined,
          estadoRetorno: estadoRetornoCambio,
          observacion: observacionCambio,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error registrando cambio de equipo");
        return;
      }

      setMensaje(data.mensaje || "Cambio de equipo registrado correctamente");
      cerrarCambioEquipo();
      await cargarInventario(true);
    } catch {
      setMensaje("Error registrando cambio de equipo");
    } finally {
      setCargando(false);
    }
  };

  const devolverABodega = async (item: InventarioItem) => {
    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario/cambiar-estado", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          estadoActual: "BODEGA",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error actualizando estado");
        return;
      }

      setMensaje("Equipo devuelto a BODEGA");
      await cargarInventario(true);
    } catch {
      setMensaje("Error actualizando estado");
    } finally {
      setCargando(false);
    }
  };

  const abrirPrestamo = (item: InventarioItem) => {
    setItemPrestamo(item);
    setSedeDestinoId("");
    setMostrarModalPrestamo(true);
  };

  const enviarPrestamo = async () => {
    if (!itemPrestamo) return;

    if (!sedeDestinoId) {
      setMensaje("Debes seleccionar una sede destino");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/prestamos/crear-desde-inventario", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inventarioId: itemPrestamo.id,
          sedeDestinoId: Number(sedeDestinoId),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error creando prestamo");
        return;
      }

      setMensaje("Solicitud de prestamo enviada. La sede destino debe aprobarla.");
      setMostrarModalPrestamo(false);
      setItemPrestamo(null);
      setSedeDestinoId("");
      await cargarInventario(true);
    } catch {
      setMensaje("Error creando prestamo");
    } finally {
      setCargando(false);
    }
  };

  const abrirPagoDeuda = (item: InventarioItem) => {
    setItemPago(item);
    setMostrarModalPago(true);
  };

  const pagarDeuda = async () => {
    if (!itemPago) return;

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario/pagar-deuda", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: itemPago.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje(data.error || "Error pagando deuda");
        return;
      }

      setMensaje(data.mensaje || "Deuda pagada correctamente");
      setMostrarModalPago(false);
      setItemPago(null);
      await cargarInventario(true);
    } catch {
      setMensaje("Error pagando deuda");
    } finally {
      setCargando(false);
    }
  };

  const puedeDevolverABodega = (item: InventarioItem) => {
    const estado = (item.estadoActual || "").toUpperCase();
    const vieneDeBodegaPrincipal =
      String(item.origen || "").trim().toUpperCase() === "PRINCIPAL";

    if (esAdmin && (estado === "PENDIENTE" || estado === "GARANTIA")) {
      return true;
    }

    return !vieneDeBodegaPrincipal && (estado === "PENDIENTE" || estado === "GARANTIA");
  };

  const puedePasarAPendiente = (item: InventarioItem) => {
    return String(item.estadoActual || "").toUpperCase() === "BODEGA";
  };

  const puedePasarAGarantia = (item: InventarioItem) => {
    return String(item.estadoActual || "").toUpperCase() === "BODEGA";
  };

  const puedeEnviarPrestamo = (item: InventarioItem) => {
    const estadoActual = String(item.estadoActual || "").toUpperCase();

    if (estadoActual !== "BODEGA") {
      return false;
    }

    return true;
  };

  const puedePagarDeuda = (item: InventarioItem) => {
    const estado = String(item.estadoFinanciero || "").trim().toUpperCase();
    const deboA = String(item.deboA || "").trim().toUpperCase();
    const estadoActual = String(item.estadoActual || "").trim().toUpperCase();
    const deudaProveedor = !esDeudaEntreSedes(deboA);
    const estadoPermitePagoProveedor = [
      "BODEGA",
      "VENDIDO",
      "PRESTAMO",
      "PRESTAMO_PAGO",
      "TRASLADO",
    ].includes(estadoActual);

    if (estado !== "DEUDA") return false;
    if (esDeudaEntreSedes(deboA)) return false;

    return deudaProveedor && estadoPermitePagoProveedor;
  };

  const puedeRegistrarCambioEquipo = (item: InventarioItem) => {
    if (!esAdmin) return false;

    const estadoActual = String(item.estadoActual || "").trim().toUpperCase();
    return estadoActual === "BODEGA" || estadoActual === "VENDIDO";
  };

  const itemsSeleccionados = useMemo(
    () => items.filter((item) => idsSeleccionados.includes(item.id)),
    [idsSeleccionados, items]
  );
  const itemSeleccionadoUnico = itemsSeleccionados.length === 1 ? itemsSeleccionados[0] : null;

  const idsVisibles = useMemo(
    () => itemsVista.map((item) => item.id),
    [itemsVista]
  );

  const todosVisiblesSeleccionados = useMemo(
    () =>
      idsVisibles.length > 0 &&
      idsVisibles.every((id) => idsSeleccionados.includes(id)),
    [idsSeleccionados, idsVisibles]
  );

  const itemsSeleccionadosParaPrestamo = useMemo(
    () => itemsSeleccionados.filter((item) => puedeEnviarPrestamo(item)),
    [itemsSeleccionados]
  );

  const itemsSeleccionadosParaPago = useMemo(
    () => itemsSeleccionados.filter((item) => puedePagarDeuda(item)),
    [itemsSeleccionados]
  );

  const itemsSeleccionadosParaPendiente = useMemo(
    () => itemsSeleccionados.filter((item) => puedePasarAPendiente(item)),
    [itemsSeleccionados]
  );

  const itemsSeleccionadosParaGarantia = useMemo(
    () => itemsSeleccionados.filter((item) => puedePasarAGarantia(item)),
    [itemsSeleccionados]
  );

  const itemsSeleccionadosParaFactura = useMemo(
    () => itemsSeleccionados.filter((item) => !item.facturaStand),
    [itemsSeleccionados]
  );
  const cantidadExcluidaFacturaStand =
    itemsSeleccionados.length - itemsSeleccionadosParaFactura.length;
  const sedeStandFactura = itemsSeleccionadosParaFactura[0]?.sede || null;
  const seleccionIncluyeStand = itemsSeleccionados.some(
    (item) => item.sede?.soloInventarioPorCobrar
  );
  const seleccionFacturaStandValida = useMemo(() => {
    if (!esAdmin || itemsSeleccionadosParaFactura.length === 0) return false;

    const primeraSedeId = itemsSeleccionadosParaFactura[0].sedeId;
    return itemsSeleccionadosParaFactura.every((item) => {
      return (
        item.sedeId === primeraSedeId &&
        item.sede?.soloInventarioPorCobrar === true &&
        Number(item.costo || 0) > 0
      );
    });
  }, [esAdmin, itemsSeleccionadosParaFactura]);

  const totalFacturaStand = useMemo(
    () =>
      itemsSeleccionadosParaFactura.reduce(
        (acumulado, item) => acumulado + Number(item.costo || 0),
        0
      ),
    [itemsSeleccionadosParaFactura]
  );

  const motivoFacturaStandInvalida = useMemo(() => {
    if (itemsSeleccionados.length === 0) return "Selecciona al menos un equipo.";
    if (itemsSeleccionadosParaFactura.length === 0) {
      return "Todos los equipos seleccionados ya estan vinculados a una factura.";
    }
    if (
      !itemsSeleccionadosParaFactura.every(
        (item) => item.sede?.soloInventarioPorCobrar
      )
    ) {
      return "Selecciona unicamente equipos de un stand marcado como solo inventario.";
    }
    if (
      new Set(itemsSeleccionadosParaFactura.map((item) => item.sedeId)).size !== 1
    ) {
      return "Todos los equipos de la factura deben pertenecer al mismo stand.";
    }
    if (
      itemsSeleccionadosParaFactura.some(
        (item) => Number(item.costo || 0) <= 0
      )
    ) {
      return "Todos los equipos deben tener un costo mayor a cero.";
    }
    return "";
  }, [itemsSeleccionados, itemsSeleccionadosParaFactura]);

  const totalPagoMasivo = useMemo(
    () =>
      itemsSeleccionadosParaPago.reduce(
        (acc, item) => acc + deudaPendienteInventario(item),
        0
      ),
    [itemsSeleccionadosParaPago]
  );

  const totalSeleccionDeuda = itemsSeleccionados.reduce((total, item) => total + deudaPendienteInventario(item), 0);
  const acreedoresPago = agruparDeudasPorAcreedor(itemsSeleccionadosParaPago);

  const sedesDestinoMasivo = useMemo(() => {
    return sedes.filter(
      (sede) =>
        esSedeOperativaInventario(sede.nombre) &&
        itemsSeleccionadosParaPrestamo.every((item) => item.sedeId !== sede.id)
    );
  }, [itemsSeleccionadosParaPrestamo, sedes]);

  const alternarSeleccion = (id: number) => {
    setIdsSeleccionados((actuales) =>
      actuales.includes(id)
        ? actuales.filter((itemId) => itemId !== id)
        : [...actuales, id]
    );
  };

  const alternarSeleccionVisibles = () => {
    setIdsSeleccionados((actuales) => {
      if (todosVisiblesSeleccionados) {
        return actuales.filter((id) => !idsVisibles.includes(id));
      }

      return Array.from(new Set([...actuales, ...idsVisibles]));
    });
  };

  const limpiarSeleccionMasiva = () => {
    setIdsSeleccionados([]);
    setSedeDestinoId("");
    setMostrarModalPrestamoMasivo(false);
    setMostrarModalPagoMasivo(false);
    setMostrarModalFacturaStand(false);
  };

  const abrirEliminacion = (ids: number[]) => {
    if (!puedeEliminar) {
      setMensaje("El rol actual no puede eliminar registros");
      return;
    }

    setIdsEliminar(ids);
    setModalEliminar(true);
  };

  const cerrarEliminacion = () => {
    setModalEliminar(false);
    setIdsEliminar([]);
  };

  const ejecutarEnvioMasivo = async () => {
    if (!sedeDestinoId) {
      setMensaje("Debes seleccionar una sede destino");
      return;
    }

    if (itemsSeleccionadosParaPrestamo.length === 0) {
      setMensaje("No hay equipos seleccionados disponibles para enviar");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      let enviados = 0;
      const errores: string[] = [];

      for (const item of itemsSeleccionadosParaPrestamo) {
        const res = await fetch("/api/prestamos/crear-desde-inventario", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inventarioId: item.id,
            sedeDestinoId: Number(sedeDestinoId),
          }),
        });

        const data = await res.json();

        if (res.ok) {
          enviados += 1;
        } else {
          errores.push(`${item.imei}: ${data.error || "Error creando prestamo"}`);
        }
      }

      setMensaje(
        [
          `Envio masivo finalizado: ${enviados} equipo${
            enviados === 1 ? "" : "s"
          } enviado${enviados === 1 ? "" : "s"}.`,
          errores.length
            ? `${errores.length} no se procesaron. ${errores.slice(0, 3).join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );

      limpiarSeleccionMasiva();
      await cargarInventario(true);
    } catch {
      setMensaje("Error ejecutando envio masivo");
    } finally {
      setCargando(false);
    }
  };

  const ejecutarPagoMasivo = async () => {
    if (itemsSeleccionadosParaPago.length === 0) {
      setMensaje("No hay equipos seleccionados con deuda pagable");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      let procesados = 0;
      const errores: string[] = [];

      for (const item of itemsSeleccionadosParaPago) {
        const res = await fetch("/api/inventario/pagar-deuda", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: item.id,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          procesados += 1;
        } else {
          errores.push(`${item.imei}: ${data.error || "Error pagando deuda"}`);
        }
      }

      setMensaje(
        [
          `Pago masivo finalizado: ${procesados} solicitud${
            procesados === 1 ? "" : "es"
          } procesada${procesados === 1 ? "" : "s"}.`,
          errores.length
            ? `${errores.length} no se procesaron. ${errores.slice(0, 3).join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );

      limpiarSeleccionMasiva();
      await cargarInventario(true);
    } catch {
      setMensaje("Error ejecutando pago masivo");
    } finally {
      setCargando(false);
    }
  };

  const emitirFacturaStand = async () => {
    if (!seleccionFacturaStandValida) {
      setMensaje(
        motivoFacturaStandInvalida ||
          "La seleccion actual no se puede facturar."
      );
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const res = await fetch("/api/inventario/factura-stand", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inventarioIds: itemsSeleccionadosParaFactura.map((item) => item.id),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        mensaje?: string;
        factura?: FacturaStandResultado;
        facturaAnteriorAnulada?: {
          factura: string;
          notaCredito: string | null;
        } | null;
      };

      if (!res.ok || !data.factura) {
        setMensaje(data.error || "No fue posible emitir la factura");
        return;
      }

      setFacturaStandResultado({
        ...data.factura,
        facturaAnteriorAnulada: data.facturaAnteriorAnulada,
      });
      setMostrarModalFacturaStand(false);
      setIdsSeleccionados([]);
      setMensaje(data.mensaje || "Factura emitida correctamente");
      await cargarInventario(true);
    } catch {
      setMensaje("Error comunicando la factura con Siigo");
    } finally {
      setCargando(false);
    }
  };

  const ejecutarCambioEstadoMasivo = async (
    estadoActual: "PENDIENTE" | "GARANTIA",
    itemsObjetivo: InventarioItem[]
  ) => {
    if (itemsObjetivo.length === 0) {
      setMensaje(
        estadoActual === "PENDIENTE"
          ? "No hay equipos seleccionados disponibles para pasar a pendiente"
          : "No hay equipos seleccionados disponibles para pasar a garantia"
      );
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      let procesados = 0;
      const errores: string[] = [];

      for (const item of itemsObjetivo) {
        const res = await fetch("/api/inventario/cambiar-estado", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: item.id,
            estadoActual,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          procesados += 1;
        } else {
          errores.push(`${item.imei}: ${data.error || "Error actualizando estado"}`);
        }
      }

      setMensaje(
        [
          `${
            estadoActual === "PENDIENTE" ? "Pendiente" : "Garantia"
          } masiva finalizada: ${procesados} equipo${
            procesados === 1 ? "" : "s"
          } actualizado${procesados === 1 ? "" : "s"}.`,
          errores.length
            ? `${errores.length} no se procesaron. ${errores.slice(0, 3).join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );

      limpiarSeleccionMasiva();
      await cargarInventario(true);
    } catch {
      setMensaje("Error ejecutando cambio masivo de estado");
    } finally {
      setCargando(false);
    }
  };

  const confirmarEliminacion = () => {
    if (idsEliminar.length === 0) return;

    void eliminar(idsEliminar);
    cerrarEliminacion();
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
  const coberturaActual = esAdmin
    ? sedeFiltroId === "TODAS" ? "Todas las sedes" : sedeFiltroNombre
    : user?.sedeNombre || "Tu sede";
  const vistaDisponible = inventarioCargado && consultaCargada === consultaScope;
  const valorMetrica = (valor: string | number) => vistaDisponible ? valor : "—";
  const resultados = vistaDisponible ? itemsVista.length : 0;
  const filasPorPaginaVista = pestana === "deudas" ? filasPorPaginaDeudas : filasPorPagina;
  const paginaVista = pestana === "deudas" ? paginaDeudas : pagina;
  const cambiarPagina = pestana === "deudas" ? setPaginaDeudas : setPagina;
  const paginas = Math.max(1, Math.ceil(resultados / filasPorPaginaVista));
  const paginaActual = Math.min(paginaVista, paginas);
  const inicioPagina = (paginaActual - 1) * filasPorPaginaVista;
  const itemsPagina = vistaDisponible ? itemsVista.slice(inicioPagina, inicioPagina + filasPorPaginaVista) : [];
  const paginaSeleccionada = itemsPagina.length > 0 && itemsPagina.every((item) => idsSeleccionados.includes(item.id));
  const alternarSeleccionPagina = () => setIdsSeleccionados((actuales) => paginaSeleccionada
    ? actuales.filter((id) => !itemsPagina.some((item) => item.id === id))
    : Array.from(new Set([...actuales, ...itemsPagina.map((item) => item.id)])));
  const cambiarFilasPorPagina = (cantidad: number) => {
    if (pestana === "deudas") { setFilasPorPaginaDeudas(cantidad); setPaginaDeudas(1); }
    else { setFilasPorPagina(cantidad); setPagina(1); }
  };
  const primeraPagina = Math.max(1, Math.min(paginaActual - 2, paginas - 4));
  const botonesPagina = Array.from({ length: Math.min(5, paginas) }, (_, index) => primeraPagina + index);
  const filtrosActivos = pestana === "deudas" ? Boolean(busquedaDeudas.trim() || filtrosEstadoDeudas.length || acreedorDeudaClave !== "TODOS") : Boolean(busqueda.trim() || filtrosEstado.length);
  const etiquetasFiltro: Record<EstadoOperativoFiltro, string> = {
    BODEGA: "Bodega", VENDIDO: "Vendidos", PENDIENTE: "Pendiente", GARANTIA: "Garantía",
    PRESTAMO: "Préstamo", PRESTAMO_PAGO: "Préstamo pago", TRASLADO: "Traslado", PRESTAMO_POR_ACEPTAR: "Por aceptar",
  };

  const limpiarFiltros = () => {
    if (pestana === "deudas") {
      setBusquedaDeudas(""); setBusquedaAcreedores(""); setFiltrosEstadoDeudas([]); setAcreedorDeudaClave("TODOS"); setPaginaDeudas(1);
    } else { setBusqueda(""); setFiltrosEstado([]); setPagina(1); }
    setIdsSeleccionados([]);
  };
  const limpiarGrupo = (financiero: boolean) => {
    setFiltrosEstado((actuales) => actuales.filter((estado) => esFiltroFinanciero(estado) !== financiero));
    setIdsSeleccionados([]); setPagina(1);
  };
  const accionesEquipo = (item: InventarioItem): InventoryAction[] => {
    const acciones: InventoryAction[] = [{ key: "historial", label: "Ver historial", icon: "document-search", href: `/inventario/historial?imei=${encodeURIComponent(item.imei)}` }];
    if (puedeDevolverABodega(item)) acciones.push({ key: "bodega", label: "Devolver a bodega", icon: "inventory", onClick: () => void devolverABodega(item), disabled: cargando });
    if (puedeEnviarPrestamo(item)) acciones.push({ key: "prestamo", label: "Enviar a sede", icon: "send", onClick: () => abrirPrestamo(item), disabled: cargando });
    if (puedePasarAPendiente(item)) acciones.push({ key: "pendiente", label: "Marcar pendiente", icon: "clock", onClick: () => void cambiarEstado(item, "PENDIENTE"), disabled: cargando });
    if (puedePasarAGarantia(item)) acciones.push({ key: "garantia", label: "Marcar garantía", icon: "shield", onClick: () => void cambiarEstado(item, "GARANTIA"), disabled: cargando });
    if (puedePagarDeuda(item)) acciones.push({ key: "pago", label: "Pagar deuda", icon: "coins", onClick: () => abrirPagoDeuda(item), disabled: cargando });
    if (puedeRegistrarCambioEquipo(item)) acciones.push({ key: "cambio", label: String(item.estadoActual || "").toUpperCase() === "VENDIDO" ? "Reemplazar equipo vendido" : "Registrar cambio de equipo", icon: "transfer", onClick: () => abrirCambioEquipo(item), disabled: cargando });
    if (esAdmin) acciones.push({ key: "editar", label: "Editar", icon: "settings", onClick: () => abrirEdicion(item), disabled: cargando });
    if (puedeEliminar) acciones.push({ key: "eliminar", label: "Eliminar", icon: "close", onClick: () => abrirEliminacion([item.id]), disabled: cargando, danger: true });
    return acciones;
  };

  const operacionesMasivas = (
vistaDisponible && (pestana === "deudas" || filtrosEstado.includes("DEUDA") || idsSeleccionados.length > 0) && (
            <div className={styles.bulkSection}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    {idsSeleccionados.length > 0
                      ? `${idsSeleccionados.length} equipo${
                          idsSeleccionados.length === 1 ? "" : "s"
                        } seleccionado${idsSeleccionados.length === 1 ? "" : "s"}`
                      : "Selecciona los equipos que deseas pagar"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {idsSeleccionados.length > 0
                      ? `${itemsSeleccionadosParaPago.length} deuda${
                          itemsSeleccionadosParaPago.length === 1 ? "" : "s"
                        } pagable${
                          itemsSeleccionadosParaPago.length > 0
                            ? ` por ${formatoPesos(totalPagoMasivo)}`
                            : ""
                        }. Solo se procesará lo seleccionado.`
                      : "Marca IMEI individuales o selecciona todos los resultados filtrados de todas las páginas. El pago masivo procesará solamente lo seleccionado."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={alternarSeleccionVisibles}
                    disabled={cargando || idsVisibles.length === 0}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {todosVisiblesSeleccionados
                      ? "Quitar selección de resultados"
                      : `Seleccionar resultados (${idsVisibles.length})`}
                  </button>

                  {idsSeleccionados.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSedeDestinoId("");
                        setMostrarModalPrestamoMasivo(true);
                      }}
                      disabled={cargando || itemsSeleccionadosParaPrestamo.length === 0}
                      className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Enviar a sede
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setMostrarModalPagoMasivo(true)}
                    disabled={cargando || itemsSeleccionadosParaPago.length === 0}
                    className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Pagar seleccionados
                    {itemsSeleccionadosParaPago.length > 0
                      ? ` (${itemsSeleccionadosParaPago.length})`
                      : ""}
                  </button>

                  {esAdmin &&
                    idsSeleccionados.length > 0 &&
                    seleccionIncluyeStand && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!seleccionFacturaStandValida) {
                            setMensaje(motivoFacturaStandInvalida);
                            return;
                          }

                          setFacturaStandResultado(null);
                          setMostrarModalFacturaStand(true);
                        }}
                        disabled={cargando || !seleccionFacturaStandValida}
                        title={motivoFacturaStandInvalida || "Emitir factura electronica"}
                        className="rounded-2xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Factura electronica
                        {seleccionFacturaStandValida
                          ? " (" + itemsSeleccionadosParaFactura.length + ")"
                          : ""}
                      </button>
                    )}

                  {esAdmin &&
                    seleccionIncluyeStand &&
                    cantidadExcluidaFacturaStand > 0 && (
                      <span className="self-center text-xs font-semibold text-blue-700">
                        {cantidadExcluidaFacturaStand} con factura se excluyen
                      </span>
                    )}

                  {esAdmin && idsSeleccionados.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        void ejecutarCambioEstadoMasivo(
                          "PENDIENTE",
                          itemsSeleccionadosParaPendiente
                        )
                      }
                      disabled={cargando || itemsSeleccionadosParaPendiente.length === 0}
                      className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Marcar pendiente
                    </button>
                  )}

                  {esAdmin && idsSeleccionados.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        void ejecutarCambioEstadoMasivo(
                          "GARANTIA",
                          itemsSeleccionadosParaGarantia
                        )
                      }
                      disabled={cargando || itemsSeleccionadosParaGarantia.length === 0}
                      className="rounded-2xl bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Marcar garantia
                    </button>
                  )}

                  {esAdmin && idsSeleccionados.length > 0 && (
                    <button
                      type="button"
                      onClick={() => itemSeleccionadoUnico && abrirEdicion(itemSeleccionadoUnico)}
                      disabled={cargando || !itemSeleccionadoUnico}
                      className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Editar seleccionado
                    </button>
                  )}

                  {puedeEliminar && idsSeleccionados.length > 0 && (
                    <button
                      type="button"
                      onClick={() => abrirEliminacion(idsSeleccionados)}
                      disabled={cargando || idsSeleccionados.length === 0}
                      className="rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Eliminar seleccion
                    </button>
                  )}

                  {idsSeleccionados.length > 0 && (
                    <button
                      type="button"
                      onClick={limpiarSeleccionMasiva}
                      disabled={cargando}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      Limpiar seleccion
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
  );
  const tablaEquipos = (<>
<div className={`${styles.tableScroller} ${pestana === "deudas" ? styles.debtTableScroller : ""}`} aria-busy={cargandoInventario}>
              <table className={`${styles.table} ${pestana === "deudas" ? styles.debtTable : ""}`}>
                <colgroup>{Array.from({ length: pestana === "deudas" ? 6 : 8 }, (_, index) => <col key={index} />)}</colgroup>
                <thead><tr><th><input type="checkbox" aria-label={pestana === "deudas" ? `Seleccionar página actual (${itemsPagina.length})` : `Seleccionar todos los resultados filtrados (${resultados})`} checked={vistaDisponible && (pestana === "deudas" ? paginaSeleccionada : todosVisiblesSeleccionados)} disabled={!vistaDisponible || cargando || !resultados} onChange={pestana === "deudas" ? alternarSeleccionPagina : alternarSeleccionVisibles} /></th><th>Equipo / IMEI</th><th>Costo</th><th>Sede</th>{pestana === "equipos" && <th>Acreedor</th>}<th>Estado</th>{pestana === "equipos" && <th>Financiero</th>}<th>Acciones</th></tr></thead>
                <tbody>{!itemsPagina.length ? <tr><td colSpan={pestana === "deudas" ? 6 : 8} className={styles.empty}><DashboardIcon name="inventory" /><strong>{!vistaDisponible ? cargandoInventario || !user && !mensaje ? "Cargando inventario…" : "No se pudo cargar el inventario" : "No hay equipos para estos filtros"}</strong>{vistaDisponible && filtrosActivos && <button type="button" onClick={limpiarFiltros}>Limpiar filtros</button>}</td></tr> : itemsPagina.map((item) => <InventoryRow key={item.id} variant={pestana === "deudas" ? "debt" : "default"} item={item} selected={idsSeleccionados.includes(item.id)} onSelect={() => alternarSeleccion(item.id)} expanded={idsExpandidos.includes(item.id)} onToggle={() => setIdsExpandidos((actuales) => actuales.includes(item.id) ? actuales.filter((id) => id !== item.id) : [...actuales, item.id])} destino={etiquetaDestinoPrestamo(item)} actions={accionesEquipo(item)} />)}</tbody>
              </table>
            </div>
            <footer className={styles.pagination}>
              <p>{vistaDisponible ? `Mostrando ${resultados ? inicioPagina + 1 : 0} – ${Math.min(inicioPagina + filasPorPaginaVista, resultados)} de ${resultados.toLocaleString("es-CO")}` : "Esperando la consulta"}</p>
              <div className={styles.paginationControls}>
                <label className={styles.pageSize}>Filas por página<select aria-label="Filas por página" value={filasPorPaginaVista} onChange={(event) => cambiarFilasPorPagina(Number(event.target.value))}>{[10, 25, 50, 100].map((cantidad) => <option key={cantidad} value={cantidad}>{cantidad}</option>)}</select></label>
                <nav className={styles.pageButtons} aria-label="Páginas de inventario">
                  <button type="button" aria-label="Página anterior" disabled={!vistaDisponible || paginaActual <= 1} onClick={() => cambiarPagina(paginaActual - 1)}><DashboardIcon name="chevron" className={styles.previousIcon} /></button>
                  {primeraPagina > 1 && <><button type="button" aria-label="Página 1" onClick={() => cambiarPagina(1)}>1</button>{primeraPagina > 2 && <span>…</span>}</>}
                  {botonesPagina.map((numero) => <button key={numero} type="button" aria-label={`Página ${numero}`} aria-current={paginaActual === numero ? "page" : undefined} disabled={!vistaDisponible} onClick={() => cambiarPagina(numero)}>{numero}</button>)}
                  {botonesPagina.at(-1)! < paginas && <>{botonesPagina.at(-1)! < paginas - 1 && <span>…</span>}<button type="button" aria-label={`Página ${paginas}`} onClick={() => cambiarPagina(paginas)}>{paginas}</button></>}
                  <button type="button" aria-label="Página siguiente" disabled={!vistaDisponible || paginaActual >= paginas} onClick={() => cambiarPagina(paginaActual + 1)}><DashboardIcon name="chevron" /></button>
                </nav>
              </div>
            </footer>
  </>);

  return (
    <div className={styles.shell}>
      <DashboardSidebar appearance="white" activeHref="/inventario" coverageLabel={coberturaActual} items={navigationItems} />
      <div className={styles.workspace}>
        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerTitle}><h1>Inventario</h1>
              <label className={styles.sedeField}>
                <DashboardIcon name="pin" />
                <select aria-label="Sede del inventario" value={esAdmin ? sedeFiltroId : String(user?.sedeId ?? "")} disabled={!esAdmin || cargando} onChange={(event) => {
                  setSedeFiltroId(event.target.value); setAcreedorDeudaClave("TODOS"); setIdsSeleccionados([]); setPagina(1); setPaginaDeudas(1);
                }}>
                  {esAdmin ? <><option value="TODAS">Todas las sedes</option>{sedes.map((sede) => <option key={sede.id} value={String(sede.id)}>{sede.nombre}</option>)}</> : <option value={String(user?.sedeId ?? "")}>{user?.sedeNombre || "Tu sede"}</option>}
                </select>
                <DashboardIcon name="chevron" />
              </label>
            </div>
            <div className={styles.headerControls}>
              <Link href="/inventario/historial">Centro IMEI</Link>
              <Link href="/prestamos">Préstamos</Link>
              <Link className={styles.newInventory} href="/inventario/nuevo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>Nuevo inventario</Link>
              <SalesProfile name={user?.nombre || user?.usuario || "Usuario"} role={user?.rolNombre || ""} />
            </div>
          </header>
          {mensaje && <div className={styles.notice} role="alert"><DashboardIcon name="bell" /><span>{mensaje}</span><button type="button" disabled={cargandoInventario || cargando} onClick={() => void (user ? cargarInventario() : cargarUsuario())}>Actualizar</button></div>}
          <div className={styles.tabs} role="tablist" aria-label="Secciones de inventario">
            <button type="button" role="tab" id="inventory-equipment-tab" aria-selected={pestana === "equipos"} aria-controls="inventory-equipment-panel" onClick={() => { setPestana("equipos"); setIdsSeleccionados([]); }}>Equipos</button>
            <button type="button" role="tab" id="inventory-debts-tab" aria-selected={pestana === "deudas"} aria-controls="inventory-debts-panel" onClick={() => { setPestana("deudas"); setIdsSeleccionados([]); }}>Deudas por acreedor</button>
          </div>
          {pestana === "equipos" ? <div role="tabpanel" id="inventory-equipment-panel" aria-labelledby="inventory-equipment-tab">
          <section className={`${styles.summary} ${styles.counts}`} aria-label={`Estados del inventario · ${coberturaActual}`} aria-busy={cargandoInventario}>
            <InventoryMetric icon="inventory" label="En bodega" value={valorMetrica(totalBodega)} />
            <InventoryMetric icon="warning" label="Pendientes" value={valorMetrica(totalPendiente)} alert />
            <InventoryMetric icon="shield" label="Garantía" value={valorMetrica(totalGarantia)} alert />
            <InventoryMetric icon="approvals" label="Pagados" value={valorMetrica(totalPagados)} />
            <InventoryMetric icon="close" label="Cancelados" value={valorMetrica(totalCancelados)} />
          </section>
          <section className={`${styles.summary} ${styles.financial}`} aria-label={`Saldos del inventario · ${coberturaActual}`} aria-busy={cargandoInventario}>
            <InventoryMetric financial icon="document" label="Total que debo" value={valorMetrica(totalDeuda)} alert />
            <InventoryMetric financial icon="clock" label="Préstamos por cobrar" value={valorMetrica(valorPrestamosPorCobrar)} detail={vistaDisponible ? `${totalPrestamo.toLocaleString("es-CO")} préstamo${totalPrestamo === 1 ? "" : "s"}` : undefined} alert />
            <InventoryMetric financial icon="wallet" label="Total pagado" value={valorMetrica(totalPagado)} />
          </section>
          <section className={styles.list} aria-labelledby="inventory-list-title">
            <div className={styles.listTop}>
              <div className={styles.listHeading}><h2 id="inventory-list-title">Equipos registrados</h2><span aria-live="polite">{vistaDisponible ? `${resultados.toLocaleString("es-CO")} resultado${resultados === 1 ? "" : "s"}` : cargandoInventario || !user && !mensaje ? "Cargando inventario…" : "Sin datos cargados"}</span></div>
              <label className={styles.search}><DashboardIcon name="search" /><input aria-label="Buscar equipos" type="search" value={busqueda} placeholder="Buscar IMEI, referencia, color, proveedor o sede…" onChange={(event) => { setBusqueda(event.target.value); setIdsSeleccionados([]); setPagina(1); }} /></label>
            </div>
            <div className={styles.filterRows}>
              <div className={styles.filterGroup}><p>Estado del equipo</p><div className={styles.filterButtons} role="group" aria-label="Estado del equipo">
                <button type="button" aria-pressed={!filtrosOperativosSeleccionados.length} onClick={() => limpiarGrupo(false)}>Todos</button>
                {ESTADOS_OPERATIVOS_FILTRO.map((estado) => <button key={estado} type="button" aria-pressed={filtrosEstado.includes(estado)} onClick={() => alternarFiltroEstado(estado)}>{etiquetasFiltro[estado]}</button>)}
              </div></div>
              <div className={`${styles.filterGroup} ${styles.financeGroup}`}><p>Estado financiero</p><div className={styles.filterButtons} role="group" aria-label="Estado financiero">
                <button type="button" aria-pressed={!filtrosFinancierosSeleccionados.length} onClick={() => limpiarGrupo(true)}>Todos</button>
                {ESTADOS_FINANCIEROS_FILTRO.map((estado) => <button key={estado} type="button" aria-pressed={filtrosEstado.includes(estado)} onClick={() => alternarFiltroEstado(estado)}>{estado === "PAGO" ? "Pago" : "Deuda"}</button>)}
              </div></div>
            </div>
            {filtrosActivos && <div className={styles.filterMeta}><span>{coberturaActual} · Selección múltiple de estados</span><button type="button" onClick={limpiarFiltros}><DashboardIcon name="close" />Limpiar filtros</button></div>}
            {vistaDisponible && filtrosEstado.includes("PRESTAMO") && <div className={styles.extraPanel}><div className={styles.loanSummary}><span>Préstamos en esta consulta · {itemsPrestamoConBusqueda.length.toLocaleString("es-CO")} equipos</span><strong>{formatoPesos(totalPrestamoVista)}</strong></div></div>}
            {operacionesMasivas}

            {tablaEquipos}
          </section>
          </div> : <div role="tabpanel" id="inventory-debts-panel" aria-labelledby="inventory-debts-tab">
            <DebtSummary total={totalDeudaVista} count={itemsDeudaBase.length} loading={!vistaDisponible} />
            <div className={styles.debtGrid}>
              <CreditorsPanel creditors={vistaDisponible ? resumenDeudaPorAcreedor : []} selectedKey={acreedorDeudaClave} onSelect={(key) => { setAcreedorDeudaClave(key); setIdsSeleccionados([]); setPaginaDeudas(1); }} search={busquedaAcreedores} onSearch={(value) => { setBusquedaAcreedores(value); setIdsSeleccionados([]); }} loading={!vistaDisponible} error={!vistaDisponible && !cargandoInventario && Boolean(mensaje)} />
              <section className={`${styles.list} ${styles.debtEquipment}`} aria-label="Equipos con deuda">
                <DebtEquipmentFilters search={busquedaDeudas} onSearch={(value) => { setBusquedaDeudas(value); setIdsSeleccionados([]); setPaginaDeudas(1); }} states={filtrosEstadoDeudas} onToggleState={(estado) => { setFiltrosEstadoDeudas((actuales) => actuales.includes(estado) ? actuales.filter((item) => item !== estado) : [...actuales, estado]); setIdsSeleccionados([]); setPaginaDeudas(1); }} onClear={limpiarFiltros} resultsCount={resultados} creditorLabel={acreedorDeudaClave === "TODOS" ? "Todos los acreedores" : resumenDeudaPorAcreedor.find((creditor) => creditor.key === acreedorDeudaClave)?.name || "Sin acreedor"} />
                <DebtSelectionBar selectedCount={idsSeleccionados.length} total={totalSeleccionDeuda} resultsCount={resultados} pageCount={itemsPagina.length} allSelected={todosVisiblesSeleccionados} pageSelected={paginaSeleccionada} onSelectAll={alternarSeleccionVisibles} onSelectPage={alternarSeleccionPagina} onClear={limpiarSeleccionMasiva} onPay={() => setMostrarModalPagoMasivo(true)} payDisabled={!vistaDisponible || !itemsSeleccionadosParaPago.length} busy={cargando || !vistaDisponible} />
                {idsSeleccionados.length > itemsSeleccionadosParaPago.length && <p className={styles.paymentEligibility}>{itemsSeleccionadosParaPago.length} equipos aptos para pago · {formatoPesos(totalPagoMasivo)}. Los demás no aplican por estado, tipo de deuda o reglas actuales.</p>}
                {idsSeleccionados.length > 0 && <details className={styles.moreBulkOperations}><summary>Más operaciones para la selección</summary>{operacionesMasivas}</details>}
                {tablaEquipos}
              </section>
            </div>
          </div>}
        </main>
      </div>
      {mostrarModalFacturaStand && (
        <div className={styles.modal}>
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-2xl">
            <div className="bg-slate-950 px-6 py-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">
                Factura electronica
              </p>
              <h3 className="mt-2 text-2xl font-black">
                Confirmar lote del stand
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Revisa el destinatario, los IMEI y el valor antes de enviar la
                factura a Siigo.
              </p>
            </div>

            <div className="p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    Stand
                  </p>
                  <p className="mt-2 font-black text-slate-950">
                    {sedeStandFactura?.nombre || "Sin sede"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    Equipos
                  </p>
                  <p className="mt-2 text-xl font-black text-slate-950">
                    {itemsSeleccionadosParaFactura.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-700">
                    Total factura
                  </p>
                  <p className="mt-2 text-xl font-black text-blue-950">
                    {formatoPesos(totalFacturaStand)}
                  </p>
                </div>
              </div>

              <div className="mt-5 border border-blue-200 bg-blue-50 p-4 text-blue-950">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">
                  Configuracion Siigo del stand
                </p>
                <p className="mt-2 text-sm leading-6">
                  La forma de pago y el plazo se aplicaran automaticamente desde la configuracion de {sedeStandFactura?.nombre || "este stand"}.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-black text-slate-950">
                    IMEI incluidos
                  </p>
                  <span className="text-xs font-semibold text-slate-500">
                    Una linea por equipo
                  </span>
                </div>
                <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                  {itemsSeleccionadosParaFactura.slice(0, 30).map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      {item.imei}
                    </span>
                  ))}
                  {itemsSeleccionadosParaFactura.length > 30 && (
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">
                      +{itemsSeleccionadosParaFactura.length - 30} mas
                    </span>
                  )}
                </div>
              </div>

              {cantidadExcluidaFacturaStand > 0 && (
                <div className="mt-5 border border-blue-300 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
                  {cantidadExcluidaFacturaStand} equipo
                  {cantidadExcluidaFacturaStand === 1 ? "" : "s"} ya tiene
                  {cantidadExcluidaFacturaStand === 1 ? "" : "n"} factura y no
                  se incluira{cantidadExcluidaFacturaStand === 1 ? "" : "n"} en
                  este nuevo lote.
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                Esta accion genera una factura electronica real. No marca los
                equipos como pagados, no los elimina y no modifica caja,
                prestamos ni ventas.
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setMostrarModalFacturaStand(false)}
                  disabled={cargando}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void emitirFacturaStand()}
                  disabled={cargando || !seleccionFacturaStandValida}
                  className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cargando
                    ? "Verificando y enviando..."
                    : "Emitir factura"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {facturaStandResultado && (
        <div className={styles.modal}>
          <div className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-2xl">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">
              V
            </span>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              Factura emitida
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">
              {facturaStandResultado.nombre}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {facturaStandResultado.cantidad} equipos de{" "}
              {facturaStandResultado.sedeNombre} por{" "}
              <span className="font-black text-slate-950">
                {formatoPesos(facturaStandResultado.total)}
              </span>
            </p>
            <p className="mt-2 text-sm font-bold text-slate-700">
              {facturaStandResultado.diasVencimiento > 0
                ? `Credito a ${facturaStandResultado.diasVencimiento} dias`
                : "Pago inmediato"}
            </p>
            {facturaStandResultado.facturaAnteriorAnulada && (
              <div className="mt-5 border border-emerald-300 bg-emerald-50 p-4 text-left text-sm text-emerald-950">
                <p className="font-black">Nota credito verificada</p>
                <p className="mt-1">
                  Factura anterior:{" "}
                  {facturaStandResultado.facturaAnteriorAnulada.factura}
                </p>
                <p>
                  Nota credito:{" "}
                  {facturaStandResultado.facturaAnteriorAnulada.notaCredito ||
                    "Confirmada en Siigo"}
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-col gap-3">
              {facturaStandResultado.url && (
                <a
                  href={facturaStandResultado.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800"
                >
                  Abrir factura
                </a>
              )}
              <button
                type="button"
                onClick={() => setFacturaStandResultado(null)}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalPrestamoMasivo && (
        <div className={styles.modal}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              Envio masivo a sede
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Se enviaran {itemsSeleccionadosParaPrestamo.length} equipo
              {itemsSeleccionadosParaPrestamo.length === 1 ? "" : "s"} disponible
              {itemsSeleccionadosParaPrestamo.length === 1 ? "" : "s"} en BODEGA.
              {idsSeleccionados.length > itemsSeleccionadosParaPrestamo.length
                ? ` ${idsSeleccionados.length - itemsSeleccionadosParaPrestamo.length} seleccionado${
                    idsSeleccionados.length - itemsSeleccionadosParaPrestamo.length === 1
                      ? ""
                      : "s"
                  } no aplica por estado o reglas actuales.`
                : ""}
            </p>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Sede destino
              </label>
              <select
                value={sedeDestinoId}
                onChange={(e) => setSedeDestinoId(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">Seleccionar sede</option>
                {sedesDestinoMasivo.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={ejecutarEnvioMasivo}
                disabled={cargando || itemsSeleccionadosParaPrestamo.length === 0}
                className="flex-1 rounded-2xl bg-[#cf2e2e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b92525] disabled:opacity-70"
              >
                Confirmar envio
              </button>

              <button
                onClick={() => {
                  setMostrarModalPrestamoMasivo(false);
                  setSedeDestinoId("");
                }}
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalPagoMasivo && (
        <div className={styles.modal}>
          <div ref={pagoMasivoDialog} className={styles.paymentReview} role="dialog" aria-modal="true" aria-labelledby="bulk-payment-title" onKeyDown={(event) => {
            if (event.key === "Escape" && !cargando) { event.preventDefault(); setMostrarModalPagoMasivo(false); }
            if (event.key === "Tab") {
              const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
              const first = buttons[0]; const last = buttons.at(-1);
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
          }}>
            <h3 id="bulk-payment-title" className="text-xl font-bold text-slate-900">
              Pagar deudas seleccionadas
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Se procesarán {itemsSeleccionadosParaPago.length} deuda
              {itemsSeleccionadosParaPago.length === 1 ? "" : "s"} por un total de{" "}
              <span className="font-semibold text-slate-950">
                {formatoPesos(totalPagoMasivo)}
              </span>
              .
              {idsSeleccionados.length > itemsSeleccionadosParaPago.length
                ? ` ${idsSeleccionados.length - itemsSeleccionadosParaPago.length} seleccionado${
                    idsSeleccionados.length - itemsSeleccionadosParaPago.length === 1
                      ? ""
                      : "s"
                  } no aplica por estado, tipo de deuda o reglas actuales.`
                : ""}
            </p>

            <div className={styles.paymentCreditors}>
              {acreedoresPago.map((creditor) => <section key={creditor.key}>
                <header><strong>{creditor.name}{creditor.id != null && <small> ID {creditor.id}</small>}</strong><b>{formatoPesos(creditor.total)}</b></header>
                <ul>{itemsSeleccionadosParaPago.filter((item) => identidadAcreedor(item).key === creditor.key).map((item) => <li key={item.id}><span><strong>{item.referencia}</strong><small>ID {item.id} · IMEI: {item.imei} · {item.sede?.nombre || "—"}</small></span><b>{formatoPesos(deudaPendienteInventario(item))}</b></li>)}</ul>
              </section>)}
            </div>
            {itemsSeleccionadosParaPago.some((item) => String(item.origen || "").toUpperCase() === "PRINCIPAL") && <p className={styles.paymentEligibility}>Las deudas con origen Principal siguen el flujo actual de aprobación antes de registrarse como pagadas.</p>}
            <div className="mt-6 flex gap-3">
              <button
                onClick={ejecutarPagoMasivo}
                disabled={cargando || itemsSeleccionadosParaPago.length === 0}
                className="flex-1 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
              >
                Confirmar pago
              </button>

              <button
                onClick={() => setMostrarModalPagoMasivo(false)}
                data-cancel-payment
                disabled={cargando}
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalPrestamo && itemPrestamo && (
        <div className={styles.modal}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              Enviar a sede
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              IMEI: {itemPrestamo.imei}
            </p>
            <p className="text-sm text-slate-600">
              Referencia: {itemPrestamo.referencia}
            </p>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Sede destino
              </label>
              <select
                value={sedeDestinoId}
                onChange={(e) => setSedeDestinoId(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              >
                <option value="">Seleccionar sede</option>
                {sedes
                  .filter(
                    (sede) =>
                      sede.id !== itemPrestamo.sedeId &&
                      esSedeOperativaInventario(sede.nombre)
                  )
                  .map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={enviarPrestamo}
                disabled={cargando}
                className="flex-1 rounded-2xl bg-[#cf2e2e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b92525] disabled:opacity-70"
              >
                Confirmar envio
              </button>

              <button
                onClick={() => {
                  setMostrarModalPrestamo(false);
                  setItemPrestamo(null);
                  setSedeDestinoId("");
                }}
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalPago && itemPago && (
        <div className={styles.modal}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              Pagar deuda del equipo
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              IMEI: {itemPago.imei}
            </p>
            <p className="text-sm text-slate-600">
              Referencia: {itemPago.referencia}
            </p>
            <p className="mt-3 text-sm text-slate-700">
              Proveedor / acreedor:{" "}
              <span className="font-semibold">{identidadAcreedor(itemPago).name}</span>
            </p>
            <p className="mt-1 text-sm text-slate-700">
              Valor a pagar:{" "}
              <span className="font-semibold">{formatoPesos(deudaPendienteInventario(itemPago))}</span>
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={pagarDeuda}
                disabled={cargando}
                className="flex-1 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
              >
                Confirmar pago
              </button>

              <button
                onClick={() => {
                  setMostrarModalPago(false);
                  setItemPago(null);
                }}
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalCambio && itemCambio && (
        <div className={styles.modal}>
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              {String(itemCambio.estadoActual || "").toUpperCase() === "VENDIDO"
                ? "Reemplazar equipo vendido"
                : "Registrar cambio de equipo"}
            </h3>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Equipo seleccionado
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                IMEI: {itemCambio.imei}
              </p>
              <p className="text-sm text-slate-600">
                {itemCambio.referencia} - {itemCambio.sede?.nombre || "Sede sin configurar"}
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  {String(itemCambio.estadoActual || "").toUpperCase() === "VENDIDO"
                    ? "IMEI nuevo"
                    : "IMEI anterior"}
                </label>
                <input
                  value={imeiCambio}
                  onChange={(e) =>
                    setImeiCambio(e.target.value.replace(/\D/g, "").slice(0, 15))
                  }
                  placeholder="15 digitos"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Estado del equipo anterior
                </label>
                <select
                  value={estadoRetornoCambio}
                  onChange={(e) => setEstadoRetornoCambio(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="BODEGA">BODEGA</option>
                  <option value="GARANTIA">GARANTIA</option>
                  <option value="PENDIENTE">PENDIENTE</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Observacion
              </label>
              <textarea
                value={observacionCambio}
                onChange={(e) => setObservacionCambio(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={ejecutarCambioEquipo}
                disabled={cargando}
                className="flex-1 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-70"
              >
                Guardar cambio
              </button>

              <button
                onClick={cerrarCambioEquipo}
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalEditar && itemEditar && (
        <div className={styles.modal}>
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              Editar inventario
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              IMEI: {itemEditar.imei}. Esta edicion actualiza la ficha del inventario de sede sin cambiar el IMEI.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Referencia
                </label>
                <input
                  value={formularioEditar.referencia}
                  onChange={(e) =>
                    setFormularioEditar((actual) => ({
                      ...actual,
                      referencia: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Color
                </label>
                <input
                  value={formularioEditar.color}
                  onChange={(e) =>
                    setFormularioEditar((actual) => ({
                      ...actual,
                      color: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Tipo de producto
                </label>
                <select
                  value={formularioEditar.tipoProducto}
                  onChange={(e) =>
                    setFormularioEditar((actual) => ({
                      ...actual,
                      tipoProducto: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                >
                  {TIPOS_PRODUCTO.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Costo
                </label>
                <input
                  value={formularioEditar.costo ? formatoPesos(Number(formularioEditar.costo)) : ""}
                  onChange={(e) =>
                    setFormularioEditar((actual) => ({
                      ...actual,
                      costo: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Distribuidor
                </label>
                <input
                  value={formularioEditar.distribuidor}
                  onChange={(e) =>
                    setFormularioEditar((actual) => ({
                      ...actual,
                      distribuidor: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Estado financiero
                </label>
                <select
                  value={formularioEditar.estadoFinanciero}
                  onChange={(e) =>
                    setFormularioEditar((actual) => ({
                      ...actual,
                      estadoFinanciero: e.target.value,
                      deboA: e.target.value === "DEUDA" ? actual.deboA : "",
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="PAGO">PAGO</option>
                  <option value="DEUDA">DEUDA</option>
                  <option value="CANCELADO">CANCELADO</option>
                </select>
              </div>

              {formularioEditar.estadoFinanciero === "DEUDA" && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Debe a
                  </label>
                  <input
                    value={formularioEditar.deboA}
                    onChange={(e) =>
                      setFormularioEditar((actual) => ({
                        ...actual,
                        deboA: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={guardarEdicion}
                disabled={cargando}
                className="flex-1 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-70"
              >
                Guardar cambios
              </button>

              <button
                onClick={cerrarEdicion}
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEliminar && (
        <div className={styles.modal}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              Confirmar eliminacion
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              {idsEliminar.length === 1
                ? "Se eliminara 1 equipo si no tiene ventas, prestamos activos ni registros comerciales pendientes."
                : `Se eliminaran ${idsEliminar.length} equipos si cumplen las reglas de seguridad.`}
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={cerrarEliminacion}
                className="flex-1 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>

              <button
                onClick={confirmarEliminacion}
                className="flex-1 rounded-2xl bg-[#cf2e2e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b92525]"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
